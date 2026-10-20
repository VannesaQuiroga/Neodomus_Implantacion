# Persistencia de calificacion. Los campos y relaciones describen cómo SQLAlchemy guarda y enlaza estos registros.
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, SmallInteger, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


# Mapea la tabla «calificaciones»; sus referencias enlazan con clientes, tecnicos, citas.
class Calificacion(Base):
    __tablename__ = "calificaciones"

    id_calificacion: Mapped[int] = mapped_column(
        Integer, primary_key=True, autoincrement=True
    )
    id_cliente_c: Mapped[int] = mapped_column(
        ForeignKey("clientes.id_cliente"), nullable=False, index=True
    )
    id_tecnico_c: Mapped[int] = mapped_column(
        ForeignKey("tecnicos.id_tecnico"), nullable=False, index=True
    )
    id_cita_c: Mapped[int] = mapped_column(
        ForeignKey("citas.id_cita"), nullable=False
    )
    calificacion: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    comentario: Mapped[str] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now()
    )