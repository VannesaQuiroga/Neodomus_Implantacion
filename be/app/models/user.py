# Persistencia de user. Los campos y relaciones describen cómo SQLAlchemy guarda y enlaza estos registros.
from datetime import datetime
from sqlalchemy import BigInteger, Boolean, DateTime, ForeignKey, Integer, String, func, text
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base

# Mapea la tabla «usuarios»; sus referencias enlazan con roles_usuario.
class User(Base):
    __tablename__ = "usuarios"

    id_usuario: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    first_name: Mapped[str] = mapped_column(String(100), nullable=False)
    last_name: Mapped[str] = mapped_column(String(100), nullable=False)
    id_tipo_documento_u: Mapped[int] = mapped_column(Integer, nullable=True)
    documento_usuario: Mapped[int] = mapped_column(Integer, unique=True, nullable=True)
    telefono_usuario: Mapped[int] = mapped_column(BigInteger, nullable=True)
    email: Mapped[str] = mapped_column(String(100), unique=True, index=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    id_rol_u: Mapped[int] = mapped_column(Integer, ForeignKey("roles_usuario.id_rol"), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    desactivado_hasta: Mapped[datetime] = mapped_column(DateTime, nullable=True)
    foto_url: Mapped[str] = mapped_column(String(255), nullable=True)
    password_reset_required: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=text("0")
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

