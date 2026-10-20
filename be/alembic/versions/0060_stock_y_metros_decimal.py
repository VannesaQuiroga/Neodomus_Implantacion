"""stock y cantidades por metros a DECIMAL exacto

Los productos vendidos por metros descuentan exactamente la longitud solicitada
(1.5 m → 1.5 m), sin ceil/truncar/mínimo. Se convierten a DECIMAL las columnas
de stock (producto y variante) y la longitud del detalle. Los valores enteros
existentes se conservan (10 → 10.00); no se reinterpretan como metros/rollos.

Revision ID: 0060
Revises: 0059
Create Date: 2026-10-17
"""
from alembic import op
import sqlalchemy as sa


revision = "0060"
down_revision = "0059"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column("productos", "stock_producto", type_=sa.Numeric(12, 2), existing_type=sa.Integer(), existing_nullable=False)
    op.alter_column("producto_variantes", "stock", type_=sa.Numeric(12, 2), existing_type=sa.Integer(), existing_nullable=False)
    op.alter_column("detalle_pedido", "cantidad_metros", type_=sa.Numeric(10, 2), existing_type=sa.Float(), existing_nullable=True)


def downgrade() -> None:
    op.alter_column("detalle_pedido", "cantidad_metros", type_=sa.Float(), existing_type=sa.Numeric(10, 2), existing_nullable=True)
    op.alter_column("producto_variantes", "stock", type_=sa.Integer(), existing_type=sa.Numeric(12, 2), existing_nullable=False)
    op.alter_column("productos", "stock_producto", type_=sa.Integer(), existing_type=sa.Numeric(12, 2), existing_nullable=False)
