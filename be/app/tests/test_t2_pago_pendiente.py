"""T2.0: consistencia de confirmar_pago_pendiente frente a fallos, repeticiones
y concurrencia.

Pruebas sobre el flujo real (servicio), con sesiones independientes y avisos
anulados/contados. Requiere TEST_DATABASE_URL y base MySQL de pruebas.
"""
import asyncio
import threading
import time
import unittest
from datetime import date
from decimal import Decimal
from unittest.mock import patch

from fastapi import HTTPException
from sqlalchemy.exc import OperationalError

import app.tests.testdb  # noqa: F401

from app.database import SessionLocal
from app.models.cita import Cita
from app.models.cliente import Cliente
from app.models.factura import Factura
from app.models.pago import Pago
from app.models.pedido import DetallePedido, Pedido
from app.models.producto import Producto
from app.models.producto_variante import ProductoVariante
from app.models.tecnico import Tecnico
from app.models.user import User
from app.services.pedidos_service import _crear_factura, confirmar_pago_pendiente, crear_pedido


def _run(coro):
    return asyncio.run(coro)


def _crear_cliente(db):
    c = Cliente(
        first_name="Cli", last_name="T2",
        email=f"t2.cli.{int(time.time() * 1_000_000)}@neodomus.com",
        is_active=True, auth_provider="local",
    )
    db.add(c)
    db.commit()
    db.refresh(c)
    return c


def _crear_tecnico(db, sufijo):
    u = User(
        first_name="Tec", last_name=sufijo,
        email=f"t2.tec.{sufijo}.{int(time.time() * 1_000_000)}@neodomus.com",
        password_hash="x", id_rol_u=2, is_active=True,
    )
    db.add(u)
    db.flush()
    t = Tecnico(id_usuario_t=u.id_usuario, certificacion_t="")
    db.add(t)
    db.commit()
    db.refresh(u)
    return t


def _crear_producto(db, sufijo, stock, venta_por_metros=0):
    p = Producto(
        nombre_producto=f"Prod {sufijo}",
        referencia_producto=f"REF-{sufijo}-{int(time.time() * 1_000_000)}",
        stock_producto=stock,
        venta_por_metros=venta_por_metros,
        visible_cliente=True,
    )
    db.add(p)
    db.commit()
    db.refresh(p)
    return p


def _crear_pedido_pendiente(db, cliente, lineas, total=100):
    """lineas: [{producto, cantidad, cantidad_metros?, descripcion?}]."""
    pedido = Pedido(id_cliente_pe=cliente.id_cliente, estado_pedido="Pendiente", total_pedido=total)
    db.add(pedido)
    db.flush()
    for l in lineas:
        db.add(DetallePedido(
            id_pedido_d=pedido.id_pedido,
            id_producto_d=l["producto"].id_producto,
            cantidad_detalle=l.get("cantidad", 1),
            cantidad_metros=l.get("cantidad_metros"),
            descripcion_detalle=l.get("descripcion"),
        ))
    pago = Pago(id_pedido=pedido.id_pedido, metodo_pago="punto_pago", estado="pendiente", monto=total)
    db.add(pago)
    db.commit()
    db.refresh(pedido)
    db.refresh(pago)
    return pedido, pago


