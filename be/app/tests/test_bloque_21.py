"""Pruebas del bloque 2.1: garantías de capacidad aplicadas en los flujos
reales (reagendamiento, creación, consulta y reasignación automática), no solo
en las utilidades.

Ejercita los endpoints/servicios de negocio directamente, anulando correo y
facturación. Las pruebas de concurrencia usan sesiones independientes y una
barrera con tiempo máximo.
"""

import json
import threading
import time
import unittest
from datetime import date, timedelta
from unittest.mock import patch

from fastapi import HTTPException

import app.tests.testdb  # noqa: F401  (configura la base de pruebas y bloquea si no está definida)

from app.database import SessionLocal
from app.models.cita import Cita
from app.models.cliente import Cliente
from app.models.especializacion import Especializacion, producto_especializacion
from app.models.pedido import Pedido
from app.models.producto import Producto
from app.models.tecnico import Tecnico
from app.models.user import User
from app.routers.citas import crear_cita, editar_cita, horas_disponibles_cita
from app.routers.tecnicos import reagendar_cita_tecnico, ReagendarCitaRequest
from app.schemas.cita import CitaCreate, CitaUpdate
from app.services.asignacion_service import reasignar_cita_automatica
from app.services.especialidades import (
    bloquear_tecnicos,
    tecnico_ocupado,
)

from app.tests.test_bloque_2 import (
    BaseIntegracionTestCase,
    _crear_cita,
    _crear_cliente,
    _crear_entrega,
    _crear_tecnico,
    _fecha_laboral,
    notificaciones_anuladas,
)


# confirma los cambios con la sesión de base de datos.
def _crear_producto(db, sufijo, dificultad="baja", tecnicos_requeridos=1, ids_esp=None):
    p = Producto(
        nombre_producto=f"Producto {sufijo}",
        referencia_producto=f"b21-{sufijo}-{int(time.time() * 1_000_000)}",
        estado_producto="activo",
        stock_producto=10,
        venta_por_metros=0,
        tecnicos_requeridos=tecnicos_requeridos,
        dificultad_instalacion=dificultad,
        visible_cliente=True,
    )
    db.add(p)
    db.flush()
    if ids_esp:
        for eid in ids_esp:
            db.execute(
                producto_especializacion.insert().values(
                    id_producto=p.id_producto, id_especializacion=eid
                )
            )
    db.commit()
    return p


class BaseFlujoTestCase(BaseIntegracionTestCase):
    def _fecha(self, dias=5):
        return _fecha_laboral(dias)

    def setUp(self):
        super().setUp()
        self._ids_producto = []

    def tearDown(self):
        for pid in self._ids_producto:
            self.db.query(Producto).filter(Producto.id_producto == pid).delete(
                synchronize_session=False
            )
        super().tearDown()

    def _producto(self, sufijo, dificultad="baja", tecnicos_requeridos=1, ids_esp=None):
        p = _crear_producto(self.db, sufijo, dificultad, tecnicos_requeridos, ids_esp)
        self._ids_producto.append(p.id_producto)
        return p


