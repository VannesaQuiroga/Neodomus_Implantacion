# Persistencia de especializacion. Los campos y relaciones describen cómo SQLAlchemy guarda y enlaza estos registros.
from sqlalchemy import (
    Column,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Table,
    Boolean,
    Text,
    Float,
    func,
)
from app.database import Base

# ────────────────────────────────────────────────────────────────
# Catálogo de especializaciones (domótica) administrable.
# ────────────────────────────────────────────────────────────────


# Mapea la tabla «especializaciones».
class Especializacion(Base):
    __tablename__ = "especializaciones"

    id_especializacion = Column(Integer, primary_key=True, index=True)
    nombre = Column(String(100), nullable=False, unique=True)
    descripcion = Column(String(255), nullable=True)
    activa = Column(Boolean, nullable=False, default=True, server_default="1")
    created_at = Column(DateTime, server_default=func.now())


# TÉCNICO ↔ ESPECIALIZACIÓN (muchos a muchos)
tecnico_especializacion = Table(
    "tecnico_especializacion",
    Base.metadata,
    Column(
        "id_tecnico",
        Integer,
        ForeignKey("tecnicos.id_tecnico", ondelete="CASCADE"),
        primary_key=True,
    ),
    Column(
        "id_especializacion",
        Integer,
        ForeignKey("especializaciones.id_especializacion", ondelete="CASCADE"),
        primary_key=True,
    ),
)

# PRODUCTO ↔ ESPECIALIZACIÓN requerida para su instalación (muchos a muchos)
producto_especializacion = Table(
    "producto_especializacion",
    Base.metadata,
    Column(
        "id_producto",
        Integer,
        ForeignKey("productos.id_producto", ondelete="CASCADE"),
        primary_key=True,
    ),
    Column(
        "id_especializacion",
        Integer,
        ForeignKey("especializaciones.id_especializacion", ondelete="CASCADE"),
        primary_key=True,
    ),
)


# ────────────────────────────────────────────────────────────────
# Historial / trazabilidad de citas (reasignaciones, cancelaciones…)
# ────────────────────────────────────────────────────────────────


# Mapea la tabla «historial_citas»; sus referencias enlazan con citas.
class HistorialCita(Base):
    __tablename__ = "historial_citas"

    id_historial = Column(Integer, primary_key=True, index=True)
    id_cita = Column(
        Integer, ForeignKey("citas.id_cita", ondelete="CASCADE"), nullable=False, index=True
    )
    accion = Column(String(50), nullable=False)  # creacion | reasignacion | cancelacion | entrega | actualizacion
    tecnico_anterior_id = Column(Integer, nullable=True)
    tecnico_anterior_nombre = Column(String(150), nullable=True)
    tecnico_nuevo_id = Column(Integer, nullable=True)
    tecnico_nuevo_nombre = Column(String(150), nullable=True)
    administrador_id = Column(Integer, nullable=True)
    motivo = Column(String(255), nullable=True)
    detalle = Column(Text, nullable=True)
    created_at = Column(DateTime, server_default=func.now())


# ────────────────────────────────────────────────────────────────
# Reembolsos (integrados con la pasarela simulada de pagos).
# Estados: Pendiente | Procesando | Reembolsado | Rechazado
# ────────────────────────────────────────────────────────────────


# Mapea la tabla «reembolsos»; sus referencias enlazan con citas, pedidos.
class Reembolso(Base):
    __tablename__ = "reembolsos"

    id_reembolso = Column(Integer, primary_key=True, index=True)
    id_cita = Column(Integer, ForeignKey("citas.id_cita", ondelete="SET NULL"), nullable=True, index=True)
    id_pedido = Column(Integer, ForeignKey("pedidos.id_pedido", ondelete="SET NULL"), nullable=True, index=True)
    monto = Column(Float, nullable=False, default=0)
    estado = Column(String(20), nullable=False, default="Pendiente")
    motivo = Column(String(255), nullable=True)
    numero_transaccion_original = Column(String(120), nullable=True)
    numero_transaccion_reembolso = Column(String(120), nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    procesado_at = Column(DateTime, nullable=True)
