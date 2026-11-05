"""T1.1: verificación de correo, recuperación de contraseña y tipos de token.

Pruebas HTTP reales contra la aplicación de pruebas. Reutiliza las fixtures y
helpers de test_t1_identidad. Controla el tiempo manipulando expires_at en la
BD (sin pausas reales) y neutraliza el transporte de correo (testdb).
"""
import unittest
from datetime import datetime, timedelta
from unittest.mock import patch

from jose import jwt as jose_jwt

import app.tests.testdb  # noqa: F401

from app.database import SessionLocal
from app.models.cliente import Cliente
from app.models.password_reset_token import PasswordResetToken
from app.models.pending_registration import PendingRegistration
from app.models.user import User
from app.tests.test_t1_identidad import PASSWORD, BaseT1TestCase
from app.utils.security import ALGORITHM, SECRET_KEY


async def _async_noop(*a, **k):
    return None


class VerificacionCorreoTestCase(BaseT1TestCase):
    def _register(self, email, password=PASSWORD):
        with patch("app.services.auth_service.send_verification_email", new=lambda *a, **k: None):
            r = self._post("/api/v1/auth/register/client", json={
                "first_name": "Nuevo", "last_name": "Cliente", "email": email, "password": password,
            })
        return r

    def _codigo_pendiente(self, email):
        self._resincronizar()
        p = self.db.query(PendingRegistration).filter(PendingRegistration.email == email).first()
        return p.code if p else None

    def _verify(self, code):
        return self._post("/api/v1/auth/verify-email", params={"code": code})

    def test_verificacion_valida_crea_cliente(self):
        email = self._email("t11.ver")
        self._emails_pending.append(email)
        self.assertEqual(self._register(email).status_code, 200)
        code = self._codigo_pendiente(email)
        self.assertIsNotNone(code)
        r = self._verify(code)
        self.assertEqual(r.status_code, 200, r.text)
        self._resincronizar()
        self.assertIsNotNone(self.db.query(Cliente).filter(Cliente.email == email).first())
        self.assertIsNone(self.db.query(PendingRegistration).filter(PendingRegistration.email == email).first())

    def test_verificacion_codigo_invalido_400(self):
        email = self._email("t11.ver")
        self._emails_pending.append(email)
        self._register(email)
        r = self._verify("000000")
        self.assertEqual(r.status_code, 400, r.text)

    def test_verificacion_codigo_consumido_400(self):
        email = self._email("t11.ver")
        self._emails_pending.append(email)
        self._register(email)
        code = self._codigo_pendiente(email)
        self.assertEqual(self._verify(code).status_code, 200)
        # El pendiente ya fue consumido → el código no sirve de nuevo.
        self.assertEqual(self._verify(code).status_code, 400)

    def test_verificacion_codigo_expirado_400(self):
        email = self._email("t11.ver")
        self._emails_pending.append(email)
        self._register(email)
        p = self.db.query(PendingRegistration).filter(PendingRegistration.email == email).first()
        p.expires_at = datetime.utcnow() - timedelta(hours=1)
        self.db.commit()
        self.assertEqual(self._verify(p.code).status_code, 400)

    def test_reenvio_invalida_codigo_anterior(self):
        email = self._email("t11.ver")
        self._emails_pending.append(email)
        self._register(email)
        code_viejo = self._codigo_pendiente(email)
        with patch("app.services.auth_service.send_verification_email", new=_async_noop):
            r = self._post("/api/v1/auth/resend-verification", json={"email": email})
        self.assertEqual(r.status_code, 200, r.text)
        self._resincronizar()
        code_nuevo = self._codigo_pendiente(email)
        self.assertNotEqual(code_viejo, code_nuevo)
        # El código anterior ya no verifica.
        self.assertEqual(self._verify(code_viejo).status_code, 400)
        self.assertEqual(self._verify(code_nuevo).status_code, 200)


