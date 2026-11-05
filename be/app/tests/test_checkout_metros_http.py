"""Contrato HTTP del checkout por metros, con MySQL dedicado vía testdb.

Ejecuta autenticación, esquemas, router y servicios reales. Solo se anulan
avisos externos; el simulador de punto de pago sigue siendo el del producto.
"""
import threading
import time
from datetime import datetime
from decimal import Decimal
from unittest.mock import patch

import app.tests.testdb  # noqa: F401
from httpx import ASGITransport, AsyncClient
from sqlalchemy.exc import OperationalError

from app.main import app
from app.database import SessionLocal
from app.models.cliente import Cliente
from app.models.pago import Pago
from app.models.pedido import Pedido, DetallePedido
from app.models.producto import Producto
from app.models.producto_variante import ProductoVariante
from app.models.factura import Factura
from app.services.pedidos_service import crear_pedido, reintentar_pago_pedido
from app.tests.test_t2_pago_pendiente import BaseT2, _run, _async_noop
from app.utils.security import create_access_token


class CheckoutMetrosHTTPTestCase(BaseT2):
    def setUp(self):
        super().setUp()
        previous = app.state.limiter.enabled
        app.state.limiter.enabled = False
        self.addCleanup(setattr, app.state.limiter, 'enabled', previous)
        self.producto = self._producto('http', Decimal('5.00'), venta_por_metros=1)
        self.producto.precio_venta_producto = 1000
        self.db.commit()
        self.producto_id = self.producto.id_producto
        token = create_access_token(
            {'sub': self.cliente.email}, user_type='client', rol='cliente',
            user_id=self.cliente.id_cliente,
        )
        self.headers = {'Authorization': f'Bearer {token}'}
        for target in (
            'app.services.notificaciones.notificar_pedido_creado_cliente',
            'app.services.notificaciones.notificar_pago_confirmado_cliente',
            'app.services.notificaciones.notificar_entrega_asignada_tecnico',
            'app.services.notificaciones.notificar_entrega_asignada_cliente',
            'app.services.inventario_service._verificar_stock_bajo',
            'app.services.pedidos_service._alertar_admin_stock_agotado',
        ):
            self.enterContext(patch(target))
        self.enterContext(patch('app.services.pedidos_service._enviar_factura', new=_async_noop))

    def tearDown(self):
        # Recoger por propietario incluso si falló una aserción después del POST.
        self.db.rollback()
        self._ids_pedido = [p.id_pedido for p in self.db.query(Pedido).filter(
            Pedido.id_cliente_pe == self.cliente.id_cliente
        ).all()]
        super().tearDown()

    def _post(self, path, payload=None, autenticado=True):
        async def request():
            async with AsyncClient(transport=ASGITransport(app=app), base_url='http://test') as client:
                return await client.post(path, json=payload,
                                         headers=self.headers if autenticado else {})
        return _run(request())

    def _payload(self, metros):
        return {'items': [{'id_producto': self.producto_id, 'cantidad': 1, 'metros': metros}],
                'servicios': [], 'pago': {'metodo': 'punto_pago', 'punto_pago': 'Efecty'}}

    def _sin_compra(self):
        with SessionLocal() as db:
            self.assertEqual(db.query(Pedido).filter(
                Pedido.id_cliente_pe == self.cliente.id_cliente).count(), 0)
            self.assertEqual(db.get(Producto, self.producto_id).stock_producto, Decimal('5.00'))

    def test_metros_pendientes_confirmados_y_repetidos_por_http(self):
        self._tecnico('http')
        response = self._post('/api/v1/pedidos', self._payload(1.5))
        self.assertEqual(response.status_code, 200, response.text)
        body = response.json()
        pid = body['pedido']['id_pedido']
        self.assertEqual(body['pago']['estado'], 'pendiente')
        with SessionLocal() as db:
            detalle = db.query(DetallePedido).filter(DetallePedido.id_pedido_d == pid).one()
            self.assertEqual(detalle.cantidad_metros, Decimal('1.50'))
            self.assertEqual(Decimal(str(detalle.subtotal_detalle)), Decimal('1500.00'))
            self.assertEqual(db.get(Producto, self.producto_id).stock_producto, Decimal('5.00'))
        facturas = []
        for _ in range(2):
            response = self._post(f'/api/v1/pedidos/{pid}/confirmar-pago')
            self.assertEqual(response.status_code, 200, response.text)
            self.assertEqual(response.json()['pago']['estado'], 'aprobado')
            facturas.append(response.json()['factura']['id_factura'])
        self.assertEqual(facturas[0], facturas[1])
        with SessionLocal() as db:
            self.assertEqual(db.get(Producto, self.producto_id).stock_producto, Decimal('3.50'))
            self.assertTrue(db.get(Pedido, pid).confirmacion_completa)
            self.assertEqual(db.query(Factura).filter(Factura.id_pedido == pid).count(), 1)

    def test_precision_excesiva_rechazada_sin_pedido_ni_descuento(self):
        response = self._post('/api/v1/pedidos', self._payload(1.555))
        self.assertEqual(response.status_code, 400, response.text)
        self._sin_compra()

    def test_precio_de_variante_prevalece_sobre_importes_del_navegador(self):
        self.producto.descuento_activo = 10
        variante = ProductoVariante(
            id_producto=self.producto.id_producto,
            nombre='Rojo',
            stock=3,
            precio=750,
        )
        self.db.add(variante)
        self.db.commit()
        self.db.refresh(variante)

        payload = {
            'items': [{
                'id_producto': self.producto_id,
                'cantidad': 2,
                'id_variante': variante.id,
                'color': 'Rojo',
                'precio_unitario': 1,
                'subtotal': 2,
            }],
            'servicios': [],
            'pago': {'metodo': 'punto_pago', 'punto_pago': 'Efecty'},
        }
        response = self._post('/api/v1/pedidos', payload)
        self.assertEqual(response.status_code, 200, response.text)
        pid = response.json()['pedido']['id_pedido']
        with SessionLocal() as db:
            detalle = db.query(DetallePedido).filter(
                DetallePedido.id_pedido_d == pid
            ).one()
            self.assertEqual(
                Decimal(str(detalle.precio_unitario_detalle)),
                Decimal('750.00'),
            )
            self.assertEqual(
                Decimal(str(detalle.subtotal_detalle)),
                Decimal('1500.00'),
            )

    def test_checkout_anonimo_rechazado_sin_efectos(self):
        response = self._post('/api/v1/pedidos', self._payload(1.5), autenticado=False)
        self.assertEqual(response.status_code, 401, response.text)
        self._sin_compra()

    def _payload_tarjeta(self, resultado='aprobado', numero='4242424242424242',
                         expiracion='12/30', cvv='123'):
        return {
            'items': [{'id_producto': self.producto_id, 'cantidad': 1, 'metros': 1.5}],
            'servicios': [],
            'pago': {
                'metodo': 'tarjeta_debito',
                'numero': numero,
                'titular': 'Cliente HTTP',
                'expiracion': expiracion,
                'cvv': cvv,
                'resultado_simulacion': resultado,
            },
        }

    def _otro_cliente(self):
        c = Cliente(
            first_name='Otro', last_name='Cliente',
            email=f'otro.http.{int(time.time() * 1_000_000)}@neodomus.com',
            is_active=True, auth_provider='local',
        )
        self.db.add(c)
        self.db.commit()
        self.db.refresh(c)
        cid = c.id_cliente

        def limpiar():
            db = SessionLocal()
            try:
                db.query(Cliente).filter(Cliente.id_cliente == cid).delete(synchronize_session=False)
                db.commit()
            finally:
                db.close()

        self.addCleanup(limpiar)
        return c

    def _headers_de(self, cliente):
        token = create_access_token(
            {'sub': cliente.email}, user_type='client', rol='cliente',
            user_id=cliente.id_cliente,
        )
        return {'Authorization': f'Bearer {token}'}

    def _post_como(self, path, payload, headers):
        async def request():
            async with AsyncClient(transport=ASGITransport(app=app), base_url='http://test') as client:
                return await client.post(path, json=payload, headers=headers)
        return _run(request())

    def _estado_compra(self, pid):
        with SessionLocal() as db:
            pedido = db.get(Pedido, pid)
            pago = db.query(Pago).filter(Pago.id_pedido == pid).first()
            return (
                pedido.estado_pedido if pedido else None,
                pago.estado if pago else None,
                db.query(Factura).filter(Factura.id_pedido == pid).count(),
                db.get(Producto, self.producto_id).stock_producto,
            )

    def test_tarjeta_rechazada_y_reintento_aprobado_no_duplica(self):
        self._tecnico('tarjeta')
        rechazo = self._post('/api/v1/pedidos', self._payload_tarjeta('rechazado'))
        self.assertEqual(rechazo.status_code, 200, rechazo.text)
        body = rechazo.json()
        pid = body['pedido']['id_pedido']
        pago_id = body['pago']['id_pago']
        self.assertEqual(body['pago']['estado'], 'rechazado')
        with SessionLocal() as db:
            self.assertEqual(db.query(Pedido).filter(
                Pedido.id_cliente_pe == self.cliente.id_cliente).count(), 1)
            self.assertEqual(db.query(Pago).filter(Pago.id_pedido == pid).count(), 1)
            self.assertEqual(db.query(Factura).filter(Factura.id_pedido == pid).count(), 0)
            self.assertEqual(db.get(Producto, self.producto_id).stock_producto, Decimal('5.00'))

        aprobado = self._post(
            f'/api/v1/pedidos/{pid}/reintentar-pago',
            self._payload_tarjeta('aprobado')['pago'],
        )
        self.assertEqual(aprobado.status_code, 200, aprobado.text)
        aprobado_body = aprobado.json()
        self.assertEqual(aprobado_body['pedido']['id_pedido'], pid)
        self.assertEqual(aprobado_body['pago']['id_pago'], pago_id)
        self.assertEqual(aprobado_body['pago']['estado'], 'aprobado')
        self.assertIsNotNone(aprobado_body['factura'])
        with SessionLocal() as db:
            self.assertEqual(db.query(Pedido).filter(
                Pedido.id_cliente_pe == self.cliente.id_cliente).count(), 1)
            self.assertEqual(db.query(Pago).filter(Pago.id_pedido == pid).count(), 1)
            self.assertEqual(db.query(Factura).filter(Factura.id_pedido == pid).count(), 1)
            self.assertEqual(db.get(Producto, self.producto_id).stock_producto, Decimal('3.50'))
            self.assertTrue(db.get(Pedido, pid).confirmacion_completa)

        repetido = self._post(
            f'/api/v1/pedidos/{pid}/reintentar-pago',
            self._payload_tarjeta('aprobado')['pago'],
        )
        self.assertEqual(repetido.status_code, 200, repetido.text)
        self.assertEqual(
            repetido.json()['factura']['id_factura'],
            aprobado_body['factura']['id_factura'],
        )
        with SessionLocal() as db:
            self.assertEqual(db.query(Pedido).filter(
                Pedido.id_cliente_pe == self.cliente.id_cliente).count(), 1)
            self.assertEqual(db.query(Pago).filter(Pago.id_pedido == pid).count(), 1)
            self.assertEqual(db.query(Factura).filter(Factura.id_pedido == pid).count(), 1)
            self.assertEqual(db.get(Producto, self.producto_id).stock_producto, Decimal('3.50'))

    def test_tarjeta_datos_invalidos_no_crean_pedido(self):
        casos = [
            {'expiracion': '12/20'},
            {'expiracion': '13/30'},
            {'expiracion': '1230'},
            {'cvv': '12'},
            {'numero': '42424242424242424242'},
        ]
        for cambio in casos:
            with self.subTest(cambio=cambio):
                response = self._post(
                    '/api/v1/pedidos',
                    self._payload_tarjeta(**cambio),
                )
                self.assertEqual(response.status_code, 400, response.text)
                self._sin_compra()

    def test_reintento_autorizacion(self):
        self._tecnico('auth')
        r = self._post('/api/v1/pedidos', self._payload_tarjeta('rechazado'))
        self.assertEqual(r.status_code, 200, r.text)
        pid = r.json()['pedido']['id_pedido']
        antes = self._estado_compra(pid)

        anonimo = self._post(
            f'/api/v1/pedidos/{pid}/reintentar-pago',
            self._payload_tarjeta('aprobado')['pago'],
            autenticado=False,
        )
        self.assertEqual(anonimo.status_code, 401)
        self.assertEqual(self._estado_compra(pid), antes)

        ajeno = self._post_como(
            f'/api/v1/pedidos/{pid}/reintentar-pago',
            self._payload_tarjeta('aprobado')['pago'],
            self._headers_de(self._otro_cliente()),
        )
        self.assertEqual(ajeno.status_code, 404)
        self.assertEqual(self._estado_compra(pid), antes)

    def test_reintento_estados_no_permitidos(self):
        self._tecnico('estado')

        # Pagado: no vuelve a cobrar ni descontar.
        aprobado = self._post('/api/v1/pedidos', self._payload_tarjeta('aprobado'))
        self.assertEqual(aprobado.status_code, 200, aprobado.text)
        pid = aprobado.json()['pedido']['id_pedido']
        pago_id = aprobado.json()['pago']['id_pago']
        factura_id = aprobado.json()['factura']['id_factura']
        reintento = self._post(
            f'/api/v1/pedidos/{pid}/reintentar-pago',
            self._payload_tarjeta('rechazado')['pago'],
        )
        self.assertEqual(reintento.status_code, 200, reintento.text)
        self.assertEqual(reintento.json()['pago']['estado'], 'aprobado')
        self.assertEqual(reintento.json()['pago']['id_pago'], pago_id)
        self.assertEqual(reintento.json()['factura']['id_factura'], factura_id)
        with SessionLocal() as db:
            self.assertEqual(db.query(Pago).filter(Pago.id_pedido == pid).count(), 1)
            self.assertEqual(db.query(Factura).filter(Factura.id_pedido == pid).count(), 1)
            self.assertEqual(db.get(Producto, self.producto_id).stock_producto, Decimal('3.50'))

        # Cancelado: no revive.
        cancelado = self._post('/api/v1/pedidos', self._payload_tarjeta('rechazado'))
        self.assertEqual(cancelado.status_code, 200, cancelado.text)
        cpid = cancelado.json()['pedido']['id_pedido']
        with SessionLocal() as db:
            db.get(Pedido, cpid).estado_pedido = 'Cancelado'
            db.commit()
        reintento_cancelado = self._post(
            f'/api/v1/pedidos/{cpid}/reintentar-pago',
            self._payload_tarjeta('aprobado')['pago'],
        )
        self.assertEqual(reintento_cancelado.status_code, 409, reintento_cancelado.text)
        with SessionLocal() as db:
            self.assertEqual(db.get(Pedido, cpid).estado_pedido, 'Cancelado')
            self.assertEqual(db.query(Pago).filter(Pago.id_pedido == cpid).one().estado, 'rechazado')
            self.assertEqual(db.query(Factura).filter(Factura.id_pedido == cpid).count(), 0)
            self.assertEqual(db.get(Producto, self.producto_id).stock_producto, Decimal('3.50'))

    def test_importes_desde_servidor_y_no_persistencia(self):
        self._tecnico('monto')
        r = self._post('/api/v1/pedidos', self._payload_tarjeta('rechazado'))
        pid = r.json()['pedido']['id_pedido']
        aprobado = self._post(
            f'/api/v1/pedidos/{pid}/reintentar-pago',
            self._payload_tarjeta('aprobado')['pago'],
        )
        self.assertEqual(aprobado.status_code, 200, aprobado.text)
        cuerpo = aprobado.json()
        self.assertEqual(cuerpo['pago']['monto'], 1500.0)
        self.assertEqual(cuerpo['pago']['ultimos_digitos'], '4242')
        self.assertNotIn('numero', cuerpo['pago'])
        self.assertNotIn('cvv', cuerpo['pago'])
        with SessionLocal() as db:
            pago = db.query(Pago).filter(Pago.id_pedido == pid).one()
            self.assertEqual(pago.monto, 1500.0)
            self.assertEqual(pago.ultimos_digitos, '4242')
            self.assertFalse(hasattr(pago, 'numero'))
            self.assertFalse(hasattr(pago, 'cvv'))

    def test_reintentos_concurrentes_no_duplican(self):
        self._tecnico('conc')
        r = self._post('/api/v1/pedidos', self._payload_tarjeta('rechazado'))
        pid = r.json()['pedido']['id_pedido']
        id_cliente = self.cliente.id_cliente
        datos = self._payload_tarjeta('aprobado')['pago']

        avisos = {'n': 0}

        def contar_aviso(*args, **kwargs):
            avisos['n'] += 1

        def reintentar(barrera):
            barrera.wait()
            db = SessionLocal()
            try:
                cliente = db.query(Cliente).filter(Cliente.id_cliente == id_cliente).first()
                resultado = _run(reintentar_pago_pedido(db, cliente, pid, 'tarjeta_debito', datos))
                return {
                    'estado': resultado['pago'].estado,
                    'id_pago': resultado['pago'].id_pago,
                    'id_factura': resultado['factura'].id_factura if resultado['factura'] else None,
                }
            finally:
                db.close()

        n = 2
        barrera = threading.Barrier(n)
        resultados = [None] * n
        with patch('app.services.notificaciones.notificar_pago_confirmado_cliente', side_effect=contar_aviso):
            hilos = [
                threading.Thread(target=lambda i=i: resultados.__setitem__(i, reintentar(barrera)))
                for i in range(n)
            ]
            for h in hilos:
                h.start()
            for h in hilos:
                h.join(timeout=30)

        self.assertTrue(all(r is not None for r in resultados))
        self.assertTrue(all(r['estado'] == 'aprobado' for r in resultados))
        self.assertEqual(len({r['id_pago'] for r in resultados}), 1)
        self.assertEqual(len({r['id_factura'] for r in resultados}), 1)
        with SessionLocal() as db:
            self.assertEqual(db.query(Pago).filter(Pago.id_pedido == pid).count(), 1)
            self.assertEqual(db.query(Factura).filter(Factura.id_pedido == pid).count(), 1)
            self.assertEqual(db.get(Producto, self.producto_id).stock_producto, Decimal('3.50'))
            self.assertTrue(db.get(Pedido, pid).confirmacion_completa)
        self.assertEqual(avisos['n'], 1)

    def test_reintento_fallo_antes_commit_revierte(self):
        self._tecnico('fb')
        r = self._post('/api/v1/pedidos', self._payload_tarjeta('rechazado'))
        pid = r.json()['pedido']['id_pedido']
        with SessionLocal() as db:
            original = db.query(Pago).filter(Pago.id_pedido == pid).one()
            pago_id = original.id_pago
            transaccion_original = original.numero_transaccion

        def factura_falla(db, pedido, pago, commit=True):
            raise OperationalError("INSERT factura", {}, Exception(1205, "timeout inyectado"))

        with patch('app.services.pedidos_service._crear_factura', side_effect=factura_falla):
            with self.assertRaises(OperationalError):
                _run(reintentar_pago_pedido(
                    self.db, self.cliente, pid, 'tarjeta_debito',
                    self._payload_tarjeta('aprobado')['pago'],
                ))

        self.db.rollback()
        with SessionLocal() as db:
            self.assertEqual(db.get(Pedido, pid).estado_pedido, 'Pago rechazado')
            pago = db.query(Pago).filter(Pago.id_pedido == pid).one()
            self.assertEqual(pago.estado, 'rechazado')
            self.assertEqual(pago.id_pago, pago_id)
            self.assertEqual(pago.numero_transaccion, transaccion_original)
            self.assertEqual(db.query(Factura).filter(Factura.id_pedido == pid).count(), 0)
            self.assertEqual(db.get(Producto, self.producto_id).stock_producto, Decimal('5.00'))

    def test_reintento_aviso_fallido_no_repite_finalizacion(self):
        self._tecnico('aviso')
        r = self._post('/api/v1/pedidos', self._payload_tarjeta('rechazado'))
        pid = r.json()['pedido']['id_pedido']

        envios = {'n': 0}

        async def enviar_falla(db, factura, pedido, cliente):
            envios['n'] += 1
            raise RuntimeError('fallo de envío de factura')

        with patch('app.services.pedidos_service._enviar_factura', new=enviar_falla):
            resp = self._post(
                f'/api/v1/pedidos/{pid}/reintentar-pago',
                self._payload_tarjeta('aprobado')['pago'],
            )
        self.assertEqual(resp.status_code, 200, resp.text)
        factura_id = resp.json()['factura']['id_factura']
        with SessionLocal() as db:
            self.assertEqual(db.query(Factura).filter(Factura.id_pedido == pid).count(), 1)
            self.assertEqual(db.get(Producto, self.producto_id).stock_producto, Decimal('3.50'))
            self.assertTrue(db.get(Pedido, pid).confirmacion_completa)
        self.assertEqual(envios['n'], 1)

        with patch('app.services.pedidos_service._enviar_factura', new=enviar_falla):
            resp2 = self._post(
                f'/api/v1/pedidos/{pid}/reintentar-pago',
                self._payload_tarjeta('aprobado')['pago'],
            )
        self.assertEqual(resp2.status_code, 200, resp2.text)
        self.assertEqual(resp2.json()['factura']['id_factura'], factura_id)
        self.assertEqual(envios['n'], 1)

    def test_checkout_directo_marca_completado_y_reintento_idempotente(self):
        self._tecnico('directo')
        aprobado = self._post('/api/v1/pedidos', self._payload_tarjeta('aprobado'))
        self.assertEqual(aprobado.status_code, 200, aprobado.text)
        pid = aprobado.json()['pedido']['id_pedido']
        factura_id = aprobado.json()['factura']['id_factura']
        with SessionLocal() as db:
            self.assertTrue(db.get(Pedido, pid).confirmacion_completa)

        reintento = self._post(
            f'/api/v1/pedidos/{pid}/reintentar-pago',
            self._payload_tarjeta('aprobado')['pago'],
        )
        self.assertEqual(reintento.status_code, 200, reintento.text)
        self.assertEqual(reintento.json()['factura']['id_factura'], factura_id)
        with SessionLocal() as db:
            self.assertEqual(db.query(Pago).filter(Pago.id_pedido == pid).count(), 1)
            self.assertEqual(db.query(Factura).filter(Factura.id_pedido == pid).count(), 1)
            self.assertEqual(db.get(Producto, self.producto_id).stock_producto, Decimal('3.50'))

    def test_reintento_historicos_ambiguos_null_en_conflicto(self):
        self._tecnico('hist')
        casos = {}
        with SessionLocal() as db:
            for etiqueta, con_factura in (('con_factura', True), ('sin_factura', False)):
                pedido = Pedido(
                    id_cliente_pe=self.cliente.id_cliente,
                    estado_pedido='Pagado',
                    total_pedido=1500.0,
                )
                db.add(pedido)
                db.flush()
                db.add(Pago(
                    id_pedido=pedido.id_pedido,
                    metodo_pago='tarjeta_debito',
                    estado='aprobado',
                    monto=1500.0,
                    ultimos_digitos='4242',
                ))
                if con_factura:
                    db.add(Factura(
                        id_pedido=pedido.id_pedido,
                        numero_factura=f'FH-{pedido.id_pedido}',
                        fecha_factura=datetime.now(),
                        monto_total=1500.0,
                        metodo_pago='tarjeta_debito',
                        estado_pago='aprobado',
                    ))
                db.commit()
                casos[etiqueta] = pedido.id_pedido
                self._ids_pedido.append(pedido.id_pedido)

        for etiqueta, pid in casos.items():
            with self.subTest(caso=etiqueta):
                resp = self._post(
                    f'/api/v1/pedidos/{pid}/reintentar-pago',
                    self._payload_tarjeta('aprobado')['pago'],
                )
                self.assertEqual(resp.status_code, 409, resp.text)
                with SessionLocal() as db:
                    self.assertIsNone(db.get(Pedido, pid).confirmacion_completa)
                    self.assertEqual(db.get(Producto, self.producto_id).stock_producto, Decimal('5.00'))

    def test_checkout_directo_rollback_antes_de_commit(self):
        self._tecnico('rollback')

        def factura_falla(db, pedido, pago, commit=True):
            raise RuntimeError('fallo inyectado en factura')

        with patch('app.services.pedidos_service._crear_factura', side_effect=factura_falla):
            with self.assertRaises(RuntimeError):
                _run(crear_pedido(
                    self.db,
                    self.cliente,
                    [{'id_producto': self.producto_id, 'cantidad': 1, 'metros': 1.5}],
                    [],
                    'tarjeta_debito',
                    self._payload_tarjeta('aprobado')['pago'],
                ))

        self.db.rollback()
        self._sin_compra()
