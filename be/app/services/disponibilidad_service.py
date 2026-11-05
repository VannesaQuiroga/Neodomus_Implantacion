"""Reglas únicas de disponibilidad comercial de productos.

Un producto es comprable cuando su stock propio es mayor que cero. Si tiene
variantes, además debe existir al menos una variante con stock. Nunca se suman
existencias del producto y de sus variantes porque representan el mismo
inventario compartido; tampoco se redondean cantidades por metros.
"""

from decimal import Decimal, InvalidOperation

from sqlalchemy import and_, exists, or_

from app.models.producto import Producto
from app.models.producto_variante import ProductoVariante


def _stock(valor) -> Decimal:
    try:
        cantidad = Decimal(str(valor if valor is not None else 0))
    except (TypeError, ValueError, InvalidOperation):
        return Decimal("0")
    if not cantidad.is_finite() or cantidad < 0:
        return Decimal("0")
    return cantidad


def stock_disponible_variante(producto: Producto, variante: ProductoVariante | None) -> Decimal:
    """Existencias realmente comprables de una variante concreta."""
    total = _stock(producto.stock_producto)
    if total <= 0:
        return Decimal("0")
    if variante is None:
        return stock_disponible_producto(producto)
    return min(total, _stock(variante.stock))


def stock_disponible_producto(producto: Producto) -> Decimal:
    """Máximo comprable en una sola línea, sin sumar inventarios incompatibles."""
    total = _stock(producto.stock_producto)
    if total <= 0:
        return Decimal("0")
    variantes = list(producto.variantes or [])
    if not variantes:
        return total
    mejor_variante = max((_stock(v.stock) for v in variantes), default=Decimal("0"))
    return min(total, mejor_variante)


def producto_disponible(producto: Producto) -> bool:
    return stock_disponible_producto(producto) > 0


def filtro_disponible_publico():
    """Condición SQL equivalente a ``producto_disponible`` para catálogo público."""
    tiene_variantes = exists().where(
        ProductoVariante.id_producto == Producto.id_producto
    )
    tiene_variante_con_stock = exists().where(
        and_(
            ProductoVariante.id_producto == Producto.id_producto,
            ProductoVariante.stock > 0,
        )
    )
    return and_(
        Producto.stock_producto > 0,
        or_(~tiene_variantes, tiene_variante_con_stock),
    )
