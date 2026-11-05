# Contratos de datos para cita. Pydantic valida los campos de entrada y de respuesta de la API.
from datetime import date, datetime
from typing import Any, Optional
from pydantic import BaseModel, ConfigDict


# Agrupa los campos de CitaBase: id_tecnico, nombre_tecnico, id_tecnico_2, nombre_tecnico_2, tipo_servicio y los demás declarados abajo.
class CitaBase(BaseModel):
    id_tecnico: Optional[int] = None
    nombre_tecnico: Optional[str] = None
    id_tecnico_2: Optional[int] = None
    nombre_tecnico_2: Optional[str] = None
    tipo_servicio: str
    fecha: date
    hora: str
    direccion: str
    descripcion: Optional[str] = None
    costo_cita: Optional[float] = None
    metodo_pago: Optional[str] = None
    estado_pago: Optional[str] = None
    numero_transaccion: Optional[str] = None


# Agrupa los campos de CitaCreate: id_tecnico, metodo_pago, datos_pago.
class CitaCreate(CitaBase):
    id_tecnico: Optional[int] = None
    metodo_pago: str
    datos_pago: Optional[dict[str, Any]] = None


# Agrupa los campos de CitaUpdate: tipo_servicio, fecha, hora, direccion, descripcion.
class CitaUpdate(BaseModel):
    tipo_servicio: Optional[str] = None
    fecha: Optional[date] = None
    hora: Optional[str] = None
    direccion: Optional[str] = None
    descripcion: Optional[str] = None


# Agrupa los campos de CitaResponse: id_cita, id_cliente, estado, created_at.
class CitaResponse(CitaBase):
    id_cita: int
    id_cliente: int
    estado: str
    created_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


# Agrupa los campos de CrearCitaResponse: redirect_url.
class CrearCitaResponse(CitaResponse):
    redirect_url: Optional[str] = None
