"""Grupo A (login) del complemento de pruebas para ``auth_service``.

Complementa SIN duplicar a los tests HTTP existentes:
- ``test_t1_identidad`` cubre login correcto/incorrecto por la ruta
  automática (sin ``user_type``), cliente inactivo y separación de tokens.
- ``test_auth`` / ``test_t1_1_cuentas`` cubren registro, verificación y
  recuperación de contraseña del cliente.

Este módulo ejercita las ramas sin cobertura actual del servicio:
rutas explícitas ``user_type`` y reglas de EMPLEADO (credenciales
incorrectas, cuenta inactiva, rol no permitido), además de la emisión del
``TokenResponse`` con sus claims verificados.

Seguridad cubierta aquí: el login con credenciales incorrectas o correo
inexistente NO produce tokens (la función lanza ``HTTPException`` antes de
construirlos); se comprueba el código y el mensaje exactos.

Aislamiento: ``app.tests.testdb`` se importa ANTES que la aplicación
(MySQL de pruebas exclusivo y transporte de correo neutralizado). Cada
prueba crea sus propios usuarios y los elimina en ``tearDown``.

Corrida: ``python -m unittest app.tests.test_auth_service_complemento``
"""

import unittest
from uuid import uuid4

import app.tests.testdb  # noqa: F401  (configura la base de pruebas y bloquea si falta)

from fastapi import HTTPException

from app.database import SessionLocal
from app.models.cliente import Cliente
from app.models.roles_usuario import RolesUsuario
from app.models.user import User
from app.schemas.auth import UserLogin
from app.services.auth_service import login
from app.utils.security import decode_token, hash_password
from sqlalchemy import select


def _email_unico(prefijo: str) -> str:
    # Dominio del proyecto con sufijo de prueba (NO es un dominio reservado
    # IANA como .local/.test, que ``EmailStr`` de pydantic rechaza).
    return f"grp-a.{prefijo}.{uuid4().hex[:10]}@test.neodomus.com"


