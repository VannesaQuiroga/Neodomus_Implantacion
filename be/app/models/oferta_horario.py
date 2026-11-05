"""Ofertas de horarios liberados por cancelaciones.

Cuando una cita se cancela, su franja se OFRECE a los clientes que tienen
una cita futura con el mismo tÃ©cnico, ordenados por lealtad (compras +
servicios adquiridos). El primero que acepta mueve su cita al horario
libre; las demÃ¡s ofertas del mismo hueco se marcan como 'Perdida'.
Si nadie acepta antes de que expire su ventana, pasa a 'Expirada'.
"""

from datetime import datetime

from sqlalchemy import Date, DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


# Mapea la tabla «ofertas_horario»; sus referencias enlazan con clientes.
class OfertaHorario(Base):
    __tablename__ = "ofertas_horario"

    id_oferta: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    # Cliente destinatario de ESTA oferta (una fila por candidato).
    id_cliente: Mapped[int] = mapped_column(
        Integer, ForeignKey("clientes.id_cliente", ondelete="CASCADE"), nullable=False, index=True
    )
    # Franja liberada
    fecha: Mapped[datetime.date] = mapped_column(Date, nullable=False)
    hora: Mapped[str] = mapped_column(String(10), nullable=False)
    tipo_servicio: Mapped[str] = mapped_column(String(30), nullable=False)
    id_tecnico: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    nombre_tecnico: Mapped[str | None] = mapped_column(String(150), nullable=True)
    # Lealtad del cliente al momento de generarse (pedidos pagados + citas).
    puntaje: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    # Estado: Ofrecida -> Aceptada | Expirada | Perdida
    estado: Mapped[str] = mapped_column(String(15), nullable=False, default="Ofrecida", index=True)
    # Cliente que aceptó la oferta (trazabilidad; el primero que la tomó).
    aceptada_por_cliente: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("clientes.id_cliente", ondelete="SET NULL"), nullable=True
    )
    # Ventana para aceptar
    expira_en: Mapped[datetime] = mapped_column(DateTime, nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
