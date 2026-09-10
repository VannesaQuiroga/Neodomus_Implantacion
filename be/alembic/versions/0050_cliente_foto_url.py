"""Agregar columna foto_url a clientes

Revision ID: 0050
Revises: 0049
Create Date: 2026-09-01
"""

from alembic import op
import sqlalchemy as sa

revision = "0050"
down_revision = "0049"
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
    if not _columna_existe("clientes", "foto_url"):
        op.add_column(
            "clientes",
            sa.Column("foto_url", sa.String(255), nullable=True),
        )


def downgrade() -> None:
    if _columna_existe("clientes", "foto_url"):
        op.drop_column("clientes", "foto_url")
