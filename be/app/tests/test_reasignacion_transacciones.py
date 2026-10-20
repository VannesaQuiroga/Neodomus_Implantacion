"""Regresiones del límite de commit, búsqueda y cancelación de reasignaciones.

Requiere TEST_DATABASE_URL y ejecuta el servicio real sobre MySQL de pruebas.
Solo se inyectan fallos en los límites transaccionales o se anulan avisos.
"""
from datetime import timedelta
from unittest.mock import patch

import app.tests.testdb  # noqa: F401
from sqlalchemy.exc import OperationalError

from app.database import SessionLocal
from app.models.cita import Cita
from app.models.especializacion import HistorialCita, Reembolso
from app.services import asignacion_service as servicio
from app.tests.test_bloque_21_cierre import BaseCierreTestCase
from app.tests.test_bloque_2 import _crear_cita


class LimiteTransaccionalTestCase(BaseCierreTestCase):
    def setUp(self):
        super().setUp()
        self.productos_creados = []

    def preparar(self, segundo=False):
        a = self._tecnico("a", ids_esp=[1])
        b = self._tecnico("b", ids_esp=[1])
        z = self._tecnico("z", ids_esp=[1]) if segundo else None
        cita = _crear_cita(self.db, self.cliente.id_cliente, a.id_tecnico,
                           self._fecha(), "08:00", id_tecnico_2=z.id_tecnico if z else None)
        cita.id_especializacion = 1
        cita.estado_pago = "aprobado"
        cita.costo_cita = 100
        self.db.commit()
        self._track_cita(cita)
        return cita.id_cita, a.id_tecnico, b.id_tecnico, z.id_tecnico if z else None

    def ejecutar(self, cid, aid):
        cita = self.db.get(Cita, cid)
        return servicio.reasignar_cita_automatica(self.db, cita, excluir_ids={aid})

    def cuentas(self, cid):
        self.db.rollback()
        return (self.db.query(HistorialCita).filter_by(id_cita=cid).count(),
                self.db.query(Reembolso).filter_by(id_cita=cid).count())

    def tearDown(self):
        self.db.rollback()
        self.db.query(Reembolso).filter(Reembolso.id_cita.in_(self._ids_cita)).delete(synchronize_session=False)
        self.db.commit()
        super().tearDown()
        if self.productos_creados:
            from app.models.producto import Producto
            self.db.query(Producto).filter(Producto.id_producto.in_(self.productos_creados)).delete(synchronize_session=False)
            self.db.commit()

    def test_E1_timeout_antes_commit_reintenta_sin_duplicar(self):
        cid, aid, bid, _ = self.preparar()
        commit_real = self.db.commit
        llamadas = []

        def commit():
            llamadas.append(1)
            # Historial ya fue insertado por flush: rollback debe eliminarlo.
            self.assertEqual(self.db.query(HistorialCita).filter_by(id_cita=cid).count(), 1)
            if len(llamadas) == 1:
                raise OperationalError("commit", {}, Exception(1205, "timeout inyectado"))
            commit_real()

        with patch.object(self.db, "commit", side_effect=commit), \
             patch.object(servicio, "_notificar_cliente_reasignacion") as cliente, \
             patch.object(servicio, "_notificar_tecnico_asignacion") as tecnico:
            resultado = self.ejecutar(cid, aid)
        self.assertEqual(resultado["estado"], "reasignada")
        self.assertEqual(len(llamadas), 2)
        self.assertEqual((cliente.call_count, tecnico.call_count), (1, 1))
        self.assertEqual(self.cuentas(cid), (1, 0))
        self.assertEqual(self.db.get(Cita, cid).id_tecnico, bid)

    def test_E2_lectura_post_commit_no_reintenta(self):
        cid, aid, bid, _ = self.preparar()
        with self.assertLogs(servicio.__name__, level="ERROR"), \
             patch.object(servicio, "_intentar_reasignar", wraps=servicio._intentar_reasignar) as intento, \
             patch.object(servicio, "_enviar_avisos", side_effect=OperationalError("SELECT avisos", {}, Exception(1205, "timeout"))):
            resultado = self.ejecutar(cid, aid)
        self.assertEqual(intento.call_count, 1)
        self.assertTrue(resultado["avisos_pendientes"])
        self.assertEqual(self.cuentas(cid), (1, 0))
        self.assertEqual(self.db.get(Cita, cid).id_tecnico, bid)

    def test_E3_timeout_agotado_revierte_sin_avisos(self):
        cid, aid, _, _ = self.preparar()
        with patch.object(self.db, "commit", side_effect=OperationalError("commit", {}, Exception(1205, "timeout"))) as commit, \
             patch.object(servicio, "_enviar_avisos") as avisos:
            resultado = self.ejecutar(cid, aid)
        self.assertEqual(commit.call_count, 3)
        avisos.assert_not_called()
        self.assertEqual(resultado["conflicto"], "reintentos_agotados")
        self.assertEqual(self.cuentas(cid), (0, 0))
        self.assertEqual(self.db.get(Cita, cid).estado, "Confirmada")
        self.assertEqual(self.db.get(Cita, cid).id_tecnico, aid)

    def test_error_no_reintentable_se_propaga(self):
        cid, aid, _, _ = self.preparar()
        with patch.object(self.db, "commit", side_effect=OperationalError("commit", {}, Exception(9999, "otro"))) as commit, \
             patch.object(servicio, "_enviar_avisos") as avisos:
            with self.assertRaises(OperationalError):
                self.ejecutar(cid, aid)
        self.assertEqual(commit.call_count, 1)
        avisos.assert_not_called()
        self.assertEqual(self.cuentas(cid), (0, 0))

    def test_limite_busqueda_no_cancela_aunque_haya_mas_horarios(self):
        cid, aid, bid, zid = self.preparar(segundo=True)
        fecha = self.db.get(Cita, cid).fecha
        self._track_cita(_crear_cita(self.db, self.cliente.id_cliente, bid, fecha, "08:00"))
        fecha += timedelta(days=1)
        creadas = 0
        while creadas < 10:
            if fecha.weekday() != 6:
                for hora in ("08:00", "11:00", "14:00", "17:00"):
                    if creadas == 10:
                        break
                    self._track_cita(_crear_cita(self.db, self.cliente.id_cliente, zid, fecha, hora))
                    creadas += 1
            fecha += timedelta(days=1)
        with patch.object(servicio, "_enviar_avisos") as avisos:
            resultado = self.ejecutar(cid, aid)
        self.assertEqual(resultado.get("conflicto"), "busqueda_limitada")
        avisos.assert_not_called()
        self.assertEqual(self.cuentas(cid), (0, 0))
        self.assertEqual(self.db.get(Cita, cid).estado, "Confirmada")

    def test_C_cancelacion_no_sobrescribe_cambio_de_hora(self):
        cid, aid, bid, _ = self.preparar()
        # Sin candidatos aptos: desactivar al único reemplazo.
        from app.models.tecnico import Tecnico
        self.db.get(Tecnico, bid).usuario.is_active = False
        self.db.commit()
        cancelar_real = servicio._cancelar_cita

        def cambiar_y_cancelar(db, cita_id, admin, huella):
            with SessionLocal() as otra:
                cita = otra.get(Cita, cita_id)
                cita.hora = "14:00"
                otra.commit()
            return cancelar_real(db, cita_id, admin, huella)

        with patch.object(servicio, "_cancelar_cita", side_effect=cambiar_y_cancelar), \
             patch.object(servicio, "_enviar_avisos"):
            resultado = self.ejecutar(cid, aid)
        self.assertEqual(resultado["estado"], "sin_cambio")
        self.assertEqual(self.cuentas(cid), (0, 0))
        self.assertEqual(self.db.get(Cita, cid).hora, "14:00")

    def test_cancelacion_real_guarda_historial_y_reembolso_atomicamente(self):
        cid, aid, bid, _ = self.preparar()
        from app.models.tecnico import Tecnico
        self.db.get(Tecnico, bid).usuario.is_active = False
        self.db.commit()
        with patch.object(servicio, "_enviar_avisos") as avisos:
            resultado = self.ejecutar(cid, aid)
        self.assertEqual(resultado["estado"], "cancelada")
        self.assertEqual(self.cuentas(cid), (1, 1))
        self.assertEqual(self.db.get(Cita, cid).estado, "Cancelada")
        self.assertEqual(avisos.call_count, 1)

    def test_C_requisitos_producto_cambiados_no_usan_instantanea_antigua(self):
        from app.models.producto import Producto
        from app.models.cita_producto import CitaProducto
        cid, aid, _, _ = self.preparar()
        producto = Producto(nombre_producto="Prueba de duración", dificultad_instalacion="baja")
        self.db.add(producto)
        self.db.flush()
        pid = producto.id_producto
        self.productos_creados.append(pid)
        item = CitaProducto(id_cita=cid, id_producto=pid, cantidad=1)
        self.db.add(item)
        self.db.commit()
        leer_real = servicio._leer_cita_bloqueada

        def cambiar_y_leer(db, cita_id):
            with SessionLocal() as otra:
                actual = otra.query(CitaProducto).filter_by(id_cita=cid).one()
                actual.cantidad = 3
                otra.commit()
            return leer_real(db, cita_id)

        with patch.object(servicio, "_leer_cita_bloqueada", side_effect=cambiar_y_leer), \
             patch.object(servicio, "_enviar_avisos") as avisos:
            resultado = self.ejecutar(cid, aid)
        self.assertEqual(resultado["estado"], "sin_cambio")
        self.assertEqual(self.cuentas(cid), (0, 0))
        self.assertEqual(self.db.get(Cita, cid).id_tecnico, aid)
        self.assertEqual(self.db.query(CitaProducto).filter_by(id_cita=cid).one().cantidad, 3)
        avisos.assert_not_called()
