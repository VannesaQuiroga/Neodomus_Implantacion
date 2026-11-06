"""Permite vincular Google a cuentas de empleados.

Revision ID: 0061
Revises: 0060
"""
from alembic import op
import sqlalchemy as sa


revision = "0061"
down_revision = "0060"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("usuarios", sa.Column("google_id", sa.String(length=255), nullable=True))
    op.create_index("ix_usuarios_google_id", "usuarios", ["google_id"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_usuarios_google_id", table_name="usuarios")
    op.drop_column("usuarios", "google_id")
