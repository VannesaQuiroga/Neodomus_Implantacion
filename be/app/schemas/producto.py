# Contratos de datos para producto. Pydantic valida los campos de entrada y de respuesta de la API.
from pydantic import BaseModel
from typing import Optional

# Agrupa los campos de ProductoResponse: id_producto, nombre_producto, precio_venta_producto, imagen_url, id_cate_pr y los demás declarados abajo.
class ProductoResponse(BaseModel):
    id_producto: int
    nombre_producto: str
    precio_venta_producto: float
    imagen_url: Optional[str] = None
    id_cate_pr: Optional[int] = None
    nombre_categoria: Optional[str] = None
    descuento_activo: Optional[float] = None
    precio_final: Optional[float] = None

    class Config:
        from_attributes = True

# Agrupa los campos de CategoriaResponse: id_categoria, nombre_categoria, descripcion.
class CategoriaResponse(BaseModel):
    id_categoria: int
    nombre_categoria: str
    descripcion: str