class RecuperacionPasswordTestCase(BaseT1TestCase):
    def _forgot(self, email):
        return self._post("/api/v1/auth/forgot-password", json={"email": email})

    def _codigo_reset(self, email):
        self._resincronizar()
        t = self.db.query(PasswordResetToken).filter(PasswordResetToken.email == email).order_by(PasswordResetToken.id.desc()).first()
        return t.code if t else None

    def test_recuperacion_cambio_password_efectivo(self):
        c = self._crear_cliente("rec")
        self.assertEqual(self._forgot(c.email).status_code, 200)
        code = self._codigo_reset(c.email)
        self.assertIsNotNone(code)
        self.assertEqual(self._post("/api/v1/auth/verify-code", json={"email": c.email, "code": code}).status_code, 200)
        nueva = "NuevaPass123"
        r = self._post("/api/v1/auth/reset-password", json={"token": code, "new_password": nueva})
        self.assertEqual(r.status_code, 200, r.text)
        # La nueva funciona; la anterior deja de funcionar.
        self.assertEqual(self._login(c.email, nueva).status_code, 200)
        self.assertEqual(self._login(c.email, PASSWORD).status_code, 401)

    def test_recuperacion_codigo_reutilizado_400(self):
        c = self._crear_cliente("rec2")
        self._forgot(c.email)
        code = self._codigo_reset(c.email)
        self.assertEqual(self._post("/api/v1/auth/reset-password", json={"token": code, "new_password": "NuevaPass123"}).status_code, 200)
        # Reutilización del mismo enlace → no permite otro cambio.
        r = self._post("/api/v1/auth/reset-password", json={"token": code, "new_password": "OtraPass123"})
        self.assertEqual(r.status_code, 400, r.text)

    def test_recuperacion_codigo_expirado_400(self):
        c = self._crear_cliente("rec3")
        self._forgot(c.email)
        self._resincronizar()
        t = self.db.query(PasswordResetToken).filter(PasswordResetToken.email == c.email).first()
        t.expires_at = datetime.utcnow() - timedelta(minutes=1)
        self.db.commit()
        r = self._post("/api/v1/auth/reset-password", json={"token": t.code, "new_password": "NuevaPass123"})
        self.assertEqual(r.status_code, 400, r.text)

    def test_recuperacion_email_inexistente_no_revela(self):
        c = self._crear_cliente("rec4")
        inexistente = self._email("t11.nope")
        r_existente = self._forgot(c.email)
        r_inexistente = self._forgot(inexistente)
        self.assertEqual(r_existente.status_code, 200)
        self.assertEqual(r_inexistente.status_code, 200)
        self.assertEqual(r_existente.json(), r_inexistente.json())

    def test_codigo_de_otro_proposito_no_sirve(self):
        # Un código de VERIFICACIÓN no sirve para resetear contraseña.
        email = self._email("t11.cross")
        self._emails_pending.append(email)
        with patch("app.services.auth_service.send_verification_email", new=lambda *a, **k: None):
            self._post("/api/v1/auth/register/client", json={
                "first_name": "Nuevo", "last_name": "Cliente", "email": email, "password": PASSWORD,
            })
        code_verif = self.db.query(PendingRegistration).filter(PendingRegistration.email == email).first().code
        r = self._post("/api/v1/auth/reset-password", json={"token": code_verif, "new_password": "NuevaPass123"})
        self.assertEqual(r.status_code, 400, r.text)


class TiposTokenYHashTestCase(BaseT1TestCase):
    def test_hash_invalido_rechaza_login(self):
        c = self._crear_cliente("badhash")
        c.password_hash = "no_es_un_hash_bcrypt"
        self.db.commit()
        self.assertEqual(self._login(c.email, PASSWORD).status_code, 401)

    def _jwt(self, claims):
        return jose_jwt.encode(claims, SECRET_KEY, algorithm=ALGORITHM)

    def test_token_sin_type_rechazado(self):
        c = self._crear_cliente("notype")
        token = self._jwt({"sub": c.email, "user_type": "client", "uid": str(c.id_cliente),
                           "exp": datetime.utcnow() + timedelta(minutes=5)})
        r = self._get("/api/v1/notificaciones/mias", headers=self._bearer(token))
        self.assertEqual(r.status_code, 401, r.text)

    def test_token_tipo_desconocido_rechazado(self):
        c = self._crear_cliente("weirdtype")
        token = self._jwt({"sub": c.email, "user_type": "client", "uid": str(c.id_cliente),
                           "type": "weird", "exp": datetime.utcnow() + timedelta(minutes=5)})
        r = self._get("/api/v1/notificaciones/mias", headers=self._bearer(token))
        self.assertEqual(r.status_code, 401, r.text)

    def test_access_y_refresh_legitimos_siguen_funcionando(self):
        c = self._crear_cliente("oktype")
        login = self._login(c.email)
        access = self._token(login, "access_token")
        refresh = self._token(login, "refresh_token")
        self.assertEqual(self._get("/api/v1/notificaciones/mias", headers=self._bearer(access)).status_code, 200)
        r = self._post("/api/v1/auth/refresh", json={"refresh_token": refresh})
        self.assertEqual(r.status_code, 200, r.text)
        self.assertIn("access_token", r.json())

    def test_sesion_existente_no_se_revoca_al_cambiar_password(self):
        c = self._crear_cliente("ses")
        login = self._login(c.email)
        access = self._token(login, "access_token")
        self._forgot(c.email)
        code = self._codigo_reset(c.email)
        self._post("/api/v1/auth/reset-password", json={"token": code, "new_password": "NuevaPass123"})
        # Contrato: los JWT son sin estado; cambiar la contraseña NO revoca
        # sesiones previas (no hay revocación en servidor).
        self.assertEqual(self._get("/api/v1/notificaciones/mias", headers=self._bearer(access)).status_code, 200)

    def _forgot(self, email):
        return self._post("/api/v1/auth/forgot-password", json={"email": email})

    def _codigo_reset(self, email):
        self._resincronizar()
        t = self.db.query(PasswordResetToken).filter(PasswordResetToken.email == email).order_by(PasswordResetToken.id.desc()).first()
        return t.code if t else None


if __name__ == "__main__":
    unittest.main(verbosity=2)
