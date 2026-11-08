"""Router: notificaciones de plataforma por usuario y cliente.

Las notificaciones se crean en el backend (servicio de notificaciones) en
los eventos de asignación de citas y entregas, junto con el correo. Este
router las consulta y marca como leídas para cualquier rol autenticado.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.notificacion import Notificacion
from app.models.user import User
from app.models.cliente import Cliente
from app.utils.security import get_current_user

router = APIRouter(prefix="/notificaciones", tags=["Notificaciones"])


def _serializar(n: Notificacion) -> dict:
    return {
        "id_notificacion": n.id_notificacion,
        "tipo": n.tipo,
        "titulo": n.titulo,
        "mensaje": n.mensaje,
        "leida": bool(n.leida),
        "fecha_creacion": n.fecha_creacion.isoformat() if n.fecha_creacion else None,
    }


def _es_cliente(current_user) -> bool:
    return isinstance(current_user, Cliente)


def _filtro_usuario(db: Session, current_user):
    """Devuelve el filtro SQLAlchemy correcto según el tipo de usuario."""
    if isinstance(current_user, Cliente):
        return Notificacion.id_cliente == current_user.id_cliente
    return Notificacion.id_usuario == current_user.id_usuario


@router.get("/mias")
def mis_notificaciones(
    current_user = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Notificaciones del usuario o cliente autenticado, más recientes primero."""
    filtro = _filtro_usuario(db, current_user)
    items = (
        db.query(Notificacion)
        .filter(filtro, Notificacion.tipo != "soporte_vinculo")
        .order_by(Notificacion.fecha_creacion.desc(), Notificacion.id_notificacion.desc())
        .limit(100)
        .all()
    )
    return [_serializar(n) for n in items]


@router.get("/no-leidas")
def notificaciones_no_leidas(
    current_user = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Cantidad de notificaciones sin leer del usuario o cliente."""
    filtro = _filtro_usuario(db, current_user)
    total = (
        db.query(Notificacion)
        .filter(filtro, Notificacion.leida == False)  # noqa: E712
        .count()
    )
    return {"no_leidas": total}


@router.patch("/{notificacion_id}/leida")
def marcar_leida(
    notificacion_id: int,
    current_user = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Marca como leída una notificación propia."""
    filtro = _filtro_usuario(db, current_user)
    notif = (
        db.query(Notificacion)
        .filter(Notificacion.id_notificacion == notificacion_id, filtro)
        .first()
    )
    if not notif:
        raise HTTPException(status_code=404, detail="Notificación no encontrada")
    notif.leida = True
    db.commit()
    return {"msg": "Notificación marcada como leída"}


@router.patch("/leer-todas")
def marcar_todas_leidas(
    current_user = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Marca como leídas todas las notificaciones del usuario o cliente."""
    filtro = _filtro_usuario(db, current_user)
    actualizadas = (
        db.query(Notificacion)
        .filter(filtro, Notificacion.leida == False)  # noqa: E712
        .update({Notificacion.leida: True}, synchronize_session=False)
    )
    db.commit()
    return {"msg": "Notificaciones marcadas como leídas", "actualizadas": actualizadas}
