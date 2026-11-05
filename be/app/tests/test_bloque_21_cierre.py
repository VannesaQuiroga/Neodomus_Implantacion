"""Pruebas de cierre del bloque 2.1: coordinación transaccional y lecturas
vigentes en los flujos reales (autoasignación, reasignación automática, edición,
entrega y desactivación reales).

Se usan sesiones independientes y barreras con tiempo máximo; se anulan solo los
efectos externos (correo/facturación/pago simulado)."""
import asyncio
import json
import threading
import time
import unittest
from contextlib import ExitStack
from datetime import timedelta
from unittest.mock import patch

from fastapi import HTTPException
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session

import app.tests.testdb  # noqa: F401  (configura la base de pruebas y bloquea si no está definida)

from app.database import SessionLocal
from app.models.cita import Cita
from app.models.cliente import Cliente
from app.models.especializacion import HistorialCita, Reembolso
from app.models.pedido import Pedido
from app.models.tecnico import Tecnico
from app.models.user import User
from app.routers.citas import crear_cita, editar_cita
from app.routers.pedidos import asignar_entrega_admin, EntregaAsignarRequest
from app.routers.users import desactivar_empleado, editar_empleado
from app.schemas.cita import CitaCreate, CitaUpdate
from app.services import asignacion_service
from app.services.asignacion_service import reasignar_cita_automatica
from app.services.especialidades import (
    bloquear_tecnicos as real_bloquear_tecnicos,
    tecnico_ocupado,
    tecnicos_disponibles,
)

from app.tests.test_bloque_2 import (
    BaseIntegracionTestCase,
    _crear_cita,
    _crear_cliente,
    _crear_tecnico,
    _fecha_laboral,
    notificaciones_anuladas,
)


async def _async_noop(*_a, **_k):
    return None


class BaseCierreTestCase(BaseIntegracionTestCase):
    def _fecha(self, dias=5):
        return _fecha_laboral(dias)

    def _crear_cita_anulado(self):
        stack = ExitStack()
        stack.enter_context(
            patch("app.services.pagos_service.procesar_pago",
                  return_value={"estado": "aprobado", "numero_transaccion": "TXN"})
        )
        stack.enter_context(patch("app.services.factura_service.crear_factura_cita", return_value=None))
        stack.enter_context(patch("app.routers.citas.crear_notificacion", new=lambda *a, **k: None))
        stack.enter_context(notificaciones_anuladas())
        return stack

    def _ejecutar(self, fns, timeout=30):
        n = len(fns)
        barrera = threading.Barrier(n)
        resultados = [None] * n
        finalizados = [False] * n

        def _wrap(i, fn):
            try:
                resultados[i] = fn(barrera)
            except Exception as e:  # noqa: BLE001
                resultados[i] = e
            finally:
                finalizados[i] = True

        hilos = [threading.Thread(target=_wrap, args=(i, fn)) for i, fn in enumerate(fns)]
        for h in hilos:
            h.start()
        for h in hilos:
            h.join(timeout)
        return resultados, finalizados


