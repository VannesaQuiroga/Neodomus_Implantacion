"""Pruebas de comportamiento del bloque 1: estados de entrega coherentes.

- ``TransicionTecnicoTestCase`` y ``AsignacionReasignableTestCase`` son puras
  (no tocan la base de datos) y validan la máquina de estados.
- ``IntegracionEntregasTestCase`` crea sus propios cliente, técnico y usuario
  (fixtures con identificadores únicos) y un pedido desechable, ejercita el
  endpoint real ``actualizar_estado_entrega_tecnico`` y elimina todo al final.
  No depende de registros preexistentes (ni ``Tecnico.first()`` ni
  ``Cliente.first()``).
"""
import unittest
from datetime import date, timedelta
from unittest.mock import patch

from fastapi import HTTPException

import app.tests.testdb  # noqa: F401  (configura la base de pruebas y bloquea si no está definida)

from app.services.estados_entrega import (
    ESTADOS_ACCION_TECNICO,
    ORDEN_ESTADOS_ENTREGA,
    asignacion_reasignable,
    validar_transicion_tecnico,
)
from app.tests.test_bloque_2 import _crear_cliente, _crear_tecnico


class TransicionTecnicoTestCase(unittest.TestCase):
    def test_orden_canonico(self):
        self.assertEqual(
            ORDEN_ESTADOS_ENTREGA,
            ("Pendiente", "Asignada", "Recogido", "En camino", "Entregado"),
        )

    def test_secuencia_normal_avanza_un_paso(self):
        self.assertEqual(validar_transicion_tecnico("Asignada", "Recogido"), (True, None))
        self.assertEqual(validar_transicion_tecnico("Recogido", "En camino"), (True, None))
        self.assertEqual(validar_transicion_tecnico("En camino", "Entregado"), (True, None))

    def test_estado_vacio_se_trata_como_asignada(self):
        self.assertEqual(validar_transicion_tecnico(None, "Recogido"), (True, None))
        self.assertEqual(validar_transicion_tecnico("", "Recogido"), (True, None))

    def test_no_salta_etapas(self):
        ok, err = validar_transicion_tecnico("Asignada", "En camino")
        self.assertFalse(ok)
        self.assertIn("sin completar", err)
        ok, err = validar_transicion_tecnico("Asignada", "Entregado")
        self.assertFalse(ok)
        self.assertIn("sin completar", err)
        ok, err = validar_transicion_tecnico("Recogido", "Entregado")
        self.assertFalse(ok)

    def test_no_retrocede(self):
        ok, err = validar_transicion_tecnico("En camino", "Recogido")
        self.assertFalse(ok)
        self.assertIn("retroceder", err)
        ok, _ = validar_transicion_tecnico("Recogido", "Asignada")
        self.assertFalse(ok)

    def test_repetir_estado_actual_es_valido(self):
        self.assertEqual(validar_transicion_tecnico("En camino", "En camino"), (True, None))
        self.assertEqual(validar_transicion_tecnico("Recogido", "Recogido"), (True, None))

    def test_objetivo_administrativo_rechazado_para_tecnico(self):
        ok, err = validar_transicion_tecnico("Asignada", "Asignada")
        self.assertFalse(ok)
        ok, err = validar_transicion_tecnico("Asignada", "Pendiente")
        self.assertFalse(ok)
        ok, err = validar_transicion_tecnico("Recogido", "hola")
        self.assertFalse(ok)

    def test_entregado_es_terminal(self):
        for objetivo in ESTADOS_ACCION_TECNICO:
            if objetivo == "Entregado":
                continue
            ok, _ = validar_transicion_tecnico("Entregado", objetivo)
            self.assertFalse(ok)

    def test_estado_desconocido_rechazado(self):
        ok, err = validar_transicion_tecnico("EstadoRaro", "Recogido")
        self.assertFalse(ok)


class AsignacionReasignableTestCase(unittest.TestCase):
    def test_estados_administrativos_son_reasignables(self):
        self.assertTrue(asignacion_reasignable("Pendiente"))
        self.assertTrue(asignacion_reasignable("Asignada"))
        self.assertTrue(asignacion_reasignable(None))

    def test_custodia_y_terminal_no_son_reasignables(self):
        self.assertFalse(asignacion_reasignable("Recogido"))
        self.assertFalse(asignacion_reasignable("En camino"))
        self.assertFalse(asignacion_reasignable("Entregado"))


