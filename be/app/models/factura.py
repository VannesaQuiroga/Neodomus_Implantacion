# Persistencia de factura. Los campos y relaciones describen cómo SQLAlchemy guarda y enlaza estos registros.
from datetime import datetime
from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, func, text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class Factura(Base):
    """Factura generada a partir de un pedido o cita aprobado."""
    __tablename__ = "facturas"

    id_factura: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    id_pedido: Mapped[int] = mapped_column(ForeignKey("pedidos.id_pedido"), nullable=True, index=True)
    id_cita: Mapped[int] = mapped_column(ForeignKey("citas.id_cita"), nullable=True, index=True)
    numero_factura: Mapped[str] = mapped_column(String(30), nullable=False, unique=True)
    fecha_factura: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    monto_total: Mapped[float] = mapped_column(Float, nullable=False)
    metodo_pago: Mapped[str] = mapped_column(String(30), nullable=True)
    estado_pago: Mapped[str] = mapped_column(String(20), nullable=True)
    numero_transaccion: Mapped[str] = mapped_column(String(50), nullable=True)
    enviada_por_correo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    pedido = relationship("Pedido", foreign_keys=[id_pedido])
    cita = relationship("Cita", foreign_keys=[id_cita])