class CuentaInactivaTestCase(BaseCierreTestCase):
    def test_cuenta_precargada_activa_luego_inactiva(self):
        a = self._tecnico("a")
        f = self._fecha()
        id_cliente = self.cliente.id_cliente
        id_usuario = a.id_usuario_t

        db_a = SessionLocal()
        try:
            # Sesión A: pre-carga la cuenta como activa (establece instantánea).
            cliente_a = db_a.query(Cliente).filter(Cliente.id_cliente == id_cliente).first()
            u = db_a.query(User).filter(User.id_usuario == id_usuario).first()
            self.assertTrue(u.is_active)

            # Sesión B: desactiva la cuenta mediante el endpoint real.
            db_b = SessionLocal()
            try:
                admin = db_b.query(User).filter(User.id_rol_u == 1).first()
                with patch("app.routers.users._notificar_estado_empleado", new=_async_noop), \
                     notificaciones_anuladas():
                    asyncio.run(desactivar_empleado(id_usuario, admin, db_b))
            finally:
                db_b.close()

            # Sesión A intenta confirmar: debe ver la cuenta inactiva (lectura
            # vigente) y rechazar, sin asignar trabajo.
            with self._crear_cita_anulado():
                with self.assertRaises(HTTPException):
                    crear_cita(
                        CitaCreate(
                            tipo_servicio="mantenimiento", fecha=f, hora="08:00",
                            direccion="X", id_tecnico=a.id_tecnico, metodo_pago="tarjeta",
                        ),
                        cliente_a,
                        db_a,
                    )
        finally:
            db_a.close()

        # No quedó ninguna cita asignada al técnico.
        db = SessionLocal()
        try:
            n = db.query(Cita).filter(Cita.id_tecnico == a.id_tecnico).count()
            self.assertEqual(n, 0)
        finally:
            db.close()

    def test_reserva_frente_a_desactivacion_real(self):
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
                admin = db.query(User).filter(User.id_rol_u == 1).first()
                with patch("app.routers.users._notificar_estado_empleado", new=_async_noop), \
                     notificaciones_anuladas():
                    return asyncio.run(desactivar_empleado(id_usuario, admin, db))
            finally:
                db.close()

        with self._crear_cita_anulado():
            (r_confirmar, r_desact), finalizados = self._ejecutar([confirmar, desactivar])

        self.assertTrue(all(finalizados), finalizados)
        db = SessionLocal()
        try:
            u = db.query(User).filter(User.id_usuario == id_usuario).first()
            n_citas = db.query(Cita).filter(Cita.id_tecnico == a.id_tecnico).count()
            self._ids_cita.extend(
                x[0] for x in db.query(Cita.id_cita).filter(Cita.id_cliente == id_cliente).all()
            )
            if isinstance(r_desact, Exception):
                # La reserva ganó: el técnico sigue activo y su cita existe.
                self.assertTrue(u.is_active)
                self.assertNotIsInstance(r_confirmar, Exception)
                self.assertEqual(n_citas, 1)
            else:
                # La desactivación ganó: el técnico quedó inactivo y la reserva
                # en curso NO pudo confirmar un trabajo al técnico inactivo.
                self.assertFalse(u.is_active)
                self.assertEqual(n_citas, 0)
        finally:
            db.close()


class AutoasignacionTestCase(BaseCierreTestCase):
    def test_autoasignacion_con_lectura_previa_no_duplica(self):
        f = self._fecha()
        # Candidato que elegiría la autoasignación (primer apto en orden).
        cand = tecnicos_disponibles(self.db, f, "08:00")[0]
        cand_id = cand.id_tecnico
        id_cliente = self.cliente.id_cliente

        db_a = SessionLocal()
        try:
            # Sesión A: lectura previa (instantánea antigua).
            _ = db_a.query(User).first()
            # Sesión B: reserva explícita del candidato.
            db_b = SessionLocal()
            try:
                cliente_b = db_b.query(Cliente).filter(Cliente.id_cliente == id_cliente).first()
                with self._crear_cita_anulado():
                    crear_cita(
                        CitaCreate(
                            tipo_servicio="mantenimiento", fecha=f, hora="08:00",
                            direccion="X", id_tecnico=cand_id, metodo_pago="tarjeta",
                        ),
                        cliente_b,
                        db_b,
                    )
            finally:
                db_b.close()
            # Sesión A: autoasignación (sin técnico elegido). Con la instantánea
            # antigua, el primer candidato aparece libre; la revalidación vigente
            # lo descarta y la autoasignación cae al siguiente técnico apto, sin
            # duplicar la ocupación del candidato.
            cliente_a = db_a.query(Cliente).filter(Cliente.id_cliente == id_cliente).first()
            with self._crear_cita_anulado():
                resp = crear_cita(
                    CitaCreate(
                        tipo_servicio="mantenimiento", fecha=f, hora="08:00",
                        direccion="X", metodo_pago="tarjeta",
                    ),
                    cliente_a,
                    db_a,
                )
            id_asignado = resp.id_tecnico
        finally:
            db_a.close()

        db = SessionLocal()
        try:
            n_cand = db.query(Cita).filter(Cita.id_tecnico == cand_id, Cita.fecha == f, Cita.hora == "08:00").count()
            self.assertEqual(n_cand, 1)  # sin duplicar al candidato
            self.assertIsNotNone(id_asignado)
            self.assertNotEqual(id_asignado, cand_id)  # cayó a otro técnico
            self._ids_cita.extend(
                x[0] for x in db.query(Cita.id_cita).filter(Cita.id_cliente == id_cliente).all()
            )
        finally:
            db.close()


