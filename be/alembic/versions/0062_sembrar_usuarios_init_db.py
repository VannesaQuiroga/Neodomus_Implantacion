"""Agrega a la BD activa las cuentas de empleado declaradas en init_db.sql.

La base de Docker se inicia con Alembic y seed_test_users.py, no ejecuta el
respaldo scripts/init_db.sql. Estas filas faltantes causaban que Google solo
encontrara el registro de cliente. Los correos existentes y sus roles no se
modifican. Se omiten documentos/teléfonos porque la migración base ya asigna
esos mismos valores a usuarios sintéticos.

Revision ID: 0062
Revises: 0061
"""
from alembic import op
import sqlalchemy as sa


revision = "0062"
down_revision = "0061"
branch_labels = None
depends_on = None


EMPLEADOS = [
    ("CARLOS ANDRÉS", "GÓMEZ RÍOS", "carlos.andres.gomez@gmail.com", "$2b$12$cEkNLc8Js907ywI9KHgYLu/TCD5.Ld35TwAIO7Ev5hSxfeG1LNf0C", "tecnico", "Certificación en Redes y Cableado Estructurado"),
    ("JORGE DANIEL", "CHARRY PÉREZ", "jorge.charry@gmail.com", "$2b$12$N1Ge6TcZlgNgP85DKhp5quBdrXQkixJV5hB1Th455B1gkKDIbMj96", "tecnico", "Certificación en Instalación de Domótica"),
    ("JUAN SEBASTIÁN", "MORENO TORRES", "juan.moreno@gmail.com", "$2b$12$vic9BT8xg8NX1SKPnjmGn.yoKQBh88xViJjhrrG.PRWyKbMDWOin2", "tecnico", "Certificación en Seguridad Electrónica"),
    ("LUIS EDUARDO", "MARTÍNEZ GAITÁN", "luis.martinez@gmail.com", "$2b$12$.zBmllFGXbnL7eAIFAfr6ueCtlwal3yjMxeiPTooqG6tcq8q2Ham2", "administrador", ""),
    ("ANDRÉS MAURICIO", "LÓPEZ VARGAS", "andres.lopez@gmail.com", "$2b$12$RByXZVO3eUwDQiQeBeZd2.bdFX3uOCkj9omMfE7iqNX1oRbYB7dPO", "tecnico", "Certificación en Programación de PLCs"),
    ("CAMILA ANDREA", "RODRÍGUEZ PEÑA", "camila.rodriguez@gmail.com", "$2b$12$z4DFKDwZ.jHTfu6.0RT7hOU5JpqgvNtYjzCGp11phcY7iKM9kEKfe", "administrador", ""),
    ("NICOL ALEJANDRA", "MARIÑO ROMERO", "nicolmarinoromero@gmail.com", "$2b$12$OQdysg.2T0oagVqY5zPeq.07kcmonKB.zwxBSbQHlK0uEnGiyhBv6", "administrador", ""),
    ("LAURA MARCELA", "PÉREZ DUARTE", "nicolmarino09@gmail.com", "$2b$12$iY/it6NSqzlUkR7IBT1q3eTYKKudhyVIb4Gyf1V.UYX6s548abKpu", "tecnico", "Automatización de hogares"),
    ("JULIÁN FELIPE", "CARVAJAL CABALLERO", "julian.carvajal@gmail.com", "$2b$12$dork9ZuJsoLuly6HWBQ6WuKiP97jjnGNl.h9Z2oqT/FZJfC/iyGQK", "tecnico", "Automatización de hogares"),
    ("MARÍA FERNANDA", "RINCÓN SALAZAR", "maria.rincon@gmail.com", "$2b$12$QnuBlookrDuipcigufnlKenl1ufl6Fk8.eQP27nIvz5f/lpgYKEhW", "tecnico", "Automatización de hogares"),
]


def upgrade() -> None:
    conn = op.get_bind()
    for first_name, last_name, email, password_hash, role_name, certification in EMPLEADOS:
        user_id = conn.execute(
            sa.text("SELECT id_usuario FROM usuarios WHERE LOWER(TRIM(email)) = :email LIMIT 1"),
            {"email": email},
        ).scalar_one_or_none()

        if user_id is None:
            role_id = conn.execute(
                sa.text("SELECT id_rol FROM roles_usuario WHERE LOWER(TRIM(nombre_rol)) = :role LIMIT 1"),
                {"role": role_name},
            ).scalar_one_or_none()
            if role_id is None:
                continue
            result = conn.execute(
                sa.text(
                    "INSERT INTO usuarios (first_name, last_name, email, password_hash, id_rol_u, is_active) "
                    "VALUES (:first_name, :last_name, :email, :password_hash, :role_id, 1)"
                ),
                {
                    "first_name": first_name,
                    "last_name": last_name,
                    "email": email,
                    "password_hash": password_hash,
                    "role_id": role_id,
                },
            )
            user_id = result.lastrowid

        if role_name == "tecnico" and certification:
            conn.execute(
                sa.text(
                    "INSERT INTO tecnicos (id_usuario_t, certificacion_t) "
                    "SELECT :user_id, :certification WHERE NOT EXISTS "
                    "(SELECT 1 FROM tecnicos WHERE id_usuario_t = :user_id)"
                ),
                {"user_id": user_id, "certification": certification},
            )


def downgrade() -> None:
    # No se borran empleados importados: al iniciar sesión o relacionarlos con
    # citas podrían adquirir datos dependientes que deben conservarse.
    pass
