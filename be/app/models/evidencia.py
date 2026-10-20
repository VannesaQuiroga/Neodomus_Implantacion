# Persistencia de evidencia. Los campos y relaciones describen cómo SQLAlchemy guarda y enlaza estos registros.
from datetime import datetime
from sqlalchemy import DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class EvidenciaEntrega(Base):
    """Fotos de evidencia de la entrega de un pedido (sube el técnico 1)."""

    __tablename__ = "evidencias_entrega"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    id_pedido: Mapped[int] = mapped_column(
        Integer, ForeignKey("pedidos.id_pedido", ondelete="CASCADE"), nullable=False, index=True
    )
    id_tecnico: Mapped[int] = mapped_column(Integer, nullable=False)
    url_archivo: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

class Evidencia(Base):
    """Evidencia (foto/archivo) que el técnico sube del trabajo realizado.

    Se exige al menos una evidencia para poder finalizar la cita.
    """

    __tablename__ = "evidencias"

    id_evidencia: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    id_cita: Mapped[int] = mapped_column(
        Integer, ForeignKey("citas.id_cita", ondelete="CASCADE"), nullable=False, index=True
    )
    id_tecnico: Mapped[int] = mapped_column(
        Integer, ForeignKey("tecnicos.id_tecnico"), nullable=False
    )
    url_archivo: Mapped[str] = mapped_column(String(255), nullable=False)
    descripcion: Mapped[str] = mapped_column(String(255), nullable=True)
    fecha_subida: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )