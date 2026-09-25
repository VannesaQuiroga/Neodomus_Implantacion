""" Agregar tamaño a productos

El producto principal puede tener un color (colores_producto, ya existente)
y un tamaño propio (columna nueva), además de sus variantes.

Revision ID: 0056
Revises: 0055
Create Date: 2026-09-10
"""
from alembic import op
import sqlalchemy as sa


revision = "0056"
down_revision = "0055"
branch_labels = None
depends_on = None


def _columna_existe(tabla: str, columna: str) -> bool:
    bind = op.get_bind()
    existe = bind.execute(
        sa.text(
            "SELECT COUNT(*) FROM information_schema.COLUMNS "
            "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :tabla "
            "AND COLUMN_NAME = :columna"
        ),
        {"tabla": tabla, "columna": columna},
    ).scalar()
    return bool(existe)


def upgrade() -> None:
    if not _columna_existe("productos", "tamaño"):
        op.add_column("productos", sa.Column("tamaño", sa.String(60), nullable=True))


def downgrade() -> None:
    if _columna_existe("productos", "tamaño"):
        op.drop_column("productos", "tamaño")
