# -*- coding: utf-8 -*-
"""
Guarda los registros actuales de la base de datos (clientes, usuarios y
tecnicos) dentro de scripts/init_db.sql para que no se pierdan.

La seccion final de init_db.sql (despues del marcador "REGISTROS GUARDADOS
AUTOMATICAMENTE") se regenera con INSERT IGNORE de los datos actuales.
El script es idempotente: al re-ejecutarlo se conservan los registros.

Uso:
    python scripts/export_seed.py

Conexion (se puede configurar con variables de entorno):
    DB_HOST   (default: localhost)
    DB_PORT   (default: 3307 - puerto expuesto por docker-compose)
    DB_USER   (default: neodomus)
    DB_PASSWORD (obligatoria; ver .env)
    DB_NAME   (default: neodomus)

Ejemplo con docker (desde la maquina host):
    docker exec neodomus_mysql mysqladmin ping -h localhost
    python scripts/export_seed.py
"""

import os
import sys
from decimal import Decimal
from pathlib import Path

import pymysql
from pymysql.converters import escape_item

SCRIPT_DIR = Path(__file__).resolve().parent
INIT_DB = SCRIPT_DIR / "init_db.sql"

MARKER_LINE = "-- REGISTROS GUARDADOS AUTOMÁTICAMENTE"
SEP_LINE = "-- ====================================================="
HASH_REDACTADO = "$2y$salt$redactedhash"


def get_connection():
    host = os.environ.get("DB_HOST", "localhost")
    port = int(os.environ.get("DB_PORT", "3307"))
    user = os.environ.get("DB_USER", "neodomus")
    # La credencial se lee del entorno (.env), nunca se hardcodea en el código.
    acceso_bd = os.environ.get("DB_PASSWORD") or os.environ.get("MYSQL_PASSWORD")
    if not acceso_bd:
        raise RuntimeError("Configura DB_PASSWORD o MYSQL_PASSWORD (ver .env).")
    database = os.environ.get("DB_NAME", "neodomus")
    return pymysql.connect(
        host=host,
        port=port,
        user=user,
        password=acceso_bd,
        database=database,
        charset="utf8mb4",
        autocommit=True,
    )


def sql(value):
    if value is None:
        return "NULL"
    if isinstance(value, Decimal):
        return str(value)
    return escape_item(value, "utf8mb4")


def _tuple_sql(row):
    return "(" + ", ".join(sql(v) for v in row) + ")"


def fetch_all(cursor, table, columns, order_by):
    col_list = ", ".join(columns)
    cursor.execute(f"SELECT {col_list} FROM {table} ORDER BY {order_by}")
    filas = [tuple(r) for r in cursor.fetchall()]
    if "password_hash" in columns:
        idx = columns.index("password_hash")
        filas = [
            tuple(HASH_REDACTADO if i == idx else v for i, v in enumerate(fila))
            for fila in filas
        ]
    return filas


def build_inserts(cursor):
    clientes = fetch_all(
        cursor,
        "clientes",
        [
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
        ],
        "id_cliente",
    )
    usuarios = fetch_all(
        cursor,
        "usuarios",
        [
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
        ],
        "id_usuario",
    )
    tecnicos = fetch_all(
        cursor,
        "tecnicos",
        ["id_tecnico", "id_usuario_t", "certificacion_t", "cargo_t"],
        "id_tecnico",
    )

    lines = []
    if clientes:
        lines.append("INSERT IGNORE INTO clientes (id_cliente, first_name, last_name, id_tipo_documento_c, documento_cliente, telefono_cliente, email, address, password_hash, is_active, verification_token, created_at) VALUES")
        lines.append(",\n".join(_tuple_sql(r) for r in clientes) + ";")
        lines.append("")
    if usuarios:
        lines.append("INSERT IGNORE INTO usuarios (id_usuario, first_name, last_name, id_tipo_documento_u, documento_usuario, telefono_usuario, email, password_hash, id_rol_u, is_active, created_at) VALUES")
        lines.append(",\n".join(_tuple_sql(r) for r in usuarios) + ";")
        lines.append("")
    if tecnicos:
        lines.append("INSERT IGNORE INTO tecnicos (id_tecnico, id_usuario_t, certificacion_t, cargo_t) VALUES")
        lines.append(",\n".join(_tuple_sql(r) for r in tecnicos) + ";")
        lines.append("")
    return lines


def main():
    text = INIT_DB.read_text(encoding="utf-8")
    if MARKER_LINE not in text:
        print("ERROR: no se encontro el marcador de registros en init_db.sql", file=sys.stderr)
        sys.exit(1)

    head = text.split(SEP_LINE + "\n" + MARKER_LINE)[0]
    if SEP_LINE not in head:
        head = text.split(MARKER_LINE)[0]

    conn = get_connection()
    try:
        with conn.cursor() as cursor:
            lines = build_inserts(cursor)
    finally:
        conn.close()

    if not lines:
        print("No hay registros que exportar (clientes/usuarios/tecnicos vacios).")
        return

    block = SEP_LINE + "\n" + MARKER_LINE + "\n" + "-- (Generado por scripts/export_seed.py - no editar a mano)\n" + SEP_LINE + "\n\n"
    block += "\n".join(lines)

    INIT_DB.write_text(head.rstrip() + "\n\n" + block + "\n", encoding="utf-8")
    total = sum(1 for _ in block.splitlines() if _.startswith("("))
    print(f"OK: {len(lines)} secciones de INSERT generadas en {INIT_DB.name}")


if __name__ == "__main__":
    main()
