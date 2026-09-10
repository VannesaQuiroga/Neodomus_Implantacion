from typing import Optional
from pydantic import BaseModel, ConfigDict, EmailStr, Field

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

class ClientUpdate(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    id_tipo_documento_c: Optional[int] = None
    documento_cliente: Optional[int] = None
    telefono_cliente: Optional[int] = Field(None, ge=1000000000, le=9999999999)
    email: Optional[EmailStr] = None
    address: Optional[str] = None