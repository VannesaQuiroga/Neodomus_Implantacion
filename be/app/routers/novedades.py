"""
Módulo: routers/novedades.py

Gestión de novedades e incidencias reportadas por técnicos.
- Técnicos: crear, consultar sus novedades.
- Admin: listar todas, cambiar estado, generar cupones.
"""
from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.novedad import Novedad
from app.models.roles_usuario import RolesUsuario
from app.models.tecnico import Tecnico
from app.models.user import User
from app.utils.security import get_current_employee
from app.services import novedades_service
from sqlalchemy import select

router = APIRouter(prefix="/novedades", tags=["Novedades"])


def _admin(current_user: User = Depends(get_current_employee), db: Session = Depends(get_db)) -> User:
    role = db.execute(
        select(RolesUsuario.nombre_rol).where(RolesUsuario.id_rol == current_user.id_rol_u)
    ).scalar_one_or_none()
    if role not in ("admin", "administrador"):
        raise HTTPException(403, "Solo administradores pueden realizar esta acción")
    return current_user


def _tecnico(current_user: User = Depends(get_current_employee), db: Session = Depends(get_db)) -> tuple[User, int]:
    """Retorna (user, id_tecnico) validando que el usuario sea técnico."""
    role = db.execute(
        select(RolesUsuario.nombre_rol).where(RolesUsuario.id_rol == current_user.id_rol_u)
    ).scalar_one_or_none()
    if role != "tecnico":
        raise HTTPException(403, "Solo técnicos pueden realizar esta acción")
    tecnico = db.query(Tecnico).filter(Tecnico.id_usuario_t == current_user.id_usuario).first()
    if not tecnico:
        raise HTTPException(404, "No se encontró perfil de técnico")
    return current_user, tecnico.id_tecnico


# ── Tipos y catálogos ──────────────────────────────────────────────

@router.get("/tipos")
def tipos_novedad():
    return novedades_service.TIPOS_NOVEDAD


@router.get("/estados")
def estados_novedad():
    return novedades_service.ESTADOS_NOVEDAD


@router.get("/prioridades")
def prioridades_novedad():
    return novedades_service.PRIORIDADES


# ── Técnico: crear y listar ─────────────────────────────────────────

class NovedadCrearRequest(BaseModel):
    tipo_novedad: str
    descripcion: str
    prioridad: str = "normal"
    id_pedido: Optional[int] = None
    id_cita: Optional[int] = None
    id_cliente: Optional[int] = None
    lugar_ocurrencia: Optional[str] = None
    evidencia_url: Optional[str] = None


@router.post("")
def crear_novedad(
    data: NovedadCrearRequest,
    user_info: tuple = Depends(_tecnico),
    db: Session = Depends(get_db),
):
    user, id_tecnico = user_info
    if data.tipo_novedad not in novedades_service.TIPOS_NOVEDAD:
        raise HTTPException(400, f"Tipo de novedad no válido. Use: {', '.join(novedades_service.TIPOS_NOVEDAD)}")
    if data.prioridad not in novedades_service.PRIORIDADES:
        raise HTTPException(400, f"Prioridad no válida. Use: {', '.join(novedades_service.PRIORIDADES)}")

    novedad = novedades_service.crear_novedad(
        db,
        id_tecnico=id_tecnico,
        tipo_novedad=data.tipo_novedad,
        descripcion=data.descripcion,
        prioridad=data.prioridad,
        id_pedido=data.id_pedido,
        id_cita=data.id_cita,
        id_cliente=data.id_cliente,
        lugar_ocurrencia=data.lugar_ocurrencia,
        evidencia_url=data.evidencia_url,
    )

    # Notificar al admin
    from app.services.notificaciones import crear_notificacion
    from sqlalchemy.orm import joinedload
    novedad_full = (
        db.query(Novedad)
        .options(joinedload(Novedad.tecnico))
        .filter(Novedad.id_novedad == novedad.id_novedad)
        .first()
    )
    nombre_tecnico = "Técnico"
    if novedad_full and novedad_full.tecnico and novedad_full.tecnico.usuario:
        nombre_tecnico = f"{novedad_full.tecnico.usuario.first_name} {novedad_full.tecnico.usuario.last_name}".strip()

    crear_notificacion(
        db,
        id_usuario=None,
        tipo="novedad",
        titulo=f"Nueva novedad: {data.tipo_novedad}",
        mensaje=(
            f"El técnico {nombre_tecnico} reportó una novedad"
            f"{f' en el pedido #{data.id_pedido}' if data.id_pedido else ''}"
            f": {data.descripcion[:200]}"
        ),
    )

    return {"id_novedad": novedad.id_novedad, "mensaje": "Novedad creada correctamente"}


