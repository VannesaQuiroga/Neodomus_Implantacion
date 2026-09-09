"""
Módulo: models/novedad.py

Tablas: novedades, novedad_historial
Descripción: Sistema de novedades e incidencias reportadas por técnicos
sobre entregas, citas, productos y clientes. El administrador revisa,
aprobar/rechaza y genera compensaciones cuando corresponde.
"""
from datetime import datetime
from typing import TYPE_CHECKING, List, Optional
from sqlalchemy import (
    Boolean, Column, Date, DateTime, Float, ForeignKey, Integer,
    String, Text, func, text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base

if TYPE_CHECKING:
    from app.models.tecnico import Tecnico
    from app.models.pedido import Pedido
    from app.models.cita import Cita
    from app.models.cliente import Cliente


class Novedad(Base):
    __tablename__ = "novedades"

    id_novedad: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    id_tecnico_n: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("tecnicos.id_tecnico"), nullable=True, index=True,
    )
    id_pedido: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("pedidos.id_pedido"), nullable=True, index=True,
    )
    id_cita: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("citas.id_cita"), nullable=True, index=True,
    )
    id_cliente: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("clientes.id_cliente"), nullable=True, index=True,
    )
    fecha_reporte_novedad: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False,
    )
    tipo_novedad: Mapped[str] = mapped_column(String(100), nullable=False)
    descripcion_novedad: Mapped[str] = mapped_column(Text, nullable=False)
    prioridad: Mapped[str] = mapped_column(
        String(20), nullable=False, default="normal", server_default="normal",
    )
    estado_novedad: Mapped[str] = mapped_column(
        String(50), nullable=False, server_default=text("'Pendiente'"),
    )
    lugar_ocurrencia: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    evidencia_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    accion_admin: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    id_admin_resuelve: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("usuarios.id_usuario"), nullable=True,
    )
    fecha_resolucion: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    # Relaciones
    tecnico = relationship("Tecnico", foreign_keys=[id_tecnico_n], lazy="selectin")
    pedido = relationship("Pedido", foreign_keys=[id_pedido], lazy="selectin")
    cita = relationship("Cita", foreign_keys=[id_cita], lazy="selectin")
    cliente = relationship("Cliente", foreign_keys=[id_cliente], lazy="selectin")
    historial: Mapped[List["NovedadHistorial"]] = relationship(
        "NovedadHistorial",
        back_populates="novedad",
        cascade="all, delete-orphan",
        order_by="NovedadHistorial.fecha",
    )


class NovedadHistorial(Base):
    __tablename__ = "novedad_historial"

    id_historial: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    id_novedad: Mapped[int] = mapped_column(
        Integer, ForeignKey("novedades.id_novedad", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    id_usuario: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("usuarios.id_usuario"), nullable=True,
    )
    accion: Mapped[str] = mapped_column(String(100), nullable=False)
    detalle: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    fecha: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False,
    )

    novedad = relationship("Novedad", back_populates="historial")
    usuario = relationship("User", lazy="selectin")


class CuponDescuento(Base):
    __tablename__ = "cupones_descuento"

    id_cupon: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    codigo: Mapped[str] = mapped_column(String(50), unique=True, nullable=False, index=True)
    tipo_descuento: Mapped[str] = mapped_column(
        String(20), nullable=False, default="porcentaje",
    )
    valor_descuento: Mapped[float] = mapped_column(Float, nullable=False)
    fecha_vencimiento: Mapped[Optional[Date]] = mapped_column(Date, nullable=True)
    compra_minima: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    usos_maximos: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    usos_realizados: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    aplica_tienda_completa: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default=text("1"),
    )
    categorias_aplicables: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    id_cliente: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("clientes.id_cliente"), nullable=True, index=True,
    )
    id_novedad: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("novedades.id_novedad"), nullable=True,
    )
    id_admin_crea: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("usuarios.id_usuario"), nullable=True,
    )
    activo: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default=text("1"),
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False,
    )

    cliente = relationship("Cliente", lazy="selectin")
    novedad = relationship("Novedad", lazy="selectin")
