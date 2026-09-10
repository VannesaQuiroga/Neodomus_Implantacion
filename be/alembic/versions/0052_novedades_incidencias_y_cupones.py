"""0052 novedades incidencias y cupones

Revision ID: 0052
Revises: 0051
Create Date: 2026-09-08
"""
from alembic import op
import sqlalchemy as sa


revision = "0052"
down_revision = "0051"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── Expandir tabla novedades ──────────────────────────────────
    op.add_column("novedades", sa.Column("id_pedido", sa.Integer(), nullable=True))
    op.add_column("novedades", sa.Column("id_cita", sa.Integer(), nullable=True))
    op.add_column("novedades", sa.Column("id_cliente", sa.Integer(), nullable=True))
    op.add_column("novedades", sa.Column("prioridad", sa.String(20), server_default="normal", nullable=False))
    op.add_column("novedades", sa.Column("lugar_ocurrencia", sa.String(255), nullable=True))
    op.add_column("novedades", sa.Column("evidencia_url", sa.String(500), nullable=True))
    op.add_column("novedades", sa.Column("accion_admin", sa.Text(), nullable=True))
    op.add_column("novedades", sa.Column("id_admin_resuelve", sa.Integer(), nullable=True))
    op.add_column("novedades", sa.Column("fecha_resolucion", sa.DateTime(), nullable=True))

    op.create_foreign_key("fk_novedad_pedido", "novedades", "pedidos", ["id_pedido"], ["id_pedido"])
    op.create_foreign_key("fk_novedad_cita", "novedades", "citas", ["id_cita"], ["id_cita"])
    op.create_foreign_key("fk_novedad_cliente", "novedades", "clientes", ["id_cliente"], ["id_cliente"])
    op.create_foreign_key("fk_novedad_admin", "novedades", "usuarios", ["id_admin_resuelve"], ["id_usuario"])

    op.create_index("ix_novedades_pedido", "novedades", ["id_pedido"])
    op.create_index("ix_novedades_cita", "novedades", ["id_cita"])
    op.create_index("ix_novedades_cliente", "novedades", ["id_cliente"])

    # ── Tabla historial de novedades ──────────────────────────────
    op.create_table(
        "novedad_historial",
        sa.Column("id_historial", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("id_novedad", sa.Integer(), sa.ForeignKey("novedades.id_novedad", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("id_usuario", sa.Integer(), sa.ForeignKey("usuarios.id_usuario"), nullable=True),
        sa.Column("accion", sa.String(100), nullable=False),
        sa.Column("detalle", sa.Text(), nullable=True),
        sa.Column("fecha", sa.DateTime(), server_default=sa.func.now(), nullable=False),
    )

    # ── Tabla cupones de descuento ────────────────────────────────
    op.create_table(
        "cupones_descuento",
        sa.Column("id_cupon", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("codigo", sa.String(50), unique=True, nullable=False, index=True),
        sa.Column("tipo_descuento", sa.String(20), nullable=False, server_default="porcentaje"),
        sa.Column("valor_descuento", sa.Float(), nullable=False),
        sa.Column("fecha_vencimiento", sa.Date(), nullable=True),
        sa.Column("compra_minima", sa.Float(), nullable=False, server_default="0"),
        sa.Column("usos_maximos", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("usos_realizados", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("aplica_tienda_completa", sa.Boolean(), nullable=False, server_default=sa.text("1")),
        sa.Column("categorias_aplicables", sa.Text(), nullable=True),
        sa.Column("id_cliente", sa.Integer(), sa.ForeignKey("clientes.id_cliente"), nullable=True, index=True),
        sa.Column("id_novedad", sa.Integer(), sa.ForeignKey("novedades.id_novedad"), nullable=True),
        sa.Column("id_admin_crea", sa.Integer(), sa.ForeignKey("usuarios.id_usuario"), nullable=True),
        sa.Column("activo", sa.Boolean(), nullable=False, server_default=sa.text("1")),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("cupones_descuento")
    op.drop_table("novedad_historial")
    op.drop_index("ix_novedades_cliente", "novedades")
    op.drop_index("ix_novedades_cita", "novedades")
    op.drop_index("ix_novedades_pedido", "novedades")
    op.drop_constraint("fk_novedad_admin", "novedades", type_="foreignkey")
    op.drop_constraint("fk_novedad_cliente", "novedades", type_="foreignkey")
    op.drop_constraint("fk_novedad_cita", "novedades", type_="foreignkey")
    op.drop_constraint("fk_novedad_pedido", "novedades", type_="foreignkey")
    op.drop_column("novedades", "fecha_resolucion")
    op.drop_column("novedades", "id_admin_resuelve")
    op.drop_column("novedades", "accion_admin")
    op.drop_column("novedades", "evidencia_url")
    op.drop_column("novedades", "lugar_ocurrencia")
    op.drop_column("novedades", "prioridad")
    op.drop_column("novedades", "id_cliente")
    op.drop_column("novedades", "id_cita")
    op.drop_column("novedades", "id_pedido")
