# Persistencia de devolucion. Los campos y relaciones describen cómo SQLAlchemy guarda y enlaza estos registros.
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Devolucion(Base):
    """Solicitud de devolución de un producto recibido, creada por el cliente
    desde la calificación del pedido entregado.

    Estados: Pendiente → Aprobada | Rechazada
    """

    __tablename__ = "devoluciones"

    id_devolucion: Mapped[int] = mapped_column(
        Integer, primary_key=True, autoincrement=True
    )
    id_cliente_d: Mapped[int] = mapped_column(
        ForeignKey("clientes.id_cliente"), nullable=False, index=True
    )
    id_pedido_d: Mapped[int] = mapped_column(
        ForeignKey("pedidos.id_pedido"), nullable=True, index=True
    )
    id_producto_d: Mapped[int] = mapped_column(
        ForeignKey("productos.id_producto"), nullable=True, index=True
    )
    motivo: Mapped[str] = mapped_column(Text, nullable=True)
    descripcion: Mapped[str | None] = mapped_column(Text, nullable=True)
    estado: Mapped[str] = mapped_column(String(20), nullable=False, server_default="Pendiente")
    resolucion: Mapped[str] = mapped_column(String(20), nullable=True)
    resuelta_por: Mapped[int] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now()
    )
    resuelta_at: Mapped[datetime] = mapped_column(DateTime, nullable=True)
    # Preferencia del cliente: 'producto' (cambio) o 'dinero' (reembolso).
    preferencia: Mapped[str | None] = mapped_column(String(10), nullable=True)
    # Recogida del producto: tǸcnico asignado aleatoriamente por el sistema.
    id_tecnico_recogida: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    recogida_estado: Mapped[str | None] = mapped_column(
        String(20), nullable=True, server_default="Asignada"
    )
    # Evidencia fotográfica en MinIO (clave del objeto) al recoger el producto.
    evidencia_recogida: Mapped[str | None] = mapped_column(String(255), nullable=True)
    fecha_recogida: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    # Evidencia fotográfica de la entrega del producto de cambio (resolución
    # 'Cambio'): foto del producto nuevo entregado al cliente.
    evidencia_cambio: Mapped[str | None] = mapped_column(String(255), nullable=True)
    fecha_entrega_cambio: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    # Cantidad de unidades devueltas de este producto (devolución parcial).
    cantidad: Mapped[int] = mapped_column(Integer, nullable=False, server_default="1")
    # Solicitud de devolución (cabecera) que agrupa esta línea.
    id_solicitud_dv: Mapped[int | None] = mapped_column(
        Integer, nullable=True, index=True
    )