class ReasignacionAutomaticaTestCase(BaseCierreTestCase):
    def test_reasignacion_automatica_con_respaldo_de_candidato(self):
        # Solo B y C son aptos (especialización 1). B queda ocupado; la
        # reasignación debe saltarlo y caer en C (respaldo transaccional).
        a = self._tecnico("a", ids_esp=[1])
        b = self._tecnico("b", ids_esp=[1])
        self._tecnico("c", ids_esp=[1])
        f = self._fecha()
        self._track_cita(_crear_cita(self.db, self.cliente.id_cliente, b.id_tecnico, f, "08:00"))
        cita = _crear_cita(self.db, self.cliente.id_cliente, a.id_tecnico, f, "08:00")
        cita.id_especializacion = 1
        self.db.commit()
        self._track_cita(cita)

        with notificaciones_anuladas(), \
             patch("app.services.asignacion_service._notificar_tecnico_asignacion", new=lambda *a, **k: None), \
             patch("app.services.asignacion_service._notificar_cliente_reasignacion", new=lambda *a, **k: None):
            resultado = reasignar_cita_automatica(self.db, cita, excluir_ids={a.id_tecnico})

        self.assertEqual(resultado["estado"], "reasignada")
        self.db.expire_all()
        c = self.db.query(Cita).filter(Cita.id_cita == cita.id_cita).first()
        self.assertIsNotNone(c.id_tecnico)
        self.assertNotEqual(c.id_tecnico, a.id_tecnico)
        self.assertNotEqual(c.id_tecnico, b.id_tecnico)  # B ocupado → se saltó
        self.assertTrue(tecnico_ocupado(self.db, c.id_tecnico, f, "08:00", duracion_horas=1.0))

    def test_reasignacion_no_sobrescribe_cita_cancelada(self):
        a = self._tecnico("a", ids_esp=[1])
        self._tecnico("b", ids_esp=[1])
        f = self._fecha()
        cita = _crear_cita(self.db, self.cliente.id_cliente, a.id_tecnico, f, "08:00")
        cita.id_especializacion = 1
        self.db.commit()
        self._track_cita(cita)
        cita.estado = "Cancelada"
        self.db.commit()

        with notificaciones_anuladas(), \
             patch("app.services.asignacion_service._notificar_tecnico_asignacion", new=lambda *a, **k: None), \
             patch("app.services.asignacion_service._notificar_cliente_reasignacion", new=lambda *a, **k: None):
            resultado = reasignar_cita_automatica(self.db, cita, excluir_ids={a.id_tecnico})

        self.assertEqual(resultado["estado"], "sin_cambio")
        self.db.expire_all()
        c = self.db.query(Cita).filter(Cita.id_cita == cita.id_cita).first()
        self.assertEqual(c.estado, "Cancelada")


