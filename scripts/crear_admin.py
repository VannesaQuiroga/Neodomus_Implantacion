"""Crea la cuenta de administrador inicial (idempotente, sin contraseña fija).

Lee el correo y la contraseña de forma interactiva (getpass) o desde las
variables de entorno ``ADMIN_EMAIL`` / ``ADMIN_PASSWORD`` (y opcionalmente
``ADMIN_FIRST_NAME`` / ``ADMIN_LAST_NAME``). No imprime ni guarda secretos.

Uso:

    # host:
    cd be && uv run python ../scripts/crear_admin.py
    # o con variables locales:
    ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD=... uv run python ../scripts/crear_admin.py

    # dentro del contenedor api (scripts/ está montado en /app/scripts);
    # si no pasas ADMIN_PASSWORD la pedirá por getpass sin eco:
    docker exec -it -e ADMIN_EMAIL=... neodomus_api uv run python /app/scripts/crear_admin.py
"""
from __future__ import annotations

import os
import sys
from getpass import getpass
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
# En el host es la raíz del repo (repo/scripts). En el contenedor api es /app:
# compose monta scripts/ en /app/scripts y el código del backend vive directamente
# en /app (el paquete 'app' está en /app/app).
ROOT = SCRIPT_DIR.parent


def _detectar_backend() -> Path:
    """Localiza el directorio raíz del backend (el que contiene ``app/``).

    En el host es ``<repo>/be``. Dentro del contenedor ``api`` no existe el
    subdirectorio ``be``, así que se usa el directorio contenedor del script.
    """
    for candidato in (ROOT / "be", ROOT, Path("/app")):
        if (candidato / "app").is_dir():
            return candidato
    raise RuntimeError(
        "No se encontró el paquete 'app'. Ejecuta este script desde "
        "repo/scripts (host: repo/scripts/crear_admin.py) o dentro del "
        "contenedor api (/app/scripts/crear_admin.py)."
    )


BACKEND = _detectar_backend()
sys.path.insert(0, str(BACKEND))
os.chdir(BACKEND)

try:
    from dotenv import load_dotenv

    load_dotenv(BACKEND / ".env")
except Exception:
    pass

from app.config import settings  # noqa: E402
from app.database import SessionLocal  # noqa: E402
from app.models.roles_usuario import RolesUsuario  # noqa: E402
from app.models.user import User  # noqa: E402
from app.utils.security import hash_password  # noqa: E402


def main() -> int:
    if settings.ENVIRONMENT != "development":
        print("Este comando solo debe ejecutarse en ENVIRONMENT=development.")
        return 1

    email = os.environ.get("ADMIN_EMAIL") or input("Correo del administrador: ").strip()
    password = os.environ.get("ADMIN_PASSWORD") or getpass("Contraseña (no se mostrará): ")
    if not email or "@" not in email or not password:
        print("Correo o contraseña inválidos.")
        return 1

    first_name = os.environ.get("ADMIN_FIRST_NAME") or "Administrador"
    last_name = os.environ.get("ADMIN_LAST_NAME") or "Neodomus"

    db = SessionLocal()
    try:
        rol = db.query(RolesUsuario).filter(RolesUsuario.nombre_rol == "administrador").first()
        if rol is None:
            print("No existe el rol 'administrador'. Ejecuta primero las migraciones (alembic upgrade head).")
            return 1
        if db.query(User).filter(User.email == email).first() is not None:
            print(f"El usuario {email} ya existe; no se modificó.")
            return 0
        db.add(User(
            first_name=first_name,
            last_name=last_name,
            email=email,
            password_hash=hash_password(password),
            id_rol_u=rol.id_rol,
            is_active=True,
        ))
        db.commit()
        print(f"Administrador {email} creado correctamente.")
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