class BaseT2(unittest.TestCase):
    def setUp(self):
        # La asignación real puede elegir técnicos sembrados y el aviso de
        # stock consulta admins existentes. Aislar estos efectos en toda la
        # prueba (incluidos sus hilos), no solo el transporte de correo.
        for target in (
            "app.services.notificaciones.notificar_admin_stock_bajo",
            "app.services.notificaciones.notificar_entrega_asignada_tecnico",
        ):
            self.enterContext(patch(target))
        self.db = SessionLocal()
        self.cliente = _crear_cliente(self.db)
        self._ids_producto = []
        self._ids_pedido = []
        self._ids_usuario = []
        self._ids_tecnico = []

    def tearDown(self):
        from app.models.notificacion import Notificacion

        db = self.db
        for pid in self._ids_pedido:
            db.query(Factura).filter(Factura.id_pedido == pid).delete(synchronize_session=False)
            db.query(Cita).filter(Cita.numero_transaccion == f"PEDIDO-{pid}").delete(synchronize_session=False)
            db.query(DetallePedido).filter(DetallePedido.id_pedido_d == pid).delete(synchronize_session=False)
            db.query(Pago).filter(Pago.id_pedido == pid).delete(synchronize_session=False)
            db.query(Pedido).filter(Pedido.id_pedido == pid).delete(synchronize_session=False)
        for pid in self._ids_producto:
            db.query(ProductoVariante).filter(ProductoVariante.id_producto == pid).delete(synchronize_session=False)
            db.query(Producto).filter(Producto.id_producto == pid).delete(synchronize_session=False)
        db.query(Notificacion).filter(Notificacion.id_cliente == self.cliente.id_cliente).delete(synchronize_session=False)
        for uid in self._ids_usuario:
            db.query(Notificacion).filter(Notificacion.id_usuario == uid).delete(synchronize_session=False)
        for tid in self._ids_tecnico:
            db.query(Tecnico).filter(Tecnico.id_tecnico == tid).delete(synchronize_session=False)
        for uid in self._ids_usuario:
            db.query(User).filter(User.id_usuario == uid).delete(synchronize_session=False)
        db.query(Cliente).filter(Cliente.id_cliente == self.cliente.id_cliente).delete(synchronize_session=False)
        db.commit()
        db.close()

    def _producto(self, sufijo, stock, venta_por_metros=0):
        p = _crear_producto(self.db, sufijo, stock, venta_por_metros)
        self._ids_producto.append(p.id_producto)
        return p

    def _tecnico(self, sufijo):
        t = _crear_tecnico(self.db, sufijo)
        self._ids_tecnico.append(t.id_tecnico)
        self._ids_usuario.append(t.id_usuario_t)
        return t

    def _pedido(self, lineas):
        pedido, pago = _crear_pedido_pendiente(self.db, self.cliente, lineas)
        self._ids_pedido.append(pedido.id_pedido)
        return pedido.id_pedido, pago.id_pago

    def _leer(self, pid):
        db = SessionLocal()
        try:
            return (
                db.query(Pedido).filter(Pedido.id_pedido == pid).first(),
                db.query(Pago).filter(Pago.id_pedido == pid).first(),
                db.query(Factura).filter(Factura.id_pedido == pid).count(),
            )
        finally:
            db.close()


class ConfirmacionNormalTestCase(BaseT2):
    def test_confirmacion_normal(self):
        self._tecnico("a")
        p = self._producto("a", 5)
        pid, _ = self._pedido([{"producto": p, "cantidad": 2}])

        with patch("app.services.pedidos_service._enviar_factura", new=_async_noop), \
             patch("app.services.notificaciones.notificar_pago_confirmado_cliente"), \
             patch("app.services.pedidos_service._alertar_admin_stock_agotado"):
            resultado = _run(confirmar_pago_pendiente(self.db, pid, self.cliente))

        self.assertEqual(resultado["pedido"].estado_pedido, "Pagado")
        self.assertEqual(resultado["pago"].estado, "aprobado")
        self.assertIsNotNone(resultado["factura"])
        self.assertIsNotNone(resultado["entrega"])

        self.db.expire_all()
        pedido, pago, n_factura = self._leer(pid)
        self.assertEqual(pedido.estado_pedido, "Pagado")
        self.assertEqual(pago.estado, "aprobado")
        self.assertEqual(n_factura, 1)
        self.db.expire_all()
        prod = self.db.query(Producto).filter(Producto.id_producto == p.id_producto).first()
        self.assertEqual(prod.stock_producto, 3)


class FalloParcialTestCase(BaseT2):
    def test_fallo_en_articulo_posterior_no_deja_parciales(self):
        self._tecnico("a")
        p1 = self._producto("a", 10)
        p2 = self._producto("b", 0)  # sin stock
        pid, _ = self._pedido([
            {"producto": p1, "cantidad": 2},
            {"producto": p2, "cantidad": 1},
        ])

        with patch("app.services.pedidos_service._enviar_factura", new=_async_noop), \
             patch("app.services.notificaciones.notificar_pago_confirmado_cliente"), \
             patch("app.services.pedidos_service._alertar_admin_stock_agotado"):
            with self.assertRaises(HTTPException) as ctx:
                _run(confirmar_pago_pendiente(self.db, pid, self.cliente))

        self.assertEqual(ctx.exception.status_code, 409)
        pedido, pago, n_factura = self._leer(pid)
        self.assertEqual(pedido.estado_pedido, "Pendiente")
        self.assertEqual(pago.estado, "pendiente")
        self.assertEqual(n_factura, 0)
        # El descuento del artículo anterior se revirtió.
        db = SessionLocal()
        try:
            self.assertEqual(db.query(Producto).filter(Producto.id_producto == p1.id_producto).first().stock_producto, 10)
        finally:
            db.close()


class RepeticionTestCase(BaseT2):
    def test_confirmacion_repetida_no_duplica(self):
        self._tecnico("a")
        p = self._producto("a", 5)
        pid, _ = self._pedido([{"producto": p, "cantidad": 1}])

        with patch("app.services.pedidos_service._enviar_factura", new=_async_noop), \
             patch("app.services.notificaciones.notificar_pago_confirmado_cliente"), \
             patch("app.services.pedidos_service._alertar_admin_stock_agotado"):
            r1 = _run(confirmar_pago_pendiente(self.db, pid, self.cliente))
            r2 = _run(confirmar_pago_pendiente(self.db, pid, self.cliente))

        self.assertEqual(r1["factura"].numero_factura, r2["factura"].numero_factura)
        self.assertTrue(r2.get("completado"))
        self.db.expire_all()
        _, _, n_factura = self._leer(pid)
        self.assertEqual(n_factura, 1)
        db = SessionLocal()
        try:
            self.assertEqual(db.query(Producto).filter(Producto.id_producto == p.id_producto).first().stock_producto, 4)
        finally:
            db.close()


class ConcurrenciaTestCase(BaseT2):
    def test_concurrente_mismo_pedido_una_sola_vez(self):
        self._tecnico("a")
        p = self._producto("a", 5)
        pid, _ = self._pedido([{"producto": p, "cantidad": 1}])
        id_cliente = self.cliente.id_cliente

        def confirmar(barrera):
            barrera.wait()
            db = SessionLocal()
            try:
                cliente = db.query(Cliente).filter(Cliente.id_cliente == id_cliente).first()
                with patch("app.services.pedidos_service._enviar_factura", new=_async_noop), \
                     patch("app.services.notificaciones.notificar_pago_confirmado_cliente"), \
                     patch("app.services.pedidos_service._alertar_admin_stock_agotado"):
                    return _run(confirmar_pago_pendiente(db, pid, cliente))
            finally:
                db.close()

        n = 2
        barrera = threading.Barrier(n)
        resultados = [None] * n
        hilos = [threading.Thread(target=lambda i=i: resultados.__setitem__(i, confirmar(barrera))) for i in range(n)]
        for h in hilos:
            h.start()
        for h in hilos:
            h.join(timeout=30)

        self.assertTrue(all(r is not None for r in resultados))
        _, _, n_factura = self._leer(pid)
        self.assertEqual(n_factura, 1)
        db = SessionLocal()
        try:
            self.assertEqual(db.query(Producto).filter(Producto.id_producto == p.id_producto).first().stock_producto, 4)
        finally:
            db.close()

    def test_dos_pedidos_ultimas_existencias(self):
        self._tecnico("a")
        p = self._producto("a", 1)  # una sola unidad
        id_cliente = self.cliente.id_cliente
        # Dos pedidos (mismo cliente) compiten por la última unidad.
        pedido1, pago1 = _crear_pedido_pendiente(self.db, self.cliente, [{"producto": p, "cantidad": 1}])
        pedido2, pago2 = _crear_pedido_pendiente(self.db, self.cliente, [{"producto": p, "cantidad": 1}])
        self._ids_pedido.append(pedido1.id_pedido)
        self._ids_pedido.append(pedido2.id_pedido)
        pid1, pid2 = pedido1.id_pedido, pedido2.id_pedido

        def confirmar(pid):
            db = SessionLocal()
            try:
                cliente = db.query(Cliente).filter(Cliente.id_cliente == id_cliente).first()
                with patch("app.services.pedidos_service._enviar_factura", new=_async_noop), \
                     patch("app.services.notificaciones.notificar_pago_confirmado_cliente"), \
                     patch("app.services.pedidos_service._alertar_admin_stock_agotado"):
                    return _run(confirmar_pago_pendiente(db, pid, cliente))
            except HTTPException as e:
                return e
            finally:
                db.close()

        r1 = confirmar(pid1)
        r2 = confirmar(pid2)

        exitos = [r for r in (r1, r2) if not isinstance(r, HTTPException)]
        fallos = [r for r in (r1, r2) if isinstance(r, HTTPException)]
        self.assertEqual(len(exitos), 1)
        self.assertEqual(len(fallos), 1)
        self.assertEqual(fallos[0].status_code, 409)
        db = SessionLocal()
        try:
            prod = db.query(Producto).filter(Producto.id_producto == p.id_producto).first()
            self.assertGreaterEqual(prod.stock_producto, 0)
            self.assertLessEqual(prod.stock_producto, 1)
        finally:
            db.close()


