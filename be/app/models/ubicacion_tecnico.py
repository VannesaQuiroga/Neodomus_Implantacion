# Persistencia de ubicacion tecnico. Los campos y relaciones describen cómo SQLAlchemy guarda y enlaza estos registros.
from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, Integer, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class UbicacionTecnico(Base):
    """Última ubicación GPS real reportada por el dispositivo del técnico.
    Solo se expone al cliente mientras su entrega esté En camino."""

    __tablename__ = "ubicaciones_tecnico"

    id_ubicacion: Mapped[int] = mapped_column(
        Integer, primary_key=True, autoincrement=True
    )
    id_tecnico_ut: Mapped[int] = mapped_column(
        ForeignKey("tecnicos.id_tecnico", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
    )
    latitud: Mapped[float] = mapped_column(Float, nullable=False)
    longitud: Mapped[float] = mapped_column(Float, nullable=False)
    actualizado_en: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )
