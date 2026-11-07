"""
Respaldo automático de usuarios en scripts/init_db.sql.

Cuando un cliente verifica su correo (registro) o el administrador crea un
empleado, el sistema regenera la sección "REGISTROS GUARDADOS AUTOMÁTICAMENTE"
de scripts/init_db.sql con los usuarios actuales. Los hashes de contraseña
se sustituyen por un valor redactado: nunca se escriben credenciales reales
en el repositorio.

Es el mismo formato que genera scripts/export_seed.py.
"""

from datetime import datetime
from pathlib import Path

from sqlalchemy import text

from app.database import SessionLocal

MARKER = "-- REGISTROS GUARDADOS AUTOMÁTICAMENTE"
SEP = "-- ====================================================="
HASH_REDACTADO = "$2b$12$redactedhash"

COLUMNAS_CLIENTES = (
    "id_cliente",
    "first_name",
    "last_name",
    "id_tipo_documento_c",
    "documento_cliente",
    "telefono_cliente",
    "email",
    "address",
    "password_hash",
    "is_active",
    "verification_token",
    "created_at",
)

COLUMNAS_USUARIOS = (
    "id_usuario",
    "first_name",
    "last_name",
    "id_tipo_documento_u",
    "documento_usuario",
    "telefono_usuario",
    "email",
    "password_hash",
    "id_rol_u",
    "is_active",
    "created_at",
)

COLUMNAS_TECNICOS = ("id_tecnico", "id_usuario_t", "certificacion_t")


def _candidatos_init_db() -> list[Path]:
    return [
        Path("/app/scripts/init_db.sql"),  # contenedor api
        Path(__file__).resolve().parents[3] / "scripts" / "init_db.sql",  # host: be/app/utils -> repo/scripts
    ]


def _buscar_init_db() -> Path | None:
    for p in _candidatos_init_db():
        if p.is_file():
            return p
    return None


def _escape(value):
    if value is None:
        return "NULL"
    if isinstance(value, bool):
        return "1" if value else "0"
    if isinstance(value, int):
        return str(value)
    if isinstance(value, float):
        return repr(value)
    if isinstance(value, datetime):
        return f"'{value.strftime('%Y-%m-%d %H:%M:%S')}'"
    s = str(value).replace("\\", "\\\\").replace("'", "''")
    return f"'{s}'"


def _tuple_sql(row) -> str:
    return "(" + ", ".join(_escape(v) for v in row) + ")"


def _fetch(db, tabla: str, columnas) -> list[tuple]:
    cols = ", ".join(columnas)
    filas = db.execute(text(f"SELECT {cols} FROM {tabla} ORDER BY {columnas[0]}")).fetchall()
    rows = [tuple(r) for r in filas]
    if "password_hash" in columnas:
        idx = columnas.index("password_hash")
        rows = [
            tuple(HASH_REDACTADO if i == idx else v for i, v in enumerate(fila))
            for fila in rows
        ]
    return rows


def _build_block(db) -> str:
    lineas: list[str] = []
    clientes = _fetch(db, "clientes", COLUMNAS_CLIENTES)
    usuarios = _fetch(db, "usuarios", COLUMNAS_USUARIOS)
    tecnicos = _fetch(db, "tecnicos", COLUMNAS_TECNICOS)

    if clientes:
        lineas.append(
            "INSERT IGNORE INTO clientes (id_cliente, first_name, last_name, "
            "id_tipo_documento_c, documento_cliente, telefono_cliente, email, "
            "address, password_hash, is_active, verification_token, created_at) VALUES"
        )
        lineas.append(",\n".join(_tuple_sql(r) for r in clientes) + ";")
        lineas.append("")
    if usuarios:
        lineas.append(
            "INSERT IGNORE INTO usuarios (id_usuario, first_name, last_name, "
            "id_tipo_documento_u, documento_usuario, telefono_usuario, email, "
            "password_hash, id_rol_u, is_active, created_at) VALUES"
        )
        lineas.append(",\n".join(_tuple_sql(r) for r in usuarios) + ";")
        lineas.append("")
    if tecnicos:
        lineas.append(
            "INSERT IGNORE INTO tecnicos (id_tecnico, id_usuario_t, certificacion_t) VALUES"
        )
        lineas.append(",\n".join(_tuple_sql(r) for r in tecnicos) + ";")
        lineas.append("")
    return "\n".join(lineas)


def respaldar_usuarios() -> bool:
    """Regenera la sección de usuarios de scripts/init_db.sql.

    Retorna True si el archivo se actualizó. Nunca lanza excepciones al
    llamador (los errores se registran y se ignoran) para no romper el
    flujo de registro.
    """
    try:
        path = _buscar_init_db()
        if not path:
            return False
        original = path.read_text(encoding="utf-8")
        if MARKER not in original:
            return False
        with SessionLocal() as db:
            block = _build_block(db)
        if not block:
            return False
        nuevo_bloque = (
            SEP + "\n" + MARKER + "\n"
            + "-- (Generado automáticamente por el backend - no editar a mano)\n"
            + SEP + "\n\n" + block + "\n"
        )
        head = original.split(SEP + "\n" + MARKER)[0]
        path.write_text(head.rstrip() + "\n\n" + nuevo_bloque, encoding="utf-8")
        return True
    except Exception as exc:  # noqa: BLE001 - el respaldo nunca debe romper el registro
        print(f"[respaldo_usuarios] error al regenerar init_db.sql: {exc}")
        return False
