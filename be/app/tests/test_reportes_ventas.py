"""Reporte de ventas: regla de estados, importes y permisos.

Verifica que solo los pedidos "Pagado" cuentan como venta (los rechazados,
pendientes y cancelados quedan fuera), que los importes conservan decimales,
que no se duplica una venta por líneas de detalle, que el acceso es exclusivo
del administrador y que el PDF renderiza los totales correctos.
"""
import re
import unittest
import zlib
from datetime import date, datetime

import app.tests.testdb  # noqa: F401

from app.database import SessionLocal
from app.models.pedido import DetallePedido, Pedido
from app.tests.test_t1_identidad import BaseT1TestCase

FECHA = datetime(2020, 1, 15, 12, 0, 0)  # rango aislado, sin colisión con datos reales


class ReporteVentasTestCase(BaseT1TestCase):
    def setUp(self):
        super().setUp()
        self.cliente = self._crear_cliente("rv")
        # Limpieza idempotente de restos de ejecuciones previas en el rango.
        self.db.query(DetallePedido).filter(
            DetallePedido.id_pedido_d.in_(
                self.db.query(Pedido.id_pedido).filter(
                    Pedido.fecha_peedido >= datetime(2020, 1, 1),
                    Pedido.fecha_peedido <= datetime(2020, 2, 1),
                )
            )
        ).delete(synchronize_session=False)
        self.db.query(Pedido).filter(
            Pedido.fecha_peedido >= datetime(2020, 1, 1),
            Pedido.fecha_peedido <= datetime(2020, 2, 1),
        ).delete(synchronize_session=False)
        self.db.commit()

    def tearDown(self):
        # BaseT1TestCase no borra DetallePedido; se limpian primero para evitar
        # el error de FK al eliminar el Pedido padre.
        if self._ids_pedido:
            self.db.query(DetallePedido).filter(
                DetallePedido.id_pedido_d.in_(self._ids_pedido)
            ).delete(synchronize_session=False)
            self.db.commit()
        super().tearDown()

    def _pedido(self, estado, total):
        p = Pedido(
            id_cliente_pe=self.cliente.id_cliente,
            estado_pedido=estado,
            total_pedido=total,
            fecha_peedido=FECHA,
        )
        self.db.add(p)
        self.db.commit()
        self.db.refresh(p)
        self._ids_pedido.append(p.id_pedido)
        return p

    def _params(self):
        return {"fecha_inicio": "2020-01-01", "fecha_fin": "2020-01-31", "periodo": "mes"}

    def _get_ventas(self, token):
        return self._get("/api/v1/reports/ventas", params=self._params(), headers=self._bearer(token))

    def test_solo_pedidos_pagados_cuentan_como_ventas(self):
        self._pedido("Pagado", 1000.0)
        self._pedido("Pago rechazado", 5000.0)
        self._pedido("Pago pendiente", 2000.0)
        self._pedido("Cancelado", 3000.0)

        admin = self._crear_admin("rv")
        token = self._token(self._login(admin.email))
        r = self._get_ventas(token)
        self.assertEqual(r.status_code, 200, r.text)
        resumen = r.json()["resumen"]
        self.assertEqual(resumen["total_pedidos"], 1)
        self.assertEqual(resumen["total_ventas_pedidos"], 1000.0)
        self.assertEqual(resumen["total_ingresos"], 1000.0)

    def test_importes_decimales_se_conservan(self):
        self._pedido("Pagado", 1500.5)
        self._pedido("Pagado", 2499.25)

        admin = self._crear_admin("rv")
        token = self._token(self._login(admin.email))
        r = self._get_ventas(token)
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual(r.json()["resumen"]["total_ventas_pedidos"], 3999.75)

    def test_pdf_y_api_muestran_el_mismo_importe_fraccionario(self):
        self._pedido("Pagado", 1500.5)
        self._pedido("Pagado", 2499.25)

        admin = self._crear_admin("rv")
        token = self._token(self._login(admin.email))

        r_json = self._get_ventas(token)
        self.assertEqual(r_json.status_code, 200, r_json.text)
        self.assertEqual(r_json.json()["resumen"]["total_ventas_pedidos"], 3999.75)

        r_pdf = self._get("/api/v1/reports/ventas/pdf", params=self._params(), headers=self._bearer(token))
        self.assertEqual(r_pdf.status_code, 200, r_pdf.text)
        texto = _extraer_texto_pdf(r_pdf.content)
        self.assertIn("$3.999,75 COP", texto)
        self.assertNotIn("$4.000,00 COP", texto)

    def test_suma_centavos_exacta(self):
        self._pedido("Pagado", 1000.10)
        self._pedido("Pagado", 2000.20)
        self._pedido("Pagado", 3000.30)

        admin = self._crear_admin("rv")
        token = self._token(self._login(admin.email))
        r = self._get_ventas(token)
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual(r.json()["resumen"]["total_ventas_pedidos"], 6000.60)

        r_pdf = self._get("/api/v1/reports/ventas/pdf", params=self._params(), headers=self._bearer(token))
        texto = _extraer_texto_pdf(r_pdf.content)
        self.assertIn("$6.000,60 COP", texto)

    def test_resumen_coincide_con_detalle_y_periodos_validos(self):
        # 72 meses válidos (2020-01..2025-12): un pedido Pagado por mes.
        for m in range(72):
            anio = 2020 + m // 12
            mes = m % 12 + 1
            p = Pedido(
                id_cliente_pe=self.cliente.id_cliente,
                estado_pedido="Pagado",
                total_pedido=100.0 + m,
                fecha_peedido=datetime(anio, mes, 15, 12, 0, 0),
            )
            self.db.add(p)
            self.db.commit()
            self.db.refresh(p)
            self._ids_pedido.append(p.id_pedido)

        admin = self._crear_admin("rv")
        token = self._token(self._login(admin.email))
        r = self._get(
            "/api/v1/reports/ventas",
            params={"fecha_inicio": "2020-01-01", "fecha_fin": "2025-12-31", "periodo": "mes"},
            headers=self._bearer(token),
        )
        self.assertEqual(r.status_code, 200, r.text)
        datos = r.json()
        resumen = datos["resumen"]
        detalle = datos["ventas_por_periodo"]

        # Resumen derivado de las MISMAS filas (igualdad exacta).
        self.assertEqual(resumen["total_pedidos"], sum(v["pedidos"] for v in detalle))
        self.assertEqual(resumen["total_ventas_pedidos"], round(sum(v["ventas_pedidos"] for v in detalle), 2))
        self.assertEqual(resumen["total_ingresos"], round(sum(v["total"] for v in detalle), 2))
        # 72 periodos válidos, sin "2024-13" ni valores imposibles.
        self.assertEqual(len(detalle), 72)
        for v in detalle:
            self.assertRegex(v["periodo"], r"^\d{4}-(0[1-9]|1[0-2])$")

        # PDF multipágina (>= 3 páginas) generado desde ese mismo detalle.
        r_pdf = self._get(
            "/api/v1/reports/ventas/pdf",
            params={"fecha_inicio": "2020-01-01", "fecha_fin": "2025-12-31", "periodo": "mes"},
            headers=self._bearer(token),
        )
        self.assertEqual(r_pdf.status_code, 200, r_pdf.text)
        self.assertGreaterEqual(_contar_paginas(r_pdf.content), 3)

    def test_detalle_no_duplica_venta_por_joins(self):
        p = self._pedido("Pagado", 1500.0)
        for i in range(2):
            self.db.add(DetallePedido(
                id_pedido_d=p.id_pedido,
                id_producto_d=None,
                cantidad_detalle=1,
                precio_unitario_detalle=750.0,
                subtotal_detalle=750.0,
                descripcion_detalle=f"linea {i}",
            ))
        self.db.commit()

        admin = self._crear_admin("rv")
        token = self._token(self._login(admin.email))
        r = self._get_ventas(token)
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual(r.json()["resumen"]["total_pedidos"], 1)
        self.assertEqual(r.json()["resumen"]["total_ventas_pedidos"], 1500.0)

    def test_reporte_vacio_sin_pedidos_pagados(self):
        self._pedido("Pago rechazado", 5000.0)

        admin = self._crear_admin("rv")
        token = self._token(self._login(admin.email))
        r = self._get_ventas(token)
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual(r.json()["resumen"]["total_pedidos"], 0)
        self.assertEqual(r.json()["resumen"]["total_ingresos"], 0.0)
        self.assertEqual(r.json()["ventas_por_periodo"], [])

    def test_pagado_con_entrega_avanzada_sigue_contando(self):
        # El estado de ENTREGA no altera estado_pedido: una venta entregada
        # (o con instalación/posventa) sigue siendo "Pagado" y debe contar.
        p = self._pedido("Pagado", 1500.0)
        p.estado_entrega = "Entregado"
        self.db.commit()

        admin = self._crear_admin("rv")
        token = self._token(self._login(admin.email))
        r = self._get_ventas(token)
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual(r.json()["resumen"]["total_pedidos"], 1)
        self.assertEqual(r.json()["resumen"]["total_ventas_pedidos"], 1500.0)

    def test_validacion_fechas(self):
        admin = self._crear_admin("rv")
        token = self._token(self._login(admin.email))
        # Solo una fecha: 400.
        r = self._get("/api/v1/reports/ventas", params={"fecha_inicio": "2020-01-01"}, headers=self._bearer(token))
        self.assertEqual(r.status_code, 400)
        # fin < inicio: 400.
        r = self._get("/api/v1/reports/ventas", params={"fecha_inicio": "2020-02-01", "fecha_fin": "2020-01-01"}, headers=self._bearer(token))
        self.assertEqual(r.status_code, 400)

    def test_permisos_anonimo_y_tecnico_rechazados(self):
        admin = self._crear_admin("rv")
        self._token(self._login(admin.email))

        self.assertEqual(self._get("/api/v1/reports/ventas", params=self._params()).status_code, 401)

        tecnico_u, _ = self._crear_tecnico("rv")
        token_tec = self._token(self._login(tecnico_u.email))
        self.assertEqual(self._get_ventas(token_tec).status_code, 403)

    def test_pdf_valido_con_totales(self):
        self._pedido("Pagado", 1500.0)
        self._pedido("Pagado", 2500.0)

        admin = self._crear_admin("rv")
        token = self._token(self._login(admin.email))
        r = self._get("/api/v1/reports/ventas/pdf", params=self._params(), headers=self._bearer(token))
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual(r.headers.get("content-type"), "application/pdf")
        cuerpo = r.content
        self.assertTrue(cuerpo.startswith(b"%PDF"), "no inicia con %PDF")
        self.assertIn(b"%%EOF", cuerpo)

        texto = _extraer_texto_pdf(cuerpo)
        self.assertIn("REPORTE DE VENTAS", texto)
        self.assertIn("Ventas brutas", texto)  # etiqueta de ventas brutas (sin descontar reembolsos)
        self.assertIn("$4.000,00 COP", texto)  # 1500 + 2500, con 2 decimales


def _contar_paginas(pdf: bytes) -> int:
    """Cuenta los objetos /Type /Page (sin depender de una librería de PDF)."""
    return len(re.findall(rb"/Type\s*/Page[^s]", pdf))


def _extraer_texto_pdf(pdf: bytes) -> str:
    """Extrae texto plano decodificando los streams FlateDecode (A85) de reportlab."""
    from reportlab.pdfbase.pdfutils import asciiBase85Decode

    fragmentos = []
    for m in re.finditer(rb"stream\r?\n(.*?)endstream", pdf, re.S):
        crudo = m.group(1).rstrip(b"\r\n")
        try:
            crudo = zlib.decompress(asciiBase85Decode(crudo.decode("latin-1")))
        except Exception:
            try:
                crudo = zlib.decompress(crudo)
            except Exception:
                crudo = b""
        fragmentos.append(crudo)
    return b"\n".join(fragmentos).decode("latin-1", errors="ignore")


if __name__ == "__main__":
    unittest.main()
