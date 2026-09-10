"""add foto_url to clientes

Revision ID: 0054
Revises: 0053
Create Date: 2026-09-09
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision = "0054"
down_revision = "0053"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    columns = [c["name"] for c in inspect(conn).get_columns("clientes")]
    if "foto_url" not in columns:
        op.add_column("clientes", sa.Column("foto_url", sa.String(255), nullable=True))


def downgrade() -> None:
    conn = op.get_bind()
    columns = [c["name"] for c in inspect(conn).get_columns("clientes")]
    if "foto_url" in columns:
        op.drop_column("clientes", "foto_url")
