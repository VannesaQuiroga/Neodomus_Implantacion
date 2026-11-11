"""PEN-09 / PEN-10: devolución del corte completo por metros, reposición y
reembolso con idempotencia.

Cubre la matriz funcional del ticket:

PEN-09
  - La solicitud por metros corresponde al corte completo (2,5 m → 2,5 m).
  - Las devoluciones parciales no autorizadas se rechazan en backend.
  - Las cantidades decimales se conservan (DECIMAL(10,2)).
  - Revisión administrativa: aprobar/rechazar queda registrado con decisión,
    motivo y autor; el cliente NO puede decidir su propia devolución.

PEN-10
  - La reposición solo ocurre tras la aprobación y la recogida física con
    evidencia; registra la cantidad EXACTA (metros) en el inventario.
  - El reembolso usa los valores HISTÓRICOS del pedido (precio congelado),
    no el precio actual del catálogo.
  - No hay reembolsos ni reposiciones duplicados (reintentos, doble clic y
    dos administradores concurrentes); decisión única entre Reembolso/Cambio.

Requiere TEST_DATABASE_URL (base de pruebas ``neodomus_test``).
"""
import asyncio
import io
import threading
import time
import unittest
from decimal import Decimal
from unittest.mock import patch

import app.tests.testdb  # noqa: F401  (exige TEST_DATABASE_URL y aísla MinIO)

from app.database import SessionLocal
from app.models.cliente import Cliente
from app.models.devolucion import Devolucion
from app.models.especializacion import Reembolso
from app.models.pago import Pago
from app.models.pedido import DetallePedido, Pedido
from app.models.producto import Producto
from app.models.producto_variante import ProductoVariante
from app.models.solicitud_devolucion import SolicitudDevolucion
from app.models.tecnico import Tecnico
from app.models.user import User
from app.services import devoluciones_service as dv_service
from app.tests.test_t1_identidad import BaseT1TestCase, PASSWORD

# PNG válido generado con PIL (la validación del endpoint verifica la imagen).
def _png_valido() -> bytes:
    import io as _io

    from PIL import Image

    buffer = _io.BytesIO()
    Image.new("RGB", (2, 2), (200, 30, 30)).save(buffer, format="PNG")
    return buffer.getvalue()


def _run(coro):
    return asyncio.run(coro)


class _ArchivoFalso:
    """Sustituto de ``UploadFile`` para invocar el endpoint directamente."""

    def __init__(self, nombre: str, contenido: bytes):
        self.filename = nombre
        self._contenido = contenido

    async def read(self) -> bytes:
        return self._contenido