class FalloAntesCommitTestCase(BaseT2):
    def test_fallo_antes_commit_rollback_y_reintento(self):
        self._tecnico("a")
        p = self._producto("a", 5)
        pid, _ = self._pedido([{"producto": p, "cantidad": 1}])

        # Primer intento: se inyecta un fallo tras preparar los cambios (antes
        # del único commit). Debe revertir todo.
        llamadas = {"n": 0}
        real = _crear_factura

        def factura_inestable(db, pedido, pago, commit=True):
            llamadas["n"] += 1
            if llamadas["n"] == 1:
                raise OperationalError("INSERT factura", {}, Exception(1205, "timeout inyectado"))
            return real(db, pedido, pago, commit=commit)

        with patch("app.services.pedidos_service._crear_factura", side_effect=factura_inestable), \
             patch("app.services.pedidos_service._enviar_factura", new=_async_noop), \
             patch("app.services.notificaciones.notificar_pago_confirmado_cliente"), \
             patch("app.services.pedidos_service._alertar_admin_stock_agotado"):
            with self.assertRaises(OperationalError):
                _run(confirmar_pago_pendiente(self.db, pid, self.cliente))

        pedido, pago, n_factura = self._leer(pid)
        self.assertEqual(pedido.estado_pedido, "Pendiente")
        self.assertEqual(pago.estado, "pendiente")
        self.assertEqual(n_factura, 0)
        db = SessionLocal()
        try:
            self.assertEqual(db.query(Producto).filter(Producto.id_producto == p.id_producto).first().stock_producto, 5)
        finally:
            db.close()

        # Segundo intento completa la operación una sola vez.
        with patch("app.services.pedidos_service._enviar_factura", new=_async_noop), \
             patch("app.services.notificaciones.notificar_pago_confirmado_cliente"), \
             patch("app.services.pedidos_service._alertar_admin_stock_agotado"):
            resultado = _run(confirmar_pago_pendiente(self.db, pid, self.cliente))
        self.assertEqual(resultado["pedido"].estado_pedido, "Pagado")
        self.assertEqual(resultado["pago"].estado, "aprobado")
        self.assertEqual(self._leer(pid)[2], 1)


class FalloAvisoTestCase(BaseT2):
    def test_fallo_aviso_post_commit_no_repite(self):
        self._tecnico("a")
        p = self._producto("a", 5)
        pid, _ = self._pedido([{"producto": p, "cantidad": 1}])

        contador_envio = {"n": 0}

        async def enviar_contando(db, factura, pedido, cliente):
            contador_envio["n"] += 1
            raise RuntimeError("fallo de envío de factura")

        with patch("app.services.pedidos_service._enviar_factura", new=enviar_contando), \
             patch("app.services.notificaciones.notificar_pago_confirmado_cliente") as notif_cliente, \
             patch("app.services.pedidos_service._alertar_admin_stock_agotado") as alerta_admin:
            resultado = _run(confirmar_pago_pendiente(self.db, pid, self.cliente))

        self.assertEqual(resultado["pedido"].estado_pedido, "Pagado")
        self.assertEqual(resultado["pago"].estado, "aprobado")
        self.assertEqual(contador_envio["n"], 1)
        self.assertEqual(notif_cliente.call_count, 1)
        self.assertEqual(alerta_admin.call_count, 1)
        # Sin duplicados ni descuentos adicionales.
        self.assertEqual(self._leer(pid)[2], 1)
        db = SessionLocal()
        try:
            self.assertEqual(db.query(Producto).filter(Producto.id_producto == p.id_producto).first().stock_producto, 4)
        finally:
            db.close()


