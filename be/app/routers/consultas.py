# Rutas de consultas. Las dependencias declaradas en cada endpoint determinan sus permisos de acceso.
from datetime import datetime
import re
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import select
from sqlalchemy.orm import Session
from typing import List, Optional

from app.database import get_db
from app.models.contacto import Contacto
from app.models.cliente import Cliente
from app.models.notificacion import Notificacion
from app.models.roles_usuario import RolesUsuario
from app.models.user import User
from app.utils.security import get_current_employee, get_current_user
from app.utils.fechas import ahora_utc_naiva
from app.utils.database_values_i18n import add_database_value_labels, language_from_request

router = APIRouter(tags=["Contacto"])

# `respondida` se mantiene para compatibilidad con registros ya existentes.
ESTADOS_VALIDOS = {"pendiente", "en_proceso", "resuelta", "respondida"}
TIPO_NOTIFICACION_VINCULO = "soporte_vinculo"
TIPO_NOTIFICACION_RESPUESTA = "respuesta_soporte"

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
    consulta = _persistir_consulta(data, db)
    return {"msg": "Consulta enviada. Te responderemos pronto.", "id": consulta.id}


def _persistir_consulta(
    data: ConsultaCreate,
    db: Session,
    cliente: Optional[Cliente] = None,
) -> Contacto:
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
    db.flush()
    if cliente:
        # This existing notification row establishes an ownership link without
        # adding a customer column or changing the contactos schema.
        db.add(Notificacion(
            id_usuario=None,
            id_cliente=cliente.id_cliente,
            tipo=TIPO_NOTIFICACION_VINCULO,
            titulo=f"Solicitud soporte #{consulta.id}",
            mensaje="Solicitud de soporte recibida",
            leida=True,
        ))
    db.commit()
    db.refresh(consulta)
    return consulta


