"""Pruebas del contrato real de registro de clientes (auth).

Aislamiento:
- Importa ``app.tests.testdb`` ANTES de importar la aplicación: sustituye la
  sesión por la base de pruebas (TEST_DATABASE_URL) y anula el transporte SMTP.
- Usa el cliente HTTP compatible con FastAPI (httpx/ASGITransport) contra la
  aplicación real, para ejercer el enrutado ``/api/v1`` y la validación Pydantic
  (esquema y reglas de contraseña), sin tocar el contrato de producción.
"""
import asyncio
import time
import unittest
from unittest.mock import patch

import app.tests.testdb  # noqa: F401  (aislamiento antes de importar la app)

from httpx import ASGITransport, AsyncClient

from app.main import app
from app.database import SessionLocal
from app.models.cliente import Cliente
from app.models.pending_registration import PendingRegistration


class RegistroClienteTestCase(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        # El rate limiter (slowapi) no aporta al contrato de registro y, con un
        # único "cliente" de test, haría fallar pruebas repetidas (429). Se
        # desactiva únicamente para las pruebas de auth.
        app.state.limiter.enabled = False

    @staticmethod
    def _email_unico():
        # Dominio no reservado: email-validator (EmailStr) rechaza TLD
        # especiales (.test/.local/.example), por eso se usa un dominio real.
        return f"auth.{int(time.time() * 1_000_000)}@neodomus.com"

    def setUp(self):
        self.email = self._email_unico()

    def tearDown(self):
        db = SessionLocal()
        try:
            db.query(PendingRegistration).filter(
                PendingRegistration.email == self.email
            ).delete(synchronize_session=False)
            db.query(Cliente).filter(Cliente.email == self.email).delete(synchronize_session=False)
            db.commit()
        finally:
            db.close()

    def _post(self, payload):
        async def _run():
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as ac:
                return await ac.post("/api/v1/auth/register/client", json=payload)

        return asyncio.run(_run())

    def _payload(self, **overrides):
        data = {
            "first_name": "Test",
            "last_name": "User",
            "email": self.email,
            "password": "Secret123",
            "id_tipo_documento_c": 1,
            "documento_cliente": 123456789,
            "telefono_cliente": 3001234567,
            "address": "Calle Falsa 123",
        }
        data.update(overrides)
        return data

    def test_registro_valido_crea_pendiente_y_envia_correo(self):
        enviados = []

        async def _envio_simulado(to_email, code):
            enviados.append((to_email, code))

        with patch("app.services.auth_service.send_verification_email", new=_envio_simulado):
            resp = self._post(self._payload())

        self.assertEqual(resp.status_code, 200, resp.text)
        self.assertIn("msg", resp.json())

        db = SessionLocal()
        try:
            pend = db.query(PendingRegistration).filter(PendingRegistration.email == self.email).first()
            self.assertIsNotNone(pend)
        finally:
            db.close()

        # El transporte de correo se sustituyó y se cuenta su invocación.
        self.assertEqual(len(enviados), 1)
        self.assertEqual(enviados[0][0], self.email)

    def test_registro_password_debil_rechazado(self):
        resp = self._post(self._payload(password="secret"))
        self.assertEqual(resp.status_code, 422, resp.text)

    def test_registro_esquema_antiguo_rechazado(self):
        # El contrato exige first_name/last_name/email/password: los campos
        # antiguos (nombre/apellido/documento/telefono/direccion) no existen.
        resp = self._post({
            "nombre": "Test",
            "apellido": "User",
            "tipo_documento_id": 1,
            "documento": 123456789,
            "telefono": 3001234567,
            "email": self.email,
            "direccion": "Calle Falsa 123",
            "password": "Secret123",
        })
        self.assertEqual(resp.status_code, 422, resp.text)


if __name__ == "__main__":
    unittest.main(verbosity=2)
