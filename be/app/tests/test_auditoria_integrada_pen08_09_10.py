"""Auditoría integrada PEN-08 + PEN-09 + PEN-10: flujo completo de negocio.

Escenarios ejecutados sobre HTTP real (ASGI) y la base de pruebas ``neodomus_test``:

  E1. Compra por metros (checkout real) → pedido entregado → solicitud de
      devolución del corte completo.
  E2. Revisión administrativa → aprobación (resolución Cambio) → recogida
      física con evidencia → reposición EXACTA en inventario (producto y variante).
  E3. Revisión administrativa → aprobación (resolución Reembolso) → reembolso
      con valores HISTÓRICOS (no el precio actual) → confirmación del pipeline.
  E4. Protecciones: doble clic en aprobar, dos administradores concurrentes,
      solicitudes repetidas, cantidades manipuladas por HTTP, stock insuficiente,
      variante inexistente, solicitud parcial, fallo de pasarela y reintento.

Todas las verificaciones leen el estado REAL de la base de datos (sesiones
independientes) y ningún resultado se simula. El simulador de pagos es el del
producto (académico); la evidencia de recogida usa MinIO sustituido por stub.
"""
import asyncio
import io
import threading
import time
import unittest
from decimal import Decimal
from unittest.mock import patch

from PIL import Image

import app.tests.testdb  # noqa: F401
from httpx import ASGITransport, AsyncClient

from app.main import app
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
from app.tests.test_t2_pago_pendiente import BaseT2, _run, _async_noop
from app.utils.security import create_access_token

PRECIO = 20000.0


def _png_valido() -> bytes:
    buffer = io.BytesIO()
    Image.new("RGB", (2, 2), (30, 90, 200)).save(buffer, format="PNG")
    return buffer.getvalue()


def _leer(fn):
    """Lee estado REAL de la BD con una sesión independiente."""
    with SessionLocal() as db:
        db.rollback()  # cierra cualquier transacción implícita antes de leer
        return fn(db)


