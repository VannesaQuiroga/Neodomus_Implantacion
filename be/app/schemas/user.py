# Contratos de datos para user. Pydantic valida los campos de entrada y de respuesta de la API.
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict, EmailStr, Field

# Agrupa los campos de EmployeeResponse: id_usuario, first_name, last_name, id_tipo_documento_u, documento_usuario y los demás declarados abajo.
class EmployeeResponse(BaseModel):
    id_usuario: int
    first_name: str
    last_name: str
    id_tipo_documento_u: Optional[int] = None
    documento_usuario: Optional[int] = None
    telefono_usuario: Optional[int] = None
    email: EmailStr
    is_active: bool
    id_rol_u: Optional[int] = None
    created_at: datetime
    foto_url: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class PerfilEmpleadoResponse(EmployeeResponse):
    """Perfil del empleado autenticado, incluye su ficha técnica (si existe)."""

    certificacion_t: Optional[str] = None
    especializaciones: list[dict] = []

# app/schemas/user.py (añade al final)

# Agrupa los campos de UserBase: email, first_name, last_name.
class UserBase(BaseModel):
    email: EmailStr
    first_name: str
    last_name: str

# Agrupa los campos de UserCreate: password.
class UserCreate(UserBase):
    password: str

# Agrupa los campos de UserOut: id_usuario, is_active, created_at.
class UserOut(UserBase):
    id_usuario: int
    is_active: bool
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)

# Agrupa los campos de UserUpdate: first_name, last_name, email, telefono_usuario, documento_usuario y los demás declarados abajo.
class UserUpdate(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    email: Optional[EmailStr] = None
    telefono_usuario: Optional[int] = Field(None, ge=1000000000, le=9999999999)
    documento_usuario: Optional[int] = Field(None, ge=100000, le=999999999999)
    certificacion_t: Optional[str] = None