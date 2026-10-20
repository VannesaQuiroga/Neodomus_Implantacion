"""Pruebas de comportamiento del bloque 2: agenda por capacidad real de
técnicos y prevención de reservas incompatibles.

Cubre:
  - Capacidad por técnico: citas simultáneas de equipos distintos, solapamientos,
    participación como 2º/3er técnico, cita vs entrega.
  - Aptitud: especialización requerida y cuentas inactivas.
  - Duraciones/horarios: inicios que caben en la jornada, intervalos contiguos.
  - Equipo completo y distinto para citas de varias personas.
  - Confirmación segura: mismas reglas que la consulta, sin escrituras en GET,
    bloqueo frente a reservas concurrentes.
"""

import threading
import time
import unittest
from contextlib import ExitStack
from datetime import date, timedelta
from unittest.mock import patch

from fastapi import HTTPException

import app.tests.testdb  # noqa: F401  (configura la base de pruebas y bloquea si no está definida)

from app.database import SessionLocal
from app.models.cita import Cita
from app.models.cliente import Cliente
from app.models.especializacion import Especializacion, tecnico_especializacion
from app.models.pedido import Pedido
from app.models.tecnico import Tecnico
from app.models.user import User
from app.routers.citas import crear_cita, _validar_tecnico_cita
from app.schemas.cita import CitaCreate
from app.services.especialidades import (
    horas_laborales,
    tecnico_ocupado,
    tecnico_libre_en_rango,
    tecnico_disponible,
    tecnicos_disponibles,
    hay_disponibilidad,
    bloquear_tecnicos,
)


class _Contador:
    def __init__(self):
        self._n = 0
        self._lock = threading.Lock()

    def inc(self, *_a, **_k):
        with self._lock:
            self._n += 1
        return None

    @property
    def valor(self):
        with self._lock:
            return self._n


async def _async_noop(*_a, **_k):
    return None


def notificaciones_anuladas(contador=None):
    stack = ExitStack()
    stack.enter_context(patch("app.utils.email.send_email", new=_async_noop))
    stack.enter_context(
        patch("app.services.notificaciones.programar_correo", new=lambda *a, **k: None)
    )
    if contador is not None:
        stack.enter_context(
            patch("app.services.notificaciones.crear_notificacion", side_effect=contador.inc)
        )
    else:
        stack.enter_context(
            patch("app.services.notificaciones.crear_notificacion", new=lambda *a, **k: None)
        )
    return stack


# Consulta Especializacion; confirma los cambios con la sesión de base de datos.
def _crear_tecnico(db, sufijo, ids_esp=None, activo=True):
    email = f"bloque2.{sufijo}.{int(time.time() * 1_000_000)}@test.local"
    u = User(
        first_name="Tec", last_name=sufijo, email=email, password_hash="x",
        id_rol_u=2, is_active=activo,
    )
    db.add(u)
    db.flush()
    t = Tecnico(id_usuario_t=u.id_usuario, certificacion_t="")
    db.add(t)
    db.flush()
    if ids_esp:
        t.especializaciones = [
            db.query(Especializacion).filter(Especializacion.id_especializacion == eid).first()
            for eid in ids_esp
        ]
    db.commit()
    db.refresh(u)
    return t


# confirma los cambios con la sesión de base de datos.
def _crear_cliente(db):
    c = Cliente(
        first_name="Test", last_name="Cliente",
        email=f"b2.cliente.{int(time.time() * 1_000_000)}@test.local",
        is_active=True, auth_provider="local",
    )
    db.add(c)
    db.commit()
    db.refresh(c)
    return c


# confirma los cambios con la sesión de base de datos.
def _crear_cita(db, id_cliente, id_tecnico, fecha, hora, tipo_servicio="mantenimiento",
                estado="Confirmada", id_tecnico_2=None, id_tecnico_3=None):
    cita = Cita(
        id_cliente=id_cliente, id_tecnico=id_tecnico,
        id_tecnico_2=id_tecnico_2, id_tecnico_3=id_tecnico_3,
        tipo_servicio=tipo_servicio, fecha=fecha, hora=hora,
        direccion="Calle 1", estado=estado,
    )
    db.add(cita)
    db.commit()
    return cita


# confirma los cambios con la sesión de base de datos.
def _crear_entrega(db, id_cliente, id_tecnico, fecha, hora_ini, hora_fin, estado="Asignada"):
    pedido = Pedido(
        id_cliente_pe=id_cliente, estado_pedido="Pagado", estado_entrega=estado,
        id_tecnico_entrega=id_tecnico, fecha_entrega=fecha,
        hora_entrega=hora_ini, hora_entrega_fin=hora_fin,
    )
    db.add(pedido)
    db.commit()
    return pedido


