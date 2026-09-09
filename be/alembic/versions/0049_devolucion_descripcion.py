"""Agregar columna descripcion a devoluciones

Revision ID: 0049
Revises: 0048
Create Date: 2026-09-01
"""

from alembic import op
import sqlalchemy as sa

revision = "0049"
down_revision = "0048"
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
    if not _columna_existe("devoluciones", "descripcion"):
        op.add_column(
            "devoluciones",
            sa.Column("descripcion", sa.Text, nullable=True),
        )


def downgrade() -> None:
    if _columna_existe("devoluciones", "descripcion"):
        op.drop_column("devoluciones", "descripcion")