@router.post("/contacto/autenticado", response_model=dict)
def crear_consulta_autenticada(
    data: ConsultaCreate,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Crea un ticket ligado a la cuenta cliente autenticada, de forma atómica."""
    if not isinstance(current_user, Cliente):
        raise HTTPException(status_code=403, detail="Esta ruta es solo para clientes")
    if data.email.lower().strip() != current_user.email.lower().strip():
        raise HTTPException(status_code=403, detail="El correo debe coincidir con la cuenta")
    consulta = _persistir_consulta(data, db, cliente=current_user)
    return {"msg": "Consulta enviada. Te responderemos pronto.", "id": consulta.id}


@router.get("/admin/consultas", response_model=List[dict])
def listar_consultas(
    request: Request,
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
    idioma = language_from_request(request)
    return add_database_value_labels(
        [_to_dict(consulta) for consulta in consultas],
        {"categoria": "request_category", "estado": "contact_status"},
        idioma,
    )


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
    respuesta_anterior = consulta.respuesta
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
    respuesta_nueva = bool(consulta.respuesta and consulta.respuesta != respuesta_anterior)
    if respuesta_nueva:
        consulta.estado = "resuelta"
        consulta.responded_by = admin.id_usuario
        consulta.responded_at = ahora_utc_naiva()
    elif upd.get("estado") == "respondida":
        consulta.estado = "respondida"
        consulta.responded_by = admin.id_usuario
        consulta.responded_at = ahora_utc_naiva()
    elif upd.get("estado") == "resuelta":
        consulta.estado = "resuelta"
        consulta.responded_by = admin.id_usuario
        consulta.responded_at = ahora_utc_naiva()
    elif upd.get("estado") == "en_proceso":
        consulta.estado = "en_proceso"
        consulta.responded_by = None
        consulta.responded_at = None
    elif upd.get("estado") == "pendiente":
        consulta.estado = "pendiente"
        consulta.responded_by = None
        consulta.responded_at = None
    db.commit()
    db.refresh(consulta)
    if consulta.respuesta and consulta.respuesta != respuesta_anterior:
        cliente = db.query(Cliente).filter(Cliente.email == consulta.email_usuario).first()
        ticket_vinculado = (
            db.query(Notificacion.id_notificacion)
            .filter(
                Notificacion.id_cliente == cliente.id_cliente,
                Notificacion.tipo == TIPO_NOTIFICACION_VINCULO,
                Notificacion.titulo == f"Solicitud soporte #{consulta.id}",
            )
            .first()
            if cliente else None
        )
        if cliente and ticket_vinculado:
            from app.services.notificaciones import crear_notificacion

            crear_notificacion(
                db=db,
                id_usuario=None,
                id_cliente=cliente.id_cliente,
                tipo=TIPO_NOTIFICACION_RESPUESTA,
                titulo=f"Respuesta a solicitud #{consulta.id}",
                mensaje=f"El equipo de NeoDomus respondió tu solicitud: {consulta.asunto}",
            )
    return _to_dict(consulta)


@router.get("/contacto/mias", response_model=List[dict])
def listar_mis_consultas(
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Devuelve solo solicitudes cuyo correo coincide con el cliente autenticado."""
    if not isinstance(current_user, Cliente):
        raise HTTPException(status_code=403, detail="Esta ruta es solo para clientes")

    vinculos = (
        db.query(Notificacion.titulo)
        .filter(
            Notificacion.id_cliente == current_user.id_cliente,
            Notificacion.tipo == TIPO_NOTIFICACION_VINCULO,
        )
        .all()
    )
    ids_solicitudes = []
    for (titulo_vinculo,) in vinculos:
        match = re.search(r"solicitud soporte #(\d+)", titulo_vinculo, re.IGNORECASE)
        if match:
            ids_solicitudes.append(int(match.group(1)))
    if not ids_solicitudes:
        return []
    consultas = (
        db.query(Contacto)
        .filter(Contacto.id.in_(ids_solicitudes), Contacto.email_usuario == current_user.email.lower().strip())
        .order_by(Contacto.created_at.desc(), Contacto.id.desc())
        .all()
    )
    notificaciones = (
        db.query(Notificacion)
        .filter(
            Notificacion.id_cliente == current_user.id_cliente,
            Notificacion.tipo == TIPO_NOTIFICACION_RESPUESTA,
        )
        .order_by(Notificacion.fecha_creacion.desc())
        .all()
    )
    notificaciones_por_solicitud = {}
    for notificacion in notificaciones:
        match = re.search(r"solicitud #(\d+)", notificacion.titulo, re.IGNORECASE)
        if match:
            notificaciones_por_solicitud.setdefault(int(match.group(1)), []).append(notificacion)
    resultado = []
    for consulta in consultas:
        item = _to_dict(consulta)
        notificaciones_ticket = notificaciones_por_solicitud.get(consulta.id, [])
        notificacion_no_leida = next((n for n in notificaciones_ticket if not n.leida), None)
        item["respuesta_no_leida"] = notificacion_no_leida is not None
        resultado.append(item)
    return resultado


@router.patch("/contacto/mias/{consulta_id}/respuesta/leida", response_model=dict)
def marcar_respuesta_leida(
    consulta_id: int,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Marca como leída la notificación de respuesta de un ticket propio."""
    if not isinstance(current_user, Cliente):
        raise HTTPException(status_code=403, detail="Esta ruta es solo para clientes")
    consulta = (
        db.query(Contacto)
        .filter(
            Contacto.id == consulta_id,
            Contacto.email_usuario == current_user.email.lower().strip(),
        )
        .first()
    )
    if not consulta:
        raise HTTPException(status_code=404, detail="Solicitud no encontrada")
    vinculo = (
        db.query(Notificacion.id_notificacion)
        .filter(
            Notificacion.id_cliente == current_user.id_cliente,
            Notificacion.tipo == TIPO_NOTIFICACION_VINCULO,
            Notificacion.titulo == f"Solicitud soporte #{consulta.id}",
        )
        .first()
    )
    if not vinculo:
        raise HTTPException(status_code=404, detail="Solicitud no encontrada")
    titulo = f"Respuesta a solicitud #{consulta.id}"
    notificaciones = (
        db.query(Notificacion)
        .filter(
            Notificacion.id_cliente == current_user.id_cliente,
            Notificacion.tipo == TIPO_NOTIFICACION_RESPUESTA,
            Notificacion.titulo == titulo,
        )
        .all()
    )
    no_leidas = [notificacion for notificacion in notificaciones if not notificacion.leida]
    if no_leidas:
        for notificacion in no_leidas:
            notificacion.leida = True
        db.commit()
    return {"leida": True}
