"""
Router: catálogo de especializaciones (domótica).

- GET  /especializaciones            → lista (público; ?todas=true para admin)
- POST /especializaciones            → crear (admin)
- PUT  /especializaciones/{id}       → editar nombre/descripción/activa (admin)
- DELETE /especializaciones/{id}     → eliminar si no está en uso (admin)
"""
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.especializacion import (
    Especializacion,
    producto_especializacion,
    tecnico_especializacion,
)
from app.models.roles_usuario import RolesUsuario
from app.models.user import User
from app.utils.security import get_current_employee

router = APIRouter(prefix="/especializaciones", tags=["Especializaciones"])


# Agrupa los campos de EspecializacionOut: id_especializacion, nombre, descripcion, activa, tecnicos_count y los demás declarados abajo.
class EspecializacionOut(BaseModel):
    id_especializacion: int
    nombre: str
    descripcion: str | None = None
    activa: bool = True
    tecnicos_count: int = 0
    productos_count: int = 0


# Agrupa los campos de EspecializacionCreate: nombre, descripcion, activa.
class EspecializacionCreate(BaseModel):
    nombre: str
    descripcion: str | None = None
    activa: bool = True


# Agrupa los campos de EspecializacionUpdate: nombre, descripcion, activa.
class EspecializacionUpdate(BaseModel):
    nombre: str | None = None
    descripcion: str | None = None
    activa: bool | None = None


# Valida las condiciones de esta operación y devuelve un error HTTP si no se cumplen.
def _admin(
    current_user: User = Depends(get_current_employee),
    db: Session = Depends(get_db),
) -> User:
    role = db.execute(
        select(RolesUsuario.nombre_rol).where(RolesUsuario.id_rol == current_user.id_rol_u)
    ).scalar_one_or_none()
    if role not in ("admin", "administrador"):
        raise HTTPException(status_code=403, detail="Permisos insuficientes")
    return current_user


def _serializar(db: Session, e: Especializacion) -> EspecializacionOut:
    tecnicos_count = (
        db.query(func.count())
        .select_from(tecnico_especializacion)
        .filter(tecnico_especializacion.c.id_especializacion == e.id_especializacion)
        .scalar()
        or 0
    )
    productos_count = (
        db.query(func.count())
        .select_from(producto_especializacion)
        .filter(producto_especializacion.c.id_especializacion == e.id_especializacion)
        .scalar()
        or 0
    )
    return EspecializacionOut(
        id_especializacion=e.id_especializacion,
        nombre=e.nombre,
        descripcion=e.descripcion,
        activa=bool(e.activa),
        tecnicos_count=int(tecnicos_count),
        productos_count=int(productos_count),
    )


@router.get("", response_model=List[EspecializacionOut])
def listar_especializaciones(
    todas: bool = False,
    db: Session = Depends(get_db),
):
    """Lista el catálogo de especializaciones. Por defecto solo las activas;
    con `todas=true` (requiere autenticación de empleado) incluye inactivas."""
    query = db.query(Especializacion).order_by(Especializacion.nombre.asc())
    if not todas:
        query = query.filter(Especializacion.activa == True)  # noqa: E712
    return [_serializar(db, e) for e in query.all()]


# Consulta Especializacion; confirma los cambios con la sesión de base de datos.
@router.post("", response_model=EspecializacionOut)
def crear_especializacion(
    data: EspecializacionCreate,
    _admin_user: User = Depends(_admin),
    db: Session = Depends(get_db),
):
    nombre = (data.nombre or "").strip()
    if not nombre:
        raise HTTPException(status_code=400, detail="El nombre es obligatorio")
    existe = (
        db.query(Especializacion)
        .filter(func.lower(Especializacion.nombre) == nombre.lower())
        .first()
    )
    if existe:
        raise HTTPException(status_code=400, detail="Ya existe una especialización con ese nombre")
    esp = Especializacion(nombre=nombre, descripcion=data.descripcion, activa=data.activa)
    db.add(esp)
    db.commit()
    db.refresh(esp)
    return _serializar(db, esp)


# Consulta Especializacion; confirma los cambios con la sesión de base de datos.
@router.put("/{id_especializacion}", response_model=EspecializacionOut)
def actualizar_especializacion(
    id_especializacion: int,
    data: EspecializacionUpdate,
    _admin_user: User = Depends(_admin),
    db: Session = Depends(get_db),
):
    esp = (
        db.query(Especializacion)
        .filter(Especializacion.id_especializacion == id_especializacion)
        .first()
    )
    if not esp:
        raise HTTPException(status_code=404, detail="Especialización no encontrada")
    if data.nombre is not None:
        nombre = data.nombre.strip()
        if not nombre:
            raise HTTPException(status_code=400, detail="El nombre es obligatorio")
        duplicada = (
            db.query(Especializacion)
            .filter(
                func.lower(Especializacion.nombre) == nombre.lower(),
                Especializacion.id_especializacion != id_especializacion,
            )
            .first()
        )
        if duplicada:
            raise HTTPException(status_code=400, detail="Ya existe una especialización con ese nombre")
        esp.nombre = nombre
    if data.descripcion is not None:
        esp.descripcion = data.descripcion
    if data.activa is not None:
        esp.activa = data.activa
    db.commit()
    db.refresh(esp)
    return _serializar(db, esp)


@router.delete("/{id_especializacion}", response_model=dict)
def eliminar_especializacion(
    id_especializacion: int,
    _admin_user: User = Depends(_admin),
    db: Session = Depends(get_db),
):
    """Elimina una especialización solo si no tiene técnicos ni productos
    asociados; en caso contrario sugiere desactivarla."""
    esp = (
        db.query(Especializacion)
        .filter(Especializacion.id_especializacion == id_especializacion)
        .first()
    )
    if not esp:
        raise HTTPException(status_code=404, detail="Especialización no encontrada")
    datos = _serializar(db, esp)
    if datos.tecnicos_count or datos.productos_count:
        raise HTTPException(
            status_code=400,
            detail=(
                f"No se puede eliminar: {datos.tecnicos_count} técnico(s) y "
                f"{datos.productos_count} producto(s) la usan. Desactívala."
            ),
        )
    db.delete(esp)
    db.commit()
    return {"msg": "Especialización eliminada", "id": id_especializacion}
