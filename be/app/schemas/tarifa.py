# Contratos de datos para tarifa. Pydantic valida los campos de entrada y de respuesta de la API.
from typing import Optional
from pydantic import BaseModel, ConfigDict


# Agrupa los campos de TarifaResponse: tipo_servicio, costo, descripcion.
class TarifaResponse(BaseModel):
    tipo_servicio: str
    costo: float
    descripcion: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


# Agrupa los campos de TarifaUpdate: costo, descripcion.
class TarifaUpdate(BaseModel):
    costo: float
    descripcion: Optional[str] = None