class BasePen0910(BaseT1TestCase):
    """Fixture común: productos por metros, pedidos entregados y limpieza."""

    def setUp(self):
        super().setUp()
        self._ids_solicitud = []
        self._ids_producto = []
        self._ids_reembolso = []
        # Los avisos de inventario / entrega crean notificaciones ajenas.
        for target in (
            "app.services.notificaciones.notificar_admin_stock_bajo",
            "app.services.notificaciones.notificar_entrega_asignada_tecnico",
        ):
            self.enterContext(patch(target))

    def tearDown(self):
        # Limpia cualquier transacción fallida del test antes de borrar.
        self.db.rollback()
        db = self.db
        # Orden dependiente de FKs: reembolsos → detalles/pagos →
        # devoluciones → solicitudes → variantes/productos.
        for pid in self._ids_pedido:
            db.query(Reembolso).filter(Reembolso.id_pedido == pid).delete(
                synchronize_session=False
            )
            db.query(DetallePedido).filter(DetallePedido.id_pedido_d == pid).delete(
                synchronize_session=False
            )
            db.query(Pago).filter(Pago.id_pedido == pid).delete(
                synchronize_session=False
            )
        for sid in self._ids_solicitud:
            db.query(Devolucion).filter(Devolucion.id_solicitud_dv == sid).delete(
                synchronize_session=False
            )
            db.query(SolicitudDevolucion).filter(
                SolicitudDevolucion.id_solicitud == sid
            ).delete(synchronize_session=False)
        for prid in self._ids_producto:
            db.query(ProductoVariante).filter(
                ProductoVariante.id_producto == prid
            ).delete(synchronize_session=False)
            db.query(Producto).filter(Producto.id_producto == prid).delete(
                synchronize_session=False
            )
        db.commit()
        super().tearDown()

    # ── Fixtures ──────────────────────────────────────────────────────────
    def _crear_producto(
        self,
        sufijo,
        stock=Decimal("10.00"),
        venta_por_metros=1,
        precio=20000.0,
        con_variante=False,
    ):
        p = Producto(
            nombre_producto=f"Cable {sufijo}",
            referencia_producto=f"REF-PEN-{sufijo}-{int(time.time() * 1_000_000)}",
            precio_venta_producto=precio,
            stock_producto=stock,
            venta_por_metros=venta_por_metros,
            visible_cliente=True,
        )
        db = self.db
        db.add(p)
        db.flush()
        self._ids_producto.append(p.id_producto)
        variante = None
        if con_variante:
            variante = ProductoVariante(
                id_producto=p.id_producto,
                nombre="Rojo",
                hex="#ff0000",
                stock=Decimal("10.00"),
            )
            db.add(variante)
        db.commit()
        db.refresh(p)
        if variante is not None:
            db.refresh(variante)
        return p, variante

    def _crear_pedido_entregado(self, cliente, producto, *, metros="2.50", precio=20000.0):
        """Pedido entregado y pagado con un corte de metros (valores históricos)."""
        metros_dec = Decimal(metros)
        subtotal = float(Decimal(str(precio)) * metros_dec)
        pedido = Pedido(
            id_cliente_pe=cliente.id_cliente,
            estado_pedido="Pagado",
            estado_entrega="Entregado",
            total_pedido=subtotal,
        )
        db = self.db
        db.add(pedido)
        db.flush()
        db.add(
            DetallePedido(
                id_pedido_d=pedido.id_pedido,
                id_producto_d=producto.id_producto,
                cantidad_detalle=1,
                cantidad_metros=metros_dec,
                precio_unitario_detalle=precio,
                subtotal_detalle=subtotal,
                descripcion_detalle=(
                    f"Cable thhn - {metros_dec:g} metros - Color: Rojo"
                    if producto.venta_por_metros
                    else "Cable thhn"
                ),
            )
        )
        pago = Pago(
            id_pedido=pedido.id_pedido,
            metodo_pago="tarjeta_debito",
            estado="aprobado",
            monto=subtotal,
            numero_transaccion=f"TX-PEN-{pedido.id_pedido}",
        )
        db.add(pago)
        db.commit()
        db.refresh(pedido)
        db.refresh(pago)
        self._ids_pedido.append(pedido.id_pedido)
        self._resincronizar()
        return pedido, pago

    def _crear_solicitud(self, cliente, pedido, producto, metros="2.50"):
        """Solicitud de devolución del corte completo vía servicio."""
        return dv_service.crear_solicitud(
            self.db,
            cliente,
            id_pedido=pedido.id_pedido,
            items=[{"id_producto": producto.id_producto, "cantidad": 1, "metros": metros}],
            motivo_tipo="defectuoso",
            motivo_otro=None,
            comentario=None,
        )

    def _aprobar(self, solicitud, resolucion="Reembolso", admin_id=1):
        return dv_service.cambiar_estado(
            self.db,
            solicitud,
            dv_service.EST_APROBADA,
            resolucion=resolucion,
            admin_id=admin_id,
        )

    def _stock(self, producto_id):
        self._resincronizar()
        p = self.db.query(Producto).filter(Producto.id_producto == producto_id).first()
        self.db.refresh(p)
        return Decimal(str(p.stock_producto))


# ────────────────────────────────────────────────────────────────────────
# PEN-09: solicitud del corte completo
# ────────────────────────────────────────────────────────────────────────
class ElegibilidadMetrosTestCase(BasePen0910):
    def test_elegibilidad_muestra_metros_del_corte(self):
        """La elegibilidad reporta la longitud comprada, no unidades enteras."""
        p, _ = self._crear_producto("elig")
        cliente = self._crear_cliente("elig")
        pedido, _ = self._crear_pedido_entregado(cliente, p, metros="2.50", precio=20000.0)

        info = dv_service.elegibilidad_pedido(self.db, cliente, pedido.id_pedido)
        self.assertTrue(info["elegible"])
        linea = info["productos"][0]
        self.assertTrue(linea["venta_por_metros"])
        self.assertEqual(Decimal(str(linea["metros_comprados"])), Decimal("2.50"))
        self.assertEqual(Decimal(str(linea["metros_disponibles"])), Decimal("2.50"))
        # El importe máximo usa el valor histórico: 2,5 m × $20.000 = $50.000
        self.assertEqual(Decimal(str(linea["monto_maximo"])), Decimal("50000.00"))

    def test_elegibilidad_no_revela_pedidos_ajenos(self):
        p, _ = self._crear_producto("ajeno")
        dueño = self._crear_cliente("dueno")
        otro = self._crear_cliente("otro")
        pedido, _ = self._crear_pedido_entregado(dueño, p)
        with self.assertRaises(PermissionError):
            dv_service.elegibilidad_pedido(self.db, otro, pedido.id_pedido)

    def test_elegibilidad_pedido_inexistente(self):
        cliente = self._crear_cliente("fantasma")
        with self.assertRaises(PermissionError):
            dv_service.elegibilidad_pedido(self.db, cliente, 99999999)


