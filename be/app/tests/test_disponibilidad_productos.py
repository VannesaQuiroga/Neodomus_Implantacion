"""Disponibilidad comercial de productos por HTTP y servicio.

Cubre stock cero, última unidad, reposición, ocultación manual, variantes y
productos por metros sin sumar inventarios incompatibles ni redondear.
"""

import asyncio
import time
import unittest
from decimal import Decimal

from fastapi import HTTPException

import app.tests.testdb  # noqa: F401

from app.models.producto import Producto
from app.models.producto_variante import ProductoVariante
from app.services.disponibilidad_service import (
    producto_disponible,
    stock_disponible_producto,
)
from app.services.inventario_service import descontar_stock
from app.services.pedidos_service import crear_pedido
from app.tests.test_t1_identidad import BaseT1TestCase


class DisponibilidadProductosTestCase(BaseT1TestCase):
    def setUp(self):
        super().setUp()
        self._ids_producto = []
        self.admin = self._crear_admin("stock")
        self.admin_headers = self._bearer(self._token(self._login(self.admin.email)))

    def tearDown(self):
        for pid in self._ids_producto:
            self.db.query(ProductoVariante).filter(
                ProductoVariante.id_producto == pid
            ).delete(synchronize_session=False)
            self.db.query(Producto).filter(
                Producto.id_producto == pid
            ).delete(synchronize_session=False)
        self.db.commit()
        super().tearDown()

    def _producto(self, stock, visible=True, metros=False):
        p = Producto(
            nombre_producto=f"Producto stock {time.time_ns()}",
            referencia_producto=f"STOCK-{time.time_ns()}",
            precio_venta_producto=1000,
            stock_producto=Decimal(str(stock)),
            visible_cliente=visible,
            venta_por_metros=1 if metros else 0,
            estado_producto="activo",
        )
        self.db.add(p)
        self.db.commit()
        self.db.refresh(p)
        self._ids_producto.append(p.id_producto)
        return p

    def _variante(self, producto, stock, nombre="Variante"):
        v = ProductoVariante(
            id_producto=producto.id_producto,
            nombre=nombre,
            stock=Decimal(str(stock)),
        )
        self.db.add(v)
        self.db.commit()
        self.db.refresh(v)
        return v

    def _publicos(self, **params):
        r = self._get("/api/v1/productos/", params={"limit": 100, **params})
        self.assertEqual(r.status_code, 200, r.text)
        return r.json()["data"]

    def _publico_contiene(self, producto):
        return any(p["id_producto"] == producto.id_producto for p in self._publicos())

    def test_agotado_oculto_no_se_publica_ni_por_api_directa(self):
        p = self._producto(0, visible=False)

        self.assertFalse(self._publico_contiene(p))
        self.assertEqual(self._get(f"/api/v1/productos/{p.id_producto}").status_code, 404)

        r = self._put(
            f"/api/v1/productos/{p.id_producto}/visibilidad",
            headers=self.admin_headers,
        )
        self.assertEqual(r.status_code, 409, r.text)
        self.db.expire_all()
        self.assertFalse(self.db.get(Producto, p.id_producto).visible_cliente)

        self.db.get(Producto, p.id_producto).stock_producto = Decimal("10")
        self.db.commit()
        r = self._put(
            f"/api/v1/productos/{p.id_producto}/visibilidad",
            headers=self.admin_headers,
        )
        self.assertEqual(r.status_code, 200, r.text)
        self.assertTrue(r.json()["visible_cliente"])
        self.assertTrue(self._publico_contiene(p))
        self.assertEqual(self._get(f"/api/v1/productos/{p.id_producto}").status_code, 200)

    def test_ultima_unidad_se_vende_y_desaparece(self):
        p = self._producto(1)
        self.assertTrue(self._publico_contiene(p))
        self.assertEqual(self._get(f"/api/v1/productos/{p.id_producto}").status_code, 200)

        descontar_stock(self.db, p, None, 1, notificar_stock_bajo=False)
        self.db.commit()
        self.db.expire_all()
        p = self.db.get(Producto, p.id_producto)
        self.assertEqual(p.stock_producto, Decimal("0.00"))
        self.assertFalse(producto_disponible(p))
        self.assertFalse(self._publico_contiene(p))
        self.assertEqual(self._get(f"/api/v1/productos/{p.id_producto}").status_code, 404)

    def test_reposicion_conserva_ocultacion_manual(self):
        p = self._producto(0, visible=False)
        r = self._put(
            f"/api/v1/productos/{p.id_producto}",
            json={
                "nombre_producto": p.nombre_producto,
                "precio_venta_producto": 1000,
                "stock_producto": 5,
                "estado_producto": "activo",
            },
            headers=self.admin_headers,
        )
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual(r.json()["stock_producto"], 5, r.text)
        self._resincronizar()
        p = self.db.get(Producto, p.id_producto)
        self.assertEqual(p.stock_producto, Decimal("5.00"))
        self.assertFalse(p.visible_cliente)
        self.assertTrue(producto_disponible(p))
        self.assertFalse(self._publico_contiene(p))

        r = self._put(
            f"/api/v1/productos/{p.id_producto}/visibilidad",
            headers=self.admin_headers,
        )
        self.assertEqual(r.status_code, 200, r.text)
        self.assertTrue(self._publico_contiene(p))

    def test_variantes_no_se_suman_ni_ignoran_stock_del_producto(self):
        p = self._producto(10)
        self._variante(p, 0, "Sin stock")
        self._variante(p, 5, "Con stock")
        self.assertTrue(self._publico_contiene(p))
        detalle = self._get(f"/api/v1/productos/{p.id_producto}").json()
        self.assertEqual(Decimal(str(detalle["stock_disponible"])), Decimal("5"))
        self.assertTrue(detalle["disponible"])

        v1, v2 = p.variantes
        v1.stock = Decimal("0")
        v2.stock = Decimal("0")
        self.db.commit()
        self.db.expire_all()
        p = self.db.get(Producto, p.id_producto)
        self.assertFalse(producto_disponible(p))
        self.assertFalse(self._publico_contiene(p))

        self.db.get(Producto, p.id_producto).stock_producto = Decimal("0")
        self.db.query(ProductoVariante).filter(
            ProductoVariante.id_producto == p.id_producto
        ).update({ProductoVariante.stock: Decimal("5")})
        self.db.commit()
        self.db.expire_all()
        p = self.db.get(Producto, p.id_producto)
        self.assertFalse(producto_disponible(p))
        self.assertTrue(all(v.stock > 0 for v in p.variantes))
        self.assertFalse(self._publico_contiene(p))

    def test_metros_con_stock_minimo_visible_sin_redondear(self):
        p = self._producto("0.01", metros=True)
        self.assertEqual(stock_disponible_producto(p), Decimal("0.01"))
        self.assertTrue(self._publico_contiene(p))
        detalle = self._get(f"/api/v1/productos/{p.id_producto}").json()
        self.assertEqual(Decimal(str(detalle["stock_disponible"])), Decimal("0.01"))

        p.stock_producto = Decimal("1.25")
        self.db.commit()
        self.db.expire_all()
        p = self.db.get(Producto, p.id_producto)
        self.assertEqual(stock_disponible_producto(p), Decimal("1.25"))
        self.assertTrue(self._publico_contiene(p))

    def test_carrito_antiguo_no_compra_oculto_ni_variantes_agotadas(self):
        cliente = self._crear_cliente("carrito")
        oculto = self._producto(5, visible=False)
        variantes_agotadas = self._producto(5, visible=True)
        self._variante(variantes_agotadas, 0)
        sin_producto = self._producto(0, visible=True)
        self._variante(sin_producto, 5)

        for producto in (oculto, variantes_agotadas, sin_producto):
            with self.subTest(producto=producto.id_producto):
                with self.assertRaises(HTTPException) as ctx:
                    asyncio.run(
                        crear_pedido(
                            self.db,
                            cliente,
                            [{"id_producto": producto.id_producto, "cantidad": 1}],
                            [],
                            "punto_pago",
                            {"punto_pago": "Efecty"},
                        )
                    )
                self.assertEqual(ctx.exception.status_code, 400)

    def test_admin_ve_y_edita_agotado(self):
        p = self._producto(0, visible=True)
        r = self._get(
            "/api/v1/productos/", params={"limit": 100}, headers=self.admin_headers
        )
        self.assertEqual(r.status_code, 200, r.text)
        self.assertIn(p.id_producto, [x["id_producto"] for x in r.json()["data"]])
        self.assertEqual(
            self._get(
                f"/api/v1/productos/{p.id_producto}", headers=self.admin_headers
            ).status_code,
            200,
        )
        r = self._put(
            f"/api/v1/productos/{p.id_producto}",
            json={
                "nombre_producto": p.nombre_producto,
                "precio_venta_producto": 1200,
                "stock_producto": 3,
                "estado_producto": "activo",
            },
            headers=self.admin_headers,
        )
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual(r.json()["stock_producto"], 3)


if __name__ == "__main__":
    unittest.main()
