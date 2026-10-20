# Persistencia de pedido. Los campos y relaciones describen cómo SQLAlchemy guarda y enlaza estos registros.
from datetime import datetime, date
from sqlalchemy import Date, DateTime, Float, ForeignKey, Integer, String, Text, Boolean, Numeric, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


# Mapea la tabla «pedidos»; sus referencias enlazan con clientes.
class Pedido(Base):
    __tablename__ = "pedidos"

    id_pedido: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    id_cliente_pe: Mapped[int] = mapped_column(ForeignKey("clientes.id_cliente"), nullable=True)
    fecha_peedido: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    total_pedido: Mapped[float] = mapped_column(Float, nullable=True)
    estado_pedido: Mapped[str] = mapped_column(String(50), nullable=True)
    fecha_entrega: Mapped[date] = mapped_column(Date, nullable=True)
    hora_entrega: Mapped[str] = mapped_column(String(10), nullable=True)
    hora_entrega_fin: Mapped[str] = mapped_column(String(10), nullable=True)
    id_tecnico_entrega: Mapped[int] = mapped_column(Integer, nullable=True)
    nombre_tecnico_entrega: Mapped[str] = mapped_column(String(150), nullable=True)
    estado_entrega: Mapped[str] = mapped_column(String(20), nullable=True)
    entrega_actualizada_en: Mapped[datetime] = mapped_column(DateTime, nullable=True)
    evidencia_entrega_url: Mapped[str] = mapped_column(String(255), nullable=True)
    # Marcador explícito: True cuando la confirmación de pago pendiente terminó
    # ATOMICAMENTE (pago + stock + factura + entrega/órdenes). NULL en registros
    # históricos (evidencia no fiable → conciliación). Nunca se revierte.
    confirmacion_completa: Mapped[bool] = mapped_column(Boolean, nullable=True)

    cliente = relationship("Cliente", foreign_keys=[id_cliente_pe])
    detalles = relationship("DetallePedido", back_populates="pedido")
    tecnico_entrega = relationship(
        "Tecnico",
        foreign_keys=[id_tecnico_entrega],
        primaryjoin="Pedido.id_tecnico_entrega == Tecnico.id_tecnico",
    )


# Mapea la tabla «detalle_pedido»; sus referencias enlazan con pedidos, productos.
class DetallePedido(Base):
    __tablename__ = "detalle_pedido"

    id_detalle: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    id_pedido_d: Mapped[int] = mapped_column(ForeignKey("pedidos.id_pedido"), nullable=True)
    id_producto_d: Mapped[int] = mapped_column(ForeignKey("productos.id_producto"), nullable=True)
    id_servicio_d: Mapped[int] = mapped_column(Integer, nullable=True)
    id_comision_d: Mapped[int] = mapped_column(Integer, nullable=True)
    cantidad_detalle: Mapped[int] = mapped_column(Integer, nullable=True, default=1)
    cantidad_metros: Mapped[float] = mapped_column(Numeric(10, 2), nullable=True)
    precio_unitario_detalle: Mapped[float] = mapped_column(Float, nullable=True)
    subtotal_detalle: Mapped[float] = mapped_column(Float, nullable=True)
    descripcion_detalle: Mapped[str] = mapped_column(Text, nullable=True)
    fecha_servicio: Mapped[datetime] = mapped_column(DateTime, nullable=True)
    hora_servicio: Mapped[str] = mapped_column(String(5), nullable=True)
    direccion_servicio: Mapped[str] = mapped_column(String(200), nullable=True)

    pedido = relationship("Pedido", back_populates="detalles")
    producto = relationship("Producto", foreign_keys=[id_producto_d])