class AuditoriaIntegradaTestCase(BaseT2):
    """Escenarios E1-E4 del flujo completo compra → devolución → reposición/reembolso."""

    def setUp(self):
        super().setUp()
        previous = app.state.limiter.enabled
        app.state.limiter.enabled = False
        self.addCleanup(setattr, app.state.limiter, 'enabled', previous)
        for target in (
            'app.services.notificaciones.notificar_pedido_creado_cliente',
            'app.services.notificaciones.notificar_pago_confirmado_cliente',
            'app.services.notificaciones.notificar_entrega_asignada_tecnico',
            'app.services.notificaciones.notificar_entrega_asignada_cliente',
            'app.services.inventario_service._verificar_stock_bajo',
            'app.services.pedidos_service._alertar_admin_stock_agotado',
            'app.services.minio_service.subir_imagen_privada',
        ):
            self.enterContext(patch(target))
        self.enterContext(patch('app.services.pedidos_service._enviar_factura', new=_async_noop))

        self.producto, self.variante = self._producto_metros('audit', Decimal('10.00'))
        self._ids_producto.append(self.producto.id_producto)
        self._ids_solicitud = []
        self.token_cliente = create_access_token(
            {'sub': self.cliente.email}, user_type='client', rol='cliente',
            user_id=self.cliente.id_cliente,
        )
        self.headers_cliente = {'Authorization': f'Bearer {self.token_cliente}'}

    def tearDown(self):
        # Recoger TODOS los pedidos del cliente de prueba aunque una aserción
        # haya fallado a mitad del escenario.
        self.db.rollback()
        self._ids_pedido = [p.id_pedido for p in self.db.query(Pedido).filter(
            Pedido.id_cliente_pe == self.cliente.id_cliente
        ).all()]
        for s in self.db.query(SolicitudDevolucion).filter(
            SolicitudDevolucion.id_cliente_s == self.cliente.id_cliente
        ).all():
            self._ids_solicitud.append(s.id_solicitud)
        # Orden dependiente de FKs: reembolsos → devoluciones → solicitudes,
        # ANTES de que BaseT2 borre facturas/pagos/detalles/pedidos/productos.
        db = self.db
        for pid in self._ids_pedido:
            db.query(Reembolso).filter(Reembolso.id_pedido == pid).delete(
                synchronize_session=False)
        for sid in self._ids_solicitud:
            db.query(Reembolso).filter(Reembolso.id_solicitud_origen == sid).delete(
                synchronize_session=False)
            db.query(Devolucion).filter(Devolucion.id_solicitud_dv == sid).delete(
                synchronize_session=False)
            db.query(SolicitudDevolucion).filter(
                SolicitudDevolucion.id_solicitud == sid).delete(synchronize_session=False)
        for pid in self._ids_pedido:
            db.query(Devolucion).filter(Devolucion.id_pedido_d == pid).delete(
                synchronize_session=False)
        db.commit()
        super().tearDown()

    def _resincronizar(self):
        """Termina la transacción de la sesión de test para ver los commits
        hechos por otras sesiones (HTTP corre en sesiones independientes bajo
        REPEATABLE READ)."""
        self.db.expire_all()
        self.db.rollback()

    # ── Fixtures ──────────────────────────────────────────────────────────
    def _producto_metros(self, sufijo, stock):
        p = Producto(
            nombre_producto=f'Cable audit {sufijo}',
            referencia_producto=f'REF-AUD-{sufijo}-{int(time.time() * 1_000_000)}',
            precio_venta_producto=PRECIO,
            stock_producto=stock,
            venta_por_metros=1,
            visible_cliente=True,
        )
        self.db.add(p)
        self.db.flush()
        v = ProductoVariante(id_producto=p.id_producto, nombre='Rojo',
                             hex='#ff0000', stock=stock)
        self.db.add(v)
        self.db.commit()
        self.db.refresh(p)
        self.db.refresh(v)
        return p, v

    def _http(self, method, path, *, headers=None, json=None, files=None):
        async def request():
            async with AsyncClient(transport=ASGITransport(app=app), base_url='http://test') as client:
                return await client.request(method, path, json=json, files=files,
                                            headers=headers or {})
        return _run(request())

    def _token_admin(self):
        admin = User(
            first_name='Admin', last_name='Audit',
            email=f'audit.admin.{int(time.time() * 1_000_000)}@neodomus.com',
            password_hash='x', id_rol_u=1, is_active=True,
        )
        self.db.add(admin)
        self.db.commit()
        self.db.refresh(admin)
        self._ids_usuario.append(admin.id_usuario)
        return {'Authorization': 'Bearer ' + create_access_token(
            {'sub': admin.email}, user_type='employee', rol='admin',
            user_id=admin.id_usuario,
        )}

    def _tecnico_asignado(self, linea):
        u = User(
            first_name='Tec', last_name='Audit',
            email=f'audit.tec.{int(time.time() * 1_000_000)}@neodomus.com',
            password_hash='x', id_rol_u=2, is_active=True,
        )
        self.db.add(u)
        self.db.flush()
        t = Tecnico(id_usuario_t=u.id_usuario, certificacion_t='')
        self.db.add(t)
        self.db.commit()
        self.db.refresh(u)
        self._ids_usuario.append(u.id_usuario)
        self._ids_tecnico.append(t.id_tecnico)
        linea.id_tecnico_recogida = t.id_tecnico
        linea.recogida_estado = 'Asignada'
        self.db.commit()
        return {'Authorization': 'Bearer ' + create_access_token(
            {'sub': u.email}, user_type='employee', rol='tecnico',
            user_id=u.id_usuario,
        )}

    def _comprar_y_entregar(self, metros='2.50', con_variante=False):
        """E1: checkout HTTP real (punto de pago + confirmación) y entrega."""
        item = {'id_producto': self.producto.id_producto, 'cantidad': 1, 'metros': metros}
        if con_variante:
            # Ciclo completo con variante (igual que la web/móvil al elegir color).
            item['id_variante'] = self.variante.id
            item['color'] = self.variante.nombre
        respuesta = self._http('POST', '/api/v1/pedidos', headers=self.headers_cliente, json={
            'items': [item],
            'servicios': [],
            'pago': {'metodo': 'punto_pago', 'punto_pago': 'Efecty'},
        })
        self.assertEqual(respuesta.status_code, 200, respuesta.text)
        id_pedido = respuesta.json()['pedido']['id_pedido']
        self._ids_pedido.append(id_pedido)

        # Confirmación de pago (idempotente: se repite para probarlo).
        for _ in range(2):
            confirmacion = self._http('POST', f'/api/v1/pedidos/{id_pedido}/confirmar-pago',
                                      headers=self.headers_cliente)
            self.assertEqual(confirmacion.status_code, 200, confirmacion.text)
            self.assertEqual(confirmacion.json()['pago']['estado'], 'aprobado')

        # El pedido queda entregado (precondición de elegibilidad de devolución).
        self._resincronizar()  # termina la instantánea REPEATABLE READ de esta sesión
        pedido = self.db.query(Pedido).filter(Pedido.id_pedido == id_pedido).first()
        pedido.estado_entrega = 'Entregado'
        self.db.commit()
        self._resincronizar()
        return id_pedido

    def _solicitar_devolucion(self, id_pedido, metros):
        return self._http('POST', '/api/v1/devoluciones/solicitudes',
                          headers=self.headers_cliente, json={
                              'id_pedido': id_pedido,
                              'items': [{'id_producto': self.producto.id_producto,
                                         'cantidad': 1, 'metros': metros}],
                              'motivo_tipo': 'defectuoso',
                          })

    def _linea_de(self, id_solicitud):
        return (
            self.db.query(Devolucion)
            .filter(Devolucion.id_solicitud_dv == id_solicitud)
            .order_by(Devolucion.id_devolucion.asc())
            .first()
        )

    def _recoger(self, headers_tecnico, id_devolucion):
        return self._http(
            'POST', f'/api/v1/devoluciones/{id_devolucion}/evidencia-recogida',
            headers=headers_tecnico,
            files={'file': ('recogida.png', _png_valido(), 'image/png')},
        )

    def _stock(self, producto_id, variante_id=None):
        def leer(db):
            p = db.get(Producto, producto_id)
            datos = {'producto': Decimal(str(p.stock_producto))}
            if variante_id:
                v = db.get(ProductoVariante, variante_id)
                datos['variante'] = Decimal(str(v.stock))
            return datos
        return _leer(leer)

    # ── E1: compra por metros → devolución del corte completo ────────────
    def test_e1_compra_metros_y_devolucion_corte_completo(self):
        id_pedido = self._comprar_y_entregar(metros='2.50')

        # La compra real descuenta 2,5 m y congela el precio histórico.
        compra = _leer(lambda db: {
            'stock': Decimal(str(db.get(Producto, self.producto.id_producto).stock_producto)),
            'stock_var': Decimal(str(db.get(ProductoVariante, self.variante.id).stock)),
            'detalle': db.query(DetallePedido).filter(
                DetallePedido.id_pedido_d == id_pedido,
                DetallePedido.id_producto_d == self.producto.id_producto,
            ).one(),
            'total': Decimal(str(db.get(Pedido, id_pedido).total_pedido)),
        })
        self.assertEqual(compra['stock'], Decimal('7.50'))
        # Sin variante seleccionada, el checkout NO descuenta la variante
        # (regla del backend); el producto sí.
        self.assertEqual(compra['stock_var'], Decimal('10.00'))
        self.assertEqual(Decimal(str(compra['detalle'].cantidad_metros)), Decimal('2.50'))
        self.assertEqual(Decimal(str(compra['detalle'].precio_unitario_detalle)), Decimal('20000.00'))
        self.assertEqual(compra['total'], Decimal('50000.00'))

        # El frontend (móvil y web) muestra lo mismo que valida el backend:
        # el corte completo, no unidades.
        elegibilidad = self._http('GET', f'/api/v1/devoluciones/elegibilidad/{id_pedido}',
                                  headers=self.headers_cliente)
        self.assertEqual(elegibilidad.status_code, 200, elegibilidad.text)
        linea = elegibilidad.json()['productos'][0]
        self.assertTrue(linea['venta_por_metros'])
        self.assertEqual(Decimal(str(linea['metros_comprados'])), Decimal('2.50'))
        self.assertEqual(Decimal(str(linea['metros_disponibles'])), Decimal('2.50'))
        self.assertEqual(Decimal(str(linea['monto_maximo'])), Decimal('50000.00'))

        # Solicitud de devolución del corte completo.
        solicitud = self._solicitar_devolucion(id_pedido, 2.5)
        self.assertEqual(solicitud.status_code, 200, solicitud.text)
        datos = solicitud.json()
        self._ids_solicitud.append(datos['id_solicitud'])
        self.assertEqual(Decimal(str(datos['monto_total'])), Decimal('50000.00'))
        self.assertEqual(Decimal(str(datos['items'][0]['metros'])), Decimal('2.50'))
        self.assertEqual(datos['tipo_devolucion'], 'total')

        # La decisión administrativa aún NO existe: estado Solicitada.
        estado = _leer(lambda db: db.get(SolicitudDevolucion, datos['id_solicitud']).estado)
        self.assertEqual(estado, 'Solicitada')

    def test_e1b_devolucion_parcial_y_superior_rechazadas(self):
        id_pedido = self._comprar_y_entregar(metros='2.50')
        casos = {'1.5': 'corte completo', '3.0': 'corte completo',
                 '2.505': '2 decimales'}
        for metros, mensaje in casos.items():
            respuesta = self._solicitar_devolucion(id_pedido, metros)
            self.assertEqual(respuesta.status_code, 400, f'{metros}: {respuesta.text}')
            self.assertIn(mensaje, str(respuesta.json()['detail']))
        self.assertEqual(_leer(lambda db: db.query(SolicitudDevolucion).filter(
            SolicitudDevolucion.id_pedido_s == id_pedido).count()), 0)

    def test_e1c_pedido_ajeno_inexistente_y_duplicado(self):
        id_pedido = self._comprar_y_entregar(metros='2.50')

        # Pedido de otro cliente (token de otro cliente).
        otro = Cliente(
            first_name='Otro', last_name='Audit',
            email=f'audit.otro.{int(time.time() * 1_000_000)}@neodomus.com',
            is_active=True, auth_provider='local',
        )
        self.db.add(otro)
        self.db.commit()
        self.db.refresh(otro)
        token_otro = create_access_token(
            {'sub': otro.email}, user_type='client', rol='cliente', user_id=otro.id_cliente,
        )
        ajena = self._http('POST', '/api/v1/devoluciones/solicitudes',
                           headers={'Authorization': f'Bearer {token_otro}'}, json={
                               'id_pedido': id_pedido,
                               'items': [{'id_producto': self.producto.id_producto,
                                          'cantidad': 1, 'metros': 2.5}],
                               'motivo_tipo': 'defectuoso',
                           })
        self.assertEqual(ajena.status_code, 404, ajena.text)
        inexistente = self._solicitar_devolucion(99999999, 2.5)
        self.assertEqual(inexistente.status_code, 404, inexistente.text)

        # Primera solicitud OK; la repetida se rechaza.
        primera = self._solicitar_devolucion(id_pedido, 2.5)
        self.assertEqual(primera.status_code, 200, primera.text)
        self._ids_solicitud.append(primera.json()['id_solicitud'])
        repetida = self._solicitar_devolucion(id_pedido, 2.5)
        self.assertEqual(repetida.status_code, 400, repetida.text)
        self.assertEqual(_leer(lambda db: db.query(SolicitudDevolucion).filter(
            SolicitudDevolucion.id_pedido_s == id_pedido).count()), 1)

    # ── E2: aprobación + recogida física → reposición exacta ─────────────
    def test_e2_reposicion_exacta_con_variante(self):
        # Compra CON variante (color) para validar el ciclo completo
        # descuento → reposición en producto y variante.
        id_pedido = self._comprar_y_entregar(metros='2.50', con_variante=True)
        solicitud = self._solicitar_devolucion(id_pedido, 2.5)
        id_solicitud = solicitud.json()['id_solicitud']
        self._ids_solicitud.append(id_solicitud)

        stock_antes = self._stock(self.producto.id_producto, self.variante.id)

        # Aprobación con resolución CAMBIO: la reposición no genera reembolso.
        headers_admin = self._token_admin()
        aprobacion = self._http(
            'PUT', f'/api/v1/devoluciones/admin/solicitudes/{id_solicitud}/estado',
            headers=headers_admin, json={'estado': 'Aprobada', 'resolucion': 'Cambio'})
        self.assertEqual(aprobacion.status_code, 200, aprobacion.text)
        self.assertEqual(aprobacion.json()['resolucion'], 'Cambio')

        # La aprobación NO toca el inventario (exige recepción física).
        stock_tras_aprobar = self._stock(self.producto.id_producto, self.variante.id)
        self.assertEqual(stock_tras_aprobar, stock_antes)

        # Recogida física con evidencia (técnico real, foto real).
        linea = self._linea_de(id_solicitud)
        headers_tecnico = self._tecnico_asignado(linea)
        recogida = self._recoger(headers_tecnico, linea.id_devolucion)
        self.assertEqual(recogida.status_code, 200, recogida.text)
        self.assertEqual(Decimal(str(recogida.json()['cantidad_reintegrada'])), Decimal('2.50'))

        # Reposición EXACTA en producto y variante.
        stock_despues = self._stock(self.producto.id_producto, self.variante.id)
        self.assertEqual(stock_despues['producto'] - stock_antes['producto'], Decimal('2.50'))
        self.assertEqual(stock_despues['variante'] - stock_antes['variante'], Decimal('2.50'))

        # Sin resolución Reembolso NO hay reembolso; pipeline en Recibida.
        estado = _leer(lambda db: {
            'solicitud': db.get(SolicitudDevolucion, id_solicitud).estado,
            'reembolsos': db.query(Reembolso).filter(
                Reembolso.id_solicitud_origen == id_solicitud).count(),
        })
        self.assertEqual(estado['solicitud'], dv_service.EST_RECIBIDA)
        self.assertEqual(estado['reembolsos'], 0)

        # Recogida repetida: sin segunda reposición.
        repetida = self._recoger(headers_tecnico, linea.id_devolucion)
        self.assertEqual(repetida.status_code, 400, repetida.text)
        self.assertIn('ya fue confirmada', str(repetida.json()['detail']))
        stock_final = self._stock(self.producto.id_producto, self.variante.id)
        self.assertEqual(stock_final, stock_despues)

    # ── E3: aprobación + reembolso con valores históricos ────────────────
    def test_e3_reembolso_con_precio_historico_y_confirmacion(self):
        id_pedido = self._comprar_y_entregar(metros='2.50')
        solicitud = self._solicitar_devolucion(id_pedido, 2.5)
        id_solicitud = solicitud.json()['id_solicitud']
        self._ids_solicitud.append(id_solicitud)

        # El catálogo cambia de precio DESPUÉS de la compra.
        producto = self.db.query(Producto).filter(
            Producto.id_producto == self.producto.id_producto).first()
        producto.precio_venta_producto = 99000.0
        self.db.commit()

        headers_admin = self._token_admin()
        aprobacion = self._http(
            'PUT', f'/api/v1/devoluciones/admin/solicitudes/{id_solicitud}/estado',
            headers=headers_admin, json={'estado': 'Aprobada', 'resolucion': 'Reembolso'})
        self.assertEqual(aprobacion.status_code, 200, aprobacion.text)
        self.assertIsNotNone(aprobacion.json()['id_reembolso'])

        datos = _leer(lambda db: {
            'reembolso': db.query(Reembolso).filter(
                Reembolso.id_solicitud_origen == id_solicitud).one(),
            'detalle': db.query(DetallePedido).filter(
                DetallePedido.id_pedido_d == id_pedido,
                DetallePedido.id_producto_d == self.producto.id_producto).one(),
        })
        # Importe con el valor HISTÓRICO: 2,5 × 20.000 = 50.000 (no 99.000/m).
        self.assertEqual(Decimal(str(datos['reembolso'].monto)), Decimal('50000.00'))
        self.assertEqual(datos['reembolso'].estado, 'Reembolsado')
        self.assertIsNotNone(datos['reembolso'].numero_transaccion_reembolso)
        # El pedido y su precio congelado no cambiaron.
        self.assertEqual(Decimal(str(datos['detalle'].precio_unitario_detalle)), Decimal('20000.00'))

        # Recogida física → pipeline llega a 'Reembolso procesado'.
        linea = self._linea_de(id_solicitud)
        headers_tecnico = self._tecnico_asignado(linea)
        recogida = self._recoger(headers_tecnico, linea.id_devolucion)
        self.assertEqual(recogida.status_code, 200, recogida.text)
        estado = _leer(lambda db: db.get(SolicitudDevolucion, id_solicitud).estado)
        self.assertEqual(estado, dv_service.EST_REEMBOLSO)

        # Una sola operación: 1 reembolso; cambiar la resolución no es posible.
        segundo = self._http(
            'PUT', f'/api/v1/devoluciones/admin/solicitudes/{id_solicitud}/estado',
            headers=headers_admin, json={'estado': 'Aprobada', 'resolucion': 'Cambio'})
        self.assertEqual(segundo.status_code, 400, segundo.text)
        self.assertEqual(_leer(lambda db: db.query(Reembolso).filter(
            Reembolso.id_solicitud_origen == id_solicitud).count()), 1)

    # ── E4: protecciones (concurrencia, pasarela fallida, reintento) ─────
    def test_e4a_dos_administradores_aprueban_simultaneamente(self):
        id_pedido = self._comprar_y_entregar(metros='2.50')
        solicitud = self._solicitar_devolucion(id_pedido, 2.5)
        id_solicitud = solicitud.json()['id_solicitud']
        self._ids_solicitud.append(id_solicitud)

        resultados: list = []

        # El token se crea ANTES de lanzar los hilos (la sesión del test no es
        # thread-safe); dos peticiones concurrentes con decisión idéntica.
        headers_admin = self._token_admin()

        def aprobar():
            try:
                r = self._http(
                    'PUT', f'/api/v1/devoluciones/admin/solicitudes/{id_solicitud}/estado',
                    headers=headers_admin, json={'estado': 'Aprobada', 'resolucion': 'Reembolso'})
                resultados.append(('http', r.status_code))
            except Exception as e:  # fallo de transporte/BD también es un rechazo
                resultados.append(('excepcion', type(e).__name__))

        hilos = [threading.Thread(target=aprobar) for _ in range(2)]
        for h in hilos:
            h.start()
        for h in hilos:
            h.join()

        # INVARIANTE: exactamente UN éxito y UN rechazo (400 HTTP, o error de
        # concurrencia de BD bajo saturación: deadlock/lock-wait). En ambos
        # canales la segunda decisión NO se aplica.
        exitos = [r for r in resultados if r == ('http', 200)]
        rechazos = [r for r in resultados if r != ('http', 200)]
        self.assertEqual(len(exitos), 1, resultados)
        self.assertEqual(len(rechazos), 1, resultados)
        estado = _leer(lambda db: {
            'solicitud': db.get(SolicitudDevolucion, id_solicitud).estado,
            'reembolsos': db.query(Reembolso).filter(
                Reembolso.id_solicitud_origen == id_solicitud).count(),
        })
        self.assertEqual(estado['solicitud'], dv_service.EST_APROBADA)
        self.assertEqual(estado['reembolsos'], 1)

    def test_e4b_fallo_pasarela_no_marca_exitoso_y_reintento_recupera(self):
        id_pedido = self._comprar_y_entregar(metros='2.50')
        solicitud = self._solicitar_devolucion(id_pedido, 2.5)
        id_solicitud = solicitud.json()['id_solicitud']
        self._ids_solicitud.append(id_solicitud)

        headers_admin = self._token_admin()
        # La pasarela FALLA en el primer intento.
        with patch('app.services.pagos_service.procesar_reembolso',
                   side_effect=RuntimeError('pasarela no disponible')):
            aprobacion = self._http(
                'PUT', f'/api/v1/devoluciones/admin/solicitudes/{id_solicitud}/estado',
                headers=headers_admin, json={'estado': 'Aprobada', 'resolucion': 'Reembolso'})
        self.assertEqual(aprobacion.status_code, 200, aprobacion.text)
        self.assertIsNotNone(aprobacion.json().get('id_reembolso'))

        datos = _leer(lambda db: {
            'solicitud': db.get(SolicitudDevolucion, id_solicitud),
            'reembolso': db.query(Reembolso).filter(
                Reembolso.id_solicitud_origen == id_solicitud).one(),
        })
        # NO se marca como exitoso: reembolso Rechazado, pipeline NO avanzado.
        self.assertEqual(datos['reembolso'].estado, 'Rechazado')
        self.assertEqual(datos['solicitud'].estado, dv_service.EST_APROBADA)
        id_reembolso = datos['reembolso'].id_reembolso

        # Reintento administrativo (pasarela real de vuelta): se recupera
        # SIN crear un segundo reembolso.
        reintento = self._http('POST', f'/api/v1/reembolsos/{id_reembolso}/procesar',
                               headers=headers_admin, json={'porcentaje_cliente': 100})
        self.assertEqual(reintento.status_code, 200, reintento.text)
        self.assertEqual(reintento.json()['estado'], 'Reembolsado')
        self.assertEqual(_leer(lambda db: db.query(Reembolso).filter(
            Reembolso.id_solicitud_origen == id_solicitud).count()), 1)

        # La recogida física avanza el pipeline y cierra con el reembolso.
        linea = self._linea_de(id_solicitud)
        headers_tecnico = self._tecnico_asignado(linea)
        recogida = self._recoger(headers_tecnico, linea.id_devolucion)
        self.assertEqual(recogida.status_code, 200, recogida.text)
        estado = _leer(lambda db: db.get(SolicitudDevolucion, id_solicitud).estado)
        self.assertEqual(estado, dv_service.EST_REEMBOLSO)

    def test_e4c_stock_insuficiente_y_variante_inexistente(self):
        # Checkout con más metros que el disponible → 409 real, sin pedido.
        respuesta = self._http('POST', '/api/v1/pedidos', headers=self.headers_cliente, json={
            'items': [{'id_producto': self.producto.id_producto, 'cantidad': 1, 'metros': 10.5}],
            'servicios': [],
            'pago': {'metodo': 'punto_pago', 'punto_pago': 'Efecty'},
        })
        self.assertEqual(respuesta.status_code, 409, respuesta.text)
        self.assertIn('Stock insuficiente', str(respuesta.json()['detail']))

        # Variante inexistente → rechazado, sin pedido.
        respuesta = self._http('POST', '/api/v1/pedidos', headers=self.headers_cliente, json={
            'items': [{'id_producto': self.producto.id_producto, 'cantidad': 1,
                       'metros': 1.5, 'id_variante': 99999999}],
            'servicios': [],
            'pago': {'metodo': 'punto_pago', 'punto_pago': 'Efecty'},
        })
        self.assertIn(respuesta.status_code, (400, 404), respuesta.text)
        self.assertEqual(_leer(lambda db: db.query(Pedido).filter(
            Pedido.id_cliente_pe == self.cliente.id_cliente).count()), 0)

    def test_e4d_integridad_historica_tras_flujo_completo(self):
        """El pedido, su detalle, su pago y la factura quedan intactos tras
        devolución + reposición/reembolso completos."""
        id_pedido = self._comprar_y_entregar(metros='2.50')
        antes = _leer(lambda db: {
            'pedido': db.get(Pedido, id_pedido),
            'detalle': db.query(DetallePedido).filter(
                DetallePedido.id_pedido_d == id_pedido).one(),
            'pagos': [(p.estado, Decimal(str(p.monto)), p.numero_transaccion)
                      for p in db.query(Pago).filter(Pago.id_pedido == id_pedido).all()],
        })

        solicitud = self._solicitar_devolucion(id_pedido, 2.5)
        id_solicitud = solicitud.json()['id_solicitud']
        self._ids_solicitud.append(id_solicitud)
        headers_admin = self._token_admin()
        self._http('PUT', f'/api/v1/devoluciones/admin/solicitudes/{id_solicitud}/estado',
                   headers=headers_admin, json={'estado': 'Aprobada', 'resolucion': 'Reembolso'})
        linea = self._linea_de(id_solicitud)
        headers_tecnico = self._tecnico_asignado(linea)
        self._recoger(headers_tecnico, linea.id_devolucion)

        despues = _leer(lambda db: {
            'pedido': db.get(Pedido, id_pedido),
            'detalle': db.query(DetallePedido).filter(
                DetallePedido.id_pedido_d == id_pedido).one(),
            'pagos': [(p.estado, Decimal(str(p.monto)), p.numero_transaccion)
                      for p in db.query(Pago).filter(Pago.id_pedido == id_pedido).all()],
        })

        self.assertEqual(despues['pedido'].total_pedido, antes['pedido'].total_pedido)
        self.assertEqual(despues['pedido'].estado_pedido, antes['pedido'].estado_pedido)
        self.assertEqual(despues['pedido'].estado_entrega, antes['pedido'].estado_entrega)
        self.assertEqual(despues['detalle'].cantidad_metros, antes['detalle'].cantidad_metros)
        self.assertEqual(despues['detalle'].precio_unitario_detalle,
                         antes['detalle'].precio_unitario_detalle)
        self.assertEqual(despues['detalle'].subtotal_detalle, antes['detalle'].subtotal_detalle)
        self.assertEqual(despues['detalle'].descripcion_detalle,
                         antes['detalle'].descripcion_detalle)
        self.assertEqual(despues['pagos'], antes['pagos'])


if __name__ == '__main__':
    unittest.main(verbosity=2)