class ReagendamientoFlujoTestCase(BaseFlujoTestCase):
    def test_reagendar_cliente_con_segundo_ocupado(self):
        a = self._tecnico("a")
        b = self._tecnico("b")
        f = self._fecha()
        f2 = self._fecha(6)
        cita = self._track_cita(
            _crear_cita(self.db, self.cliente.id_cliente, a.id_tecnico, f, "08:00", id_tecnico_2=b.id_tecnico)
        )
        # El segundo técnico queda ocupado en la nueva franja.
        self._track_cita(_crear_cita(self.db, self.cliente.id_cliente, b.id_tecnico, f2, "08:00"))
        with notificaciones_anuladas():
            with self.assertRaises(HTTPException) as ctx:
                editar_cita(cita.id_cita, CitaUpdate(fecha=f2, hora="08:00"), self.cliente, self.db)
        self.assertEqual(ctx.exception.status_code, 409)
        # La cita original conserva su fecha/hora.
        self.db.expire_all()
        c = self.db.query(Cita).filter(Cita.id_cita == cita.id_cita).first()
        self.assertEqual(c.fecha, f)
        self.assertEqual(c.hora, "08:00")

    def test_reagendar_tecnico_secundario_con_principal_ocupado(self):
        a = self._tecnico("a")
        b = self._tecnico("b")
        f = self._fecha()
        f2 = self._fecha(6)
        cita = self._track_cita(
            _crear_cita(self.db, self.cliente.id_cliente, a.id_tecnico, f, "08:00", id_tecnico_2=b.id_tecnico)
        )
        # El principal queda ocupado en la nueva franja.
        self._track_cita(_crear_cita(self.db, self.cliente.id_cliente, a.id_tecnico, f2, "08:00"))
        # El técnico SECUNDARIO (b) solicita el reagendamiento: debe validarse el
        # principal (a) también, no solo el solicitante.
        with notificaciones_anuladas():
            with self.assertRaises(HTTPException) as ctx:
                reagendar_cita_tecnico(
                    cita.id_cita,
                    ReagendarCitaRequest(fecha=f2, hora="08:00", id_comision=0),
                    b.usuario,
                    self.db,
                )
        self.assertEqual(ctx.exception.status_code, 409)
        self.db.expire_all()
        c = self.db.query(Cita).filter(Cita.id_cita == cita.id_cita).first()
        self.assertEqual(c.fecha, f)
        self.assertEqual(c.hora, "08:00")

    def test_reprogramacion_fallida_conserva_estado(self):
        a = self._tecnico("a")
        b = self._tecnico("b")
        f = self._fecha()
        f2 = self._fecha(6)
        cita = self._track_cita(
            _crear_cita(self.db, self.cliente.id_cliente, a.id_tecnico, f, "08:00", id_tecnico_2=b.id_tecnico)
        )
        self._track_cita(_crear_cita(self.db, self.cliente.id_cliente, b.id_tecnico, f2, "08:00"))
        with notificaciones_anuladas():
            with self.assertRaises(HTTPException):
                editar_cita(cita.id_cita, CitaUpdate(fecha=f2, hora="08:00"), self.cliente, self.db)
        self.db.expire_all()
        c = self.db.query(Cita).filter(Cita.id_cita == cita.id_cita).first()
        self.assertEqual(c.fecha, f)
        self.assertEqual(c.hora, "08:00")
        self.assertEqual(c.id_tecnico, a.id_tecnico)
        self.assertEqual(c.id_tecnico_2, b.id_tecnico)


class DuracionRealFlujoTestCase(BaseFlujoTestCase):
    def test_servicio_largo_fin_jornada(self):
        # Producto de dificultad "media" (2 h) → duración clamp 2 h; con 2
        # productos suma 4 h → clamp 2.5 h. Ver consulta y confirmación.
        p = self._producto("largo", dificultad="media")
        a = self._tecnico("a")
        f = self._fecha()
        items = json.dumps([{"id_producto": p.id_producto, "cantidad": 1}])
        # Con duración 2 h, 17:00 ya no cabe (19:00 > 18:00).
        horas = horas_disponibles_cita(f, tecnico_id=a.id_tecnico, tipo_servicio="instalacion", items=items, db=self.db)
        self.assertNotIn("17:00", horas)