@router.get("/mis-novedades")
def mis_novedades(
    user_info: tuple = Depends(_tecnico),
    db: Session = Depends(get_db),
):
    _, id_tecnico = user_info
    novedades = novedades_service.listar_novedades_tecnico(db, id_tecnico)
    return _serializar_novedades(novedades, db)


# ── Admin: listar, cambiar estado, cupones ──────────────────────────

@router.get("")
def listar_novedades_admin(
    id_pedido: Optional[int] = None,
    id_tecnico: Optional[int] = None,
    id_cliente: Optional[int] = None,
    tipo_novedad: Optional[str] = None,
    estado: Optional[str] = None,
    prioridad: Optional[str] = None,
    fecha_desde: Optional[date] = None,
    fecha_hasta: Optional[date] = None,
    _admin_user: User = Depends(_admin),
    db: Session = Depends(get_db),
):
    novedades = novedades_service.listar_novedades_admin(
        db,
        id_pedido=id_pedido,
        id_tecnico=id_tecnico,
        id_cliente=id_cliente,
        tipo_novedad=tipo_novedad,
        estado=estado,
        prioridad=prioridad,
        fecha_desde=fecha_desde,
        fecha_hasta=fecha_hasta,
    )
    return _serializar_novedades(novedades, db)


@router.get("/cliente/{cliente_id}/cupones")
def cupones_cliente(
    cliente_id: int,
    _admin_user: User = Depends(_admin),
    db: Session = Depends(get_db),
):
    cupones = novedades_service.listar_cupones_cliente(db, cliente_id)
    return [
        {
            "id_cupon": c.id_cupon,
            "codigo": c.codigo,
            "tipo_descuento": c.tipo_descuento,
            "valor_descuento": c.valor_descuento,
            "fecha_vencimiento": c.fecha_vencimiento.isoformat() if c.fecha_vencimiento else None,
            "usos_maximos": c.usos_maximos,
            "usos_realizados": c.usos_realizados,
            "activo": c.activo,
        }
        for c in cupones
    ]


@router.get("/{novedad_id}")
def obtener_novedad(
    novedad_id: int,
    current_user: User = Depends(get_current_employee),
    db: Session = Depends(get_db),
):
    role = db.execute(
        select(RolesUsuario.nombre_rol).where(RolesUsuario.id_rol == current_user.id_rol_u)
    ).scalar_one_or_none()

    novedad = novedades_service.obtener_novedad(db, novedad_id)
    if not novedad:
        raise HTTPException(404, "Novedad no encontrada")

    # Los técnicos solo pueden ver sus propias novedades
    if role == "tecnico":
        tecnico = db.query(Tecnico).filter(Tecnico.id_usuario_t == current_user.id_usuario).first()
        if not tecnico or novedad.id_tecnico_n != tecnico.id_tecnico:
            raise HTTPException(403, "No tienes acceso a esta novedad")
    elif role not in ("admin", "administrador"):
        raise HTTPException(403, "Sin permisos")

    return _serializar_novedad_detalle(novedad, db)


class CambiarEstadoRequest(BaseModel):
    nuevo_estado: str
    accion_detalle: Optional[str] = None


@router.put("/{novedad_id}/estado")
def cambiar_estado(
    novedad_id: int,
    data: CambiarEstadoRequest,
    admin_user: User = Depends(_admin),
    db: Session = Depends(get_db),
):
    if data.nuevo_estado not in novedades_service.ESTADOS_NOVEDAD:
        raise HTTPException(400, f"Estado no válido. Use: {', '.join(novedades_service.ESTADOS_NOVEDAD)}")
    try:
        novedad = novedades_service.cambiar_estado_novedad(
            db,
            id_novedad=novedad_id,
            nuevo_estado=data.nuevo_estado,
            id_admin=admin_user.id_usuario,
            accion_detalle=data.accion_detalle,
        )
    except ValueError as e:
        raise HTTPException(404, str(e))

    # Notificar al técnico
    from app.services.notificaciones import crear_notificacion
    if novedad.id_tecnico_n:
        tecnico = db.query(Tecnico).filter(Tecnico.id_tecnico == novedad.id_tecnico_n).first()
        if tecnico and tecnico.usuario:
            crear_notificacion(
                db,
                id_usuario=tecnico.usuario.id_usuario,
                tipo="novedad",
                titulo=f"Novedad #{novedad_id} — {data.nuevo_estado}",
                mensaje=(
                    f"Tu reporte del pedido"
                    f"{f' #{novedad.id_pedido}' if novedad.id_pedido else ''}"
                    f" fue revisado y marcado como {data.nuevo_estado}."
                    f"{f' {data.accion_detalle}' if data.accion_detalle else ''}"
                ),
            )

    return {"mensaje": f"Estado actualizado a {data.nuevo_estado}"}


