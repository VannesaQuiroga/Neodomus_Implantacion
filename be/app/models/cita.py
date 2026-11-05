# Persistencia de cita. Los campos y relaciones describen cómo SQLAlchemy guarda y enlaza estos registros.
from datetime import datetime, date
from decimal import Decimal

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, Numeric, String, Text, func, text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


# Mapea la tabla «citas»; sus referencias enlazan con clientes, comisiones, especializaciones.
class Cita(Base):
    __tablename__ = "citas"

    id_cita: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    id_cliente: Mapped[int] = mapped_column(
        ForeignKey("clientes.id_cliente", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    id_tecnico: Mapped[int] = mapped_column(Integer, nullable=True)
    nombre_tecnico: Mapped[str] = mapped_column(String(150), nullable=True)
    id_tecnico_2: Mapped[int] = mapped_column(Integer, nullable=True)
    nombre_tecnico_2: Mapped[str] = mapped_column(String(150), nullable=True)
    id_tecnico_3: Mapped[int] = mapped_column(Integer, nullable=True)
    nombre_tecnico_3: Mapped[str] = mapped_column(String(150), nullable=True)
    tipo_servicio: Mapped[str] = mapped_column(String(30), nullable=False)
    fecha: Mapped[date] = mapped_column(Date, nullable=False)
    hora: Mapped[str] = mapped_column(String(10), nullable=False)
    direccion: Mapped[str] = mapped_column(String(200), nullable=False)
    descripcion: Mapped[str] = mapped_column(Text, nullable=True)
    estado: Mapped[str] = mapped_column(String(20), nullable=False, default="Pendiente")
    costo_cita: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=True)
    metodo_pago: Mapped[str] = mapped_column(String(30), nullable=True)
    estado_pago: Mapped[str] = mapped_column(String(20), nullable=True)
    numero_transaccion: Mapped[str] = mapped_column(String(120), nullable=True)
    id_comision_c: Mapped[int] = mapped_column(
        ForeignKey("comisiones.id_comision"),
        nullable=True,
    )
    id_especializacion: Mapped[int] = mapped_column(
        ForeignKey("especializaciones.id_especializacion", ondelete="SET NULL"),
        nullable=True,
    )
    recordatorio_enviado: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=text("0")
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    cliente = relationship("Cliente", foreign_keys=[id_cliente])
    especializacion = relationship("Especializacion", foreign_keys=[id_especializacion])
    productos_asociados = relationship(
        "CitaProducto",
        back_populates="cita",
        cascade="all, delete-orphan",
    )
