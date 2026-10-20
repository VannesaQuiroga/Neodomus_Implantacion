# Persistencia de email verification token. Los campos y relaciones describen cómo SQLAlchemy guarda y enlaza estos registros.
from datetime import datetime
from typing import TYPE_CHECKING
from sqlalchemy import Boolean, DateTime, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base

if TYPE_CHECKING:
    from .cliente import Cliente

# Mapea la tabla «email_verification_tokens»; sus referencias enlazan con clientes.
class EmailVerificationToken(Base):
    __tablename__ = "email_verification_tokens"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    email_cliente: Mapped[str] = mapped_column(String(100), ForeignKey("clientes.email", ondelete="CASCADE"), nullable=False, unique=True)
    code: Mapped[str] = mapped_column(String(6), unique=True, index=True, nullable=False)   # código de 6 dígitos
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    used: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    cliente: Mapped["Cliente"] = relationship("Cliente", back_populates="email_verification_tokens")