# Rutas de tarifas. Las dependencias declaradas en cada endpoint determinan sus permisos de acceso.
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session
from typing import List

from app.database import get_db
from app.models.tarifa_servicio import TarifaServicio
from app.models.user import User
from app.models.roles_usuario import RolesUsuario
from app.schemas.tarifa import TarifaResponse, TarifaUpdate
from app.utils.security import get_current_employee

router = APIRouter(prefix="/tarifas", tags=["Tarifas de servicio"])


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


@router.get("", response_model=List[TarifaResponse])
def listar_tarifas(db: Session = Depends(get_db)):
    """Lista las tarifas por tipo de servicio (acceso público para que el
    cliente vea el costo antes de agendar)."""
    tarifas = db.query(TarifaServicio).order_by(TarifaServicio.tipo_servicio.asc()).all()
    return tarifas


@router.put("/{tipo_servicio}", response_model=TarifaResponse)
def actualizar_tarifa(
    tipo_servicio: str,
    data: TarifaUpdate,
    _admin_user: User = Depends(_admin),
    db: Session = Depends(get_db),
):
    """Actualiza el costo (y descripción) de una tarifa de servicio (solo admin)."""
    if data.costo <= 0:
        raise HTTPException(status_code=400, detail="El costo debe ser mayor a cero")
    tarifa = (
        db.query(TarifaServicio)
        .filter(TarifaServicio.tipo_servicio == tipo_servicio.lower().strip())
        .first()
    )
    if not tarifa:
        raise HTTPException(status_code=404, detail="Tarifa no encontrada para ese servicio")
    tarifa.costo = data.costo
    if data.descripcion is not None:
        tarifa.descripcion = data.descripcion.strip() or None
    db.commit()
    db.refresh(tarifa)
    return tarifa