class CantidadesVariantesTestCase(BaseT2):
    def test_metros_exactos_descuentan_fraccion(self):
        # A: stock 5, venta 1.5 m → descuenta exactamente 1.5 y queda 3.5.
        self._tecnico("a")
        p = self._producto("a", 5, venta_por_metros=1)
        pid, _ = self._pedido([{"producto": p, "cantidad": 1, "cantidad_metros": 1.5}])

        with patch("app.services.pedidos_service._enviar_factura", new=_async_noop), \
             patch("app.services.notificaciones.notificar_pago_confirmado_cliente"), \
             patch("app.services.pedidos_service._alertar_admin_stock_agotado"):
            _run(confirmar_pago_pendiente(self.db, pid, self.cliente))

        db = SessionLocal()
        try:
            # Descuenta exactamente 1.5 m: 5 - 1.5 = 3.5.
            self.assertEqual(
                db.query(Producto).filter(Producto.id_producto == p.id_producto).first().stock_producto,
                Decimal("3.50"),
            )
        finally:
            db.close()

    def test_variante_descuenta_stock_propio(self):
        self._tecnico("a")
        p = self._producto("a", 5)
        v = ProductoVariante(id_producto=p.id_producto, nombre="Rojo", stock=3)
        self.db.add(v)
        self.db.commit()
        self.db.refresh(v)
        pid, _ = self._pedido([{
            "producto": p, "cantidad": 2,
            "descripcion": "Prod - Color: Rojo",
        }])

        with patch("app.services.pedidos_service._enviar_factura", new=_async_noop), \
             patch("app.services.notificaciones.notificar_pago_confirmado_cliente"), \
             patch("app.services.pedidos_service._alertar_admin_stock_agotado"):
            _run(confirmar_pago_pendiente(self.db, pid, self.cliente))

        db = SessionLocal()
        try:
            prod = db.query(Producto).filter(Producto.id_producto == p.id_producto).first()
            variante = db.query(ProductoVariante).filter(ProductoVariante.id == v.id).first()
            self.assertEqual(prod.stock_producto, 3)
            self.assertEqual(variante.stock, 1)
        finally:
            db.close()


class EstadoHeredadoTestCase(BaseT2):
    def test_pago_aprobado_sin_factura_devuelve_409(self):
        self._tecnico("a")
        p = self._producto("a", 5)
        pedido, pago = _crear_pedido_pendiente(self.db, self.cliente, [{"producto": p, "cantidad": 1}])
        self._ids_pedido.append(pedido.id_pedido)
        # Simula estado heredado incompleto: pago aprobado, pedido Pagado, sin
        # factura y sin descuento de stock (interrupción del flujo antiguo).
        pedido.estado_pedido = "Pagado"
        pago.estado = "aprobado"
        self.db.commit()

        with patch("app.services.pedidos_service._enviar_factura", new=_async_noop), \
             patch("app.services.notificaciones.notificar_pago_confirmado_cliente"), \
             patch("app.services.pedidos_service._alertar_admin_stock_agotado"):
            with self.assertRaises(HTTPException) as ctx:
                _run(confirmar_pago_pendiente(self.db, pedido.id_pedido, self.cliente))

        self.assertEqual(ctx.exception.status_code, 409)
        # No se descuenta de nuevo ni se crea factura (sin éxito engañoso).
        self.assertEqual(self._leer(pedido.id_pedido)[2], 0)
        db = SessionLocal()
        try:
            self.assertEqual(db.query(Producto).filter(Producto.id_producto == p.id_producto).first().stock_producto, 5)
        finally:
            db.close()

    def test_pago_aprobado_con_factura_sin_marcador_devuelve_409(self):
        self._tecnico("a")
        p = self._producto("a", 5)
        pedido, pago = _crear_pedido_pendiente(self.db, self.cliente, [{"producto": p, "cantidad": 1}])
        self._ids_pedido.append(pedido.id_pedido)
        # Simula el estado heredado ambiguo: pago aprobado + factura, pero SIN el
        # marcador de confirmación completa (la entrega/órdenes pudo no hacerse).
        pedido.estado_pedido = "Pagado"
        pago.estado = "aprobado"
        self.db.add(Factura(id_pedido=pedido.id_pedido, numero_factura=f"FAC-LEGACY-{pedido.id_pedido}",
                            fecha_factura=date.today(), monto_total=pedido.total_pedido or 0,
                            metodo_pago=pago.metodo_pago, estado_pago="aprobado"))
        self.db.commit()

        with patch("app.services.pedidos_service._enviar_factura", new=_async_noop), \
             patch("app.services.notificaciones.notificar_pago_confirmado_cliente"), \
             patch("app.services.pedidos_service._alertar_admin_stock_agotado"):
            with self.assertRaises(HTTPException) as ctx:
                _run(confirmar_pago_pendiente(self.db, pedido.id_pedido, self.cliente))

        self.assertEqual(ctx.exception.status_code, 409)
        # No se re-descuenta ni se genera otra factura.
        self.assertEqual(self._leer(pedido.id_pedido)[2], 1)
        db = SessionLocal()
        try:
            self.assertEqual(db.query(Producto).filter(Producto.id_producto == p.id_producto).first().stock_producto, 5)
        finally:
            db.close()

    def test_repeticion_despues_de_avance_de_estado(self):
        self._tecnico("a")
        p = self._producto("a", 5)
        pid, _ = self._pedido([{"producto": p, "cantidad": 1}])

        with patch("app.services.pedidos_service._enviar_factura", new=_async_noop), \
             patch("app.services.notificaciones.notificar_pago_confirmado_cliente"), \
             patch("app.services.pedidos_service._alertar_admin_stock_agotado"):
            _run(confirmar_pago_pendiente(self.db, pid, self.cliente))

        # La entrega avanza de estado; eso no convierte la confirmación en incompleta.
        pedido = self.db.query(Pedido).filter(Pedido.id_pedido == pid).first()
        pedido.estado_entrega = "Entregado"
        self.db.commit()

        with patch("app.services.pedidos_service._enviar_factura", new=_async_noop), \
             patch("app.services.notificaciones.notificar_pago_confirmado_cliente"), \
             patch("app.services.pedidos_service._alertar_admin_stock_agotado"):
            r2 = _run(confirmar_pago_pendiente(self.db, pid, self.cliente))

        self.assertTrue(r2.get("completado"))
        self.assertEqual(self._leer(pid)[2], 1)
        db = SessionLocal()
        try:
            self.assertEqual(db.query(Producto).filter(Producto.id_producto == p.id_producto).first().stock_producto, 4)
        finally:
            db.close()


