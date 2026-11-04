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

import app.database as _app_db  # noqa: E402
from app.config import settings  # noqa: E402

# ── Configuración centralizada del MinIO de pruebas ─────────────────────
# ``app`` (app/__init__.py) importa ``config`` de forma eager, así que aquí
# se SOBREESCRIBE ``settings`` tras su instanciación y se invalida el cliente
# cacheado de minio_service para que se cree con la instancia de pruebas.
# NO hay credenciales por defecto: se exige configuración EXPLÍCITA mediante
# las variables TEST_MINIO_* del entorno (sin tocar .env ni secretos reales).
_TEST_MINIO_VARS = (
    "TEST_MINIO_ENDPOINT",
    "TEST_MINIO_ACCESS_KEY",
    "TEST_MINIO_SECRET_KEY",
    "TEST_MINIO_BUCKET",
    "TEST_MINIO_PRIVATE_BUCKET",
    "TEST_MINIO_PUBLIC_ENDPOINT",
)


def _configurar_minio_pruebas() -> None:
    # Sin configuración explícita no se pisan MINIO_* (las pruebas de MinIO
    # deben omitirse de forma honesta, no caer en buckets de desarrollo).
    if not all(os.environ.get(v) for v in _TEST_MINIO_VARS):
        return
    for test_var in _TEST_MINIO_VARS:
        var = test_var[len("TEST_"):]
        os.environ[var] = os.environ[test_var]
        setattr(settings, var, os.environ[test_var])


_configurar_minio_pruebas()

# Códigos S3 que indican CREDENCIALES INVÁLIDAS (configuración errónea), a
# distinguir de "servicio inaccesible" (conexión rechazada/timeout).
_CODIGOS_CREDENCIALES_INVALIDAS = {
    "SignatureDoesNotMatch",
    "AccessDenied",
    "InvalidAccessKeyId",
}


def minio_pruebas_configurado() -> bool:
    return all(os.environ.get(v) for v in _TEST_MINIO_VARS)


def _bucket_de_pruebas(nombre: str) -> bool:
    return "test" in (nombre or "").lower()


def asegurar_minio_pruebas() -> None:
    """Verifica configuración explícita y buckets EXCLUSIVOS de pruebas.

    Se llama antes de escribir/borrar en el MinIO de pruebas: evita que una
    prueba toque un bucket real (de desarrollo/producción) por accidente.
    """
    if not minio_pruebas_configurado():
        raise RuntimeError(
            "TEST_MINIO_* no está configurado; define las variables del MinIO de pruebas."
        )
    if not (_bucket_de_pruebas(settings.MINIO_BUCKET) and _bucket_de_pruebas(settings.MINIO_PRIVATE_BUCKET)):
        raise RuntimeError(
            "Los buckets MinIO no son exclusivos de pruebas: revisa "
            "TEST_MINIO_BUCKET y TEST_MINIO_PRIVATE_BUCKET."
        )


def minio_de_pruebas_disponible() -> bool:
    """True si el MinIO de pruebas responde y su bucket público existe.

    Una credencial inválida se trata como error de configuración (no como
    omisión silenciosa): se propaga para no declarar aprobada una prueba que
    en realidad no se ejecutó contra el almacenamiento real.
    """
    if not minio_pruebas_configurado():
        return False
    asegurar_minio_pruebas()

    from minio import Minio
    from minio.error import S3Error

    from app.config import settings as _settings

    try:
        cliente = Minio(
            _settings.MINIO_ENDPOINT,
            access_key=_settings.MINIO_ACCESS_KEY,
            secret_key=_settings.MINIO_SECRET_KEY,
            secure=_settings.MINIO_SECURE,
        )
        return cliente.bucket_exists(_settings.MINIO_BUCKET)
    except S3Error as e:
        if getattr(e, "code", None) in _CODIGOS_CREDENCIALES_INVALIDAS:
            raise RuntimeError(
                "Configuración MinIO de pruebas inválida (credenciales): "
                f"code={getattr(e, 'code', None)}. Revisa TEST_MINIO_*."
            ) from e
        return False
    except Exception:
        return False

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


# Se conserva la implementación real para las pruebas que simulan únicamente
# el transporte SMTP y necesitan construir el mensaje MIME con su adjunto.
if not hasattr(_email, "_adjunto_original"):
    _email._adjunto_original = _email.send_email_with_attachment
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