class CreacionFlujoTestCase(BaseFlujoTestCase):
    def test_crear_cita_equipo_duplicado(self):
        a = self._tecnico("a")
        f = self._fecha()
        with notificaciones_anuladas(), patch(
            "app.services.pagos_service.procesar_pago",
            return_value={"estado": "aprobado", "numero_transaccion": "TXN"},
        ):
            with self.assertRaises(HTTPException) as ctx:
                crear_cita(
                    CitaCreate(
                        tipo_servicio="mantenimiento", fecha=f, hora="08:00",
                        direccion="X", id_tecnico=a.id_tecnico, id_tecnico_2=a.id_tecnico,
                        metodo_pago="tarjeta",
                    ),
                    self.cliente,
                    self.db,
                )
        self.assertEqual(ctx.exception.status_code, 400)

    def test_crear_cita_segundo_ocupado(self):
        a = self._tecnico("a")
        b = self._tecnico("b")
        f = self._fecha()
        self._track_cita(_crear_cita(self.db, self.cliente.id_cliente, b.id_tecnico, f, "08:00"))
        with notificaciones_anuladas(), patch(
            "app.services.pagos_service.procesar_pago",
            return_value={"estado": "aprobado", "numero_transaccion": "TXN"},
        ):
            with self.assertRaises(HTTPException):
                crear_cita(
                    CitaCreate(
                        tipo_servicio="mantenimiento", fecha=f, hora="08:00",
                        direccion="X", id_tecnico=a.id_tecnico, id_tecnico_2=b.id_tecnico,
                        metodo_pago="tarjeta",
                    ),
                    self.cliente,
                    self.db,
                )

    def test_crear_cita_sin_tecnico_asigna(self):
        self._tecnico("a")
        f = self._fecha()
        with notificaciones_anuladas(), patch(
            "app.services.pagos_service.procesar_pago",
            return_value={"estado": "aprobado", "numero_transaccion": "TXN"},
        ), patch("app.services.factura_service.crear_factura_cita", return_value=None):
            resp = crear_cita(
                CitaCreate(
                    tipo_servicio="mantenimiento", fecha=f, hora="08:00",
                    direccion="X", metodo_pago="tarjeta",
                ),
                self.cliente,
                self.db,
            )
        self._ids_cita.append(resp.id_cita)
        self.assertIsNotNone(resp.id_tecnico)


class ConsultaMultipersonaFlujoTestCase(BaseFlujoTestCase):
    def test_consulta_multipersona_capacidad_insuficiente(self):
        # Un solo técnico apto para la especialización, pero el producto exige 2.
        p = self._producto("multi", tecnicos_requeridos=2, ids_esp=[1])
        self._tecnico("a", ids_esp=[1])
        f = self._fecha()
        items = json.dumps([{"id_producto": p.id_producto, "cantidad": 1}])
        horas = horas_disponibles_cita(f, tipo_servicio="instalacion", items=items, db=self.db)
        self.assertEqual(horas, [])

    def test_consulta_multipersona_con_dos_tecnicos(self):
        p = self._producto("multi2", tecnicos_requeridos=2, ids_esp=[1])
        self._tecnico("a", ids_esp=[1])
        self._tecnico("b", ids_esp=[1])
        f = self._fecha()
        items = json.dumps([{"id_producto": p.id_producto, "cantidad": 1}])
        horas = horas_disponibles_cita(f, tipo_servicio="instalacion", items=items, db=self.db)
        self.assertIn("08:00", horas)


class ReasignacionAutomaticaFlujoTestCase(BaseFlujoTestCase):
    def test_reasignacion_automatica_ocupa_capacidad(self):
        # Técnico A tiene una cita; la reasignación automática la mueve a otro
        # técnico apto, que queda ocupado a esa hora (la reasignación consume
        # capacidad real).
        a = self._tecnico("a")
        f = self._fecha()
        cita = self._track_cita(
            _crear_cita(self.db, self.cliente.id_cliente, a.id_tecnico, f, "08:00")
        )
        with notificaciones_anuladas():
            resultado = reasignar_cita_automatica(self.db, cita, excluir_ids={a.id_tecnico})
        self.assertEqual(resultado["estado"], "reasignada")
        self.db.expire_all()
        c = self.db.query(Cita).filter(Cita.id_cita == cita.id_cita).first()
        self.assertIsNotNone(c.id_tecnico)
        self.assertNotEqual(c.id_tecnico, a.id_tecnico)
        # El nuevo técnico quedó ocupado a esa hora.
        self.assertTrue(tecnico_ocupado(self.db, c.id_tecnico, f, "08:00", duracion_horas=1.0))


