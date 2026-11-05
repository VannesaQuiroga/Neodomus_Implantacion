# Persistencia de solicitud devolucion. Los campos y relaciones describen cómo SQLAlchemy guarda y enlaza estos registros.
from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class SolicitudDevolucion(Base):
    """Solicitud de devolución creada por el cliente sobre un pedido entregado.

    Agrupa una o varias líneas de devolución (tabla ``devoluciones``), cada una
    con su producto y cantidad. Una solicitud puede ser PARCIAL (algunos
    productos/unidades del pedido) o TOTAL (todos los productos disponibles).

    Pipeline de estados:
      Solicitada → En revisión → Aprobada → Producto en devolución
        → Recibida → Reembolso procesado
      Rechazada (terminal, requiere motivo_rechazo)
    """

    __tablename__ = "solicitudes_devolucion"

    id_solicitud: Mapped[int] = mapped_column(
        Integer, primary_key=True, autoincrement=True
    )
    # Número público de la devolución: DEV-000001
    numero: Mapped[str] = mapped_column(String(20), nullable=False, unique=True)
    id_cliente_s: Mapped[int] = mapped_column(
        ForeignKey("clientes.id_cliente"), nullable=False, index=True
    )
    id_pedido_s: Mapped[int] = mapped_column(
        ForeignKey("pedidos.id_pedido"), nullable=True, index=True
    )

    # Motivo estructurado (clave del catálogo) + explicación si es 'otro'.
    motivo_tipo: Mapped[str | None] = mapped_column(String(40), nullable=True)
    motivo_otro: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Comentario adicional opcional del cliente.
    comentario: Mapped[str | None] = mapped_column(Text, nullable=True)

    estado: Mapped[str] = mapped_column(
        String(30), nullable=False, server_default="Solicitada", index=True
    )
    # 'parcial' | 'total'
    tipo_devolucion: Mapped[str] = mapped_column(
        String(10), nullable=False, server_default="parcial"
    )
    # Valor estimado a devolver (suma de líneas: cantidad × precio unitario).
    monto_total: Mapped[float] = mapped_column(Float, nullable=False, server_default="0")

    resolucion: Mapped[str | None] = mapped_column(
        String(20), nullable=True
    )  # 'Reembolso' | 'Cambio'
    motivo_rechazo: Mapped[str | None] = mapped_column(Text, nullable=True)
    observaciones_admin: Mapped[str | None] = mapped_column(Text, nullable=True)

    resuelta_por: Mapped[int | None] = mapped_column(Integer, nullable=True)
    resuelta_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now()
    )
    updated_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    lineas = relationship(
        "Devolucion",
        primaryjoin="Devolucion.id_solicitud_dv == SolicitudDevolucion.id_solicitud",
        foreign_keys="Devolucion.id_solicitud_dv",
        viewonly=True,
    )
