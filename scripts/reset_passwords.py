"""
Resetea las contraseñas de usuarios existentes (clientes y empleados)
con el patrón:

    12345678 + inicial del nombre en MAYÚSCULA + inicial del primer apellido
    en minúscula + "."

Ejemplos:
    LAURA GARCÍA ROJAS   ->  12345678Lg.
    CARLOS ANDRÉS GÓMEZ   ->  12345678Cg.

Solo se guarda el hash bcrypt (nunca texto plano).
Es idempotente: puede ejecutarse varias veces con el mismo resultado.

Por defecto, SOLO establece contraseña en usuarios que NO tienen password_hash
(así no sobrescribe contraseñas ya establecidas por los usuarios).
Usa --forzar para reestablecer contraseñas en todos los usuarios.

Uso (dentro del contenedor api):

    docker exec -it neodomus_api uv run python /app/scripts/reset_passwords.py
    docker exec -it neodomus_api uv run python /app/scripts/reset_passwords.py --forzar
"""

from __future__ import annotations

import os
import sys
from pathlib import Path


def _agregar_backend_al_path() -> None:
    candidatos = [
        Path.cwd(),
        Path(__file__).resolve().parent.parent / "be",
        Path(__file__).resolve().parent.parent,
        Path("/app"),
    ]
    for candidato in candidatos:
        ruta = str(candidato.resolve())
        if ruta not in sys.path:
            sys.path.insert(0, ruta)
        try:
            import app  # noqa: F401
            return
        except ImportError:
            continue


_agregar_backend_al_path()

from sqlalchemy import select

from app.database import SessionLocal
from app.models.cliente import Cliente
from app.models.user import User
from app.utils.security import hash_password

PASSWORD_PREFIX = "12345678"


def password_de(first_name: str, last_name: str) -> str:
    nombre = (first_name or "").strip()
    apellido = (last_name or "").strip()
    inicial_nombre = (nombre[:1] or "").upper()
    primer_apellido = apellido.split()[0] if apellido else ""
    inicial_apellido = (primer_apellido[:1] or "").lower()
    return f"{PASSWORD_PREFIX}{inicial_nombre}{inicial_apellido}."


def run(mostrar_claves: bool = False, forzar: bool = False) -> int:
    """
    Establece contraseñas temporales.

    - Si forzar=False (por defecto): solo establece contraseña en usuarios
      que actualmente tienen password_hash nulo o vacío (no sobrescribe
      contraseñas ya establecidas por los usuarios).
    - Si forzar=True: reestablece contraseña en TODOS los usuarios.
    """
    actualizados = 0
    omitidos = 0
    with SessionLocal() as db:
        for entidad, tabla in ((Cliente, "clientes"), (User, "empleados")):
            for registro in db.execute(select(entidad)).scalars():
                # Si no se fuerza, saltar usuarios que ya tienen contraseña establecida
                if not forzar and registro.password_hash:
                    omitidos += 1
                    continue
                pwd = password_de(registro.first_name, registro.last_name)
                registro.password_hash = hash_password(pwd)
                actualizados += 1
                print(f"[actualizado] {tabla:10s} {registro.email} -> {pwd if mostrar_claves else ''}")
        db.commit()
    if omitidos:
        print(f"[omitidos] {omitidos} usuarios ya tienen contraseña establecida (usa --forzar para sobrescribir).")
    return actualizados


if __name__ == "__main__":
    mostrar = "--mostrar-claves" in sys.argv or "-v" in sys.argv
    forzar = "--forzar" in sys.argv
    # En entornos no desarrollo, abortar a menos que se use --forzar explícitamente
    if os.getenv("ENVIRONMENT", "development") != "development" and not forzar:
        print("ABORTA: este script solo debe ejecutarse en entorno de desarrollo. "
              "Usa --forzar para sobreescribir en otros entornos.")
        sys.exit(1)
    total = run(mostrar_claves=mostrar, forzar=forzar)
    print(f"\nContraseñas actualizadas: {total}")