class OrdenBloqueoConcurrenteTestCase(BaseT2):
    def test_dos_pedidos_orden_inverso_mismos_productos(self):
        self._tecnico("a")
        pa = self._producto("a", 10)
        pb = self._producto("b", 10)
        id_cliente = self.cliente.id_cliente

        pedido1, _ = _crear_pedido_pendiente(self.db, self.cliente, [
            {"producto": pa, "cantidad": 1}, {"producto": pb, "cantidad": 1}])
        pedido2, _ = _crear_pedido_pendiente(self.db, self.cliente, [
            {"producto": pb, "cantidad": 1}, {"producto": pa, "cantidad": 1}])
        self._ids_pedido.append(pedido1.id_pedido)
        self._ids_pedido.append(pedido2.id_pedido)
        pid1, pid2 = pedido1.id_pedido, pedido2.id_pedido

        def confirmar(pid):
            db = SessionLocal()
            try:
                cliente = db.query(Cliente).filter(Cliente.id_cliente == id_cliente).first()
                with patch("app.services.pedidos_service._enviar_factura", new=_async_noop), \
                     patch("app.services.notificaciones.notificar_pago_confirmado_cliente"), \
                     patch("app.services.pedidos_service._alertar_admin_stock_agotado"):
                    return _run(confirmar_pago_pendiente(db, pid, cliente))
            finally:
                db.close()

        n = 2
        barrera = threading.Barrier(n)
        resultados = [None] * n
        errores = [None] * n

        def _run_thread(i, pid):
            try:
                barrera.wait(timeout=10)
                resultados[i] = confirmar(pid)
            except Exception as e:  # noqa: BLE001
                errores[i] = e

        hilos = [
            threading.Thread(target=_run_thread, args=(0, pid1)),
            threading.Thread(target=_run_thread, args=(1, pid2)),
        ]
        for h in hilos:
            h.start()
        for h in hilos:
            h.join(timeout=30)

        self.assertEqual(errores, [None, None])
        self.assertTrue(all(r is not None for r in resultados))
        db = SessionLocal()
        try:
            self.assertEqual(db.query(Producto).filter(Producto.id_producto == pa.id_producto).first().stock_producto, 8)
            self.assertEqual(db.query(Producto).filter(Producto.id_producto == pb.id_producto).first().stock_producto, 8)
        finally:
            db.close()

    def test_articulos_repetidos_agrupan_misma_existencia(self):
        self._tecnico("a")
        p = self._producto("a", 5)
        # Dos líneas del mismo producto se agrupan y descuentan una sola vez la suma.
        pid, _ = self._pedido([
            {"producto": p, "cantidad": 2},
            {"producto": p, "cantidad": 1},
        ])

        with patch("app.services.pedidos_service._enviar_factura", new=_async_noop), \
             patch("app.services.notificaciones.notificar_pago_confirmado_cliente"), \
             patch("app.services.pedidos_service._alertar_admin_stock_agotado"):
            _run(confirmar_pago_pendiente(self.db, pid, self.cliente))

        db = SessionLocal()
        try:
            self.assertEqual(db.query(Producto).filter(Producto.id_producto == p.id_producto).first().stock_producto, 2)
        finally:
            db.close()


