"""Pruebas de comportamiento del bloque 1.1: cierre de consistencia de
entregas y desactivación de técnicos.

Cubre:
  - Reasignación administrativa y automática rechazadas en Recogido/En camino/
    Entregado.
  - Estados desconocidos rechazados (lista permitida).
  - Desactivación rechazada (409) con entregas en custodia, sin cambios
    parciales ni avisos, incluyendo pedidos con fecha pasada.
  - Desactivación normal sin custodia.
  - Otro técnico / cliente sin permiso para actualizar la entrega.
  - Solicitud del antiguo responsable después de reasignación.
  - Concurrencia: mismo avance repetido, recogida vs reasignación y recogida
    vs desactivación.

Las pruebas de concurrencia usan conexiones/sesiones independientes contra la
misma base MySQL de pruebas y una barrera para coordinar el arranque; el
ganador lo decide el bloqueo de fila (FOR UPDATE), no la secuencia. Las
notificaciones y correos externos se anulan para no escribir ni enviar nada.
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
from app.models.cliente import Cliente
from app.models.evidencia import EvidenciaEntrega
from app.models.pedido import Pedido
from app.models.tecnico import Tecnico
from app.models.user import User
from app.routers.pedidos import EntregaAsignarRequest, asignar_entrega_admin
from app.routers.tecnicos import (
    EstadoEntregaUpdate,
    actualizar_estado_entrega_tecnico,
)
from app.routers.users import EmployeeUpdate, editar_empleado
from app.services.asignacion_service import (
    OMITIR_ENTREGA,
    reasignar_entrega,
    validar_desactivacion_sin_custodia,
)
from app.services.estados_entrega import asignacion_reasignable


class _Contador:
    """Contador thread-safe para notificaciones anuladas."""

    def __init__(self):
        self._n = 0
        self._lock = threading.Lock()

    def inc(self, *_args, **_kwargs):
        with self._lock:
            self._n += 1
        return None

    @property
    def valor(self):
        with self._lock:
            return self._n


async def _async_noop(*_args, **_kwargs):
    return None


def notificaciones_anuladas(contador=None):
    """Anula correos y notificaciones de plataforma, evitando escrituras en la
    tabla de notificaciones y envío de correos. Si se pasa un contador, cuenta
    las llamadas a ``crear_notificacion``."""
    stack = ExitStack()
    stack.enter_context(patch("app.utils.email.send_email", new=_async_noop))
    stack.enter_context(
        patch("app.services.notificaciones.programar_correo", new=lambda *a, **k: None)
    )
    if contador is not None:
        stack.enter_context(
            patch(
                "app.services.notificaciones.crear_notificacion",
                side_effect=contador.inc,
            )
        )
    else:
        stack.enter_context(
            patch("app.services.notificaciones.crear_notificacion", new=lambda *a, **k: None)
        )
    return stack


# confirma los cambios con la sesión de base de datos.
def _crear_tecnico(db, sufijo: str) -> Tecnico:
    email = f"bloque11.{sufijo}.{int(time.time() * 1_000_000)}@test.local"
    usuario = User(
        first_name="Tec",
        last_name=sufijo,
        email=email,
        password_hash="x",
        id_rol_u=2,
        is_active=True,
    )
    db.add(usuario)
    db.flush()
    ficha = Tecnico(id_usuario_t=usuario.id_usuario, certificacion_t="")
    db.add(ficha)
    db.commit()
    db.refresh(usuario)
    return ficha


# confirma los cambios con la sesión de base de datos.
def _crear_pedido(db, id_cliente, id_tecnico, estado: str | None, dias: int = 2) -> int:
    pedido = Pedido(
        id_cliente_pe=id_cliente,
        estado_pedido="Pagado",
        estado_entrega=estado,
        id_tecnico_entrega=id_tecnico,
        nombre_tecnico_entrega="Técnico de prueba",
        fecha_entrega=date.today() + timedelta(days=dias),
        hora_entrega="10:00",
    )
    db.add(pedido)
    db.commit()
    return pedido.id_pedido


# Consulta EvidenciaEntrega, Pedido; confirma los cambios con la sesión de base de datos.
def _borrar_entrega(db, id_pedido: int) -> None:
    if id_pedido is None:
        return
    db.query(EvidenciaEntrega).filter(EvidenciaEntrega.id_pedido == id_pedido).delete()
    db.query(Pedido).filter(Pedido.id_pedido == id_pedido).delete()
    db.commit()


# Consulta Tecnico, User; confirma los cambios con la sesión de base de datos.
def _borrar_tecnico(db, id_usuario: int) -> None:
    if id_usuario is None:
        return
    db.query(Tecnico).filter(Tecnico.id_usuario_t == id_usuario).delete()
    db.query(User).filter(User.id_usuario == id_usuario).delete()
    db.commit()


class ReglaAsignacionReasignableTestCase(unittest.TestCase):
    def test_solo_estados_permitidos(self):
        self.assertTrue(asignacion_reasignable("Pendiente"))
        self.assertTrue(asignacion_reasignable("Asignada"))
        self.assertTrue(asignacion_reasignable(None))
        self.assertTrue(asignacion_reasignable(""))

    def test_custodia_terminal_y_desconocidos_rechazados(self):
        for estado in ("Recogido", "En camino", "Entregado", "EstadoRaro", "foo", "En Camino", " "):
            self.assertFalse(asignacion_reasignable(estado), estado)


class BaseIntegracionTestCase(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.db = SessionLocal()

    @classmethod
    def tearDownClass(cls):
        cls.db.close()

    def setUp(self):
        self.cliente = Cliente(
            first_name="Test",
            last_name="Cliente",
            email=f"b11.cliente.{int(time.time() * 1_000_000)}@test.local",
            is_active=True,
            auth_provider="local",
        )
        self.db.add(self.cliente)
        self.db.commit()
        self.id_pedido = None
        self._tecnico_ids = []

    def tearDown(self):
        _borrar_entrega(self.db, self.id_pedido)
        for id_usuario in self._tecnico_ids:
            _borrar_tecnico(self.db, id_usuario)
        self.db.query(Cliente).filter(Cliente.id_cliente == self.cliente.id_cliente).delete()
        self.db.commit()

    def _tecnico(self, sufijo):
        ficha = _crear_tecnico(self.db, sufijo)
        self._tecnico_ids.append(ficha.id_usuario_t)
        return ficha

    def _leer_estado(self):
        db = SessionLocal()
        try:
            pedido = (
                db.query(Pedido).filter(Pedido.id_pedido == self.id_pedido).first()
            )
            return pedido.estado_entrega if pedido else None
        finally:
            db.close()


class ReasignacionRechazadaTestCase(BaseIntegracionTestCase):
    def _estado(self):
        return (
            self.db.query(Pedido)
            .filter(Pedido.id_pedido == self.id_pedido)
            .first()
            .estado_entrega
        )

    def test_reasignacion_admin_rechazada_en_custodia_y_terminal(self):
        tecnico_a = self._tecnico("a")
        tecnico_b = self._tecnico("b")
        for estado in ("Recogido", "En camino", "Entregado"):
            self.id_pedido = _crear_pedido(
                self.db, self.cliente.id_cliente, tecnico_a.id_tecnico, estado
            )
            with notificaciones_anuladas():
                with self.assertRaises(HTTPException) as ctx:
                    asignar_entrega_admin(
                        self.id_pedido,
                        EntregaAsignarRequest(id_tecnico=tecnico_b.id_tecnico),
                        admin_user=None,
                        db=self.db,
                    )
            self.assertEqual(ctx.exception.status_code, 409, estado)
            self.assertEqual(self._estado(), estado)
            _borrar_entrega(self.db, self.id_pedido)
            self.id_pedido = None

    def test_reasignacion_automatica_rechazada_en_custodia(self):
        tecnico_a = self._tecnico("a")
        for estado in ("Recogido", "En camino", "Entregado"):
            self.id_pedido = _crear_pedido(
                self.db, self.cliente.id_cliente, tecnico_a.id_tecnico, estado
            )
            pedido = self.db.query(Pedido).filter(Pedido.id_pedido == self.id_pedido).first()
            with notificaciones_anuladas():
                with self.assertRaises(HTTPException) as ctx:
                    reasignar_entrega(
                        self.db,
                        pedido,
                        excluir_ids={tecnico_a.id_tecnico},
                        propietario_esperado=tecnico_a.id_tecnico,
                    )
            self.assertEqual(ctx.exception.status_code, 409, estado)
            self.assertEqual(
                self.db.query(Pedido).filter(Pedido.id_pedido == self.id_pedido).first().estado_entrega,
                estado,
            )
            _borrar_entrega(self.db, self.id_pedido)
            self.id_pedido = None

    def test_estado_desconocido_rechazado_en_asignacion_admin(self):
        tecnico_a = self._tecnico("a")
        tecnico_b = self._tecnico("b")
        self.id_pedido = _crear_pedido(
            self.db, self.cliente.id_cliente, tecnico_a.id_tecnico, "EstadoRaro"
        )
        with notificaciones_anuladas():
            with self.assertRaises(HTTPException) as ctx:
                asignar_entrega_admin(
                    self.id_pedido,
                    EntregaAsignarRequest(id_tecnico=tecnico_b.id_tecnico),
                    admin_user=None,
                    db=self.db,
                )
        self.assertEqual(ctx.exception.status_code, 409)
        # No se normaliza ni sobrescribe el estado desconocido.
        self.assertEqual(self._estado(), "EstadoRaro")


class ReasignacionPrecargaTestCase(BaseIntegracionTestCase):
    """Verifica que ``reasignar_entrega`` valida el estado y el responsable
    vigentes incluso cuando recibe un objeto Pedido precargado (potencialmente
    desactualizado en el mapa de identidad de la sesión). Usa sesiones
    independientes para reproducir el orden relevante de forma determinista."""

    def test_precarga_desactualizada_detecta_recogido(self):
        tecnico = self._tecnico("a")
        self.id_pedido = _crear_pedido(
            self.db, self.cliente.id_cliente, tecnico.id_tecnico, "Asignada"
        )
        # Sesión A: precarga el pedido en estado Asignada.
        db_a = SessionLocal()
        pedido_a = db_a.query(Pedido).filter(Pedido.id_pedido == self.id_pedido).first()
        self.assertEqual(pedido_a.estado_entrega, "Asignada")

        # Sesión B: el técnico confirma Recogido.
        db_b = SessionLocal()
        try:
            with notificaciones_anuladas():
                usuario = db_b.query(User).filter(User.id_usuario == tecnico.id_usuario_t).first()
                actualizar_estado_entrega_tecnico(
                    self.id_pedido,
                    EstadoEntregaUpdate(estado="Recogido"),
                    current_user=usuario,
                    db=db_b,
                )
        finally:
            db_b.close()

        # Sesión A intenta la reasignación automática con el objeto precargado:
        # debe releer la fila (populate_existing) y detectar Recogido → 409.
        contador = _Contador()
        try:
            with notificaciones_anuladas(contador):
                with self.assertRaises(HTTPException) as ctx:
                    reasignar_entrega(
                        db_a,
                        pedido_a,
                        excluir_ids={tecnico.id_tecnico},
                        propietario_esperado=tecnico.id_tecnico,
                    )
        finally:
            db_a.close()
        self.assertEqual(ctx.exception.status_code, 409)
        self.assertEqual(contador.valor, 0)
        # El cambio de la sesión B se conserva.
        self.assertEqual(self._leer_estado(), "Recogido")

    def test_precarga_reasignada_a_otro_tecnico_se_conserva(self):
        tecnico_a = self._tecnico("a")
        tecnico_b = self._tecnico("b")
        self.id_pedido = _crear_pedido(
            self.db, self.cliente.id_cliente, tecnico_a.id_tecnico, "Asignada"
        )
        # Sesión de desactivación: precarga la entrega del técnico A.
        db_deact = SessionLocal()
        pedido = db_deact.query(Pedido).filter(Pedido.id_pedido == self.id_pedido).first()

        # Otra sesión la reasigna al técnico B.
        db_admin = SessionLocal()
        try:
            with notificaciones_anuladas():
                asignar_entrega_admin(
                    self.id_pedido,
                    EntregaAsignarRequest(id_tecnico=tecnico_b.id_tecnico),
                    admin_user=None,
                    db=db_admin,
                )
        finally:
            db_admin.close()

        # El proceso de A continúa con el objeto precargado: debe omitir sin
        # reasignar de nuevo ni dejar la entrega sin responsable.
        contador = _Contador()
        try:
            with notificaciones_anuladas(contador):
                resultado = reasignar_entrega(
                    db_deact,
                    pedido,
                    excluir_ids={tecnico_a.id_tecnico},
                    propietario_esperado=tecnico_a.id_tecnico,
                )
        finally:
            db_deact.close()
        self.assertIs(resultado, OMITIR_ENTREGA)
        self.assertEqual(contador.valor, 0)
        # La asignación a B se conserva.
        db = SessionLocal()
        try:
            p = db.query(Pedido).filter(Pedido.id_pedido == self.id_pedido).first()
            self.assertEqual(p.id_tecnico_entrega, tecnico_b.id_tecnico)
            self.assertEqual(p.estado_entrega, "Asignada")
        finally:
            db.close()

    def test_precarga_reasignada_sin_candidatos_tampoco_desasigna(self):
        tecnico_a = self._tecnico("a")
        tecnico_b = self._tecnico("b")
        self.id_pedido = _crear_pedido(
            self.db, self.cliente.id_cliente, tecnico_a.id_tecnico, "Asignada"
        )
        db_deact = SessionLocal()
        pedido = db_deact.query(Pedido).filter(Pedido.id_pedido == self.id_pedido).first()

        db_admin = SessionLocal()
        try:
            with notificaciones_anuladas():
                asignar_entrega_admin(
                    self.id_pedido,
                    EntregaAsignarRequest(id_tecnico=tecnico_b.id_tecnico),
                    admin_user=None,
                    db=db_admin,
                )
        finally:
            db_admin.close()

        # Simula la rama «sin candidatos»: aunque no hubiera técnicos libres,
        # el caso «ya reasignada» debe devolverse como omitir (no como None),
        # para no activar la desasignación a Pendiente.
        try:
            with notificaciones_anuladas():
                with patch(
                    "app.services.especialidades._tecnicos_activos", return_value=[]
                ):
                    resultado = reasignar_entrega(
                        db_deact,
                        pedido,
                        excluir_ids={tecnico_a.id_tecnico},
                        propietario_esperado=tecnico_a.id_tecnico,
                    )
        finally:
            db_deact.close()
        self.assertIs(resultado, OMITIR_ENTREGA)
        db = SessionLocal()
        try:
            p = db.query(Pedido).filter(Pedido.id_pedido == self.id_pedido).first()
            self.assertEqual(p.id_tecnico_entrega, tecnico_b.id_tecnico)
            self.assertEqual(p.estado_entrega, "Asignada")
        finally:
            db.close()


class PermisoActualizacionTestCase(BaseIntegracionTestCase):
    def test_otro_tecnico_no_puede_actualizar(self):
        tecnico_a = self._tecnico("a")
        tecnico_b = self._tecnico("b")
        self.id_pedido = _crear_pedido(
            self.db, self.cliente.id_cliente, tecnico_a.id_tecnico, "Asignada"
        )
        with notificaciones_anuladas():
            with self.assertRaises(HTTPException) as ctx:
                actualizar_estado_entrega_tecnico(
                    self.id_pedido,
                    EstadoEntregaUpdate(estado="Recogido"),
                    current_user=tecnico_b.usuario,
                    db=self.db,
                )
        self.assertEqual(ctx.exception.status_code, 404)

    def test_antiguo_responsable_no_avanza_tras_reasignacion(self):
        tecnico_a = self._tecnico("a")
        tecnico_b = self._tecnico("b")
        self.id_pedido = _crear_pedido(
            self.db, self.cliente.id_cliente, tecnico_a.id_tecnico, "Asignada"
        )
        # Admin reasigna a B.
        with notificaciones_anuladas():
            asignar_entrega_admin(
                self.id_pedido,
                EntregaAsignarRequest(id_tecnico=tecnico_b.id_tecnico),
                admin_user=None,
                db=self.db,
            )
            # El antiguo responsable (A) ya no puede avanzar el pedido.
            with self.assertRaises(HTTPException) as ctx:
                actualizar_estado_entrega_tecnico(
                    self.id_pedido,
                    EstadoEntregaUpdate(estado="Recogido"),
                    current_user=tecnico_a.usuario,
                    db=self.db,
                )
        self.assertEqual(ctx.exception.status_code, 404)
        self.assertEqual(
            self.db.query(Pedido).filter(Pedido.id_pedido == self.id_pedido).first().id_tecnico_entrega,
            tecnico_b.id_tecnico,
        )


class DesactivacionTestCase(BaseIntegracionTestCase):
    def test_desactivacion_rechazada_por_custodia_con_fecha_pasada(self):
        tecnico = self._tecnico("a")
        # Pedido en custodia con fecha en el pasado.
        self.id_pedido = _crear_pedido(
            self.db, self.cliente.id_cliente, tecnico.id_tecnico, "Recogido", dias=-3
        )
        contador = _Contador()
        with notificaciones_anuladas(contador):
            with self.assertRaises(HTTPException) as ctx:
                validar_desactivacion_sin_custodia(self.db, tecnico.id_tecnico)
        self.assertEqual(ctx.exception.status_code, 409)
        # Sin cambios: el técnico sigue activo y no se generaron avisos.
        self.assertTrue(tecnico.usuario.is_active)
        self.assertEqual(contador.valor, 0)

    def test_desactivacion_endpoint_rechazada_sin_cambios_parciales(self):
        import asyncio

        tecnico = self._tecnico("a")
        self.id_pedido = _crear_pedido(
            self.db, self.cliente.id_cliente, tecnico.id_tecnico, "En camino", dias=1
        )
        id_usuario = tecnico.id_usuario_t
        contador = _Contador()
        with notificaciones_anuladas(contador):
            with self.assertRaises(HTTPException) as ctx:
                asyncio.run(
                    editar_empleado(
                        id_usuario,
                        EmployeeUpdate(is_active=False, motivo="prueba"),
                        _admin_user=None,
                        db=self.db,
                    )
                )
        self.assertEqual(ctx.exception.status_code, 409)
        # Sin cambios parciales: is_active sigue en True.
        self.db.expire_all()
        usuario = self.db.query(User).filter(User.id_usuario == id_usuario).first()
        self.assertTrue(usuario.is_active)
        self.assertEqual(contador.valor, 0)

    def test_desactivacion_normal_sin_custodia(self):
        import asyncio

        tecnico = self._tecnico("a")
        id_usuario = tecnico.id_usuario_t
        with notificaciones_anuladas():
            resultado = asyncio.run(
                editar_empleado(
                    id_usuario,
                    EmployeeUpdate(is_active=False, motivo="prueba"),
                    _admin_user=None,
                    db=self.db,
                )
            )
        self.assertIsNotNone(resultado)
        self.db.expire_all()
        usuario = self.db.query(User).filter(User.id_usuario == id_usuario).first()
        self.assertFalse(usuario.is_active)


class ConcurrenciaTestCase(BaseIntegracionTestCase):
    def _leer_pedido(self):
        db = SessionLocal()
        try:
            return (
                db.query(Pedido).filter(Pedido.id_pedido == self.id_pedido).first()
            )
        finally:
            db.close()

    def _ejecutar_concurrente(self, fns):
        """Ejecuta varias funciones en hilos independientes sincronizados por
        una barrera. Cada función debe abrir su propia sesión. Devuelve la
        lista de resultados (valor o excepción)."""
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
            h.join()
        return resultados

    def test_mismo_avance_simultaneo_una_sola_transicion(self):
        tecnico = self._tecnico("a")
        self.id_pedido = _crear_pedido(
            self.db, self.cliente.id_cliente, tecnico.id_tecnico, "Asignada"
        )
        id_usuario = tecnico.id_usuario_t
        contador = _Contador()

        def pickup(barrera):
            barrera.wait()
            db = SessionLocal()
            try:
                usuario = db.query(User).filter(User.id_usuario == id_usuario).first()
                return actualizar_estado_entrega_tecnico(
                    self.id_pedido,
                    EstadoEntregaUpdate(estado="Recogido"),
                    current_user=usuario,
                    db=db,
                )
            finally:
                db.close()

        with notificaciones_anuladas(contador):
            r1, r2 = self._ejecutar_concurrente([pickup, pickup])

        errores = [r for r in (r1, r2) if isinstance(r, Exception)]
        exitos = [r for r in (r1, r2) if not isinstance(r, Exception)]
        self.assertEqual(len(errores), 0, errores)
        self.assertEqual(len(exitos), 2)
        self.assertEqual(self._leer_pedido().estado_entrega, "Recogido")
        # Solo una notificación de recogida.
        self.assertEqual(contador.valor, 1)

    def test_recogida_simultanea_con_reasignacion(self):
        tecnico_a = self._tecnico("a")
        tecnico_b = self._tecnico("b")
        self.id_pedido = _crear_pedido(
            self.db, self.cliente.id_cliente, tecnico_a.id_tecnico, "Asignada"
        )
        id_usuario_a = tecnico_a.id_usuario_t

        def pickup(barrera):
            barrera.wait()
            db = SessionLocal()
            try:
                usuario = db.query(User).filter(User.id_usuario == id_usuario_a).first()
                return actualizar_estado_entrega_tecnico(
                    self.id_pedido,
                    EstadoEntregaUpdate(estado="Recogido"),
                    current_user=usuario,
                    db=db,
                )
            finally:
                db.close()

        def reasignar(barrera):
            barrera.wait()
            db = SessionLocal()
            try:
                return asignar_entrega_admin(
                    self.id_pedido,
                    EntregaAsignarRequest(id_tecnico=tecnico_b.id_tecnico),
                    admin_user=None,
                    db=db,
                )
            finally:
                db.close()

        with notificaciones_anuladas():
            r_pickup, r_reasign = self._ejecutar_concurrente([pickup, reasignar])

        pedido = self._leer_pedido()

        if isinstance(r_reasign, HTTPException):
            # La recogida ganó: reasignación rechazada, técnico intacto.
            self.assertEqual(r_reasign.status_code, 409)
            self.assertEqual(pedido.estado_entrega, "Recogido")
            self.assertEqual(pedido.id_tecnico_entrega, tecnico_a.id_tecnico)
            self.assertNotIsInstance(r_pickup, Exception)
        else:
            # La reasignación ganó: la recogida del antiguo técnico falla.
            self.assertNotIsInstance(r_reasign, Exception)
            self.assertEqual(pedido.estado_entrega, "Asignada")
            self.assertEqual(pedido.id_tecnico_entrega, tecnico_b.id_tecnico)
            self.assertIsInstance(r_pickup, HTTPException)
        # Nunca ambas a la vez.
        self.assertTrue(isinstance(r_pickup, Exception) != isinstance(r_reasign, Exception))

    def test_recogida_simultanea_con_desactivacion(self):
        tecnico = self._tecnico("a")
        self.id_pedido = _crear_pedido(
            self.db, self.cliente.id_cliente, tecnico.id_tecnico, "Asignada"
        )
        id_usuario = tecnico.id_usuario_t
        id_tecnico = tecnico.id_tecnico

        def pickup(barrera):
            barrera.wait()
            db = SessionLocal()
            try:
                usuario = db.query(User).filter(User.id_usuario == id_usuario).first()
                return actualizar_estado_entrega_tecnico(
                    self.id_pedido,
                    EstadoEntregaUpdate(estado="Recogido"),
                    current_user=usuario,
                    db=db,
                )
            finally:
                db.close()

        def desactivar(barrera):
            barrera.wait()
            db = SessionLocal()
            try:
                validar_desactivacion_sin_custodia(db, id_tecnico)
                usuario = db.query(User).filter(User.id_usuario == id_usuario).first()
                usuario.is_active = False
                db.commit()
                return "ok"
            except HTTPException as e:
                db.rollback()
                return e
            finally:
                db.close()

        with notificaciones_anuladas():
            r_pickup, r_desact = self._ejecutar_concurrente([pickup, desactivar])

        pedido = self._leer_pedido()
        db = SessionLocal()
        try:
            usuario = db.query(User).filter(User.id_usuario == id_usuario).first()
            activo = usuario.is_active
        finally:
            db.close()

        if isinstance(r_desact, HTTPException):
            # La recogida ganó: desactivación rechazada, técnico sigue activo.
            self.assertEqual(r_desact.status_code, 409)
            self.assertEqual(pedido.estado_entrega, "Recogido")
            self.assertTrue(activo)
            self.assertNotIsInstance(r_pickup, Exception)
        else:
            # La desactivación ganó: el técnico inactivo no pudo recoger.
            self.assertEqual(r_desact, "ok")
            self.assertFalse(activo)
            self.assertIsInstance(r_pickup, HTTPException)
            self.assertEqual(pedido.estado_entrega, "Asignada")
        self.assertTrue(isinstance(r_pickup, Exception) != isinstance(r_desact, Exception))


if __name__ == "__main__":
    unittest.main(verbosity=2)
