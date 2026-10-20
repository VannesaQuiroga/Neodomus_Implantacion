# Persistencia de proveedor. Los campos y relaciones describen cómo SQLAlchemy guarda y enlaza estos registros.
from sqlalchemy import Column, Integer, String
from app.database import Base

# Mapea la tabla «proveedores».
class Proveedor(Base):
    __tablename__ = "proveedores"
    id_proveedor = Column(Integer, primary_key=True, index=True)
    nombre_proveedor = Column(String(100))
    contacto_proveedor = Column(String(100))
    telefono_proveedor = Column(String(20))
    correo_proveedor = Column(String(100), unique=True)
    direccion_proveedor = Column(String(150))