def _fecha_laboral(dias=5):
    f = date.today() + timedelta(days=dias)
    while f.weekday() == 6:  # domingo
        f += timedelta(days=1)
    return f


class BaseIntegracionTestCase(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.db = SessionLocal()

    @classmethod
    def tearDownClass(cls):
        cls.db.close()

    def setUp(self):
        self.cliente = _crear_cliente(self.db)
        self._ids_usuario = []
        self._id_pedido = None
        self._ids_cita = []

    def tearDown(self):
        from app.models.factura import Factura
        from app.models.notificacion import Notificacion

        self.db.query(Notificacion).filter(
            Notificacion.id_cliente == self.cliente.id_cliente
        ).delete(synchronize_session=False)
        for cid in self._ids_cita:
            self.db.query(Factura).filter(Factura.id_cita == cid).delete(synchronize_session=False)
            self.db.query(Cita).filter(Cita.id_cita == cid).delete(synchronize_session=False)
        if self._id_pedido:
            self.db.query(Pedido).filter(Pedido.id_pedido == self._id_pedido).delete(synchronize_session=False)
        for uid in self._ids_usuario:
            self.db.query(Tecnico).filter(Tecnico.id_usuario_t == uid).delete(synchronize_session=False)
            self.db.query(User).filter(User.id_usuario == uid).delete(synchronize_session=False)
        self.db.query(Cliente).filter(Cliente.id_cliente == self.cliente.id_cliente).delete(synchronize_session=False)
        self.db.commit()

    def _tecnico(self, sufijo, ids_esp=None, activo=True):
        t = _crear_tecnico(self.db, sufijo, ids_esp, activo)
        self._ids_usuario.append(t.id_usuario_t)
        return t

    def _track_cita(self, cita):
        self._ids_cita.append(cita.id_cita)
        return cita


class HorasLaboralesTestCase(unittest.TestCase):
    def test_duracion_corta_todos_los_inicios(self):
        self.assertEqual(horas_laborales(date(2026, 1, 5), 1.0), ["08:00", "11:00", "14:00", "17:00"])

    def test_duracion_larga_descarta_ultimo_inicio(self):
        self.assertEqual(horas_laborales(date(2026, 1, 5), 2.0), ["08:00", "11:00", "14:00"])

    def test_duracion_maxima_descarta_17(self):
        self.assertEqual(horas_laborales(date(2026, 1, 5), 2.5), ["08:00", "11:00", "14:00"])


class CapacidadTecnicoTestCase(BaseIntegracionTestCase):
    def _fecha(self, dias=5):
        return _fecha_laboral(dias)

    def test_mismo_tecnico_citas_solapadas(self):
        t = self._tecnico("a")
        f = self._fecha()
        self._track_cita(_crear_cita(self.db, self.cliente.id_cliente, t.id_tecnico, f, "08:00"))
        self.assertTrue(tecnico_ocupado(self.db, t.id_tecnico, f, "08:00", duracion_horas=1.0))
        # Solapamiento parcial (09:00 dentro de la cita de 08:00-09:00).
        self.assertTrue(tecnico_ocupado(self.db, t.id_tecnico, f, "08:30", duracion_horas=1.0))

    def test_intervalos_contiguos_permitidos(self):
        t = self._tecnico("a")
        f = self._fecha()
        self._track_cita(_crear_cita(self.db, self.cliente.id_cliente, t.id_tecnico, f, "08:00"))
        # Cita de 08:00 a 09:00 (duración base 1h); 09:00 es contiguo, no solapado.
        self.assertFalse(tecnico_ocupado(self.db, t.id_tecnico, f, "09:00", duracion_horas=1.0))

    def test_segundo_y_tercer_tecnico_tambien_ocupan(self):
        a = self._tecnico("a")
        b = self._tecnico("b")
        c = self._tecnico("c")
        f = self._fecha()
        self._track_cita(_crear_cita(self.db, self.cliente.id_cliente, a.id_tecnico, f, "08:00",
                                     id_tecnico_2=b.id_tecnico, id_tecnico_3=c.id_tecnico))
        self.assertTrue(tecnico_ocupado(self.db, b.id_tecnico, f, "08:00", duracion_horas=1.0))
        self.assertTrue(tecnico_ocupado(self.db, c.id_tecnico, f, "08:00", duracion_horas=1.0))

    def test_cita_y_entrega_incompatibles(self):
        t = self._tecnico("a")
        f = self._fecha()
        self._track_cita(_crear_cita(self.db, self.cliente.id_cliente, t.id_tecnico, f, "08:00"))
        # Entrega en el rango 08:00-09:00 choca con la cita (tecnico_libre_en_rango).
        self.assertFalse(tecnico_libre_en_rango(self.db, t.id_tecnico, f, "08:00", "09:00"))
        # Y una cita nueva en 08:30 chocaría con la entrega ya existente.
        self._id_pedido = _crear_entrega(
            self.db, self.cliente.id_cliente, t.id_tecnico, self._fecha(6), "08:00", "09:00"
        ).id_pedido
        self.assertTrue(tecnico_ocupado(self.db, t.id_tecnico, self._fecha(6), "08:30", duracion_horas=1.0))

    def test_cancelacion_libera_capacidad(self):
        t = self._tecnico("a")
        f = self._fecha()
        cita = self._track_cita(_crear_cita(self.db, self.cliente.id_cliente, t.id_tecnico, f, "08:00"))
        self.assertTrue(tecnico_ocupado(self.db, t.id_tecnico, f, "08:00", duracion_horas=1.0))
        cita.estado = "Cancelada"
        self.db.commit()
        self.assertFalse(tecnico_ocupado(self.db, t.id_tecnico, f, "08:00", duracion_horas=1.0))

    def test_reprogramacion_excluye_propia_cita(self):
        t = self._tecnico("a")
        f = self._fecha()
        cita = self._track_cita(_crear_cita(self.db, self.cliente.id_cliente, t.id_tecnico, f, "08:00"))
        # Misma franja, excluyendo la propia cita → no ocupado.
        self.assertFalse(
            tecnico_ocupado(self.db, t.id_tecnico, f, "08:00", excluir_cita_id=cita.id_cita, duracion_horas=1.0)
        )

    def test_cita_sin_equipo_no_bloquea_tecnicos(self):
        t = self._tecnico("a")
        f = self._fecha()
        # Cita sin técnico asignado: no ocupa la agenda de ningún técnico.
        self._track_cita(_crear_cita(self.db, self.cliente.id_cliente, None, f, "08:00"))
        self.assertFalse(tecnico_ocupado(self.db, t.id_tecnico, f, "08:00", duracion_horas=1.0))
        self.assertTrue(hay_disponibilidad(self.db, f, "08:00", cantidad=1))


class AptitudEquipoTestCase(BaseIntegracionTestCase):
    def _fecha(self, dias=5):
        return _fecha_laboral(dias)

    def test_tecnico_libre_sin_especializacion_no_basta(self):
        a = self._tecnico("a")  # sin especializaciones
        b = self._tecnico("b", ids_esp=[1])
        f = self._fecha()
        disponibles = tecnicos_disponibles(self.db, f, "08:00", ids_especializacion=[1])
        self.assertIn(b.id_tecnico, [t.id_tecnico for t in disponibles])
        self.assertNotIn(a.id_tecnico, [t.id_tecnico for t in disponibles])
        self.assertTrue(hay_disponibilidad(self.db, f, "08:00", ids_especializacion=[1], cantidad=1))

    def test_cuenta_inactiva_excluida(self):
        t = self._tecnico("a", ids_esp=[1], activo=False)
        f = self._fecha()
        disponibles = tecnicos_disponibles(self.db, f, "08:00", ids_especializacion=[1])
        self.assertNotIn(t.id_tecnico, [x.id_tecnico for x in disponibles])
        self.assertFalse(tecnico_disponible(self.db, t.id_tecnico, f, "08:00", ids_especializacion=[1]))
        self.assertFalse(hay_disponibilidad(self.db, f, "08:00", ids_especializacion=[1], cantidad=1))

    def test_equipo_completo_exigido(self):
        a = self._tecnico("a", ids_esp=[1])  # único apto
        f = self._fecha()
        self.assertTrue(hay_disponibilidad(self.db, f, "08:00", ids_especializacion=[1], cantidad=1))
        self.assertFalse(hay_disponibilidad(self.db, f, "08:00", ids_especializacion=[1], cantidad=2))


class ConfirmacionCitaTestCase(BaseIntegracionTestCase):
    def _fecha(self, dias=5):
        return _fecha_laboral(dias)

    def _crear_cita_endpoint(self, id_tecnico, fecha, hora):
        with patch("app.services.pagos_service.procesar_pago",
                   return_value={"estado": "aprobado", "numero_transaccion": "TXN"}), \
             patch("app.services.factura_service.crear_factura_cita", return_value=None):
            return crear_cita(
                CitaCreate(
                    tipo_servicio="mantenimiento", fecha=fecha, hora=hora,
                    direccion="Calle 1", id_tecnico=id_tecnico, metodo_pago="tarjeta",
                ),
                self.cliente,
                self.db,
            )

    def test_crear_cita_con_tecnico_ocupado_se_rechaza(self):
        t = self._tecnico("a")
        f = self._fecha()
        self._track_cita(_crear_cita(self.db, self.cliente.id_cliente, t.id_tecnico, f, "08:00"))
        with notificaciones_anuladas():
            with self.assertRaises(HTTPException) as ctx:
                self._crear_cita_endpoint(t.id_tecnico, f, "08:00")
        self.assertEqual(ctx.exception.status_code, 409)

    def test_tecnico_sin_especializacion_rechazado(self):
        t = self._tecnico("a")  # sin especialización
        f = self._fecha()
        with notificaciones_anuladas():
            with self.assertRaises(HTTPException):
                _validar_tecnico_cita(self.db, t.id_tecnico, "mantenimiento", f, "08:00",
                                      ids_especializacion=[1])

    def test_crear_cita_con_tecnico_libre_ok(self):
        t = self._tecnico("a")
        f = self._fecha()
        with notificaciones_anuladas():
            resp = self._crear_cita_endpoint(t.id_tecnico, f, "11:00")
        self._ids_cita.append(resp.id_cita)
        self.assertEqual(resp.estado, "Confirmada")


class ConcurrenciaCapacidadTestCase(BaseIntegracionTestCase):
    def _fecha(self, dias=5):
        return _fecha_laboral(dias)

    def _ejecutar_concurrente(self, fns, timeout=30):
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

    def _reservar(self, id_cliente, id_tecnico, fecha, hora):
        """Reserva directa (bloqueo de técnico + comprobación + inserción),
        el mismo mecanismo que usa la confirmación de una cita, sin efectos
        secundarios de notificaciones/facturas."""
        def fn(barrera):
            barrera.wait()
            db = SessionLocal()
            try:
                bloquear_tecnicos(db, [id_tecnico])
                if tecnico_ocupado(db, id_tecnico, fecha, hora, duracion_horas=1.0):
                    return "ocupado"
                cita = Cita(
                    id_cliente=id_cliente, id_tecnico=id_tecnico,
                    tipo_servicio="mantenimiento", fecha=fecha, hora=hora,
                    direccion="Calle 1", estado="Confirmada",
                )
                db.add(cita)
                db.commit()
                return cita.id_cita
            finally:
                db.close()
        return fn

    def test_dos_reservas_comptien_por_unico_tecnico(self):
        t = self._tecnico("a")
        f = self._fecha()
        id_cliente = self.cliente.id_cliente
        r1, r2 = self._ejecutar_concurrente([
            self._reservar(id_cliente, t.id_tecnico, f, "08:00"),
            self._reservar(id_cliente, t.id_tecnico, f, "08:00"),
        ])
        exitos = [r for r in (r1, r2) if not isinstance(r, Exception) and r != "ocupado"]
        ocupados = [r for r in (r1, r2) if r == "ocupado"]
        self.assertEqual(len(exitos), 1, (r1, r2))
        self.assertEqual(len(ocupados), 1)
        db = SessionLocal()
        try:
            n = db.query(Cita).filter(Cita.id_tecnico == t.id_tecnico, Cita.fecha == f, Cita.hora == "08:00").count()
            self.assertEqual(n, 1)
            self._ids_cita.extend(
                x[0] for x in db.query(Cita.id_cita).filter(Cita.id_cliente == self.cliente.id_cliente).all()
            )
        finally:
            db.close()

    def test_dos_reservas_con_dos_tecnicos_se_confirman(self):
        a = self._tecnico("a")
        b = self._tecnico("b")
        f = self._fecha()
        id_cliente = self.cliente.id_cliente
        r1, r2 = self._ejecutar_concurrente([
            self._reservar(id_cliente, a.id_tecnico, f, "08:00"),
            self._reservar(id_cliente, b.id_tecnico, f, "08:00"),
        ])
        self.assertNotIsInstance(r1, Exception, r1)
        self.assertNotIsInstance(r2, Exception, r2)
        db = SessionLocal()
        try:
            n = db.query(Cita).filter(Cita.fecha == f, Cita.hora == "08:00").count()
            self.assertEqual(n, 2)
            self._ids_cita.extend(
                x[0] for x in db.query(Cita.id_cita).filter(Cita.id_cliente == self.cliente.id_cliente).all()
            )
        finally:
            db.close()


if __name__ == "__main__":
    unittest.main(verbosity=2)
