"""Contrato HTTP del checkout por metros, con MySQL dedicado vía testdb.

Ejecuta autenticación, esquemas, router y servicios reales. Solo se anulan
avisos externos; el simulador de punto de pago sigue siendo el del producto.
"""
from decimal import Decimal
from unittest.mock import patch

import app.tests.testdb  # noqa: F401
from httpx import ASGITransport, AsyncClient

from app.main import app
from app.database import SessionLocal
from app.models.pedido import Pedido, DetallePedido
from app.models.producto import Producto
from app.models.factura import Factura
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

    def test_checkout_anonimo_rechazado_sin_efectos(self):
        response = self._post('/api/v1/pedidos', self._payload(1.5), autenticado=False)
        self.assertEqual(response.status_code, 401, response.text)
        self._sin_compra()