class SolicitudCorteCompletoTestCase(BasePen0910):
    def _preparar(self, metros="2.50", precio=20000.0):
        p, _ = self._crear_producto("sol")
        cliente = self._crear_cliente("sol")
        pedido, pago = self._crear_pedido_entregado(
            cliente, p, metros=metros, precio=precio
        )
        return p, cliente, pedido, pago

    def test_solicitud_corte_completo_registra_metros_exactos(self):
        """Devolución de un corte de 2,5 m → se registra por 2,5 m (no 2 ni 3)."""
        p, cliente, pedido, _ = self._preparar(metros="2.50", precio=20000.0)
        solicitud = self._crear_solicitud(cliente, pedido, p, metros="2.50")
        self._ids_solicitud.append(solicitud.id_solicitud)

        self.assertEqual(solicitud.estado, dv_service.EST_SOLICITADA)
        self.assertEqual(solicitud.tipo_devolucion, "total")
        # El monto usa el valor histórico del pedido: 2,5 × 20.000 = 50.000.
        self.assertEqual(Decimal(str(solicitud.monto_total)), Decimal("50000.00"))

        linea = (
            self.db.query(Devolucion)
            .filter(Devolucion.id_solicitud_dv == solicitud.id_solicitud)
            .first()
        )
        self.assertIsNotNone(linea)
        self._ids_devolucion.append(linea.id_devolucion)
        self.assertEqual(int(linea.cantidad), 1)
        self.assertEqual(Decimal(str(linea.cantidad_metros)), Decimal("2.50"))

    def test_rechaza_devolucion_parcial_no_autorizada(self):
        """1,5 m cuando se compraron 2,5 m → rechazada (sin excepciones)."""
        p, cliente, pedido, _ = self._preparar(metros="2.50")
        with self.assertRaises(dv_service.ItemInvalido) as ctx:
            self._crear_solicitud(cliente, pedido, p, metros="1.50")
        self.assertIn("corte completo", str(ctx.exception.mensaje))
        self.assertEqual(
            self.db.query(SolicitudDevolucion)
            .filter(SolicitudDevolucion.id_pedido_s == pedido.id_pedido)
            .count(),
            0,
        )

    def test_rechaza_metros_con_mas_decimales(self):
        p, cliente, pedido, _ = self._preparar(metros="2.50")
        with self.assertRaises(dv_service.ItemInvalido):
            self._crear_solicitud(cliente, pedido, p, metros="2.505")

    def test_rechaza_metros_superiores_a_la_compra(self):
        p, cliente, pedido, _ = self._preparar(metros="2.50")
        with self.assertRaises(dv_service.ItemInvalido):
            self._crear_solicitud(cliente, pedido, p, metros="3.00")

    def test_rechaza_metros_en_producto_de_unidades(self):
        producto, _ = self._crear_producto("unid", venta_por_metros=0)
        cliente = self._crear_cliente("unid")
        # Pedido NORMAL por unidades (sin metros en el detalle).
        pedido = Pedido(
            id_cliente_pe=cliente.id_cliente,
            estado_pedido="Pagado",
            estado_entrega="Entregado",
            total_pedido=15000.0,
        )
        self.db.add(pedido)
        self.db.flush()
        self.db.add(
            DetallePedido(
                id_pedido_d=pedido.id_pedido,
                id_producto_d=producto.id_producto,
                cantidad_detalle=3,
                precio_unitario_detalle=5000.0,
                subtotal_detalle=15000.0,
                descripcion_detalle="Cable thhn",
            )
        )
        self.db.add(
            Pago(
                id_pedido=pedido.id_pedido,
                metodo_pago="tarjeta_debito",
                estado="aprobado",
                monto=15000.0,
            )
        )
        self.db.commit()
        self._ids_pedido.append(pedido.id_pedido)
        self._resincronizar()

        with self.assertRaises(dv_service.ItemInvalido) as ctx:
            self._crear_solicitud(cliente, pedido, producto, metros="3")
        self.assertIn("no se vendió por metros", str(ctx.exception.mensaje))

    def test_forma_legada_cantidad_1_significa_corte_completo(self):
        """El endpoint legado (cantidad=1 sin metros) devuelve el corte entero."""
        p, cliente, pedido, _ = self._preparar(metros="2.50")
        solicitud = dv_service.crear_solicitud(
            self.db,
            cliente,
            id_pedido=pedido.id_pedido,
            items=[{"id_producto": p.id_producto, "cantidad": 1}],
            motivo_tipo="danado",
            motivo_otro=None,
            comentario=None,
        )
        self._ids_solicitud.append(solicitud.id_solicitud)
        linea = (
            self.db.query(Devolucion)
            .filter(Devolucion.id_solicitud_dv == solicitud.id_solicitud)
            .first()
        )
        self._ids_devolucion.append(linea.id_devolucion)
        self.assertEqual(Decimal(str(linea.cantidad_metros)), Decimal("2.50"))
        self.assertEqual(Decimal(str(solicitud.monto_total)), Decimal("50000.00"))

    def test_segunda_solicitud_del_mismo_corte_rechazada(self):
        """No pueden coexistir dos devoluciones del mismo corte."""
        p, cliente, pedido, _ = self._preparar(metros="2.50")
        primera = self._crear_solicitud(cliente, pedido, p, metros="2.50")
        self._ids_solicitud.append(primera.id_solicitud)
        for l in (
            self.db.query(Devolucion)
            .filter(Devolucion.id_solicitud_dv == primera.id_solicitud)
            .all()
        ):
            self._ids_devolucion.append(l.id_devolucion)

        info = dv_service.elegibilidad_pedido(self.db, cliente, pedido.id_pedido)
        linea = info["productos"][0]
        self.assertEqual(Decimal(str(linea["metros_disponibles"])), Decimal("0"))
        self.assertFalse(info["elegible"])

        with self.assertRaises(dv_service.ItemInvalido):
            self._crear_solicitud(cliente, pedido, p, metros="2.50")

    def test_rechazo_administrativo_libera_el_corte(self):
        p, cliente, pedido, _ = self._preparar(metros="2.50")
        solicitud = self._crear_solicitud(cliente, pedido, p, metros="2.50")
        self._ids_solicitud.append(solicitud.id_solicitud)
        for l in (
            self.db.query(Devolucion)
            .filter(Devolucion.id_solicitud_dv == solicitud.id_solicitud)
            .all()
        ):
            self._ids_devolucion.append(l.id_devolucion)

        dv_service.cambiar_estado(
            self.db,
            solicitud,
            dv_service.EST_RECHAZADA,
            motivo_rechazo="El producto no presenta defectos",
            admin_id=1,
        )
        self.assertEqual(solicitud.estado, dv_service.EST_RECHAZADA)
        self.assertEqual(
            solicitud.motivo_rechazo, "El producto no presenta defectos"
        )
        self.assertIsNotNone(solicitud.resuelta_at)

        info = dv_service.elegibilidad_pedido(self.db, cliente, pedido.id_pedido)
        self.assertTrue(info["elegible"])
        self.assertEqual(
            Decimal(str(info["productos"][0]["metros_disponibles"])), Decimal("2.50")
        )


