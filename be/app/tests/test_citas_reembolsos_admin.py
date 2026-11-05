"""Citas y reembolsos en el panel administrativo.

Reproduce dos defectos reportados:
- El resumen del dashboard solo mostraba citas confirmadas aunque existieran
  citas pendientes.
- Al cancelar una cita desde admin se borraba el registro y el reembolso
  quedaba sin cita, cliente ni historial asociado.
"""
import unittest
from concurrent.futures import ThreadPoolExecutor
from datetime import date, timedelta
from threading import Barrier
from unittest.mock import patch

import app.tests.testdb  # noqa: F401

from app.models.cita import Cita
from app.models.especializacion import HistorialCita, Reembolso
from app.tests.test_t1_identidad import BaseT1TestCase


class CitasReembolsosAdminTestCase(BaseT1TestCase):
    def setUp(self):
        super().setUp()
        self._ids_reembolso = []
        self._ids_historial = []

    def tearDown(self):
        for cid in self._ids_cita:
            self.db.query(Reembolso).filter(
                Reembolso.id_cita == cid
            ).delete(synchronize_session=False)
            self.db.query(HistorialCita).filter(
                HistorialCita.id_cita == cid
            ).delete(synchronize_session=False)
        for rid in self._ids_reembolso:
            self.db.query(Reembolso).filter(
                Reembolso.id_reembolso == rid
            ).delete(synchronize_session=False)
        for hid in self._ids_historial:
            self.db.query(HistorialCita).filter(
                HistorialCita.id_historial == hid
            ).delete(synchronize_session=False)
        self.db.commit()
        super().tearDown()

    def _crear_cita_pagada(self, cliente, estado="Pendiente", transaccion="TX-ADMIN-REPRO"):
        cita = Cita(
            id_cliente=cliente.id_cliente,
            tipo_servicio="mantenimiento",
            fecha=date.today() + timedelta(days=20),
            hora="08:00",
            direccion="Calle de prueba 123",
            estado=estado,
            costo_cita=100000,
            metodo_pago="tarjeta",
            estado_pago="aprobado",
            numero_transaccion=transaccion,
        )
        self.db.add(cita)
        self.db.commit()
        self.db.refresh(cita)
        self._ids_cita.append(cita.id_cita)
        return cita

    def _cancelar_admin(self, cita, headers):
        return self._put(
            f"/api/v1/citas/admin/{cita.id_cita}",
            headers=headers,
            json={"estado": "Cancelada"},
        )

    def _contar(self, cita):
        self._resincronizar()
        historial = (
            self.db.query(HistorialCita)
            .filter(
                HistorialCita.id_cita == cita.id_cita,
                HistorialCita.accion == "cancelacion",
            )
            .count()
        )
        reembolsos = (
            self.db.query(Reembolso)
            .filter(Reembolso.id_cita == cita.id_cita)
            .count()
        )
        return historial, reembolsos

    def test_cancelacion_admin_falla_intermedia_no_deja_cambios(self):
        admin = self._crear_admin()
        cliente = self._crear_cliente("falla")
        cita = self._crear_cita_pagada(cliente, transaccion="TX-FALLA")
        headers = self._bearer(self._token(self._login(admin.email)))

        with patch(
            "app.services.asignacion_service.registrar_historial",
            side_effect=RuntimeError("fallo inducido"),
        ):
            with self.assertRaises(Exception):
                self._cancelar_admin(cita, headers)

        self._resincronizar()
        cita_db = self.db.query(Cita).filter(Cita.id_cita == cita.id_cita).first()
        self.assertEqual(cita_db.estado, "Pendiente")
        self.assertEqual(self._contar(cita), (0, 0))

    def test_cancelacion_admin_notifica_una_sola_vez(self):
        admin = self._crear_admin()
        cliente = self._crear_cliente("aviso")
        cita = self._crear_cita_pagada(cliente, transaccion="TX-AVISO")
        headers = self._bearer(self._token(self._login(admin.email)))

        with patch(
            "app.services.notificaciones.notificar_cita_estado_cliente"
        ) as aviso:
            respuesta = self._cancelar_admin(cita, headers)
        self.assertEqual(respuesta.status_code, 200, respuesta.text)
        self.assertEqual(aviso.call_count, 1)
        self.assertEqual(self._contar(cita), (1, 1))

    def test_cancelacion_admin_repetida_no_duplica(self):
        admin = self._crear_admin()
        cliente = self._crear_cliente("repite")
        cita = self._crear_cita_pagada(cliente, transaccion="TX-REPITE")
        headers = self._bearer(self._token(self._login(admin.email)))

        with patch(
            "app.services.notificaciones.notificar_cita_estado_cliente"
        ) as aviso:
            primera = self._cancelar_admin(cita, headers)
            segunda = self._cancelar_admin(cita, headers)
        self.assertEqual(primera.status_code, 200, primera.text)
        self.assertEqual(segunda.status_code, 200, segunda.text)
        self.assertEqual(aviso.call_count, 1)
        self.assertEqual(self._contar(cita), (1, 1))

    def test_cancelacion_admin_concurrente_no_duplica(self):
        admin = self._crear_admin()
        cliente = self._crear_cliente("concurrente")
        cita = self._crear_cita_pagada(cliente, transaccion="TX-CONCURRENTE")
        headers = self._bearer(self._token(self._login(admin.email)))
        barrera = Barrier(2)

        def cancelar(_):
            barrera.wait(timeout=10)
            return self._cancelar_admin(cita, headers)

        with patch(
            "app.services.notificaciones.notificar_cita_estado_cliente"
        ) as aviso:
            with ThreadPoolExecutor(max_workers=2) as pool:
                respuestas = list(pool.map(cancelar, range(2)))

        for respuesta in respuestas:
            self.assertEqual(respuesta.status_code, 200, respuesta.text)
        self.assertEqual(aviso.call_count, 1)
        self.assertEqual(self._contar(cita), (1, 1))

    def test_cancelacion_admin_fallo_de_aviso_no_revierte(self):
        admin = self._crear_admin()
        cliente = self._crear_cliente("sinaaviso")
        cita = self._crear_cita_pagada(cliente, transaccion="TX-SINAVISO")
        headers = self._bearer(self._token(self._login(admin.email)))

        with patch(
            "app.services.notificaciones.notificar_cita_estado_cliente",
            side_effect=RuntimeError("SMTP caido"),
        ):
            respuesta = self._cancelar_admin(cita, headers)

        self.assertEqual(respuesta.status_code, 200, respuesta.text)
        self._resincronizar()
        cita_db = self.db.query(Cita).filter(Cita.id_cita == cita.id_cita).first()
        self.assertEqual(cita_db.estado, "Cancelada")
        self.assertEqual(self._contar(cita), (1, 1))

    def test_cancelacion_admin_requiere_rol_admin(self):
        cliente = self._crear_cliente("sinpermiso")
        _, tecnico = self._crear_tecnico("sinpermiso")
        cita = self._crear_cita_pagada(cliente, transaccion="TX-SINPERMISO")
        token = self._token(self._login(tecnico.usuario.email))
        headers = self._bearer(token)

        respuesta = self._cancelar_admin(cita, headers)
        self.assertEqual(respuesta.status_code, 403, respuesta.text)
        self.assertEqual(self._contar(cita), (0, 0))

    def test_resumen_incluye_citas_pendientes(self):
        admin = self._crear_admin()
        token = self._token(self._login(admin.email))
        headers = self._bearer(token)

        antes = self._get("/api/v1/reports/resumen", headers=headers)
        self.assertEqual(antes.status_code, 200, antes.text)
        base_total = antes.json()["citas_total"]
        base_pendientes = antes.json()["citas_por_estado"]["Pendiente"]

        cliente = self._crear_cliente("resumen")
        self._crear_cita_pagada(cliente, transaccion="TX-RESUMEN")

        despues = self._get("/api/v1/reports/resumen", headers=headers)
        self.assertEqual(despues.status_code, 200, despues.text)
        datos = despues.json()
        self.assertEqual(datos["citas_total"], base_total + 1)
        self.assertEqual(datos["citas_por_estado"]["Pendiente"], base_pendientes + 1)

    def test_cancelacion_admin_conserva_cita_reembolso_e_historial(self):
        admin = self._crear_admin()
        cliente = self._crear_cliente("cancela")
        cita = self._crear_cita_pagada(cliente, transaccion="TX-CANCELA")
        token = self._token(self._login(admin.email))
        headers = self._bearer(token)

        respuesta = self._put(
            f"/api/v1/citas/admin/{cita.id_cita}",
            headers=headers,
            json={"estado": "Cancelada"},
        )
        self.assertEqual(respuesta.status_code, 200, respuesta.text)

        self._resincronizar()
        cita_db = self.db.query(Cita).filter(Cita.id_cita == cita.id_cita).first()
        self.assertIsNotNone(cita_db)
        self.assertEqual(cita_db.estado, "Cancelada")

        reembolso = (
            self.db.query(Reembolso)
            .filter(Reembolso.id_cita == cita.id_cita)
            .first()
        )
        self.assertIsNotNone(reembolso)
        self._ids_reembolso.append(reembolso.id_reembolso)
        self.assertEqual(reembolso.estado, "Pendiente")
        self.assertEqual(float(reembolso.monto), 100000.0)

        historial = (
            self.db.query(HistorialCita)
            .filter(
                HistorialCita.id_cita == cita.id_cita,
                HistorialCita.accion == "cancelacion",
            )
            .first()
        )
        self.assertIsNotNone(historial)
        self._ids_historial.append(historial.id_historial)

        lista = self._get("/api/v1/reembolsos", headers=headers)
        self.assertEqual(lista.status_code, 200, lista.text)
        fila = next(
            x for x in lista.json() if x["id_reembolso"] == reembolso.id_reembolso
        )
        self.assertEqual(fila["id_cita"], cita.id_cita)
        self.assertIn(f"Cita #{cita.id_cita}", fila["referencia"])
        self.assertIn("Cliente cancela", fila["cliente_nombre"] or "")

        historial_api = self._get(
            "/api/v1/citas/admin/reasignaciones-historial", headers=headers
        )
        self.assertEqual(historial_api.status_code, 200, historial_api.text)
        entrada = next(
            x for x in historial_api.json() if x["id_historial"] == historial.id_historial
        )
        self.assertEqual(entrada["accion"], "cancelacion")
        self.assertIsNotNone(entrada["reembolso"])
        self.assertEqual(
            entrada["reembolso"]["id_reembolso"], reembolso.id_reembolso
        )

    def test_reembolso_historico_sin_cita_conserva_identificacion(self):
        admin = self._crear_admin()
        token = self._token(self._login(admin.email))
        reembolso = Reembolso(
            id_cita=None,
            id_pedido=None,
            monto=85000,
            estado="Pendiente",
            motivo="Cancelación realizada por el administrador",
            numero_transaccion_original="TX-HUERFANO",
        )
        self.db.add(reembolso)
        self.db.commit()
        self.db.refresh(reembolso)
        self._ids_reembolso.append(reembolso.id_reembolso)

        respuesta = self._get(
            "/api/v1/reembolsos", headers=self._bearer(token)
        )
        self.assertEqual(respuesta.status_code, 200, respuesta.text)
        fila = next(
            x for x in respuesta.json() if x["id_reembolso"] == reembolso.id_reembolso
        )
        self.assertEqual(fila["referencia"], f"Reembolso #{reembolso.id_reembolso}")
        self.assertIn("TX-HUERFANO", fila["detalle"] or "")
        self.assertIn("Cancelación", fila["detalle"] or "")


if __name__ == "__main__":
    unittest.main(verbosity=2)
