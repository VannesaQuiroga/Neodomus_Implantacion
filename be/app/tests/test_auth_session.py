"""Contrato HTTP de restauración de sesión; MySQL dedicado vía testdb."""
import app.tests.testdb  # noqa: F401

from app.tests.test_t1_identidad import BaseT1TestCase
from app.utils.security import (
    ACCESS_COOKIE_NAME, create_access_token, create_refresh_token,
)


class SessionActualTestCase(BaseT1TestCase):
    def _access(self, cliente):
        return create_access_token(
            {"sub": cliente.email}, user_type="client", rol="cliente",
            user_id=cliente.id_cliente,
        )

    def test_bearer_sin_cookie_restaura_cliente(self):
        cliente = self._crear_cliente("session")
        response = self._get("/api/v1/auth/session", headers=self._bearer(self._access(cliente)))
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json(), {
            "user_type": "client", "rol": "cliente", "uid": str(cliente.id_cliente),
        })

    def test_cookie_access_sigue_funcionando(self):
        cliente = self._crear_cliente("cookie")
        response = self._get("/api/v1/auth/session", headers={
            "Cookie": f"{ACCESS_COOKIE_NAME}={self._access(cliente)}",
        })
        self.assertEqual(response.status_code, 200, response.text)

    def test_header_prevalece_sobre_cookie_de_otra_cuenta(self):
        a = self._crear_cliente("header")
        b = self._crear_cliente("cookie")
        headers = self._bearer(self._access(a))
        headers["Cookie"] = f"{ACCESS_COOKIE_NAME}={self._access(b)}"
        response = self._get("/api/v1/auth/session", headers=headers)
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["uid"], str(a.id_cliente))

    def test_refresh_no_restaura_sesion_por_cookie_ni_header(self):
        cliente = self._crear_cliente("refresh")
        token = create_refresh_token({"sub": cliente.email}, user_type="client",
                                     rol="cliente", user_id=cliente.id_cliente)
        for headers in (self._bearer(token), {"Cookie": f"{ACCESS_COOKIE_NAME}={token}"}):
            with self.subTest(transport="header" if "Authorization" in headers else "cookie"):
                self.assertEqual(self._get("/api/v1/auth/session", headers=headers).status_code, 401)

    def test_cuenta_desactivada_no_restaura_sesion(self):
        cliente = self._crear_cliente("inactive")
        token = self._access(cliente)
        cliente.is_active = False
        self.db.commit()
        response = self._get("/api/v1/auth/session", headers={"Cookie": f"{ACCESS_COOKIE_NAME}={token}"})
        self.assertEqual(response.status_code, 401)

    def test_header_invalido_no_cae_a_cookie_valida(self):
        cliente = self._crear_cliente("invalid")
        headers = self._bearer("invalido")
        headers["Cookie"] = f"{ACCESS_COOKIE_NAME}={self._access(cliente)}"
        self.assertEqual(self._get("/api/v1/auth/session", headers=headers).status_code, 401)

    def test_sin_credenciales_rechazado(self):
        self.assertEqual(self._get("/api/v1/auth/session").status_code, 401)

    def test_rol_empleado_se_lee_de_bd(self):
        usuario = self._crear_admin("sessionrole")
        token = create_access_token({"sub": usuario.email}, user_type="employee",
                                    rol="tecnico", user_id=usuario.id_usuario)
        response = self._get("/api/v1/auth/session", headers=self._bearer(token))
        self.assertEqual(response.status_code, 200, response.text)
        from app.models.roles_usuario import RolesUsuario
        rol = self.db.get(RolesUsuario, usuario.id_rol_u).nombre_rol
        self.assertEqual(response.json()["rol"], rol)
