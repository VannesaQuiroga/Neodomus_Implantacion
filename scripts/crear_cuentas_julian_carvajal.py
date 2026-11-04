"""Crea dos cuentas de empleado "Julian Carvajal" en la base de DESARROLLO local.

    - Administrador: usuario con rol ``administrador``.
    - Técnico: usuario con rol ``tecnico`` + su perfil en ``tecnicos``.

Uso (desde la raíz del proyecto):

    .\\be\\.venv\\Scripts\\python.exe scripts\\crear_cuentas_julian_carvajal.py

Pide por entrada interactiva los correos (``input``) y las contraseñas
(``getpass``, sin eco). Idempotente: si un correo ya existe, lo informa y NO
modifica su rol ni su contraseña. No hardcodea credenciales, no las imprime, no
las registra en logs y no las deja en Git. Solo se ejecuta en ``development``.
"""

from __future__ import annotations

import os
import sys
from getpass import getpass
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]
BE = ROOT / "be"
os.chdir(BE)
sys.path.insert(0, str(BE))

try:
    from dotenv import load_dotenv

    load_dotenv(BE / ".env")
except Exception:
    pass

from app.config import settings  # noqa: E402
from app.database import SessionLocal  # noqa: E402
from app.models.roles_usuario import RolesUsuario  # noqa: E402
from app.models.tecnico import Tecnico  # noqa: E402
from app.models.user import User  # noqa: E402
from app.utils.security import hash_password, verify_password  # noqa: E402

FIRST_NAME = "Julian"
LAST_NAME = "Carvajal"
ROLES_REQUERIDOS = ("administrador", "tecnico")


def _destino_sanitizado() -> str:
    """Devuelve host:puerto/base sin credenciales."""
    try:
        parsed = urlparse(settings.DATABASE_URL or "")
        host = parsed.hostname or "?"
        puerto = f":{parsed.port}" if parsed.port else ""
        base = parsed.path.lstrip("/") or "?"
        return f"{host}{puerto}/{base}"
    except Exception:
        return "desconocida"


def _pedir_correo(etiqueta: str) -> str:
    while True:
        correo = input(f"Correo de la cuenta {etiqueta}: ").strip()
        if correo and "@" in correo and "." in correo.split("@")[-1]:
            return correo
        print("  Correo no válido; intenta de nuevo.")


def _pedir_contrasena(etiqueta: str) -> str:
    while True:
        contrasena = getpass(f"Contraseña de la cuenta {etiqueta} (no se mostrará): ")
        if not contrasena:
            print("  La contraseña no puede estar vacía.")
            continue
        if getpass(f"Repite la contraseña de {etiqueta}: ") == contrasena:
            return contrasena
        print("  Las contraseñas no coinciden; intenta de nuevo.")


def _rol(db, nombre: str) -> RolesUsuario | None:
    return db.query(RolesUsuario).filter(RolesUsuario.nombre_rol == nombre).first()


def main() -> int:
    if settings.ENVIRONMENT != "development":
        print(
            "ABORTA: este script solo debe ejecutarse en desarrollo local "
            f"(ENVIRONMENT actual: {settings.ENVIRONMENT!r})."
        )
        return 1

    db = SessionLocal()
    try:
        roles = {nombre: _rol(db, nombre) for nombre in ROLES_REQUERIDOS}
        if any(roles[nombre] is None for nombre in ROLES_REQUERIDOS):
            print(
                "ABORTA: faltan roles en roles_usuario "
                f"({', '.join(ROLES_REQUERIDOS)}). Ejecuta antes la migración/seed."
            )
            return 1

        print(f"Destino: base de desarrollo ({_destino_sanitizado()}).")
        print(f"Nombre de las cuentas: {FIRST_NAME} {LAST_NAME}.")
        print()

        pendientes = []
        for etiqueta, rol_nombre in (
            ("ADMINISTRADOR", "administrador"),
            ("TÉCNICO", "tecnico"),
        ):
            correo = _pedir_correo(etiqueta)
            existente = db.query(User).filter(User.email == correo).first()
            if existente is not None:
                rol_actual = (
                    db.query(RolesUsuario.nombre_rol)
                    .filter(RolesUsuario.id_rol == existente.id_rol_u)
                    .scalar()
                )
                print(f"  · {etiqueta}: {correo} ya existe (rol={rol_actual}); no se modifica.")
                continue
            contrasena = _pedir_contrasena(etiqueta)
            pendientes.append((etiqueta, rol_nombre, correo, contrasena))

        if not pendientes:
            print("\nNo hay cuentas nuevas que crear.")
            return 0

        correos = {p[2].lower() for p in pendientes}
        if len(correos) != len(pendientes):
            print("\nABORTA: los correos de las cuentas nuevas no pueden repetirse.")
            return 1

        creados: dict[str, tuple[User, str]] = {}
        for etiqueta, rol_nombre, correo, contrasena in pendientes:
            usuario = User(
                first_name=FIRST_NAME,
                last_name=LAST_NAME,
                email=correo,
                password_hash=hash_password(contrasena),
                id_rol_u=roles[rol_nombre].id_rol,
                is_active=True,
            )
            db.add(usuario)
            creados[etiqueta] = (usuario, contrasena)

        db.flush()

        if "TÉCNICO" in creados:
            usuario_tec = creados["TÉCNICO"][0]
            db.add(Tecnico(id_usuario_t=usuario_tec.id_usuario, certificacion_t=""))

        db.commit()

        print("\nResultado:")
        for etiqueta, (usuario, contrasena) in creados.items():
            rol_nombre = (
                db.query(RolesUsuario.nombre_rol)
                .filter(RolesUsuario.id_rol == usuario.id_rol_u)
                .scalar()
            )
            perfil = ""
            if etiqueta == "TÉCNICO":
                tiene = db.query(Tecnico).filter(Tecnico.id_usuario_t == usuario.id_usuario).first() is not None
                perfil = f", perfil técnico={'sí' if tiene else 'no'}"
            verifica = verify_password(contrasena, usuario.password_hash)
            print(
                f"  · {etiqueta}: {usuario.email} → rol={rol_nombre}, "
                f"activo={usuario.is_active}, contraseña verifica={'sí' if verifica else 'no'}{perfil}"
            )

        return 0
    except Exception as exc:  # pragma: no cover - defensivo
        db.rollback()
        print(f"\nERROR: {exc}")
        return 1
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