class IntegracionEntregasTestCase(unittest.TestCase):
    """Ejercita el endpoint real contra la base de pruebas aislada.

    Crea sus propios cliente, técnico y usuario (fixtures) con identificadores
    únicos y los elimina en ``tearDownClass``. El pedido desechable se crea y
    elimina por test. No depende de registros sembrados.
    """

    @classmethod
    def setUpClass(cls):
        from app.database import SessionLocal

        cls.db = SessionLocal()
        cls.cliente = _crear_cliente(cls.db)
        cls.tecnico = _crear_tecnico(cls.db, "entregas")
        # Capturar ids como enteros para la limpieza (sin lazy-load en tearDown).
        cls.cliente_id = cls.cliente.id_cliente
        cls.tecnico_id = cls.tecnico.id_tecnico
        cls.usuario_id = cls.tecnico.id_usuario_t

    @classmethod
    def tearDownClass(cls):
        from app.models.cliente import Cliente
        from app.models.tecnico import Tecnico
        from app.models.user import User

        # Orden de borrado por claves foráneas: técnico → usuario → cliente.
        cls.db.query(Tecnico).filter(Tecnico.id_tecnico == cls.tecnico_id).delete(
            synchronize_session=False
        )
        cls.db.query(User).filter(User.id_usuario == cls.usuario_id).delete(
            synchronize_session=False
        )
        cls.db.query(Cliente).filter(Cliente.id_cliente == cls.cliente_id).delete(
            synchronize_session=False
        )
        cls.db.commit()
        cls.db.close()

    def setUp(self):
        from app.models.pedido import Pedido

        self.pedido_id = None
        pedido = Pedido(
            id_cliente_pe=self.cliente.id_cliente,
            estado_pedido="Pagado",
            estado_entrega="Asignada",
            id_tecnico_entrega=self.tecnico.id_tecnico,
            nombre_tecnico_entrega="Técnico de prueba",
            fecha_entrega=date.today() + timedelta(days=2),
            hora_entrega="10:00",
        )
        self.db.add(pedido)
        self.db.commit()
        self.pedido_id = pedido.id_pedido

    def tearDown(self):
        if self.pedido_id is not None:
            from app.models.evidencia import EvidenciaEntrega
            from app.models.pedido import Pedido

            self.db.query(EvidenciaEntrega).filter(
                EvidenciaEntrega.id_pedido == self.pedido_id
            ).delete()
            self.db.query(Pedido).filter(Pedido.id_pedido == self.pedido_id).delete()
            self.db.commit()
            self.pedido_id = None

    def _estado(self):
        from app.models.pedido import Pedido

        pedido = self.db.query(Pedido).filter(Pedido.id_pedido == self.pedido_id).first()
        return pedido.estado_entrega

    def _actualizar(self, estado):
        from app.routers.tecnicos import EstadoEntregaUpdate, actualizar_estado_entrega_tecnico

        with patch(
            "app.services.notificaciones.notificar_recogido_cliente",
        ), patch(
            "app.services.notificaciones.notificar_en_camino_cliente",
        ), patch(
            "app.services.notificaciones.notificar_pedido_entregado_cliente",
        ):
            return actualizar_estado_entrega_tecnico(
                self.pedido_id,
                EstadoEntregaUpdate(estado=estado),
                current_user=self.tecnico.usuario,
                db=self.db,
            )

    def test_consultar_entregas_no_modifica_estado(self):
        from app.routers.tecnicos import mis_entregas_tecnico

        antes = self._estado()
        mis_entregas_tecnico(current_user=self.tecnico.usuario, db=self.db)
        self.assertEqual(self._estado(), antes)
        self.assertEqual(antes, "Asignada")

    def test_secuencia_completa_del_tecnico(self):
        self._actualizar("Recogido")
        self.assertEqual(self._estado(), "Recogido")
        self._actualizar("En camino")
        self.assertEqual(self._estado(), "En camino")

    def test_no_salta_directo_asignada_a_entregado(self):
        with self.assertRaises(HTTPException) as ctx:
            self._actualizar("Entregado")
        self.assertEqual(ctx.exception.status_code, 409)
        self.assertEqual(self._estado(), "Asignada")

    def test_no_retrocede_de_en_camino_a_recogido(self):
        self._actualizar("Recogido")
        self._actualizar("En camino")
        with self.assertRaises(HTTPException) as ctx:
            self._actualizar("Recogido")
        self.assertEqual(ctx.exception.status_code, 409)
        self.assertEqual(self._estado(), "En camino")

    def test_no_entrega_sin_evidencia(self):
        self._actualizar("Recogido")
        self._actualizar("En camino")
        with self.assertRaises(HTTPException) as ctx:
            self._actualizar("Entregado")
        self.assertEqual(ctx.exception.status_code, 400)
        self.assertEqual(self._estado(), "En camino")

    def test_entrega_con_evidencia_y_es_terminal(self):
        from app.models.evidencia import EvidenciaEntrega

        self._actualizar("Recogido")
        self._actualizar("En camino")
        self.db.add(
            EvidenciaEntrega(
                id_pedido=self.pedido_id,
                id_tecnico=self.tecnico.id_tecnico,
                url_archivo="evidencias_entrega/test.jpg",
            )
        )
        self.db.commit()
        self._actualizar("Entregado")
        self.assertEqual(self._estado(), "Entregado")

        # Entregado es terminal: no se puede retroceder.
        with self.assertRaises(HTTPException) as ctx:
            self._actualizar("En camino")
        self.assertEqual(ctx.exception.status_code, 409)

    def test_repetir_estado_actual_no_duplica_transicion(self):
        from app.models.pedido import Pedido

        self._actualizar("Recogido")
        pedido = self.db.query(Pedido).filter(Pedido.id_pedido == self.pedido_id).first()
        marca_antes = pedido.entrega_actualizada_en

        resultado = self._actualizar("Recogido")  # no-op
        self.assertIsNotNone(resultado)
        self.assertEqual(self._estado(), "Recogido")

        self.db.expire_all()
        pedido = self.db.query(Pedido).filter(Pedido.id_pedido == self.pedido_id).first()
        marca_despues = pedido.entrega_actualizada_en
        self.assertEqual(marca_antes, marca_despues)

    def test_asignacion_ordinaria_no_reinicia_entrega_en_curso(self):
        from app.routers.pedidos import EntregaAsignarRequest, asignar_entrega_admin

        self._actualizar("Recogido")
        with self.assertRaises(HTTPException) as ctx:
            asignar_entrega_admin(
                self.pedido_id,
                EntregaAsignarRequest(id_tecnico=None),
                admin_user=None,
                db=self.db,
            )
        self.assertEqual(ctx.exception.status_code, 409)
        self.assertEqual(self._estado(), "Recogido")


if __name__ == "__main__":
    unittest.main(verbosity=2)
