"""Base de pruebas MySQL aislada.

La suite de pruebas NO se ejecuta contra la base de desarrollo. Requiere la
variable de entorno ``TEST_DATABASE_URL`` apuntando a una base MySQL de pruebas
distinta de la aplicación. Si no está definida o coincide con la base de la
aplicación, la importación de este módulo falla y bloquea la ejecución.

Al importarse, reemplaza ``app.database.SessionLocal``/``engine`` por la sesión
de pruebas, de modo que los módulos de test que hacen
``from app.database import SessionLocal`` usan la base de pruebas.
"""
import os
from urllib.parse import urlparse

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import app.database as _app_db
from app.config import settings

TEST_DATABASE_URL = (
    os.environ.get("TEST_DATABASE_URL")
    or os.environ.get("NEODOMUS_TEST_DATABASE_URL")
)


def _nombre_base(url: str) -> str:
    return (urlparse(url).path or "").lstrip("/").split("?")[0]


if not TEST_DATABASE_URL:
    raise RuntimeError(
        "TEST_DATABASE_URL no está definida. Las pruebas requieren una base "
        "MySQL de pruebas SEPARADA de la aplicación. Define TEST_DATABASE_URL "
        "y vuelve a ejecutarlas."
    )

if _nombre_base(TEST_DATABASE_URL) == _nombre_base(settings.DATABASE_URL):
    raise RuntimeError(
        "TEST_DATABASE_URL apunta a la misma base que la aplicación "
        f"('{_nombre_base(settings.DATABASE_URL)}'). Usa una base MySQL de "
        "pruebas separada (p. ej. 'neodomus_test')."
    )

_test_engine = create_engine(TEST_DATABASE_URL, pool_pre_ping=True, pool_recycle=3600)
TestSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=_test_engine)

# Reemplazar la sesión de la aplicación para que TODA la suite use la base de
# pruebas (los módulos de test importan `SessionLocal` desde `app.database`).
_app_db.engine = _test_engine
_app_db.SessionLocal = TestSessionLocal

# Barrera permanente durante este proceso de pruebas: los mocks temporales de
# hilos pueden restaurarse en distinto orden y dejar escapar un correo tardío.
# Se anula el transporte además de los mocks de notificaciones de cada test.
from app.utils import email as _email


def _correo_sin_transporte(*_args, **_kwargs):
    return True


async def _adjunto_sin_transporte(*_args, **_kwargs):
    return True


_email._send_email_sync = _correo_sin_transporte
_email.send_email_with_attachment = _adjunto_sin_transporte

# Desactivar los trabajos automáticos del scheduler durante las pruebas. El
# cliente de test (httpx/ASGI) no ejecuta el lifespan de FastAPI que lo arranca,
# pero se neutraliza igualmente para que ningún flujo lance tareas en segundo
# plano sobre la base de pruebas. Se hace a nivel de módulo para que la
# desactivación sea efectiva desde antes de importar/correr la aplicación.
from app.services import scheduler as _scheduler

_scheduler.iniciar_scheduler = lambda: None
_scheduler.detener_scheduler = lambda: None


def ensure_test_schema() -> None:
    """Crea el esquema en la base de pruebas si aún no existe.

    Se espera que el esquema se haya creado previamente con
    ``DATABASE_URL=$TEST_DATABASE_URL alembic upgrade head`` (mecanismo del
    proyecto). Esta función es una salvaguarda: no vuelve a migrar.
    """
    from sqlalchemy import inspect

    if not inspect(_test_engine).has_table("citas"):
        raise RuntimeError(
            "La base de pruebas no tiene esquema. Ejecuta "
            "`DATABASE_URL=$TEST_DATABASE_URL alembic upgrade head` antes de correr las pruebas."
        )
