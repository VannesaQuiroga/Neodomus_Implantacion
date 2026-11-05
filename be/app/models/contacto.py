# Persistencia de contacto. Los campos y relaciones describen cómo SQLAlchemy guarda y enlaza estos registros.
from datetime import datetime
from sqlalchemy import DateTime, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class Contacto(Base):
    """Consultas o solicitudes de soporte enviadas desde la plataforma
    (visitantes / usuarios) y gestionadas por el administrador."""

    __tablename__ = "contactos"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    nombre_usuario: Mapped[str] = mapped_column(String(120), nullable=False)
    email_usuario: Mapped[str] = mapped_column(String(120), nullable=False)
    asunto: Mapped[str] = mapped_column(String(180), nullable=False)
    mensaje: Mapped[str] = mapped_column(Text, nullable=False)
    categoria: Mapped[str] = mapped_column(String(40), nullable=True)
    estado: Mapped[str] = mapped_column(
        String(20), nullable=False, default="pendiente"
    )  # 'pendiente' | 'respondida'
    respuesta: Mapped[str] = mapped_column(Text, nullable=True)
    responded_by: Mapped[int] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    responded_at: Mapped[datetime] = mapped_column(DateTime, nullable=True)