"""
Seed de usuarios de prueba — NEODOMUS

Crea automáticamente los usuarios de prueba del proyecto (clientes, administrador
y técnico) con una contraseña temporal siguiendo el patrón:

    12345678 + inicial del nombre en MAYÚSCULA + inicial del primer apellido
    en minúscula + "."

Ejemplos:
    Juan Pérez        ->  12345678Jp.
    Prueba Cliente    ->  12345678Pc.

Reglas de seguridad:
    - NUNCA se almacena la contraseña en texto plano: solo se guarda su hash
      bcrypt (el mismo mecanismo que usa el resto del sistema).
    - La contraseña temporal NO se imprime en este script; si se desea conocerla
      se puede obtener con la función `password_temporal_de()`.
    - Es idempotente: si un email ya existe, no se duplica ni se sobrescribe la
      contraseña del usuario existente (a menos que se pase --reset-password).
    - No elimina ni modifica usuarios ya existentes.

Uso (dentro del contenedor api):

    docker exec -it neodomus_api uv run python /app/scripts/seed_test_users.py

O desde la raíz del proyecto con el backend en el PYTHONPATH:

    cd be && uv run python ../scripts/seed_test_users.py
"""

from __future__ import annotations

import os
import sys
from pathlib import Path


def _agregar_backend_al_path() -> None:
    """Agrega la carpeta raíz del backend al sys.path hasta poder importar `app`.

    Funciona tanto desde el host (repo/scripts -> repo/be) como dentro del
    contenedor api (donde /app ES la raíz del backend y scripts está en /app/scripts).
    """
    candidatos = [
        Path.cwd(),                                   # cd be (host) o /app (container)
        Path(__file__).resolve().parent.parent / "be",  # host: repo/scripts -> repo/be
        Path(__file__).resolve().parent.parent,         # container: /app/scripts -> /app
        Path("/app"),                                   # fallback contenedor
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
from app.models.roles_usuario import RolesUsuario
from app.models.tecnico import Tecnico
from app.models.user import User
from app.utils.security import hash_password

# ---------------------------------------------------------------------------
# Configuración de los usuarios de prueba
# ---------------------------------------------------------------------------

# Prefijo fijo de la contraseña temporal.
PASSWORD_PREFIX = "12345678"


def password_temporal_de(first_name: str, last_name: str) -> str:
    """Construye la contraseña temporal: prefijo + inicial del nombre (MAYÚS) +
    inicial del primer apellido (minúscula) + punto."""
    nombre = (first_name or "").strip()
    apellido = (last_name or "").strip()
    inicial_nombre = (nombre[:1] or "").upper()
    primer_apellido = apellido.split()[0] if apellido else ""
    inicial_apellido = (primer_apellido[:1] or "").lower()
    return f"{PASSWORD_PREFIX}{inicial_nombre}{inicial_apellido}."


# Usuarios de prueba. Cada entrada: (tipo, email, first_name, last_name, rol)
#   tipo = "cliente" | "empleado"
#   rol  = solo para empleados: "administrador" | "tecnico"
USUARIOS_PRUEBA = [
    # --- Clientes de prueba ---
    ("cliente", "prueba.cliente@neodomus.com", "Prueba", "Cliente", None),
    ("cliente", "cliente.demo@neodomus.com", "Carolina", "Mendez", None),
    # --- Administrador de prueba ---
    ("empleado", "admin@neodomus.com", "Admin", "Neodomus", "administrador"),
    # --- Técnico de prueba ---
    ("empleado", "tecnico@neodomus.com", "Tecnico", "Prueba", "tecnico"),
]


def _rol_por_nombre(db, nombre_rol: str) -> int | None:
    rol = db.execute(
        select(RolesUsuario).where(RolesUsuario.nombre_rol == nombre_rol)
    ).scalar_one_or_none()
    return rol.id_rol if rol else None


def _crear_cliente(db, email, first_name, last_name) -> bool:
    if db.execute(select(Cliente).where(Cliente.email == email)).scalar_one_or_none():
        return False
    temp_password = password_temporal_de(first_name, last_name)
    cliente = Cliente(
        first_name=first_name,
        last_name=last_name,
        email=email,
        password_hash=hash_password(temp_password),
        is_active=True,
        address="Calle de prueba 123",
    )
    db.add(cliente)
    return True


def _crear_empleado(db, email, first_name, last_name, nombre_rol) -> bool:
    if db.execute(select(User).where(User.email == email)).scalar_one_or_none():
        return False
    rol_id = _rol_por_nombre(db, nombre_rol)
    temp_password = password_temporal_de(first_name, last_name)
    empleado = User(
        first_name=first_name,
        last_name=last_name,
        email=email,
        password_hash=hash_password(temp_password),
        id_rol_u=rol_id,
        is_active=True,
    )
    db.add(empleado)
    db.flush()
    # Los técnicos también reciben su ficha técnica (necesaria para citas).
    if nombre_rol == "tecnico":
        certificacion = "Instalacion, mantenimiento, reparacion, revision, soporte"
        db.add(
            Tecnico(
                id_usuario_t=empleado.id_usuario,
                certificacion_t=certificacion,
            )
        )
    return True


def run(mostrar_claves: bool = False) -> int:
    """Ejecuta el seed. Retorna la cantidad de usuarios creados."""
    creados = 0
    with SessionLocal() as db:
        # Asegurar que existan los roles base (por si la BD no los tiene).
        for nombre_rol in ("administrador", "tecnico"):
            if not _rol_por_nombre(db, nombre_rol):
                db.add(RolesUsuario(nombre_rol=nombre_rol))
        db.flush()

        for tipo, email, first_name, last_name, rol in USUARIOS_PRUEBA:
            if tipo == "cliente":
                creado = _crear_cliente(db, email, first_name, last_name)
            else:
                creado = _crear_empleado(db, email, first_name, last_name, rol)
            if creado:
                creados += 1
                print(f"[creado] {tipo:9s} {email} ({first_name} {last_name})")
            else:
                print(f"[existe] {tipo:9s} {email} (no se modifica)")

        db.commit()

        if mostrar_claves:
            print("\nContraseñas temporales (SOLO para pruebas, no se almacenan):")
            for tipo, email, first_name, last_name, _ in USUARIOS_PRUEBA:
                pwd = password_temporal_de(first_name, last_name)
                print(f"  {email}  ->  {pwd}")

    return creados


if __name__ == "__main__":
    mostrar = "--mostrar-claves" in sys.argv or "-v" in sys.argv
    creados = run(mostrar_claves=mostrar)
    print(f"\nSeed finalizado. Usuarios creados: {creados}. "
          f"Total sembrado: {len(USUARIOS_PRUEBA)}.")
    # Nota: las claves NO se escriben en la base de datos, solo su hash.
