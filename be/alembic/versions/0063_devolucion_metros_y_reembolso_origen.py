"""devoluciones por metros y trazabilidad de reembolsos (PEN-09/PEN-10)

Migración aditiva y reversible:

  - ``devoluciones.cantidad_metros`` (DECIMAL(10,2), NULL): longitud del corte
    devuelto para productos vendidos por metros. Los registros existentes
    quedan intactos (NULL = devolución por unidades enteras).
  - ``reembolsos.id_solicitud_origen`` (INT NULL UNIQUE): enlaza el reembolso
    con la solicitud de devolución que lo originó. El índice único impide en
    la base de datos que una misma solicitud genere dos reembolsos.

No se eliminan columnas, relaciones ni registros.

Revision ID: 0063
Revises: 0062
Create Date: 2026-11-11
"""
from alembic import op
import sqlalchemy as sa


revision = "0063"
down_revision = "0062"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "devoluciones",
        sa.Column("cantidad_metros", sa.Numeric(10, 2), nullable=True),
    )
    op.add_column(
        "reembolsos",
        sa.Column("id_solicitud_origen", sa.Integer(), nullable=True),
    )
    op.create_unique_constraint(
        "uq_reembolsos_solicitud_origen", "reembolsos", ["id_solicitud_origen"]
    )
    op.create_index(
        "ix_reembolsos_id_solicitud_origen",
        "reembolsos",
        ["id_solicitud_origen"],
    )


def downgrade() -> None:
    op.drop_index("ix_reembolsos_id_solicitud_origen", table_name="reembolsos")
    op.drop_constraint("uq_reembolsos_solicitud_origen", "reembolsos", type_="unique")
    op.drop_column("reembolsos", "id_solicitud_origen")
    op.drop_column("devoluciones", "cantidad_metros")