class ReasignacionAutomaticaConcurrenteTestCase(BaseCierreTestCase):
    def test_reasignacion_automatica_frente_a_reserva_mismo_candidato(self):
        # B es el único candidato apto (especialización 1). A tiene la cita a
        # reasignar. La reserva y la reasignación compiten por B en la misma
        # franja: no debe quedar doblemente reservado.
        a = self._tecnico("a", ids_esp=[1])
        b = self._tecnico("b", ids_esp=[1])
        f = self._fecha()
        cita = _crear_cita(self.db, self.cliente.id_cliente, a.id_tecnico, f, "08:00")
        cita.id_especializacion = 1
        self.db.commit()
        self._track_cita(cita)
        # Capturar ids como ints (no acceder a objetos de la sesión principal
        # desde los hilos, para evitar lazy-load concurrente sobre la conexión).
        a_id = a.id_tecnico
        b_id = b.id_tecnico
        id_cliente = self.cliente.id_cliente
        id_cita = cita.id_cita

        def reasignar(barrera):
            barrera.wait()
            db = SessionLocal()
            try:
                c = db.query(Cita).filter(Cita.id_cita == id_cita).first()
                return reasignar_cita_automatica(db, c, excluir_ids={a_id})
            finally:
                db.close()

        def reservar(barrera):
            barrera.wait()
            db = SessionLocal()
            try:
                cliente = db.query(Cliente).filter(Cliente.id_cliente == id_cliente).first()
                return crear_cita(
                    CitaCreate(
                        tipo_servicio="mantenimiento", fecha=f, hora="08:00",
                        direccion="X", id_tecnico=b_id, metodo_pago="tarjeta",
                    ),
                    cliente,
                    db,
                )
            finally:
                db.close()

        # Los efectos externos se anulan a nivel de test (un único contexto
        # compartido por ambos hilos), no dentro de cada hilo.
        with self._crear_cita_anulado(), \
             patch("app.services.asignacion_service._notificar_tecnico_asignacion", new=lambda *a, **k: None), \
             patch("app.services.asignacion_service._notificar_cliente_reasignacion", new=lambda *a, **k: None):
            (r_reasignar, r_reservar), finalizados = self._ejecutar([reasignar, reservar])

        self.assertTrue(all(finalizados), finalizados)

        db = SessionLocal()
        try:
            self._ids_cita.extend(
                x[0] for x in db.query(Cita.id_cita).filter(Cita.id_cliente == id_cliente).all()
            )
            # Sin doble reserva del técnico B a las 08:00.
            n_b = db.query(Cita).filter(
                Cita.id_tecnico == b_id, Cita.fecha == f, Cita.hora == "08:00"
            ).count()
            self.assertEqual(n_b, 1)
        finally:
            db.close()


class OrdenDeBloqueoTestCase(BaseCierreTestCase):
    def test_creacion_frente_a_edicion_sin_deadlock(self):
        a = self._tecnico("a")
        f = self._fecha()
        id_cliente = self.cliente.id_cliente
        # Cita existente de A que el cliente editará.
        cita = self._track_cita(
            _crear_cita(self.db, self.cliente.id_cliente, a.id_tecnico, f, "11:00")
        )

        def crear(barrera):
            barrera.wait()
            db = SessionLocal()
            try:
                cliente = db.query(Cliente).filter(Cliente.id_cliente == id_cliente).first()
                with self._crear_cita_anulado():
                    return crear_cita(
                        CitaCreate(
                            tipo_servicio="mantenimiento", fecha=f, hora="14:00",
                            direccion="X", id_tecnico=a.id_tecnico, metodo_pago="tarjeta",
                        ),
                        cliente,
                        db,
                    )
            finally:
                db.close()

        def editar(barrera):
            barrera.wait()
            db = SessionLocal()
            try:
                cliente = db.query(Cliente).filter(Cliente.id_cliente == id_cliente).first()
                with notificaciones_anuladas():
                    return editar_cita(cita.id_cita, CitaUpdate(fecha=f, hora="14:00"), cliente, db)
            finally:
                db.close()

        (r_crear, r_editar), finalizados = self._ejecutar([crear, editar])
        self.assertTrue(all(finalizados), finalizados)
        # Ambas deben completarse sin interbloqueo; solo una puede ocupar la
        # franja 14:00 del técnico A.
        db = SessionLocal()
        try:
            self._ids_cita.extend(
                x[0] for x in db.query(Cita.id_cita).filter(Cita.id_cliente == id_cliente).all()
            )
            n = db.query(Cita).filter(Cita.id_tecnico == a.id_tecnico, Cita.fecha == f, Cita.hora == "14:00").count()
            self.assertEqual(n, 1)
        finally:
            db.close()

    def test_creacion_frente_a_asignacion_entrega(self):
        a = self._tecnico("a")
        f = self._fecha()
        id_cliente = self.cliente.id_cliente
        # Pedido a entregar en la misma franja.
        pedido = Pedido(
            id_cliente_pe=self.cliente.id_cliente, estado_pedido="Pagado",
            estado_entrega="Pendiente", fecha_entrega=f, hora_entrega="14:00",
        )
        self.db.add(pedido)
        self.db.commit()
        self._id_pedido = pedido.id_pedido

        def crear(barrera):
            barrera.wait()
            db = SessionLocal()
            try:
                cliente = db.query(Cliente).filter(Cliente.id_cliente == id_cliente).first()
                with self._crear_cita_anulado():
                    return crear_cita(
                        CitaCreate(
                            tipo_servicio="mantenimiento", fecha=f, hora="14:00",
                            direccion="X", id_tecnico=a.id_tecnico, metodo_pago="tarjeta",
                        ),
                        cliente,
                        db,
                    )
            finally:
                db.close()

        def entregar(barrera):
            barrera.wait()
            db = SessionLocal()
            try:
                with notificaciones_anuladas():
                    return asignar_entrega_admin(
                        pedido.id_pedido,
                        EntregaAsignarRequest(id_tecnico=a.id_tecnico),
                        admin_user=None,
                        db=db,
                    )
            finally:
                db.close()

        (r_crear, r_entregar), finalizados = self._ejecutar([crear, entregar])
        self.assertTrue(all(finalizados), finalizados)
        db = SessionLocal()
        try:
            self._ids_cita.extend(
                x[0] for x in db.query(Cita.id_cita).filter(Cita.id_cliente == id_cliente).all()
            )
            # No puede quedar a la vez una cita y una entrega del mismo técnico
            # en la misma franja.
            cita_ocupa = db.query(Cita).filter(
                Cita.id_tecnico == a.id_tecnico, Cita.fecha == f, Cita.hora == "14:00"
            ).count() > 0
            p = db.query(Pedido).filter(Pedido.id_pedido == pedido.id_pedido).first()
            entrega_asignada = p.id_tecnico_entrega == a.id_tecnico
            self.assertFalse(cita_ocupa and entrega_asignada)
        finally:
            db.close()


