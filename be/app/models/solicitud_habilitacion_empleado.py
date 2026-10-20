# Persistencia de solicitud habilitacion empleado. Los campos y relaciones describen cómo SQLAlchemy guarda y enlaza estos registros.
from datetime import datetime
from sqlalchemy import DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


# Mapea la tabla «solicitudes_habilitacion_empleado»; sus referencias enlazan con usuarios.
class SolicitudHabilitacionEmpleado(Base):
    __tablename__ = "solicitudes_habilitacion_empleado"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    id_usuario: Mapped[int] = mapped_column(
        ForeignKey("usuarios.id_usuario", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    estado: Mapped[str] = mapped_column(
        String(20), nullable=False, default="pendiente"
    )  # 'pendiente' | 'aprobada' | 'rechazada'
    resuelta_por: Mapped[int] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    resuelta_at: Mapped[datetime] = mapped_column(DateTime, nullable=True)
