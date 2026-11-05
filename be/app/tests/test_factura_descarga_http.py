"""Descarga HTTP de la factura desde el perfil del cliente.

Usa la aplicación real y la base MySQL aislada de ``testdb``. El propietario
obtiene un PDF válido; otro cliente y una petición anónima quedan bloqueados.
"""
import asyncio
import time
import unittest
from datetime import datetime

import app.tests.testdb  # noqa: F401  (aislamiento antes de importar la app)

from httpx import ASGITransport, AsyncClient

from app.database import SessionLocal
from app.main import app
from app.models.cliente import Cliente
from app.models.factura import Factura
from app.models.pedido import DetallePedido, Pedido
from app.utils.security import hash_password

PASSWORD = "Secret123"


class FacturaDescargaHTTPTestCase(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        app.state.limiter.enabled = False

    def setUp(self):
        self.db = SessionLocal()
        self._ids_cliente = []
        self._ids_pedido = []
        self._crear_datos()

    def tearDown(self):
        for pid in self._ids_pedido:
            self.db.query(Factura).filter(Factura.id_pedido == pid).delete(synchronize_session=False)
            self.db.query(DetallePedido).filter(DetallePedido.id_pedido_d == pid).delete(synchronize_session=False)
            self.db.query(Pedido).filter(Pedido.id_pedido == pid).delete(synchronize_session=False)
        for cid in self._ids_cliente:
            self.db.query(Cliente).filter(Cliente.id_cliente == cid).delete(synchronize_session=False)
        self.db.commit()
        self.db.close()

    def _email(self, prefijo):
        return f"fac.{prefijo}.{int(time.time() * 1_000_000)}@neodomus.com"

    def _cliente(self, prefijo):
        cliente = Cliente(
            first_name="Cliente",
            last_name=prefijo,
            email=self._email(prefijo),
            password_hash=hash_password(PASSWORD),
            is_active=True,
            auth_provider="local",
        )
        self.db.add(cliente)
        self.db.commit()
        self.db.refresh(cliente)
        self._ids_cliente.append(cliente.id_cliente)
        return cliente

    def _crear_datos(self):
        self.owner = self._cliente("owner")
        self.otro = self._cliente("otro")

        pedido = Pedido(
            id_cliente_pe=self.owner.id_cliente,
            total_pedido=1500,
            estado_pedido="Pagado",
        )
        self.db.add(pedido)
        self.db.flush()
        self.db.add(DetallePedido(
            id_pedido_d=pedido.id_pedido,
            id_producto_d=None,
            cantidad_detalle=1,
            cantidad_metros=1.5,
            descripcion_detalle="Servicio de instalación de prueba",
            precio_unitario_detalle=1000,
            subtotal_detalle=1500,
        ))
        factura = Factura(
            id_pedido=pedido.id_pedido,
            numero_factura=f"FAC-TEST-{int(time.time() * 1_000_000)}",
            fecha_factura=datetime(2026, 10, 21, 10, 30),
            monto_total=1500,
            metodo_pago="punto_pago",
            estado_pago="aprobado",
            numero_transaccion="TEST-HTTP",
        )
        self.db.add(factura)
        self.db.commit()
        self.db.refresh(pedido)
        self._ids_pedido.append(pedido.id_pedido)
        self.pdf_url = f"/api/v1/pedidos/{pedido.id_pedido}/factura"

    def _request(self, method, url, token=None, **kwargs):
        async def run():
            headers = {"Authorization": f"Bearer {token}"} if token else {}
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as ac:
                return await ac.request(method, url, headers=headers, **kwargs)

        return asyncio.run(run())

    def _login(self, cliente):
        return self._request(
            "POST",
            "/api/v1/auth/login",
            json={"email": cliente.email, "password": PASSWORD},
        )

    def _token(self, cliente):
        response = self._login(cliente)
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()["access_token"]

    def test_propietario_descarga_pdf_valido_desde_el_perfil(self):
        token = self._token(self.owner)

        perfil = self._request("GET", "/api/v1/pedidos/mis-pedidos", token)
        self.assertEqual(perfil.status_code, 200, perfil.text)
        fila = next(
            p for p in perfil.json()
            if p["id_pedido"] == self._ids_pedido[0]
        )
        self.assertIsNotNone(fila["factura"])
        self.assertEqual(fila["factura"]["pdf_url"], self.pdf_url)

        descarga = self._request("GET", fila["factura"]["pdf_url"], token)
        self.assertEqual(descarga.status_code, 200, descarga.text)
        self.assertEqual(descarga.headers["content-type"], "application/pdf")
        self.assertIn("attachment", descarga.headers["content-disposition"])
        self.assertTrue(descarga.content.startswith(b"%PDF-"))
        self.assertIn(b"%%EOF", descarga.content)
        self.assertGreater(len(descarga.content), 1000)

    def test_otro_cliente_no_accede_a_la_factura(self):
        token_otro = self._token(self.otro)
        response = self._request("GET", self.pdf_url, token_otro)
        self.assertEqual(response.status_code, 404, response.text)
        self.assertFalse(response.content.startswith(b"%PDF-"))

    def test_peticion_anonima_rechazada(self):
        response = self._request("GET", self.pdf_url)
        self.assertEqual(response.status_code, 401, response.text)
        self.assertFalse(response.content.startswith(b"%PDF-"))


if __name__ == "__main__":
    unittest.main()
