# Persistencia de pago. Los campos y relaciones describen cómo SQLAlchemy guarda y enlaza estos registros.
from datetime import datetime
from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class Pago(Base):
    """Pago simulado de un pedido (tarjeta, PSE, PayPal, punto de pago).

    Estados: aprobado | rechazado | pendiente
    """
    __tablename__ = "pagos"

    id_pago: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    id_pedido: Mapped[int] = mapped_column(ForeignKey("pedidos.id_pedido"), nullable=True, index=True)
    metodo_pago: Mapped[str] = mapped_column(String(30), nullable=False)
    estado: Mapped[str] = mapped_column(String(20), nullable=False, default="pendiente")
    numero_transaccion: Mapped[str] = mapped_column(String(50), nullable=True)
    monto: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    banco: Mapped[str] = mapped_column(String(100), nullable=True)
    titular: Mapped[str] = mapped_column(String(150), nullable=True)
    ultimos_digitos: Mapped[str] = mapped_column(String(6), nullable=True)
    correo_paypal: Mapped[str] = mapped_column(String(150), nullable=True)
    codigo_punto_pago: Mapped[str] = mapped_column(String(30), nullable=True)
    punto_pago: Mapped[str] = mapped_column(String(50), nullable=True)
    referencia_pago: Mapped[str] = mapped_column(String(50), nullable=True)
    fecha_limite_pago: Mapped[datetime] = mapped_column(DateTime, nullable=True)
    fecha_pago: Mapped[datetime] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    pedido = relationship("Pedido", foreign_keys=[id_pedido])
