""" Agregar color_hex a productos

Código de color (#RRGGBB) del color principal del producto, para poder
seleccionarlo con el botón de color en el formulario.

Revision ID: 0057
Revises: 0056
Create Date: 2026-09-10
"""
from alembic import op
import sqlalchemy as sa


revision = "0057"
down_revision = "0056"
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
    if not _columna_existe("productos", "color_hex"):
        op.add_column("productos", sa.Column("color_hex", sa.String(10), nullable=True))


def downgrade() -> None:
    if _columna_existe("productos", "color_hex"):
        op.drop_column("productos", "color_hex")
