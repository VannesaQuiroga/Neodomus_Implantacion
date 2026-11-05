# Persistencia de categoria. Los campos y relaciones describen cómo SQLAlchemy guarda y enlaza estos registros.
from sqlalchemy import Column, Integer, String
from app.database import Base

# Mapea la tabla «categorias».
class Categoria(Base):
    __tablename__ = "categorias"
    id_categoria = Column(Integer, primary_key=True, index=True)
    nombre_categoria = Column(String(50), nullable=False)
    descripcion = Column(String(200))