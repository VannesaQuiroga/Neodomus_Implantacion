# Persistencia de cita producto. Los campos y relaciones describen cómo SQLAlchemy guarda y enlaza estos registros.
from sqlalchemy import ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class CitaProducto(Base):
    """Productos asociados a una cita de servicio.

    Permite al técnico ver los productos que se utilizarán o se instalaron
    en una cita específica.
    """

    __tablename__ = "cita_producto"

    id_cita_producto: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    id_cita: Mapped[int] = mapped_column(
        ForeignKey("citas.id_cita", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    id_producto: Mapped[int] = mapped_column(
        ForeignKey("productos.id_producto"),
        index=True,
        nullable=False,
    )
    id_variante: Mapped[int] = mapped_column(
        ForeignKey("producto_variantes.id", ondelete="SET NULL"),
        nullable=True,
    )
    cantidad: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    notas: Mapped[str] = mapped_column(String(255), nullable=True)

    cita = relationship("Cita", back_populates="productos_asociados")
    producto = relationship("Producto", foreign_keys=[id_producto])
    variante = relationship("ProductoVariante", foreign_keys=[id_variante])