# ────────────────────────────────────────────────────────────────────────
# PEN-10: reembolso con valores históricos e idempotencia
# ────────────────────────────────────────────────────────────────────────
class ReembolsoHistoricoTestCase(BasePen0910):
    def _preparar(self, metros="2.50", precio=20000.0):
        p, _ = self._crear_producto("reem")
        cliente = self._crear_cliente("reem")
        pedido, pago = self._crear_pedido_entregado(
            cliente, p, metros=metros, precio=precio
        )
        solicitud = self._crear_solicitud(cliente, pedido, p, metros=metros)
        self._ids_solicitud.append(solicitud.id_solicitud)
        for l in (
            self.db.query(Devolucion)
            .filter(Devolucion.id_solicitud_dv == solicitud.id_solicitud)
            .all()
        ):
            self._ids_devolucion.append(l.id_devolucion)
        return p, cliente, pedido, pago, solicitud

    def test_reembolso_usa_importe_historico_del_corte(self):
        p, cliente, pedido, pago, solicitud = self._preparar(metros="2.50", precio=20000.0)
        # El catálogo cambia de precio DESPUÉS de la compra: no debe afectar.
        p.precio_venta_producto = 99000.0
        self.db.commit()

        _, reembolso = self._aprobar(solicitud, resolucion="Reembolso", admin_id=1)
        self.assertIsNotNone(reembolso)
        self._ids_reembolso.append(reembolso.id_reembolso)
        self.assertEqual(reembolso.estado, "Reembolsado")
        # 2,5 m × $20.000 (precio histórico) = $50.000 — no el precio actual.
        self.assertEqual(Decimal(str(reembolso.monto)), Decimal("50000.00"))
        self.assertEqual(reembolso.id_solicitud_origen, solicitud.id_solicitud)
        self.assertEqual(reembolso.id_pedido, pedido.id_pedido)
        self.assertEqual(
            reembolso.numero_transaccion_original, pago.numero_transaccion
        )
        # La decisión queda registrada.
        self.assertEqual(solicitud.resolucion, "Reembolso")
        self.assertEqual(solicitud.estado, dv_service.EST_APROBADA)
        self.assertIsNotNone(solicitud.resuelta_at)

        # El pedido y sus valores históricos NO cambian.
        self._resincronizar()
        detalle = (
            self.db.query(DetallePedido)
            .filter(DetallePedido.id_pedido_d == pedido.id_pedido)
            .first()
        )
        self.assertEqual(float(detalle.precio_unitario_detalle), 20000.0)
        self.assertEqual(Decimal(str(detalle.cantidad_metros)), Decimal("2.50"))
        pedido_db = (
            self.db.query(Pedido).filter(Pedido.id_pedido == pedido.id_pedido).first()
        )
        self.db.refresh(pedido_db)
        self.assertEqual(float(pedido_db.total_pedido), 50000.0)

    def test_reintentar_aprobacion_no_duplica_reembolso(self):
        p, cliente, pedido, _, solicitud = self._preparar(metros="2.50")
        _, reembolso = self._aprobar(solicitud)
        self._ids_reembolso.append(reembolso.id_reembolso)

        with self.assertRaises(ValueError):
            self._aprobar(solicitud)  # transición inválida: ya está Aprobada

        total = (
            self.db.query(Reembolso)
            .filter(Reembolso.id_solicitud_origen == solicitud.id_solicitud)
            .count()
        )
        self.assertEqual(total, 1)

    def test_resolucion_cambio_no_genera_reembolso(self):
        """Una sola operación por devolución: Cambio ⇒ sin reembolso."""
        p, cliente, pedido, _, solicitud = self._preparar(metros="2.50")
        _, reembolso = self._aprobar(solicitud, resolucion="Cambio", admin_id=1)
        self.assertIsNone(reembolso)
        self.assertEqual(
            self.db.query(Reembolso)
            .filter(Reembolso.id_solicitud_origen == solicitud.id_solicitud)
            .count(),
            0,
        )
        self.assertEqual(solicitud.resolucion, "Cambio")

    def test_aprobacion_concurrente_genera_un_solo_reembolso(self):
        """Dos administradores simultáneos → una sola decisión y un reembolso."""
        p, cliente, pedido, _, solicitud = self._preparar(metros="2.50")
        id_solicitud = solicitud.id_solicitud
        errores: list[str] = []
        exitos: list[int] = []

        def intentar():
            db = SessionLocal()
            try:
                s = (
                    db.query(SolicitudDevolucion)
                    .filter(SolicitudDevolucion.id_solicitud == id_solicitud)
                    .first()
                )
                _, reembolso = dv_service.cambiar_estado(
                    db,
                    s,
                    dv_service.EST_APROBADA,
                    resolucion="Reembolso",
                    admin_id=1,
                )
                exitos.append(reembolso.id_reembolso if reembolso else 0)
            except ValueError as e:
                errores.append(str(e))
            finally:
                db.close()

        hilos = [threading.Thread(target=intentar) for _ in range(2)]
        for h in hilos:
            h.start()
        for h in hilos:
            h.join()

        self.assertEqual(len(exitos), 1, f"exitos={exitos} errores={errores}")
        self.assertEqual(len(errores), 1, f"exitos={exitos} errores={errores}")
        self._resincronizar()
        total = (
            self.db.query(Reembolso)
            .filter(Reembolso.id_solicitud_origen == id_solicitud)
            .count()
        )
        self.assertEqual(total, 1)


# ────────────────────────────────────────────────────────────────────────
# PEN-10: reposición exacta en inventario (tras aprobación y recogida)
# ────────────────────────────────────────────────────────────────────────
class ReposicionInventarioTestCase(BasePen0910):
    def _preparar(self, stock=Decimal("10.00"), metros="2.50", con_variante=False):
        p, variante = self._crear_producto(
            "repos", stock=stock, con_variante=con_variante
        )
        cliente = self._crear_cliente("repos")
        pedido, _ = self._crear_pedido_entregado(cliente, p, metros=metros)
        solicitud = self._crear_solicitud(cliente, pedido, p, metros=metros)
        self._ids_solicitud.append(solicitud.id_solicitud)
        linea = (
            self.db.query(Devolucion)
            .filter(Devolucion.id_solicitud_dv == solicitud.id_solicitud)
            .first()
        )
        self._ids_devolucion.append(linea.id_devolucion)
        self._aprobar(solicitud, resolucion="Reembolso", admin_id=1)
        # La recogida la hace un técnico real (usuario + ficha).
        u, t = self._crear_tecnico("repos")
        linea.id_tecnico_recogida = t.id_tecnico
        linea.recogida_estado = "Asignada"
        self.db.commit()
        self._resincronizar()
        return p, variante, cliente, pedido, solicitud, linea, u

    def _subir_evidencia(self, id_devolucion, usuario, db=None):
        from app.routers.devoluciones import subir_evidencia_recogida

        with patch(
            "app.services.minio_service.subir_imagen_privada",
            return_value="recogidas/test.jpg",
        ):
            return _run(
                subir_evidencia_recogida(
                    id_devolucion,
                    file=_ArchivoFalso("recogida.png", _png_valido()),
                    current_user=usuario,
                    db=db or self.db,
                )
            )

    def test_reposicion_registra_metros_exactos(self):
        """Corte de 2,5 m devuelto → inventario +2,5 m (no 2 ni 3)."""
        p, _variante, cliente, pedido, solicitud, linea, usuario = self._preparar(
            stock=Decimal("10.00"), metros="2.50"
        )
        stock_antes = self._stock(p.id_producto)

        resultado = self._subir_evidencia(linea.id_devolucion, usuario)

        self.assertEqual(resultado["recogida_estado"], "Recogida")
        self.assertEqual(
            Decimal(str(resultado["cantidad_reintegrada"])), Decimal("2.50")
        )
        stock_despues = self._stock(p.id_producto)
        self.assertEqual(stock_despues - stock_antes, Decimal("2.50"))

        # La recogida avanza el pipeline. Como el reembolso ya quedó
        # 'Reembolsado' al aprobar (simulador), el estado llega hasta
        # 'Reembolso procesado' (Aprobada → Recibida → Reembolso procesado).
        self._resincronizar()
        s = (
            self.db.query(SolicitudDevolucion)
            .filter(SolicitudDevolucion.id_solicitud == solicitud.id_solicitud)
            .first()
        )
        self.assertEqual(s.estado, dv_service.EST_REEMBOLSO)

    def test_reposicion_sin_aprobacion_rechazada(self):
        """Sin decisión administrativa NO hay reposición."""
        producto, _ = self._crear_producto("sinap")
        cliente = self._crear_cliente("sinap")
        pedido, _ = self._crear_pedido_entregado(cliente, producto, metros="2.50")
        solicitud = self._crear_solicitud(cliente, pedido, producto, metros="2.50")
        self._ids_solicitud.append(solicitud.id_solicitud)
        linea = (
            self.db.query(Devolucion)
            .filter(Devolucion.id_solicitud_dv == solicitud.id_solicitud)
            .first()
        )
        self._ids_devolucion.append(linea.id_devolucion)
        u, t = self._crear_tecnico("sinap")
        linea.id_tecnico_recogida = t.id_tecnico
        self.db.commit()

        stock_antes = self._stock(producto.id_producto)
        with self.assertRaises(Exception) as ctx:
            self._subir_evidencia(linea.id_devolucion, u)
        self.assertEqual(getattr(ctx.exception, "status_code", None), 400)
        self.assertIn("no está aprobada", str(ctx.exception.detail))
        self.assertEqual(self._stock(producto.id_producto), stock_antes)

    def test_reintento_recogida_no_duplica_inventario(self):
        """Doble clic / repetición HTTP: el stock solo se reintegra una vez."""
        p, _variante, cliente, pedido, solicitud, linea, usuario = self._preparar(
            stock=Decimal("10.00"), metros="2.50"
        )
        stock_antes = self._stock(p.id_producto)

        self._subir_evidencia(linea.id_devolucion, usuario)
        with self.assertRaises(Exception) as ctx:
            self._subir_evidencia(linea.id_devolucion, usuario)
        self.assertEqual(getattr(ctx.exception, "status_code", None), 400)
        self.assertIn("ya fue confirmada", str(ctx.exception.detail))

        self.assertEqual(
            self._stock(p.id_producto) - stock_antes, Decimal("2.50")
        )

    def test_reposicion_concurrente_una_sola_ejecuta(self):
        """Dos técnicos simultáneos: solo una recogida reintegra stock."""
        p, _variante, cliente, pedido, solicitud, linea, usuario = self._preparar(
            stock=Decimal("10.00"), metros="2.50"
        )
        id_devolucion = linea.id_devolucion
        id_usuario = usuario.id_usuario
        stock_antes = self._stock(p.id_producto)
        codigos: list[int] = []

        def intentar():
            db = SessionLocal()
            try:
                u = db.query(User).filter(User.id_usuario == id_usuario).first()
                from app.routers.devoluciones import subir_evidencia_recogida

                with patch(
                    "app.services.minio_service.subir_imagen_privada",
                    return_value="recogidas/test.jpg",
                ):
                    _run(
                        subir_evidencia_recogida(
                            id_devolucion,
                            file=_ArchivoFalso("recogida.png", _png_valido()),
                            current_user=u,
                            db=db,
                        )
                    )
                    codigos.append(200)
            except Exception as e:
                codigos.append(getattr(e, "status_code", 0))
            finally:
                db.close()

        hilos = [threading.Thread(target=intentar) for _ in range(2)]
        for h in hilos:
            h.start()
        for h in hilos:
            h.join()

        self.assertEqual(sorted(codigos), [200, 400], codigos)
        self.assertEqual(
            self._stock(p.id_producto) - stock_antes, Decimal("2.50")
        )

    def test_reposicion_reintegra_variante_con_metros(self):
        """El descuento del checkout también tocó la variante: se repone igual."""
        p, variante, cliente, pedido, solicitud, linea, usuario = self._preparar(
            stock=Decimal("10.00"), metros="2.50", con_variante=True
        )
        self.assertIsNotNone(variante)
        prod = self.db.query(Producto).filter(Producto.id_producto == p.id_producto).first()
        self.db.refresh(prod)
        variante_db = (
            self.db.query(ProductoVariante)
            .filter(ProductoVariante.id == variante.id)
            .first()
        )
        self.db.refresh(variante_db)
        stock_prod_antes = Decimal(str(prod.stock_producto))
        stock_var_antes = Decimal(str(variante_db.stock))

        self._subir_evidencia(linea.id_devolucion, usuario)

        self._resincronizar()
        self.db.refresh(prod)
        self.db.refresh(variante_db)
        self.assertEqual(
            Decimal(str(prod.stock_producto)) - stock_prod_antes, Decimal("2.50")
        )
        self.assertEqual(
            Decimal(str(variante_db.stock)) - stock_var_antes, Decimal("2.50")
        )

    def test_reembolso_confirmado_cierra_el_pipeline(self):
        """Recibida + reembolso Reembolsado → estado 'Reembolso procesado'."""
        p, _variante, cliente, pedido, solicitud, linea, usuario = self._preparar(
            metros="2.50"
        )
        self._subir_evidencia(linea.id_devolucion, usuario)
        self._resincronizar()
        s = (
            self.db.query(SolicitudDevolucion)
            .filter(SolicitudDevolucion.id_solicitud == solicitud.id_solicitud)
            .first()
        )
        # El reembolso fue procesado al aprobar (simulador) → estado final.
        self.assertEqual(s.estado, dv_service.EST_REEMBOLSO)
        self.assertEqual(Decimal(str(s.monto_total)), Decimal("50000.00"))