class MetrosFraccionariosTestCase(BaseT2):
    def _confirmar(self, pid):
        with patch("app.services.pedidos_service._enviar_factura", new=_async_noop), \
             patch("app.services.notificaciones.notificar_pago_confirmado_cliente"), \
             patch("app.services.pedidos_service._alertar_admin_stock_agotado"):
            return _run(confirmar_pago_pendiente(self.db, pid, self.cliente))

    def _stock(self, pid_producto):
        db = SessionLocal()
        try:
            return db.query(Producto).filter(Producto.id_producto == pid_producto).first().stock_producto
        finally:
            db.close()

    def test_venta_cero_cinco_metros_exacta(self):
        # B: 0.5 m descuenta exactamente 0.5, sin mínimo artificial de 1.
        self._tecnico("a")
        p = self._producto("a", 5, venta_por_metros=1)
        pid, _ = self._pedido([{"producto": p, "cantidad": 1, "cantidad_metros": 0.5}])
        self._confirmar(pid)
        self.assertEqual(self._stock(p.id_producto), Decimal("4.50"))

    def test_dos_lineas_medio_metro_suman_un_metro(self):
        # C: dos líneas de 0.5 m del mismo recurso consumen 1 m total.
        self._tecnico("a")
        p = self._producto("a", 3, venta_por_metros=1)
        pid, _ = self._pedido([
            {"producto": p, "cantidad": 1, "cantidad_metros": 0.5},
            {"producto": p, "cantidad": 1, "cantidad_metros": 0.5},
        ])
        self._confirmar(pid)
        self.assertEqual(self._stock(p.id_producto), Decimal("2.00"))
        # Las líneas originales se conservan.
        db = SessionLocal()
        try:
            dets = db.query(DetallePedido).filter(DetallePedido.id_pedido_d == pid).all()
            self.assertEqual(len(dets), 2)
        finally:
            db.close()

    def test_dos_lineas_fracciones_diferentes_suma_exacta(self):
        # D: 0.5 + 1.5 = 2.0 m exactos.
        self._tecnico("a")
        p = self._producto("a", 3, venta_por_metros=1)
        pid, _ = self._pedido([
            {"producto": p, "cantidad": 1, "cantidad_metros": 0.5},
            {"producto": p, "cantidad": 1, "cantidad_metros": 1.5},
        ])
        self._confirmar(pid)
        self.assertEqual(self._stock(p.id_producto), Decimal("1.00"))

    def test_variantes_distintas_cada_una_su_existencia(self):
        # E: variantes distintas afectan únicamente a su propia existencia.
        self._tecnico("a")
        p = self._producto("a", 10, venta_por_metros=1)
        v1 = ProductoVariante(id_producto=p.id_producto, nombre="Rojo", stock=Decimal("5.00"))
        v2 = ProductoVariante(id_producto=p.id_producto, nombre="Azul", stock=Decimal("5.00"))
        self.db.add(v1)
        self.db.add(v2)
        self.db.commit()
        self.db.refresh(v1)
        self.db.refresh(v2)
        pid, _ = self._pedido([
            {"producto": p, "cantidad": 1, "cantidad_metros": 1.5, "descripcion": "Prod - Color: Rojo"},
            {"producto": p, "cantidad": 1, "cantidad_metros": 1.0, "descripcion": "Prod - Color: Azul"},
        ])
        self._confirmar(pid)
        db = SessionLocal()
        try:
            self.assertEqual(db.query(ProductoVariante).filter(ProductoVariante.id == v1.id).first().stock, Decimal("3.50"))
            self.assertEqual(db.query(ProductoVariante).filter(ProductoVariante.id == v2.id).first().stock, Decimal("4.00"))
        finally:
            db.close()

    def test_disponibilidad_exacta_deja_cero(self):
        # F: stock 1.5 y venta 1.5 → 0.
        self._tecnico("a")
        p = self._producto("a", Decimal("1.50"), venta_por_metros=1)
        pid, _ = self._pedido([{"producto": p, "cantidad": 1, "cantidad_metros": 1.5}])
        self._confirmar(pid)
        self.assertEqual(self._stock(p.id_producto), Decimal("0.00"))

    def test_disponibilidad_insuficiente_rechaza_sin_parciales(self):
        # G: stock 1 y solicitud 1.5 → 409, sin aprobación/factura/descuento.
        self._tecnico("a")
        p = self._producto("a", Decimal("1.00"), venta_por_metros=1)
        pid, _ = self._pedido([{"producto": p, "cantidad": 1, "cantidad_metros": 1.5}])
        with self.assertRaises(HTTPException) as ctx:
            self._confirmar(pid)
        self.assertEqual(ctx.exception.status_code, 409)
        pedido, pago, n_factura = self._leer(pid)
        self.assertEqual(pedido.estado_pedido, "Pendiente")
        self.assertEqual(pago.estado, "pendiente")
        self.assertEqual(n_factura, 0)
        self.assertEqual(self._stock(p.id_producto), Decimal("1.00"))

    def test_precision_no_admitida_rechazada(self):
        # H: la longitud con más de 2 decimales se rechaza (sin redondeo
        # silencioso); los valores no numéricos/no finitos también.
        from app.services.pedidos_service import _decimal_metros

        self.assertEqual(_decimal_metros("1.55"), Decimal("1.55"))
        self.assertEqual(_decimal_metros("0.5"), Decimal("0.5"))
        for invalido in ("1.555", "abc", "inf", "nan"):
            with self.assertRaises(HTTPException) as ctx:
                _decimal_metros(invalido)
            self.assertEqual(ctx.exception.status_code, 400)

    def test_confirmacion_repetida_no_duplica(self):
        # J: repetir no vuelve a descontar ni duplica.
        self._tecnico("a")
        p = self._producto("a", 5, venta_por_metros=1)
        pid, _ = self._pedido([{"producto": p, "cantidad": 1, "cantidad_metros": 1.5}])
        self._confirmar(pid)
        self._confirmar(pid)
        self.assertEqual(self._stock(p.id_producto), Decimal("3.50"))
        self.assertEqual(self._leer(pid)[2], 1)


