# Persistencia de pending registration. Los campos y relaciones describen cómo SQLAlchemy guarda y enlaza estos registros.
from sqlalchemy import Column, Integer, String, DateTime, BigInteger
from sqlalchemy.sql import func
from app.database import Base

# Mapea la tabla «pending_registrations».
class PendingRegistration(Base):
    __tablename__ = "pending_registrations"

    id = Column(Integer, primary_key=True, index=True)
    first_name = Column(String(100), nullable=False)
    last_name = Column(String(100), nullable=False)
    id_tipo_documento_c = Column(Integer, nullable=True)
    documento_cliente = Column(BigInteger, nullable=True)
    telefono_cliente = Column(BigInteger, nullable=True)
    email = Column(String(100), unique=True, nullable=False, index=True)
    address = Column(String(150), nullable=True)
    password_hash = Column(String(255), nullable=False)
    code = Column(String(6), nullable=False)
    expires_at = Column(DateTime, nullable=False)
    created_at = Column(DateTime, server_default=func.now())