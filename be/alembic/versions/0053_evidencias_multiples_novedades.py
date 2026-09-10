"""0053 evidencias multiples novedades

Revision ID: 0053
Revises: 0052
Create Date: 2026-09-09
"""
from alembic import op
import sqlalchemy as sa

revision = "0053"
down_revision = "0052"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "evidencias_novedad",
        sa.Column("id_evidencia_n", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "id_novedad", sa.Integer(),
            sa.ForeignKey("novedades.id_novedad", ondelete="CASCADE"),
            nullable=False, index=True,
        ),
        sa.Column("url_archivo", sa.String(500), nullable=False),
        sa.Column("descripcion", sa.String(255), nullable=True),
        sa.Column("fecha_subida", sa.DateTime(), server_default=sa.func.now(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("evidencias_novedad")
