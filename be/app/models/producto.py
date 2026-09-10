from sqlalchemy import Column, Integer, String, Float, DateTime, Date, Text, Boolean, ForeignKey
from sqlalchemy.orm import relationship
from app.database import Base
# ProductoMedida fue eliminado; las medidas se gestionan en ProductoVariante.

class Producto(Base):
    __tablename__ = "productos"
    id_producto = Column(Integer, primary_key=True, index=True)
    nombre_producto = Column(String(100))
    marca = Column(String(100), nullable=True)
    venta_por_metros = Column(Integer, nullable=False, default=0)
    referencia_producto = Column(String(50), unique=True)
    id_proveedor_pr = Column(Integer, ForeignKey("proveedores.id_proveedor"))
    precio_compra_producto = Column(Float)
    precio_venta_producto = Column(Float)
    fecha_registro_producto = Column(DateTime)
    imagen_url = Column(String(255), nullable=True)
    id_cate_pr = Column(Integer, ForeignKey("categorias.id_categoria"))
    descripcion_producto = Column(Text, nullable=True)
    caracteristicas_producto = Column(Text, nullable=True)
    colores_producto = Column(String(255), nullable=True)
    estado_producto = Column(String(20), nullable=False, default="activo")
    stock_producto = Column(Integer, nullable=False, default=0)
    descuento_activo = Column(Float, nullable=True)
    promocion_hasta = Column(Date, nullable=True)
    es_nuevo_producto = Column(Boolean, nullable=False, default=True)
    tecnicos_requeridos = Column(Integer, nullable=False, default=1)
    dificultad_instalacion = Column(String(10), nullable=True)  # baja | media | alta
    tiempo_estimado_horas = Column(Float, nullable=True)
    # El producto se vende con medidas (ancho × alto) elegibles por variante.
    tiene_medidas = Column(Boolean, nullable=False, default=False)
    # Control de visibilidad para clientes (False = oculto del catálogo público)
    visible_cliente = Column(Boolean, nullable=False, default=True)
    categoria = relationship("Categoria", foreign_keys=[id_cate_pr])
    proveedor = relationship("Proveedor", foreign_keys=[id_proveedor_pr])
    especializaciones_requeridas = relationship(
        "Especializacion",
        secondary="producto_especializacion",
        lazy="selectin",
        order_by="Especializacion.nombre",
    )
    variantes = relationship(
        "ProductoVariante",
        back_populates="producto",
        cascade="all, delete-orphan",
        order_by="ProductoVariante.id",
    )