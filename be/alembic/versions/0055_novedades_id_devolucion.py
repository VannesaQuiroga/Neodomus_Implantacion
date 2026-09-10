"""add id_devolucion to novedades

Revision ID: 0055
Revises: 0054
Create Date: 2026-09-09
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision = "0055"
down_revision = "0054"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    columns = [c["name"] for c in inspect(conn).get_columns("novedades")]
    if "id_devolucion" not in columns:
        op.add_column(
            "novedades",
            sa.Column("id_devolucion", sa.Integer, sa.ForeignKey("devoluciones.id_devolucion"), nullable=True, index=True),
        )


def downgrade() -> None:
    conn = op.get_bind()
    columns = [c["name"] for c in inspect(conn).get_columns("novedades")]
    if "id_devolucion" in columns:
        op.drop_constraint("fk_novedades_id_devolucion_devoluciones", "novedades", type_="foreignkey")
        op.drop_column("novedades", "id_devolucion")