# ────────────────────────────────────────────────────────────────────────
# Permisos y revisión administrativa por HTTP (ASGI)
# ────────────────────────────────────────────────────────────────────────
class PermisosYRevisionHTTPTestCase(BasePen0910):
    def _preparar(self, metros="2.50"):
        p, _ = self._crear_producto("http", stock=Decimal("10.00"))
        cliente = self._crear_cliente("http")
        pedido, _ = self._crear_pedido_entregado(cliente, p, metros=metros)
        return p, cliente, pedido

    def test_cliente_solicita_devolucion_del_corte_completo_http(self):
        p, cliente, pedido = self._preparar(metros="2.50")
        token = self._token(self._login(cliente.email))
        r = self._post(
            "/api/v1/devoluciones/solicitudes",
            headers=self._bearer(token),
            json={
                "id_pedido": pedido.id_pedido,
                "items": [
                    {"id_producto": p.id_producto, "cantidad": 1, "metros": 2.5}
                ],
                "motivo_tipo": "defectuoso",
            },
        )
        self.assertEqual(r.status_code, 200, r.text)
        datos = r.json()
        self._ids_solicitud.append(datos["id_solicitud"])
        for it in datos["items"]:
            self._ids_devolucion.append(it["id_devolucion"])
        # El backend normalizó la solicitud al corte completo.
        self.assertEqual(Decimal(str(datos["monto_total"])), Decimal("50000.00"))
        self.assertEqual(Decimal(str(datos["items"][0]["metros"])), Decimal("2.5"))

    def test_cliente_devolucion_parcial_rechazada_http(self):
        """El backend rechaza la manipulación manual de la solicitud HTTP."""
        p, cliente, pedido = self._preparar(metros="2.50")
        token = self._token(self._login(cliente.email))
        r = self._post(
            "/api/v1/devoluciones/solicitudes",
            headers=self._bearer(token),
            json={
                "id_pedido": pedido.id_pedido,
                "items": [
                    {"id_producto": p.id_producto, "cantidad": 1, "metros": 1.5}
                ],
                "motivo_tipo": "defectuoso",
            },
        )
        self.assertEqual(r.status_code, 400, r.text)
        self.assertIn("corte completo", str(r.json()["detail"]))

    def test_cliente_no_puede_aprobar_su_devolucion(self):
        p, cliente, pedido = self._preparar(metros="2.50")
        token = self._token(self._login(cliente.email))
        r_crea = self._post(
            "/api/v1/devoluciones/solicitudes",
            headers=self._bearer(token),
            json={
                "id_pedido": pedido.id_pedido,
                "items": [{"id_producto": p.id_producto, "cantidad": 1, "metros": 2.5}],
                "motivo_tipo": "defectuoso",
            },
        )
        self.assertEqual(r_crea.status_code, 200, r_crea.text)
        id_solicitud = r_crea.json()["id_solicitud"]
        self._ids_solicitud.append(id_solicitud)
        for it in r_crea.json()["items"]:
            self._ids_devolucion.append(it["id_devolucion"])

        r = self._put(
            f"/api/v1/devoluciones/admin/solicitudes/{id_solicitud}/estado",
            headers=self._bearer(token),
            json={"estado": "Aprobada", "resolucion": "Reembolso"},
        )
        self.assertIn(r.status_code, (401, 403), r.text)

        self._resincronizar()
        s = (
            self.db.query(SolicitudDevolucion)
            .filter(SolicitudDevolucion.id_solicitud == id_solicitud)
            .first()
        )
        self.assertEqual(s.estado, dv_service.EST_SOLICITADA)

    def test_admin_revisa_aprueba_y_queda_registrado(self):
        p, cliente, pedido = self._preparar(metros="2.50")
        token_cli = self._token(self._login(cliente.email))
        r_crea = self._post(
            "/api/v1/devoluciones/solicitudes",
            headers=self._bearer(token_cli),
            json={
                "id_pedido": pedido.id_pedido,
                "items": [{"id_producto": p.id_producto, "cantidad": 1, "metros": 2.5}],
                "motivo_tipo": "incorrecto",
                "comentario": "Llegó otro color",
            },
        )
        self.assertEqual(r_crea.status_code, 200, r_crea.text)
        datos = r_crea.json()
        self._ids_solicitud.append(datos["id_solicitud"])
        for it in datos["items"]:
            self._ids_devolucion.append(it["id_devolucion"])

        admin = self._crear_admin("pen09")
        token_adm = self._token(self._login(admin.email, PASSWORD))

        # Consulta de la solicitud pendiente con los datos mínimos.
        r_lista = self._get(
            "/api/v1/devoluciones/admin/solicitudes", headers=self._bearer(token_adm)
        )
        self.assertEqual(r_lista.status_code, 200, r_lista.text)
        objetivo = next(
            s
            for s in r_lista.json()
            if s["id_solicitud"] == datos["id_solicitud"]
        )
        self.assertEqual(objetivo["estado"], "Solicitada")
        self.assertEqual(objetivo["cliente_email"], cliente.email)
        self.assertEqual(
            Decimal(str(objetivo["items"][0]["metros"])), Decimal("2.5")
        )

        # Aprobación con decisión registrada.
        r_apr = self._put(
            f"/api/v1/devoluciones/admin/solicitudes/{datos['id_solicitud']}/estado",
            headers=self._bearer(token_adm),
            json={"estado": "Aprobada", "resolucion": "Reembolso"},
        )
        self.assertEqual(r_apr.status_code, 200, r_apr.text)
        aprobada = r_apr.json()
        self.assertEqual(aprobada["estado"], "Aprobada")
        self.assertEqual(aprobada["resolucion"], "Reembolso")
        self.assertIsNotNone(aprobada["resuelta_at"])
        self.assertIsNotNone(aprobada["id_reembolso"])

        self._resincronizar()
        reembolso = (
            self.db.query(Reembolso)
            .filter(Reembolso.id_solicitud_origen == datos["id_solicitud"])
            .first()
        )
        self.assertIsNotNone(reembolso)
        self._ids_reembolso.append(reembolso.id_reembolso)
        self.assertEqual(Decimal(str(reembolso.monto)), Decimal("50000.00"))

    def test_admin_rechaza_con_motivo_registrado(self):
        p, cliente, pedido = self._preparar(metros="2.50")
        token_cli = self._token(self._login(cliente.email))
        r_crea = self._post(
            "/api/v1/devoluciones/solicitudes",
            headers=self._bearer(token_cli),
            json={
                "id_pedido": pedido.id_pedido,
                "items": [{"id_producto": p.id_producto, "cantidad": 1, "metros": 2.5}],
                "motivo_tipo": "otro",
                "motivo_otro": "Ya no lo necesito",
            },
        )
        self.assertEqual(r_crea.status_code, 200, r_crea.text)
        datos = r_crea.json()
        self._ids_solicitud.append(datos["id_solicitud"])
        for it in datos["items"]:
            self._ids_devolucion.append(it["id_devolucion"])

        admin = self._crear_admin("pen09b")
        token_adm = self._token(self._login(admin.email, PASSWORD))
        r_rec = self._put(
            f"/api/v1/devoluciones/admin/solicitudes/{datos['id_solicitud']}/estado",
            headers=self._bearer(token_adm),
            json={"estado": "Rechazada", "motivo_rechazo": "Fuera de política"},
        )
        self.assertEqual(r_rec.status_code, 200, r_rec.text)
        self.assertEqual(r_rec.json()["estado"], "Rechazada")
        self.assertEqual(r_rec.json()["motivo_rechazo"], "Fuera de política")

    def test_pedido_ajeno_rechazado_http(self):
        p, dueño, pedido = self._preparar(metros="2.50")
        otro = self._crear_cliente("ajeno")
        token = self._token(self._login(otro.email))
        r = self._post(
            "/api/v1/devoluciones/solicitudes",
            headers=self._bearer(token),
            json={
                "id_pedido": pedido.id_pedido,
                "items": [{"id_producto": p.id_producto, "cantidad": 1, "metros": 2.5}],
                "motivo_tipo": "defectuoso",
            },
        )
        self.assertEqual(r.status_code, 404, r.text)


if __name__ == "__main__":
    unittest.main(verbosity=2)