class ReasignacionAutomaticaRobustezTestCase(BaseCierreTestCase):
    """Casos límite de la reasignación automática: avance de la búsqueda de
    próximo horario (B1/B2), protección frente a cambios concurrentes (C) y
    comportamiento frente a errores técnicos de BD (E1/E2/E3)."""

    def _siguiente_laboral(self, f):
        f2 = f + timedelta(days=1)
        while f2.weekday() == 6:  # domingo
            f2 += timedelta(days=1)
        return f2

    # ── B2: el secundario está ocupado en la primera propuesta ──────────────
    def test_reprogramacion_avanza_cuando_secundario_ocupado(self):
        a = self._tecnico("a", ids_esp=[1])
        z = self._tecnico("z", ids_esp=[1])  # secundario (ordena después de "d")
        d = self._tecnico("d", ids_esp=[1])  # candidato a principal
        f = self._fecha()
        f2 = self._siguiente_laboral(f)

        cita = _crear_cita(
            self.db, self.cliente.id_cliente, a.id_tecnico, f, "08:00",
            id_tecnico_2=z.id_tecnico,
        )
        cita.id_especializacion = 1
        self.db.commit()
        self._track_cita(cita)

        # Sin candidato libre en el mismo horario: Z y D ocupados a las 08:00.
        self._track_cita(_crear_cita(self.db, self.cliente.id_cliente, z.id_tecnico, f, "08:00"))
        self._track_cita(_crear_cita(self.db, self.cliente.id_cliente, d.id_tecnico, f, "08:00"))
        # Primera propuesta (f2 08:00): el secundario Z está ocupado → se salta.
        self._track_cita(_crear_cita(self.db, self.cliente.id_cliente, z.id_tecnico, f2, "08:00"))

        with notificaciones_anuladas(), \
             patch("app.services.asignacion_service._notificar_tecnico_asignacion", new=lambda *a, **k: None), \
             patch("app.services.asignacion_service._notificar_cliente_reasignacion", new=lambda *a, **k: None):
            resultado = reasignar_cita_automatica(self.db, cita, excluir_ids={a.id_tecnico})

        self.assertEqual(resultado["estado"], "reprogramada")
        self.db.expire_all()
        c = self.db.query(Cita).filter(Cita.id_cita == cita.id_cita).first()
        self.assertEqual(c.id_tecnico, d.id_tecnico)     # D pasa a principal
        self.assertEqual(c.id_tecnico_2, z.id_tecnico)   # secundario preservado
        self.assertEqual(c.fecha, f2)
        self.assertEqual(c.hora, "11:00")                # avanzó a la siguiente franja

    # ── B1: la propuesta de próximo horario se reserva concurrentemente ─────
    def test_reprogramacion_avanza_si_propuesta_reservada_concurrentemente(self):
        a = self._tecnico("a", ids_esp=[1])
        d = self._tecnico("d", ids_esp=[1])
        f = self._fecha()
        f2 = self._siguiente_laboral(f)

        cita = _crear_cita(self.db, self.cliente.id_cliente, a.id_tecnico, f, "08:00")
        cita.id_especializacion = 1
        self.db.commit()
        self._track_cita(cita)
        # D ocupado en el mismo horario → sin candidato → se reprograma.
        self._track_cita(_crear_cita(self.db, self.cliente.id_cliente, d.id_tecnico, f, "08:00"))

        a_id = a.id_tecnico
        d_id = d.id_tecnico
        id_cliente = self.cliente.id_cliente
        id_cita = cita.id_cita

        propuesto = threading.Event()
        continuar = threading.Event()
        llamadas = {"n": 0}
        lock = threading.Lock()

        def bloquear_pausado(db, ids):
            with lock:
                llamadas["n"] += 1
                primera = llamadas["n"] == 1
            if primera:
                propuesto.set()
                if not continuar.wait(timeout=15):
                    raise RuntimeError("timeout esperando reserva concurrente")
            return real_bloquear_tecnicos(db, ids)

        def reasignar(barrera):
            barrera.wait()
            db = SessionLocal()
            try:
                c = db.query(Cita).filter(Cita.id_cita == id_cita).first()
                return reasignar_cita_automatica(db, c, excluir_ids={a_id})
            finally:
                db.close()

        def reservar(barrera):
            barrera.wait()
            if not propuesto.wait(timeout=15):
                continuar.set()
                return RuntimeError("timeout esperando propuesta")
            db = SessionLocal()
            try:
                cliente = db.query(Cliente).filter(Cliente.id_cliente == id_cliente).first()
                return crear_cita(
                    CitaCreate(
                        tipo_servicio="mantenimiento", fecha=f2, hora="08:00",
                        direccion="X", id_tecnico=d_id, metodo_pago="tarjeta",
                    ),
                    cliente,
                    db,
                )
            finally:
                continuar.set()
                db.close()

        with self._crear_cita_anulado(), \
             patch("app.services.especialidades.bloquear_tecnicos", new=bloquear_pausado), \
             patch("app.services.asignacion_service._notificar_tecnico_asignacion", new=lambda *a, **k: None), \
             patch("app.services.asignacion_service._notificar_cliente_reasignacion", new=lambda *a, **k: None):
            (r_reasignar, r_reservar), finalizados = self._ejecutar([reasignar, reservar])

        self.assertTrue(all(finalizados), finalizados)
        self.assertNotIsInstance(r_reservar, Exception, r_reservar)
        self.assertEqual(r_reasignar["estado"], "reprogramada")

        db = SessionLocal()
        try:
            self._ids_cita.extend(
                x[0] for x in db.query(Cita.id_cita).filter(Cita.id_cliente == id_cliente).all()
            )
            # Sin doble reserva de D a las 08:00 de f2 (solo la reserva externa).
            n = db.query(Cita).filter(
                Cita.id_tecnico == d_id, Cita.fecha == f2, Cita.hora == "08:00"
            ).count()
            self.assertEqual(n, 1)
            c = db.query(Cita).filter(Cita.id_cita == id_cita).first()
            self.assertEqual(c.id_tecnico, d_id)
            self.assertEqual(c.fecha, f2)
            self.assertEqual(c.hora, "11:00")
        finally:
            db.close()

    # ── C: cambio concurrente de la cita durante la selección ───────────────
    def test_reasignacion_no_sobrescribe_cambio_concurrente(self):
        a = self._tecnico("a", ids_esp=[1])
        b = self._tecnico("b", ids_esp=[1])
        f = self._fecha()
        cita = _crear_cita(self.db, self.cliente.id_cliente, a.id_tecnico, f, "08:00")
        cita.id_especializacion = 1
        self.db.commit()
        self._track_cita(cita)

        id_cita = cita.id_cita
        a_id = a.id_tecnico

        elegido = threading.Event()
        continuar = threading.Event()
        real_elegir = asignacion_service._elegir_candidato

        def elegir_pausado(db, fecha, hora, ids_req, excluir, excluir_cita_id, duracion):
            res = real_elegir(db, fecha, hora, ids_req, excluir, excluir_cita_id, duracion)
            elegido.set()
            if not continuar.wait(timeout=15):
                raise RuntimeError("timeout esperando cambio concurrente")
            return res

        def reasignar(barrera):
            barrera.wait()
            db = SessionLocal()
            try:
                c = db.query(Cita).filter(Cita.id_cita == id_cita).first()
                return reasignar_cita_automatica(db, c, excluir_ids={a_id})
            finally:
                db.close()

        def modificar(barrera):
            barrera.wait()
            if not elegido.wait(timeout=15):
                continuar.set()
                return RuntimeError("timeout esperando selección")
            db = SessionLocal()
            try:
                c = db.query(Cita).filter(Cita.id_cita == id_cita).first()
                c.hora = "11:00"
                db.commit()
            finally:
                continuar.set()
                db.close()

        with notificaciones_anuladas(), \
             patch("app.services.asignacion_service._elegir_candidato", new=elegir_pausado), \
             patch("app.services.asignacion_service._notificar_tecnico_asignacion", new=lambda *a, **k: None), \
             patch("app.services.asignacion_service._notificar_cliente_reasignacion", new=lambda *a, **k: None):
            (r_reasignar, r_modificar), finalizados = self._ejecutar([reasignar, modificar])

        self.assertTrue(all(finalizados), finalizados)
        self.assertNotIsInstance(r_modificar, Exception, r_modificar)
        self.assertEqual(r_reasignar["estado"], "sin_cambio")

        db = SessionLocal()
        try:
            self._ids_cita.extend(
                x[0] for x in db.query(Cita.id_cita).filter(Cita.id_cliente == self.cliente.id_cliente).all()
            )
            c = db.query(Cita).filter(Cita.id_cita == id_cita).first()
            self.assertEqual(c.hora, "11:00")      # cambio concurrente preservado
            self.assertEqual(c.id_tecnico, a_id)   # no se sobrescribió con el candidato
        finally:
            db.close()

    # ── E1: un deadlock antes del commit se reintenta una sola vez ──────────
    def test_reasignacion_reintenta_deadlock_y_solo_una_vez(self):
        a = self._tecnico("a", ids_esp=[1])
        b = self._tecnico("b", ids_esp=[1])
        f = self._fecha()
        cita = _crear_cita(self.db, self.cliente.id_cliente, a.id_tecnico, f, "08:00")
        cita.id_especializacion = 1
        self.db.commit()
        self._track_cita(cita)

        real_commit = Session.commit
        llamadas = {"n": 0}

        def commit_inestable(self):
            llamadas["n"] += 1
            if llamadas["n"] == 1:
                raise OperationalError("UPDATE citas", {}, Exception(1213, "Deadlock found"))
            return real_commit(self)

        with notificaciones_anuladas(), \
             patch.object(Session, "commit", commit_inestable), \
             patch("app.services.asignacion_service._notificar_tecnico_asignacion") as aviso_tecnico, \
             patch("app.services.asignacion_service._notificar_cliente_reasignacion") as aviso_cliente:
            resultado = reasignar_cita_automatica(self.db, cita, excluir_ids={a.id_tecnico})

        self.assertEqual(resultado["estado"], "reasignada")
        self.assertEqual(llamadas["n"], 2)  # primer commit falla, el reintento confirma
        self.assertEqual(aviso_tecnico.call_count, 1)
        self.assertEqual(aviso_cliente.call_count, 1)
        self.db.expire_all()
        c = self.db.query(Cita).filter(Cita.id_cita == cita.id_cita).first()
        self.assertEqual(c.id_tecnico, b.id_tecnico)
        n_hist = self.db.query(HistorialCita).filter(
            HistorialCita.id_cita == cita.id_cita, HistorialCita.accion == "reasignacion"
        ).count()
        self.assertEqual(n_hist, 1)

    # ── E2: fallo de notificación post-commit no reasigna de nuevo ──────────
    def test_fallo_en_notificacion_post_commit_no_reasigna_de_nuevo(self):
        a = self._tecnico("a", ids_esp=[1])
        b = self._tecnico("b", ids_esp=[1])
        f = self._fecha()
        cita = _crear_cita(self.db, self.cliente.id_cliente, a.id_tecnico, f, "08:00")
        cita.id_especializacion = 1
        self.db.commit()
        self._track_cita(cita)

        # El primer aviso ya fue enviado; el segundo falla con un código que
        # sería reintentable SOLO antes del commit.
        with self.assertLogs("app.services.asignacion_service", level="ERROR"), \
             notificaciones_anuladas(), \
             patch("app.services.asignacion_service._notificar_cliente_reasignacion") as aviso_cliente, \
             patch("app.services.asignacion_service._notificar_tecnico_asignacion",
                   side_effect=OperationalError("aviso", {}, Exception(1213, "Deadlock"))) as aviso_tecnico:
            resultado = reasignar_cita_automatica(self.db, cita, excluir_ids={a.id_tecnico})

        self.assertEqual(resultado["estado"], "reasignada")
        self.assertTrue(resultado["avisos_pendientes"])
        self.assertEqual(aviso_cliente.call_count, 1)
        self.assertEqual(aviso_tecnico.call_count, 1)
        self.db.expire_all()
        c = self.db.query(Cita).filter(Cita.id_cita == cita.id_cita).first()
        self.assertEqual(c.id_tecnico, b.id_tecnico)
        n_hist = self.db.query(HistorialCita).filter(
            HistorialCita.id_cita == cita.id_cita, HistorialCita.accion == "reasignacion"
        ).count()
        self.assertEqual(n_hist, 1)

    # ── E3: agotar reintentos no cancela ni reembolsa ───────────────────────
    def test_agotar_reintentos_no_cancela_ni_reembolsa(self):
        a = self._tecnico("a", ids_esp=[1])
        b = self._tecnico("b", ids_esp=[1])
        f = self._fecha()
        cita = _crear_cita(self.db, self.cliente.id_cliente, a.id_tecnico, f, "08:00")
        cita.id_especializacion = 1
        self.db.commit()
        self._track_cita(cita)

        def commit_siempre_falla(self):
            raise OperationalError("UPDATE citas", {}, Exception(1213, "Deadlock found"))

        with notificaciones_anuladas(), \
             patch.object(Session, "commit", commit_siempre_falla), \
             patch("app.services.asignacion_service._notificar_tecnico_asignacion", new=lambda *a, **k: None), \
             patch("app.services.asignacion_service._notificar_cliente_reasignacion", new=lambda *a, **k: None):
            resultado = reasignar_cita_automatica(self.db, cita, excluir_ids={a.id_tecnico})

        self.assertEqual(resultado["estado"], "sin_cambio")
        self.assertEqual(resultado["conflicto"], "reintentos_agotados")
        self.db.expire_all()
        c = self.db.query(Cita).filter(Cita.id_cita == cita.id_cita).first()
        self.assertEqual(c.estado, "Confirmada")    # no se canceló
        self.assertEqual(c.id_tecnico, a.id_tecnico)  # no se reasignó
        n_hist = self.db.query(HistorialCita).filter(HistorialCita.id_cita == cita.id_cita).count()
        self.assertEqual(n_hist, 0)
        n_reemb = self.db.query(Reembolso).filter(Reembolso.id_cita == cita.id_cita).count()
        self.assertEqual(n_reemb, 0)


if __name__ == "__main__":
    unittest.main(verbosity=2)
