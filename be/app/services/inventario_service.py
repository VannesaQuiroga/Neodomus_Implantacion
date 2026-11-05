"""
Módulo: services/inventario_service.py

Descuento de stock con bloqueo pesimista de filas (SELECT ... FOR UPDATE)
para que dos compras concurrentes no puedan vender las mismas unidades.

Lanza HTTP 409 cuando no hay stock suficiente en lugar de silenciar el
sobregiro con max(stock - n, 0).
"""

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.producto import Producto
from app.models.producto_variante import ProductoVariante

STOCK_MINIMO_ALERTA = 5


def _decimal_cantidad(valor) -> "Decimal":
    """Convierte una cantidad a Decimal exacto; rechaza no-finitos/negativos."""
    from decimal import Decimal, InvalidOperation

    try:
        d = Decimal(str(valor))
    except (TypeError, ValueError, InvalidOperation):
        raise HTTPException(status_code=400, detail="Cantidad inválida")
    if not d.is_finite():
        raise HTTPException(status_code=400, detail="Cantidad inválida")
    return d


def _verificar_stock_bajo(db: Session, producto: Producto) -> None:
    """Si el stock del producto bajó a ≤ STOCK_MINIMO_ALERTA, notifica a los admins."""
    stock = producto.stock_producto or 0
    if stock > STOCK_MINIMO_ALERTA:
        return
    try:
        from app.models.roles_usuario import RolesUsuario
        from app.models.user import User
        from app.services.notificaciones import notificar_admin_stock_bajo

        admins = (
            db.query(User)
            .join(RolesUsuario, RolesUsuario.id_rol == User.id_rol_u)
            .filter(RolesUsuario.nombre_rol.in_(["admin", "administrador"]), User.is_active == True)
            .all()
        )
        admin_ids = [a.id_usuario for a in admins]
        if admin_ids:
            notificar_admin_stock_bajo(
                db,
                admin_ids=admin_ids,
                producto_id=producto.id_producto,
                producto_nombre=producto.nombre_producto,
                stock_actual=stock,
                stock_minimo=STOCK_MINIMO_ALERTA,
            )
    except Exception as e:
        print(f"Error notificando stock bajo para producto #{producto.id_producto}: {e}")


def descontar_stock(
    db: Session,
    producto: Producto,
    variante: ProductoVariante | None,
    cantidad: int,
    notificar_stock_bajo: bool = True,
) -> dict:
    """Bloquea y descuenta stock del producto (y su variante si aplica).

    Retorna {'producto_agotado': bool, 'variante_agotada': bool}.
    Debe llamarse dentro de la transacción del pago; si falla la validación
    se lanza HTTPException y el rollback de la sesión deshace todo el pedido.

    ``notificar_stock_bajo=False`` omite el aviso de stock bajo (que crea una
    notificación y confirma su propia transacción); el llamador puede diferirlo
    a después de su commit para no romper la atomicidad."""
    from decimal import Decimal

    unidades = _decimal_cantidad(cantidad)
    if unidades <= 0:
        raise HTTPException(status_code=400, detail="La cantidad debe ser mayor a cero")

    prod = (
        db.query(Producto)
        .with_for_update()
        .populate_existing()
        .filter(Producto.id_producto == producto.id_producto)
        .first()
    )
    if not prod:
        raise HTTPException(status_code=404, detail=f"Producto #{producto.id_producto} no existe")

    var = None
    if variante is not None:
        var = (
            db.query(ProductoVariante)
            .with_for_update()
            .populate_existing()
            .filter(ProductoVariante.id == variante.id)
            .first()
        )

    disponible_prod = Decimal(prod.stock_producto or 0)
    if unidades > disponible_prod:
        raise HTTPException(
            status_code=409,
            detail=(
                f"Stock insuficiente de '{prod.nombre_producto}' "
                f"(disponible: {disponible_prod}, solicitado: {unidades})"
            ),
        )

    disponible_var = None
    if var is not None:
        disponible_var = Decimal(var.stock or 0)
        if unidades > disponible_var:
            raise HTTPException(
                status_code=409,
                detail=(
                    f"Stock insuficiente de '{prod.nombre_producto}' en la variante "
                    f"seleccionada (disponible: {disponible_var}, solicitado: {unidades})"
                ),
            )

    prod.stock_producto = disponible_prod - unidades
    variante_agotada = False
    if var is not None:
        var.stock = disponible_var - unidades
        variante_agotada = var.stock == 0

    # Notificar stock bajo después del descuento (salvo que se difiera).
    if notificar_stock_bajo:
        _verificar_stock_bajo(db, prod)

    return {
        "producto_agotado": prod.stock_producto == 0,
        "variante_agotada": variante_agotada,
    }
