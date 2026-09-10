""" Agregar ubicacion GPS del cliente al pedido

Revision ID: 0048
Revises: 0047
Create Date: 2026-08-31
"""
from alembic import op
import sqlalchemy as sa

revision = "0048"
down_revision = "0047"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    result = conn.execute(
        sa.text(
            "SELECT COUNT(*) FROM information_schema.COLUMNS "
            "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pedidos' AND COLUMN_NAME = 'latitud_cliente'"
        )
    )
    if result.scalar() == 0:
        op.add_column(
            "pedidos",
            sa.Column("latitud_cliente", sa.Float(), nullable=True),
        )
        op.add_column(
            "pedidos",
            sa.Column("longitud_cliente", sa.Float(), nullable=True),
        )


def downgrade() -> None:
    conn = op.get_bind()
    result = conn.execute(
        sa.text(
            "SELECT COUNT(*) FROM information_schema.COLUMNS "
            "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pedidos' AND COLUMN_NAME = 'latitud_cliente'"
        )
    )
    if result.scalar() > 0:
        op.drop_column("pedidos", "latitud_cliente")
        op.drop_column("pedidos", "longitud_cliente")
