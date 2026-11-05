# Rutas de consultas. Las dependencias declaradas en cada endpoint determinan sus permisos de acceso.
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import select
from sqlalchemy.orm import Session
from typing import List, Optional

from app.database import get_db
from app.models.contacto import Contacto
from app.models.roles_usuario import RolesUsuario
from app.models.user import User
from app.utils.security import get_current_employee

router = APIRouter(tags=["Contacto"])

ESTADOS_VALIDOS = {"pendiente", "respondida"}

# Categorías de consulta. Clave almacenada en BD; label para mostrar en el panel.
CATEGORIAS_CONSULTA = {
    "consulta-general": "Consulta general",
    "soporte-tecnico": "Soporte técnico",
    "pedido": "Pedido",
    "pago": "Pago",
    "reembolso": "Reembolso",
    "reclamo": "Reclamo",
    "otro": "Otro",
}


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


def _to_dict(c: Contacto) -> dict:
    return {
        "id": c.id,
        "nombre_usuario": c.nombre_usuario,
        "email_usuario": c.email_usuario,
        "asunto": c.asunto,
        "mensaje": c.mensaje,
        "categoria": c.categoria,
        "estado": c.estado,
        "respuesta": c.respuesta,
        "created_at": c.created_at.isoformat() if c.created_at else None,
        "responded_at": c.responded_at.isoformat() if c.responded_at else None,
    }


# Agrupa los campos de ConsultaCreate: nombre, email, asunto, mensaje, categoria.
class ConsultaCreate(BaseModel):
    nombre: str = Field(..., min_length=2, max_length=120)
    email: EmailStr
    asunto: str = Field(..., min_length=3, max_length=180)
    mensaje: str = Field(..., min_length=5)
    categoria: Optional[str] = None


# Agrupa los campos de ConsultaUpdate: estado, respuesta, categoria.
class ConsultaUpdate(BaseModel):
    estado: Optional[str] = None
    respuesta: Optional[str] = None
    categoria: Optional[str] = None


@router.post("/contacto", response_model=dict)
def crear_consulta(data: ConsultaCreate, db: Session = Depends(get_db)):
    """Crea una consulta/solicitud de soporte (público: visitantes y usuarios)."""
    categoria = None
    if data.categoria:
        categoria = data.categoria.strip().lower()
        if categoria not in CATEGORIAS_CONSULTA:
            raise HTTPException(status_code=400, detail="Categoría de consulta inválida")
    consulta = Contacto(
        nombre_usuario=data.nombre.strip(),
        email_usuario=data.email.lower().strip(),
        asunto=data.asunto.strip(),
        mensaje=data.mensaje.strip(),
        categoria=categoria,
        estado="pendiente",
    )
    db.add(consulta)
    db.commit()
    db.refresh(consulta)
    return {"msg": "Consulta enviada. Te responderemos pronto.", "id": consulta.id}


@router.get("/admin/consultas", response_model=List[dict])
def listar_consultas(
    _admin_user: User = Depends(_admin),
    db: Session = Depends(get_db),
    estado: Optional[str] = None,
    categoria: Optional[str] = None,
):
    """Lista las consultas de soporte recibidas (solo admin)."""
    query = db.query(Contacto)
    if estado:
        query = query.filter(Contacto.estado == estado)
    if categoria:
        query = query.filter(Contacto.categoria == categoria)
    consultas = query.order_by(Contacto.created_at.desc()).all()
    return [_to_dict(c) for c in consultas]


@router.put("/admin/consultas/{consulta_id}", response_model=dict)
def responder_consulta(
    consulta_id: int,
    data: ConsultaUpdate,
    admin: User = Depends(_admin),
    db: Session = Depends(get_db),
):
    """Marca la consulta como respondida y guarda la respuesta del admin."""
    consulta = db.query(Contacto).filter(Contacto.id == consulta_id).first()
    if not consulta:
        raise HTTPException(status_code=404, detail="Consulta no encontrada")
    upd = data.model_dump(exclude_unset=True)
    if "estado" in upd and upd["estado"] not in ESTADOS_VALIDOS:
        raise HTTPException(status_code=400, detail="Estado inválido")
    if "categoria" in upd:
        cat = upd["categoria"]
        if cat is not None:
            cat = cat.strip().lower()
            if cat not in CATEGORIAS_CONSULTA:
                raise HTTPException(status_code=400, detail="Categoría de consulta inválida")
        consulta.categoria = cat
    if "respuesta" in upd:
        consulta.respuesta = (upd["respuesta"] or "").strip() or None
    if upd.get("estado") == "respondida":
        consulta.estado = "respondida"
        consulta.responded_by = admin.id_usuario
        consulta.responded_at = datetime.utcnow()
    elif upd.get("estado") == "pendiente":
        consulta.estado = "pendiente"
        consulta.responded_by = None
        consulta.responded_at = None
    db.commit()
    db.refresh(consulta)
    return _to_dict(consulta)