class CheckoutMetrosTestCase(BaseT2):
    """Recorrido integrado de checkout inmediato con metros fraccionarios
    (escenario M): el payload que envía la web (items con ``metros``) llega a la
    API y persiste la fracción exacta, el importe y el descuento."""

    def test_checkout_metros_fraccionarios_persistidos(self):
        self._tecnico("a")
        p = self._producto("a", Decimal("5.00"), venta_por_metros=1)
        p.precio_venta_producto = 1000.0
        self.db.commit()

        with patch("app.services.pagos_service.procesar_pago", return_value={
                "estado": "aprobado", "numero_transaccion": "TXN-123"}), \
             patch("app.services.pedidos_service._crear_factura_y_enviar", new=_async_noop), \
             patch("app.services.pedidos_service._asignar_entrega", return_value=None), \
             patch("app.services.notificaciones.notificar_pedido_creado_cliente"), \
             patch("app.services.pedidos_service._alertar_admin_stock_agotado"):
            resultado = _run(crear_pedido(
                self.db,
                self.cliente,
                [{"id_producto": p.id_producto, "cantidad": 1, "metros": 1.5}],
                [],
                "tarjeta",
                {},
            ))

        pedido = resultado["pedido"]
        self._ids_pedido.append(pedido.id_pedido)
        db = SessionLocal()
        try:
            det = db.query(DetallePedido).filter(DetallePedido.id_pedido_d == pedido.id_pedido).first()
            self.assertEqual(det.cantidad_metros, Decimal("1.50"))
            self.assertEqual(Decimal(str(det.subtotal_detalle)), Decimal("1500.00"))
            self.assertEqual(
                db.query(Producto).filter(Producto.id_producto == p.id_producto).first().stock_producto,
                Decimal("3.50"),
            )
        finally:
            db.close()


class DevolucionMetrosTestCase(BaseT2):
    """Evidencia de alcance: un detalle por metros SÍ entra al flujo de devolución,
    pero se interpreta como unidad entera (``cantidad_detalle``), perdiendo la
    fracción. Pendiente de decisión comercial (resultado C); no se corrige con una
    conversión entera ni se marca como no aplicable."""

    def test_metros_entran_en_devolucion_como_entero(self):
        from app.services import devoluciones_service

        p = self._producto("a", Decimal("5.00"), venta_por_metros=1)
        pedido, _ = _crear_pedido_pendiente(
            self.db, self.cliente, [{"producto": p, "cantidad": 1, "cantidad_metros": 1.5}]
        )
        self._ids_pedido.append(pedido.id_pedido)
        pedido.estado_entrega = "Entregado"
        self.db.commit()

        info = devoluciones_service.elegibilidad_pedido(self.db, self.cliente, pedido.id_pedido)
        self.assertTrue(info["elegible"])
        linea = info["productos"][0]
        # El flujo usa cantidad_detalle (entero) y pierde los metros.
        self.assertEqual(linea["cantidad_comprada"], 1)
        self.assertEqual(linea["cantidad_disponible"], 1)


async def _async_noop(*_a, **_k):
    return None


if __name__ == "__main__":
    unittest.main(verbosity=2)
