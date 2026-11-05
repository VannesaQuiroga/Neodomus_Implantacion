# Persistencia de password reset token. Los campos y relaciones describen cómo SQLAlchemy guarda y enlaza estos registros.
from datetime import datetime
from sqlalchemy import Column, Integer, String, Boolean, DateTime
from sqlalchemy.sql import func
from app.database import Base

# Mapea la tabla «password_reset_tokens».
class PasswordResetToken(Base):
    __tablename__ = "password_reset_tokens"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), nullable=False, index=True)
    user_type = Column(String(20), nullable=False)  # 'employee' o 'client'
    token = Column(String(500), nullable=True, unique=True, index=True)
    code = Column(String(10), nullable=False)
    expires_at = Column(DateTime, nullable=False)
    used = Column(Boolean, default=False)
    ip_used = Column(String(45), nullable=True)
    created_at = Column(DateTime, server_default=func.now())