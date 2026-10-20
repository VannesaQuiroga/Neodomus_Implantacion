# Persistencia de tarifa servicio. Los campos y relaciones describen cómo SQLAlchemy guarda y enlaza estos registros.
from decimal import Decimal

from sqlalchemy import Numeric, String
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class TarifaServicio(Base):
    """Tarifa fija configurable por tipo de servicio para citas."""

    __tablename__ = "tarifas_servicio"

    id_tarifa: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tipo_servicio: Mapped[str] = mapped_column(String(30), unique=True, nullable=False)
    costo: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    descripcion: Mapped[str] = mapped_column(String(150), nullable=True)
