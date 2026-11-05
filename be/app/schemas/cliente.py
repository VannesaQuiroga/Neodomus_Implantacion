# Contratos de datos para cliente. Pydantic valida los campos de entrada y de respuesta de la API.
from typing import Optional
from pydantic import BaseModel, ConfigDict, EmailStr, Field

# Agrupa los campos de ClientResponse: id_cliente, first_name, last_name, id_tipo_documento_c, documento_cliente y los demás declarados abajo.
class ClientResponse(BaseModel):
    id_cliente: int
    first_name: str
    last_name: str
    id_tipo_documento_c: Optional[int] = None
    documento_cliente: Optional[int] = None
    telefono_cliente: Optional[int] = None
    email: EmailStr
    address: Optional[str] = None
    is_active: bool
    foto_url: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)

# Agrupa los campos de ClientUpdate: first_name, last_name, id_tipo_documento_c, documento_cliente, telefono_cliente y los demás declarados abajo.
class ClientUpdate(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    id_tipo_documento_c: Optional[int] = None
    documento_cliente: Optional[int] = None
    telefono_cliente: Optional[int] = Field(None, ge=1000000000, le=9999999999)
    email: Optional[EmailStr] = None
    address: Optional[str] = None