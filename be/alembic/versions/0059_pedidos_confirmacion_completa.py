"""pedidos: marcador explícito de confirmación completa (confirmacion_completa)

Permite distinguir de forma fiable una confirmación de pago pendiente COMPLETA
(nuevo flujo atómico) de un registro histórico que pudo quedar incompleto. Los
registros previos quedan NULL (sin evidencia fiable) y se tratan como pendientes
de conciliación; no se rellena indiscriminadamente.

Revision ID: 0059
Revises: 0058
Create Date: 2026-10-17
"""
from alembic import op
import sqlalchemy as sa


revision = "0059"
down_revision = "0058"
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
    if not _columna_existe("pedidos", "confirmacion_completa"):
        op.add_column(
            "pedidos",
            sa.Column("confirmacion_completa", sa.Boolean(), nullable=True),
        )


def downgrade() -> None:
    if _columna_existe("pedidos", "confirmacion_completa"):
        op.drop_column("pedidos", "confirmacion_completa")