class CrearCuponRequest(BaseModel):
    codigo: str
    tipo_descuento: str = "porcentaje"
    valor_descuento: float
    fecha_vencimiento: Optional[date] = None
    compra_minima: float = 0
    usos_maximos: int = 1
    aplica_tienda_completa: bool = True
    categorias_aplicables: Optional[str] = None


@router.post("/{novedad_id}/cupon")
def crear_cupon_novedad(
    novedad_id: int,
    data: CrearCuponRequest,
    admin_user: User = Depends(_admin),
    db: Session = Depends(get_db),
):
    novedad = novedades_service.obtener_novedad(db, novedad_id)
    if not novedad:
        raise HTTPException(404, "Novedad no encontrada")
    if not novedad.id_cliente:
        raise HTTPException(400, "La novedad no tiene un cliente asociado")

    try:
        cupon = novedades_service.crear_cupon(
            db,
            codigo=data.codigo,
            tipo_descuento=data.tipo_descuento,
            valor_descuento=data.valor_descuento,
            id_cliente=novedad.id_cliente,
            id_novedad=novedad_id,
            id_admin=admin_user.id_usuario,
            fecha_vencimiento=data.fecha_vencimiento,
            compra_minima=data.compra_minima,
            usos_maximos=data.usos_maximos,
            aplica_tienda_completa=data.aplica_tienda_completa,
            categorias_aplicables=data.categorias_aplicables,
        )
    except ValueError as e:
        raise HTTPException(400, str(e))

    # Notificar al cliente
    from app.services.notificaciones import crear_notificacion
    crear_notificacion(
        db,
        id_usuario=None,
        id_cliente=novedad.id_cliente,
        tipo="cupon",
        titulo="Cupón de descuento generado",
        mensaje=(
            f"Debido al inconveniente presentado con tu pedido"
            f"{f' #{novedad.id_pedido}' if novedad.id_pedido else ''}, "
            f"se ha generado un cupón de descuento para tu próxima compra.\n"
            f"Código: {cupon.codigo}\n"
            f"Descuento: {cupon.valor_descuento}{'%' if cupon.tipo_descuento == 'porcentaje' else ' COP'}"
            f"{f'\nVálido hasta: {cupon.fecha_vencimiento}' if cupon.fecha_vencimiento else ''}"
        ),
    )

    return {
        "id_cupon": cupon.id_cupon,
        "codigo": cupon.codigo,
        "mensaje": "Cupón generado y notificación enviada al cliente",
    }


# ── Helpers de serialización ────────────────────────────────────────

def _serializar_novedades(novedades, db):
    from app.models.tecnico import Tecnico as TecnicoModel
    result = []
    for n in novedades:
        tecnico_nombre = None
        if n.id_tecnico_n:
            t = db.query(TecnicoModel).filter(TecnicoModel.id_tecnico == n.id_tecnico_n).first()
            if t and t.usuario:
                tecnico_nombre = f"{t.usuario.first_name} {t.usuario.last_name}".strip()
        cliente_nombre = None
        if n.id_cliente and n.cliente:
            cliente_nombre = f"{n.cliente.first_name} {n.cliente.last_name}".strip()
        result.append({
            "id_novedad": n.id_novedad,
            "tipo_novedad": n.tipo_novedad,
            "descripcion_novedad": n.descripcion_novedad,
            "prioridad": n.prioridad,
            "estado_novedad": n.estado_novedad,
            "fecha_reporte": n.fecha_reporte_novedad.isoformat() if n.fecha_reporte_novedad else None,
            "lugar_ocurrencia": n.lugar_ocurrencia,
            "evidencia_url": n.evidencia_url,
            "id_pedido": n.id_pedido,
            "id_cita": n.id_cita,
            "id_cliente": n.id_cliente,
            "id_tecnico": n.id_tecnico_n,
            "tecnico_nombre": tecnico_nombre,
            "cliente_nombre": cliente_nombre,
            "accion_admin": n.accion_admin,
            "fecha_resolucion": n.fecha_resolucion.isoformat() if n.fecha_resolucion else None,
        })
    return result


def _serializar_novedad_detalle(novedad, db):
    from app.models.tecnico import Tecnico as TecnicoModel
    items = _serializar_novedades([novedad], db)
    item = items[0] if items else {}

    # Historial
    historial = []
    for h in (novedad.historial or []):
        usuario_nombre = None
        if h.usuario:
            usuario_nombre = f"{h.usuario.first_name} {h.usuario.last_name}".strip()
        historial.append({
            "id_historial": h.id_historial,
            "accion": h.accion,
            "detalle": h.detalle,
            "fecha": h.fecha.isoformat() if h.fecha else None,
            "usuario_nombre": usuario_nombre,
        })
    item["historial"] = historial
    return item
