# Contratos de datos para solicitud. Pydantic valida los campos de entrada y de respuesta de la API.
from datetime import datetime
from typing import Literal, Optional
from pydantic import BaseModel, ConfigDict, model_validator


# Agrupa los campos de SolicitudCreate: tipo, motivo.
class SolicitudCreate(BaseModel):
    tipo: Literal["inhabilitar", "habilitar"]
    motivo: Optional[str] = None

    @model_validator(mode="after")
    def _motivo_obligatorio_si_inhabilitar(self):
        if self.tipo == "inhabilitar" and not (self.motivo or "").strip():
            raise ValueError("Debes indicar el motivo de la inhabilitación")
        return self


# Agrupa los campos de SolicitudResponse: id, id_cliente, tipo, estado, motivo y los demás declarados abajo.
class SolicitudResponse(BaseModel):
    id: int
    id_cliente: int
    tipo: str
    estado: str
    motivo: Optional[str] = None
    created_at: Optional[datetime] = None
    resuelta_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


# Agrupa los campos de AdminSolicitudResponse: id, id_cliente, tipo, estado, motivo y los demás declarados abajo.
class AdminSolicitudResponse(BaseModel):
    id: int
    id_cliente: int
    tipo: str
    estado: str
    motivo: Optional[str] = None
    created_at: Optional[datetime] = None
    resuelta_at: Optional[datetime] = None
    cliente_nombre: str
    cliente_email: str
    cliente_activo: bool = True

    model_config = ConfigDict(from_attributes=True)


# Agrupa los campos de AdminSolicitudEmpleadoResponse: id, id_usuario, estado, created_at, resuelta_at y los demás declarados abajo.
class AdminSolicitudEmpleadoResponse(BaseModel):
    id: int
    id_usuario: int
    estado: str
    created_at: Optional[datetime] = None
    resuelta_at: Optional[datetime] = None
    empleado_nombre: str
    empleado_email: str
    empleado_rol: str = "empleado"
    empleado_activo: bool = True

    model_config = ConfigDict(from_attributes=True)