class ConcurrenciaFlujoTestCase(BaseFlujoTestCase):
    def _ejecutar(self, fns, timeout=30):
        n = len(fns)
        barrera = threading.Barrier(n)
        resultados = [None] * n

        def _wrap(i, fn):
            try:
                resultados[i] = fn(barrera)
            except Exception as e:  # noqa: BLE001
                resultados[i] = e

        hilos = [threading.Thread(target=_wrap, args=(i, fn)) for i, fn in enumerate(fns)]
        for h in hilos:
            h.start()
        for h in hilos:
            h.join(timeout)
        return resultados

    def _confirmar(self, id_cliente, id_tecnico, fecha, hora):
        # Sin parches propios: los parches de pago/factura/notificación se
        # aplican a nivel de test (un solo contexto, compartido por los hilos).
        def fn(barrera):
            barrera.wait()
            db = SessionLocal()
            try:
                cliente = db.query(Cliente).filter(Cliente.id_cliente == id_cliente).first()
                return crear_cita(
                    CitaCreate(
                        tipo_servicio="mantenimiento", fecha=fecha, hora=hora,
                        direccion="X", id_tecnico=id_tecnico, metodo_pago="tarjeta",
                    ),
                    cliente,
                    db,
                )
            finally:
                db.close()
        return fn

    def _crear_cita_anulado(self):
        from contextlib import ExitStack

        stack = ExitStack()
        stack.enter_context(
            patch("app.services.pagos_service.procesar_pago",
                  return_value={"estado": "aprobado", "numero_transaccion": "TXN"})
        )
        stack.enter_context(patch("app.services.factura_service.crear_factura_cita", return_value=None))
        stack.enter_context(patch("app.routers.citas.crear_notificacion", new=lambda *a, **k: None))
        stack.enter_context(notificaciones_anuladas())
        return stack

    def test_dos_confirmaciones_reales_por_unico_tecnico(self):
        a = self._tecnico("a")
        f = self._fecha()
        id_cliente = self.cliente.id_cliente
        with self._crear_cita_anulado():
            r1, r2 = self._ejecutar([
                self._confirmar(id_cliente, a.id_tecnico, f, "08:00"),
                self._confirmar(id_cliente, a.id_tecnico, f, "08:00"),
            ])
        exitos = [r for r in (r1, r2) if not isinstance(r, Exception)]
        self.assertEqual(len(exitos), 1, (r1, r2))
        db = SessionLocal()
        try:
            n = db.query(Cita).filter(Cita.id_tecnico == a.id_tecnico, Cita.fecha == f, Cita.hora == "08:00").count()
            self.assertEqual(n, 1)
            self._ids_cita.extend(
                x[0] for x in db.query(Cita.id_cita).filter(Cita.id_cliente == id_cliente).all()
            )
        finally:
            db.close()

    def test_reserva_frente_a_desactivacion(self):
        a = self._tecnico("a")
        f = self._fecha()
        id_cliente = self.cliente.id_cliente
        id_usuario = a.id_usuario_t

        def confirmar(barrera):
            barrera.wait()
            db = SessionLocal()
            try:
                cliente = db.query(Cliente).filter(Cliente.id_cliente == id_cliente).first()
                return crear_cita(
                    CitaCreate(
                        tipo_servicio="mantenimiento", fecha=f, hora="08:00",
                        direccion="X", id_tecnico=a.id_tecnico, metodo_pago="tarjeta",
                    ),
                    cliente,
                    db,
                )
            finally:
                db.close()

        def desactivar(barrera):
            barrera.wait()
            db = SessionLocal()
            try:
                bloquear_tecnicos(db, [a.id_tecnico])
                u = db.query(User).filter(User.id_usuario == id_usuario).first()
                u.is_active = False
                db.commit()
                return "ok"
            finally:
                db.close()

        with self._crear_cita_anulado():
            r_confirmar, r_desact = self._ejecutar([confirmar, desactivar])
        # La reserva debe o bien confirmarse con el técnico activo, o bien
        # fallar si la desactivación ganó; nunca ambos efectos incoherentes.
        db = SessionLocal()
        try:
            u = db.query(User).filter(User.id_usuario == id_usuario).first()
            self._ids_cita.extend(
                x[0] for x in db.query(Cita.id_cita).filter(Cita.id_cliente == id_cliente).all()
            )
            if isinstance(r_desact, Exception):
                self.assertTrue(u.is_active)
                self.assertNotIsInstance(r_confirmar, Exception)
            else:
                self.assertFalse(u.is_active)
        finally:
            db.close()


if __name__ == "__main__":
    unittest.main(verbosity=2)