class LoginGrupoATestCase(unittest.TestCase):
    """Ramas de login sin cobertura: rutas explícitas y reglas de empleado."""

    def setUp(self):
        self.db = SessionLocal()
        self._usuarios: list[User] = []
        self._clientes: list[Cliente] = []

    def tearDown(self):
        try:
            for u in self._usuarios:
                if u.id_usuario:
                    self.db.query(User).filter(User.id_usuario == u.id_usuario).delete(synchronize_session=False)
            for c in self._clientes:
                if c.id_cliente:
                    self.db.query(Cliente).filter(Cliente.id_cliente == c.id_cliente).delete(synchronize_session=False)
            self.db.commit()
        finally:
            self.db.close()

    def _rol_id(self, nombre: str) -> int:
        return self.db.execute(
            select(RolesUsuario).where(RolesUsuario.nombre_rol == nombre)
        ).scalar_one().id_rol

    def _empleado(self, password: str, id_rol_u=None, is_active: bool = True) -> User:
        email = _email_unico("empleado")
        user = User(
            first_name="Grupo",
            last_name="A",
            email=email,
            password_hash=hash_password(password),
            id_rol_u=id_rol_u,
            is_active=True if is_active else False,
        )
        self.db.add(user)
        self.db.commit()
        self._usuarios.append(user)
        return user

    def _cliente(self, password: str, completo: bool = True) -> Cliente:
        email = _email_unico("cliente")
        cliente = Cliente(
            first_name="EU",
            last_name="Prueba",
            email=email,
            password_hash=hash_password(password),
            is_active=True,
            id_tipo_documento_c=1 if completo else None,
            documento_cliente=901000111 if completo else None,
            telefono_cliente=3001112222 if completo else None,
            address="Calle Grupo A 123" if completo else None,
        )
        self.db.add(cliente)
        self.db.commit()
        self._clientes.append(cliente)
        return cliente

    # ── 1. Empleado válido (ruta explícita user_type) ─────────────────
    def test_login_empleado_valido_emite_tokens_con_rol_y_claims(self):
        """Login explícito ``user_type='employee'`` para el administrador
        sembrado: emite access/refresh con rol y claims verificables."""
        empleado = self._empleado("ClaveA1x", id_rol_u=self._rol_id("administrador"))
        respuesta = login(self.db, UserLogin(
            email=empleado.email, password="ClaveA1x", user_type="employee",
        ))
        self.assertEqual(respuesta.user_type, "employee")
        self.assertEqual(respuesta.rol, "administrador")
        self.assertFalse(respuesta.password_reset_required)
        access = decode_token(respuesta.access_token)
        refresh = decode_token(respuesta.refresh_token)
        self.assertEqual(access["type"], "access")
        self.assertEqual(refresh["type"], "refresh")
        self.assertEqual(access["sub"], empleado.email)
        self.assertEqual(access["uid"], str(empleado.id_usuario))
        self.assertEqual(access["rol"], "administrador")
        self.assertEqual(access["user_type"], "employee")

    # ── 2. Empleado con contraseña incorrecta (nunca produce tokens) ──
    def test_login_empleado_password_incorrecta_401_sin_tokens(self):
        """Verificación de seguridad: credenciales incorrectas de empleado
        levantan 401 ANTES de construir tokens: no se emite ningún token
        ni se revela si el correo existe (mismo mensaje genérico)."""
        empleado = self._empleado("ClaveA1x", id_rol_u=self._rol_id("administrador"))
        with self.assertRaises(HTTPException) as ctx:
            login(self.db, UserLogin(
                email=empleado.email, password="OtraClave9z", user_type="employee",
            ))
        self.assertEqual(ctx.exception.status_code, 401)
        self.assertEqual(ctx.exception.detail, "Credenciales inválidas")

    # ── 3. Empleado inactivo ──────────────────────────────────────────
    def test_login_empleado_inactivo_403(self):
        empleado = self._empleado("ClaveA1x", id_rol_u=self._rol_id("tecnico"), is_active=False)
        with self.assertRaises(HTTPException) as ctx:
            login(self.db, UserLogin(
                email=empleado.email, password="ClaveA1x", user_type="employee",
            ))
        self.assertEqual(ctx.exception.status_code, 403)
        self.assertEqual(ctx.exception.detail, "Tu cuenta está inhabilitada")

    # ── 4. Empleado con rol no permitido ─────────────────────────────
    def test_login_empleado_sin_rol_403(self):
        """Un empleado sin rol asignado (id_rol_u nulo) no entra a la
        plataforma aunque sus credenciales sean correctas."""
        empleado = self._empleado("ClaveA1x", id_rol_u=None)
        with self.assertRaises(HTTPException) as ctx:
            login(self.db, UserLogin(
                email=empleado.email, password="ClaveA1x", user_type="employee",
            ))
        self.assertEqual(ctx.exception.status_code, 403)
        self.assertEqual(
            ctx.exception.detail,
            "Tu cuenta no tiene un rol válido asignado. Contacta al administrador.",
        )

    # ── 5. Cliente válido (ruta explícita user_type) ─────────────────
    def test_login_cliente_valido_emite_tokens_y_perfil_completo(self):
        """Login explícito ``user_type='client'`` con perfil completo:
        emite tokens con rol cliente y ``perfil_incompleto=False``."""
        cliente = self._cliente("ClaveC1x", completo=True)
        respuesta = login(self.db, UserLogin(
            email=cliente.email, password="ClaveC1x", user_type="client",
        ))
        self.assertEqual(respuesta.user_type, "client")
        self.assertEqual(respuesta.rol, "cliente")
        self.assertFalse(respuesta.perfil_incompleto)
        access = decode_token(respuesta.access_token)
        refresh = decode_token(respuesta.refresh_token)
        self.assertEqual(access["type"], "access")
        self.assertEqual(refresh["type"], "refresh")
        self.assertEqual(access["uid"], str(cliente.id_cliente))
        self.assertEqual(access["rol"], "cliente")
        self.assertEqual(access["user_type"], "client")

    # ── 6. Correo inexistente (nunca produce tokens) ─────────────────
    def test_login_correo_inexistente_401_sin_tokens(self):
        """Correo que no existe ni como cliente ni como empleado: 401 con
        el mismo mensaje genérico para ambas rutas explícitas; ningún
        token ni detalle que revele si el correo está registrado."""
        for user_type in ("client", "employee"):
            with self.subTest(user_type=user_type):
                with self.assertRaises(HTTPException) as ctx:
                    login(self.db, UserLogin(
                        email=_email_unico("inexistente"),
                        password="ClaveX9zz",
                        user_type=user_type,
                    ))
                self.assertEqual(ctx.exception.status_code, 401)
                self.assertEqual(ctx.exception.detail, "Credenciales inválidas")


if __name__ == "__main__":
    unittest.main()
