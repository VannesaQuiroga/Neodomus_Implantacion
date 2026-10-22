"""novedades: mensaje_cliente, solucion_cliente y cliente_visible

El modelo Novedad ya usa estos campos (comunicación con el cliente desde una
novedad: mensaje, solución y visibilidad), pero ninguna migración los había
creado, por lo que una base recién migrada quedaba incompatible con el modelo.

Revision ID: 0058
Revises: 0057
Create Date: 2026-10-17
"""
from alembic import op
import sqlalchemy as sa


revision = "0058"
down_revision = "0057"
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
    if not _columna_existe("novedades", "mensaje_cliente"):
        op.add_column("novedades", sa.Column("mensaje_cliente", sa.Text(), nullable=True))
    if not _columna_existe("novedades", "solucion_cliente"):
        op.add_column("novedades", sa.Column("solucion_cliente", sa.Text(), nullable=True))
    if not _columna_existe("novedades", "cliente_visible"):
        # Los registros previos quedan no visibles (0) por defecto.
        op.add_column(
            "novedades",
            sa.Column("cliente_visible", sa.Boolean(), nullable=False, server_default="0"),
        )


def downgrade() -> None:
    if _columna_existe("novedades", "cliente_visible"):
        op.drop_column("novedades", "cliente_visible")
    if _columna_existe("novedades", "solucion_cliente"):
        op.drop_column("novedades", "solucion_cliente")
    if _columna_existe("novedades", "mensaje_cliente"):
        op.drop_column("novedades", "mensaje_cliente")
