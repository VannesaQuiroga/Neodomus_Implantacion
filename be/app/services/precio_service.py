"""Precio comercial efectivo de un producto o de una de sus variantes.

El backend es la autoridad del importe. La regla replica la que expone el
catálogo: la variante usa su precio propio cuando existe; si no, se aplica el
descuento vigente del producto. Los importes se cuantizan a dos decimales sin
alterar las cantidades por metros, que conservan su precisión exacta.
"""

from datetime import date
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP

from app.models.producto import Producto
from app.models.producto_variante import ProductoVariante

DINERO_PRECISION = Decimal("0.01")


def _decimal(valor) -> Decimal:
    try:
        numero = Decimal(str(valor if valor is not None else 0))
    except (TypeError, ValueError, InvalidOperation):
        return Decimal("0")
    return numero if numero.is_finite() else Decimal("0")


def _dinero(valor: Decimal) -> Decimal:
    return valor.quantize(DINERO_PRECISION, rounding=ROUND_HALF_UP)


def descuento_vigente(producto: Producto) -> bool:
    descuento = _decimal(producto.descuento_activo)
    if descuento <= 0:
        return False
    hasta = producto.promocion_hasta
    return hasta is None or hasta >= date.today()


def porcentaje_descuento(producto: Producto) -> Decimal:
    return _decimal(producto.descuento_activo) if descuento_vigente(producto) else Decimal("0")


def precio_unitario(
    producto: Producto,
    variante: ProductoVariante | None = None,
) -> Decimal:
    """Precio unitario que debe cobrarse por el producto o variante elegidos."""
    if variante is not None and variante.precio is not None:
        return _dinero(_decimal(variante.precio))

    base = _decimal(producto.precio_venta_producto)
    descuento = porcentaje_descuento(producto)
    if descuento > 0:
        base *= Decimal("1") - (descuento / Decimal("100"))
    return _dinero(base)
