# Persistencia de notificacion. Los campos y relaciones describen cómo SQLAlchemy guarda y enlaza estos registros.
from datetime import datetime
from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, func, text
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base

class Notificacion(Base):
    """Notificación de plataforma dirigida a un usuario o cliente.

    Es la fuente de verdad de las notificaciones dentro de la app: se crea en
    los mismos eventos donde se envía el correo y el frontend la consulta para
    la campana y el panel. El estado leida se guarda aquí (no en el navegador),
    así que es consistente entre dispositivos.
    """

    __tablename__ = "notificaciones"

    id_notificacion: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    id_usuario: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("usuarios.id_usuario"), nullable=True, index=True
    )
    id_cliente: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("clientes.id_cliente"), nullable=True, index=True
    )
    tipo: Mapped[str] = mapped_column(String(30), nullable=False, default="sistema")
    titulo: Mapped[str] = mapped_column(String(150), nullable=False)
    mensaje: Mapped[str] = mapped_column(String(500), nullable=False)
    leida: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=text("0")
    )
    fecha_creacion: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )