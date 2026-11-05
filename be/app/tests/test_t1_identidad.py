"""T1: autenticación, autorización y propiedad de datos (pruebas HTTP reales).

Usa el cliente ASGI (httpx) contra la aplicación real y la base de pruebas
aislada (testdb). Crea fixtures propios (2 clientes, 2 técnicos, 1 admin) y
ejercita los flujos por HTTP. No imprime contraseñas ni tokens.
"""
import asyncio
import time
import unittest
from datetime import date, datetime, timedelta
from unittest.mock import patch

from jose import jwt as jose_jwt

import app.tests.testdb  # noqa: F401  (aislamiento antes de importar la app)

from httpx import ASGITransport, AsyncClient

from app.main import app
from app.database import SessionLocal
from app.models.cita import Cita
from app.models.cliente import Cliente
from app.models.pedido import Pedido
from app.models.pending_registration import PendingRegistration
from app.models.tecnico import Tecnico
from app.models.user import User
from app.utils.security import ALGORITHM, SECRET_KEY, hash_password

PASSWORD = "Secret123"


class BaseT1TestCase(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        app.state.limiter.enabled = False

    def setUp(self):
        self.db = SessionLocal()
        self._ids_cliente = []
        self._ids_usuario = []
        self._ids_pedido = []
        self._ids_cita = []
        self._ids_devolucion = []
        self._emails_pending = []

    def tearDown(self):
        from app.models.devolucion import Devolucion
        from app.models.factura import Factura
        from app.models.notificacion import Notificacion

        for did in self._ids_devolucion:
            self.db.query(Devolucion).filter(Devolucion.id_devolucion == did).delete(synchronize_session=False)
        for pid in self._ids_pedido:
            self.db.query(Factura).filter(Factura.id_pedido == pid).delete(synchronize_session=False)
            self.db.query(Pedido).filter(Pedido.id_pedido == pid).delete(synchronize_session=False)
        for cid in self._ids_cita:
            self.db.query(Cita).filter(Cita.id_cita == cid).delete(synchronize_session=False)
        for cid in self._ids_cliente:
            self.db.query(Notificacion).filter(Notificacion.id_cliente == cid).delete(synchronize_session=False)
            self.db.query(Cliente).filter(Cliente.id_cliente == cid).delete(synchronize_session=False)
        for uid in self._ids_usuario:
            self.db.query(Notificacion).filter(Notificacion.id_usuario == uid).delete(synchronize_session=False)
            self.db.query(Tecnico).filter(Tecnico.id_usuario_t == uid).delete(synchronize_session=False)
            self.db.query(User).filter(User.id_usuario == uid).delete(synchronize_session=False)
        for em in self._emails_pending:
            self.db.query(Cliente).filter(Cliente.email == em).delete(synchronize_session=False)
            self.db.query(PendingRegistration).filter(PendingRegistration.email == em).delete(synchronize_session=False)
        self.db.commit()
        self.db.close()

    # ── HTTP helpers ────────────────────────────────────────────────────────
    def _request(self, method, url, **kw):
        async def run():
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as ac:
                return await ac.request(method, url, **kw)
        return asyncio.run(run())

    def _get(self, url, **kw):
        return self._request("GET", url, **kw)

    def _post(self, url, **kw):
        return self._request("POST", url, **kw)

    def _put(self, url, **kw):
        return self._request("PUT", url, **kw)

    def _delete(self, url, **kw):
        return self._request("DELETE", url, **kw)

    # ── Fixtures ────────────────────────────────────────────────────────────
    def _email(self, prefijo):
        return f"{prefijo}.{int(time.time() * 1_000_000)}@neodomus.com"

    def _crear_cliente(self, sufijo, activo=True):
        c = Cliente(
            first_name="Cliente", last_name=sufijo, email=self._email(f"t1.cli.{sufijo}"),
            password_hash=hash_password(PASSWORD), is_active=activo, auth_provider="local",
        )
        self.db.add(c)
        self.db.commit()
        self.db.refresh(c)
        self._ids_cliente.append(c.id_cliente)
        return c

    def _resincronizar(self):
        """Termina la transacción de la sesión de test para ver los commits
        hechos por otras sesiones (HTTP corre en sesiones independientes bajo
        REPEATABLE READ)."""
        self.db.expire_all()
        self.db.rollback()

    def _crear_usuario(self, sufijo, id_rol, activo=True):
        u = User(
            first_name="Usuario", last_name=sufijo, email=self._email(f"t1.usu.{sufijo}"),
            password_hash=hash_password(PASSWORD), id_rol_u=id_rol, is_active=activo,
        )
        self.db.add(u)
        self.db.flush()
        self._ids_usuario.append(u.id_usuario)
        return u

    def _crear_tecnico(self, sufijo):
        u = self._crear_usuario(sufijo, 2)
        t = Tecnico(id_usuario_t=u.id_usuario, certificacion_t="")
        self.db.add(t)
        self.db.commit()
        self.db.refresh(u)
        return u, t

    def _crear_admin(self, sufijo="admin"):
        u = self._crear_usuario(sufijo, 1)
        self.db.commit()
        self.db.refresh(u)
        return u

    def _login(self, email, password=PASSWORD):
        return self._post("/api/v1/auth/login", json={"email": email, "password": password})

    def _token(self, resp, campo="access_token"):
        return resp.json()[campo]

    def _bearer(self, token):
        return {"Authorization": f"Bearer {token}"}


class AutenticacionTestCase(BaseT1TestCase):
    def test_login_correcto_emite_ambos_tokens(self):
        c = self._crear_cliente("a")
        r = self._login(c.email)
        self.assertEqual(r.status_code, 200, r.text)
        body = r.json()
        self.assertIn("access_token", body)
        self.assertIn("refresh_token", body)
        self.assertEqual(body["user_type"], "client")

    def test_login_password_incorrecto_rechazado(self):
        c = self._crear_cliente("a")
        r = self._login(c.email, password="WrongPass123")
        self.assertEqual(r.status_code, 401, r.text)

    def test_login_tecnico_y_admin(self):
        u, _t = self._crear_tecnico("t")
        a = self._crear_admin()
        rt = self._login(u.email)
        ra = self._login(a.email)
        self.assertEqual(rt.status_code, 200)
        self.assertEqual(rt.json()["user_type"], "employee")
        self.assertEqual(ra.status_code, 200)
        self.assertEqual(ra.json()["user_type"], "employee")

    def test_register_no_escala_rol(self):
        email = self._email("t1.reg")
        self._emails_pending.append(email)
        payload = {
            "first_name": "Nuevo", "last_name": "Cliente", "email": email,
            "password": PASSWORD, "id_rol_u": 1, "user_type": "employee",
            "is_active": True, "id_rol": 1,
        }
        with patch("app.services.auth_service.send_verification_email", new=lambda *a, **k: None):
            r = self._post("/api/v1/auth/register/client", json=payload)
        self.assertEqual(r.status_code, 200, r.text)
        # Solo se crea un registro pendiente (cliente); nunca un usuario con rol.
        self.assertIsNone(self.db.query(User).filter(User.email == email).first())
        pend = self.db.query(PendingRegistration).filter(PendingRegistration.email == email).first()
        self.assertIsNotNone(pend)

    def test_register_password_debil_422(self):
        email = self._email("t1.reg")
        r = self._post("/api/v1/auth/register/client", json={
            "first_name": "Nuevo", "last_name": "Cliente", "email": email, "password": "débil",
        })
        self.assertEqual(r.status_code, 422, r.text)

    def test_register_email_verificado_duplicado_400(self):
        c = self._crear_cliente("dup")
        email = self._email("t1.regdup")
        payload = {
            "first_name": "Nuevo", "last_name": "Cliente", "email": c.email,
            "password": PASSWORD,
        }
        with patch("app.services.auth_service.send_verification_email", new=lambda *a, **k: None):
            r = self._post("/api/v1/auth/register/client", json=payload)
        # El correo ya pertenece a un cliente verificado → 400.
        self.assertEqual(r.status_code, 400, r.text)

    def test_token_ausente_401(self):
        r = self._get("/api/v1/notificaciones/mias")
        self.assertEqual(r.status_code, 401)

    def test_token_malformado_401(self):
        r = self._get("/api/v1/notificaciones/mias", headers=self._bearer("no.es.un.jwt"))
        self.assertEqual(r.status_code, 401)

    def test_token_expirado_401(self):
        c = self._crear_cliente("exp")
        expirado = jose_jwt.encode(
            {"sub": c.email, "user_type": "client", "uid": str(c.id_cliente),
             "type": "access", "exp": datetime.utcnow() - timedelta(minutes=5)},
            SECRET_KEY, algorithm=ALGORITHM,
        )
        r = self._get("/api/v1/notificaciones/mias", headers=self._bearer(expirado))
        self.assertEqual(r.status_code, 401)

    def test_refresh_token_no_sirve_como_access(self):
        c = self._crear_cliente("mix")
        login = self._login(c.email)
        refresh = self._token(login, "refresh_token")
        r = self._get("/api/v1/notificaciones/mias", headers=self._bearer(refresh))
        self.assertEqual(r.status_code, 401, r.text)

    def test_access_token_no_sirve_como_refresh(self):
        c = self._crear_cliente("mix2")
        login = self._login(c.email)
        access = self._token(login, "access_token")
        r = self._post("/api/v1/auth/refresh", json={"refresh_token": access})
        self.assertEqual(r.status_code, 401, r.text)

    def test_cliente_desactivado_login_403(self):
        c = self._crear_cliente("off")
        c.is_active = False
        self.db.commit()
        r = self._login(c.email)
        self.assertEqual(r.status_code, 403, r.text)

    def test_cliente_desactivado_sesion_previa_401(self):
        c = self._crear_cliente("off2")
        login = self._login(c.email)
        access = self._token(login, "access_token")
        c.is_active = False
        self.db.commit()
        r = self._get("/api/v1/notificaciones/mias", headers=self._bearer(access))
        self.assertEqual(r.status_code, 401, r.text)


class AutorizacionPropiedadTestCase(BaseT1TestCase):
    def _pedido_de(self, cliente):
        p = Pedido(id_cliente_pe=cliente.id_cliente, estado_pedido="Pagado",
                   estado_entrega="Asignada", total_pedido=100)
        self.db.add(p)
        self.db.commit()
        self.db.refresh(p)
        self._ids_pedido.append(p.id_pedido)
        return p

    def _cita_de(self, cliente):
        c = Cita(id_cliente=cliente.id_cliente, tipo_servicio="mantenimiento",
                 fecha=date.today() + timedelta(days=5), hora="08:00",
                 direccion="X", estado="Confirmada")
        self.db.add(c)
        self.db.commit()
        self.db.refresh(c)
        self._ids_cita.append(c.id_cita)
        return c

    def test_cliente_no_lee_pedido_ajeno(self):
        c1 = self._crear_cliente("a")
        c2 = self._crear_cliente("b")
        p = self._pedido_de(c1)
        token = self._token(self._login(c2.email))
        r = self._get(f"/api/v1/pedidos/{p.id_pedido}", headers=self._bearer(token))
        self.assertEqual(r.status_code, 404, r.text)

    def test_cliente_no_descarga_factura_ajena(self):
        c1 = self._crear_cliente("a")
        c2 = self._crear_cliente("b")
        p = self._pedido_de(c1)
        token = self._token(self._login(c2.email))
        r = self._get(f"/api/v1/pedidos/{p.id_pedido}/factura", headers=self._bearer(token))
        self.assertEqual(r.status_code, 404, r.text)

    def test_cliente_no_ve_cita_ajena_en_listado(self):
        c1 = self._crear_cliente("a")
        c2 = self._crear_cliente("b")
        cita = self._cita_de(c1)
        token = self._token(self._login(c2.email))
        r = self._get("/api/v1/citas/mis-citas", headers=self._bearer(token))
        self.assertEqual(r.status_code, 200)
        ids = [x["id_cita"] for x in r.json()]
        self.assertNotIn(cita.id_cita, ids)

    def test_cliente_no_cancela_cita_ajena(self):
        c1 = self._crear_cliente("a")
        c2 = self._crear_cliente("b")
        cita = self._cita_de(c1)
        token = self._token(self._login(c2.email))
        r = self._delete(f"/api/v1/citas/{cita.id_cita}", headers=self._bearer(token))
        self.assertEqual(r.status_code, 404, r.text)
        self.db.expire_all()
        self.assertEqual(self.db.query(Cita).filter(Cita.id_cita == cita.id_cita).first().estado, "Confirmada")

    def test_cliente_no_accede_listado_admin(self):
        c = self._crear_cliente("a")
        token = self._token(self._login(c.email))
        r = self._get("/api/v1/clients", headers=self._bearer(token))
        self.assertIn(r.status_code, (401, 403), r.text)

    def test_tecnico_no_accede_admin(self):
        u, _t = self._crear_tecnico("t")
        token = self._token(self._login(u.email))
        r = self._get("/api/v1/clients", headers=self._bearer(token))
        self.assertEqual(r.status_code, 403, r.text)

    def test_tecnico_no_edita_usuarios_ni_roles(self):
        u, _t = self._crear_tecnico("t")
        otro = self._crear_usuario("otro", 2)
        self.db.commit()
        token = self._token(self._login(u.email))
        # No puede editar a otro empleado (admin-only).
        r = self._put(f"/api/v1/users/{otro.id_usuario}",
                      json={"first_name": "HACK", "id_rol": 1}, headers=self._bearer(token))
        self.assertEqual(r.status_code, 403, r.text)
        self.db.expire_all()
        self.assertNotEqual(self.db.query(User).filter(User.id_usuario == otro.id_usuario).first().first_name, "HACK")

    def test_cliente_no_puede_reactivarse(self):
        c = self._crear_cliente("react")
        token = self._token(self._login(c.email))
        # is_active no es editable desde el perfil del cliente (campo protegido).
        r = self._put("/api/v1/clients/me", json={"is_active": True}, headers=self._bearer(token))
        # El campo se ignora (no está en ClientUpdate); el estado no cambia a través de él.
        self.assertEqual(r.status_code, 200, r.text)
        self.db.expire_all()
        self.assertTrue(self.db.query(Cliente).filter(Cliente.id_cliente == c.id_cliente).first().is_active)


if __name__ == "__main__":
    unittest.main(verbosity=2)
