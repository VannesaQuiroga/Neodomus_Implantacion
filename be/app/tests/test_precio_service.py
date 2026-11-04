"""Reglas de precio autoritativas compartidas por checkout y catálogo."""
from datetime import date, timedelta
from decimal import Decimal
from types import SimpleNamespace
from unittest import TestCase

from app.services.precio_service import precio_unitario


def _producto(precio, descuento=None, hasta=None):
    return SimpleNamespace(
        precio_venta_producto=precio,
        descuento_activo=descuento,
        promocion_hasta=hasta,
    )


class PrecioUnitarioTestCase(TestCase):
    def test_sin_promocion_usa_precio_base(self):
        self.assertEqual(precio_unitario(_producto(1299.999)), Decimal("1300.00"))

    def test_promocion_vigente_se_aplica_al_producto(self):
        producto = _producto(1000, descuento=15, hasta=date.today() + timedelta(days=1))
        self.assertEqual(precio_unitario(producto), Decimal("850.00"))

    def test_promocion_vencida_no_se_aplica(self):
        producto = _producto(1000, descuento=15, hasta=date.today() - timedelta(days=1))
        self.assertEqual(precio_unitario(producto), Decimal("1000.00"))

    def test_precio_propio_de_variante_tiene_prioridad(self):
        producto = _producto(1000, descuento=50)
        variante = SimpleNamespace(precio=750)
        self.assertEqual(precio_unitario(producto, variante), Decimal("750.00"))

    def test_variante_sin_precio_hereda_promocion_del_producto(self):
        producto = _producto(1000, descuento=10)
        variante = SimpleNamespace(precio=None)
        self.assertEqual(precio_unitario(producto, variante), Decimal("900.00"))
