# Persistencia de solicitud cuenta. Los campos y relaciones describen cómo SQLAlchemy guarda y enlaza estos registros.
from datetime import datetime
from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


# Mapea la tabla «solicitudes_cuenta»; sus referencias enlazan con clientes.
class SolicitudCuenta(Base):
    __tablename__ = "solicitudes_cuenta"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    id_cliente: Mapped[int] = mapped_column(
        ForeignKey("clientes.id_cliente", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    tipo: Mapped[str] = mapped_column(String(20), nullable=False)  # 'inhabilitar' | 'habilitar'
    estado: Mapped[str] = mapped_column(
        String(20), nullable=False, default="pendiente"
    )  # 'pendiente' | 'aprobada' | 'rechazada'
    motivo: Mapped[str] = mapped_column(Text, nullable=True)
    resuelta_por: Mapped[int] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    resuelta_at: Mapped[datetime] = mapped_column(DateTime, nullable=True)