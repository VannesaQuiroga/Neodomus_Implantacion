""" Producto medidas por longitud (cableado)

Revision ID: 0051
Revises: 0050
Create Date: 2026-09-01
"""
from alembic import op
import sqlalchemy as sa

revision = "0051"
down_revision = "0050"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    # Crear tabla si no existe (idempotente)
    result = conn.execute(
        sa.text(
            "SELECT COUNT(*) FROM information_schema.TABLES "
            "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'producto_medidas'"
        )
    )
    if result.scalar() == 0:
        op.create_table(
            "producto_medidas",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("id_producto", sa.Integer(), nullable=False),
            sa.Column("metros", sa.Float(), nullable=False),
            sa.Column("stock", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("precio", sa.Float(), nullable=True),
            sa.Column("activa", sa.Boolean(), nullable=False, server_default="1"),
            sa.ForeignKeyConstraint(["id_producto"], ["productos.id_producto"], ondelete="CASCADE"),
            sa.UniqueConstraint("id_producto", "metros", name="uq_producto_metros"),
        )
        op.create_index("ix_producto_medidas_id_producto", "producto_medidas", ["id_producto"])


def downgrade() -> None:
    op.drop_index("ix_producto_medidas_id_producto", table_name="producto_medidas")
    op.drop_table("producto_medidas")
