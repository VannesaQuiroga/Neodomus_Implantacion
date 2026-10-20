# Rutas de solicitudes. Las dependencias declaradas en cada endpoint determinan sus permisos de acceso.
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session
from typing import List

from app.database import get_db
from app.models.cliente import Cliente
from app.models.roles_usuario import RolesUsuario
from app.models.solicitud_cuenta import SolicitudCuenta
from app.models.solicitud_habilitacion_empleado import SolicitudHabilitacionEmpleado
from app.models.user import User
from app.schemas.solicitud import AdminSolicitudEmpleadoResponse, AdminSolicitudResponse
from app.utils.security import get_current_employee

router = APIRouter(prefix="/admin/account-requests", tags=["Solicitudes de cuenta"])

TIPOS_ACTIVACION = {"inhabilitar": False, "habilitar": True}


def _plantilla_resultado_solicitud(nombre: str, aprobada: bool, tipo: str) -> tuple[str, str]:
    if aprobada:
        if tipo == "habilitar":
            subject = "Tu cuenta Neodomus ha sido habilitada"
            detalle = "Tu solicitud fue <strong>aprobada</strong> y tu cuenta ya está <strong>habilitada</strong>. Puedes iniciar sesión nuevamente."
        else:
            subject = "Tu cuenta Neodomus ha sido inhabilitada"
            detalle = "Tu solicitud fue <strong>aprobada</strong> y tu cuenta ha quedado <strong>inhabilitada</strong>."
    else:
        subject = "Tu solicitud en Neodomus fue rechazada"
        detalle = "Lamentablemente tu solicitud fue <strong>rechazada</strong> por el administrador."
    body = (
        "<div style='background:#f6f4ef;padding:24px;font-family:Arial,Helvetica,sans-serif'>"
        "<div style='max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e8e2d6'>"
        "<div style='background:#1f1a12;padding:20px 26px;border-bottom:4px solid #d4a54b'>"
        "<h2 style='margin:0;color:#ffffff;font-size:19px'>Neodomus</h2>"
        "<p style='margin:4px 0 0;color:#d4a54b;font-size:12px;font-weight:600;letter-spacing:1px'>ESTADO DE TU SOLICITUD</p></div>"
        "<div style='padding:26px'>"
        f"<p style='margin:0 0 8px;color:#333;font-size:14px'>Hola <strong>{nombre}</strong>,</p>"
        f"<p style='margin:0 0 16px;color:#555;font-size:14px'>{detalle}</p>"
        "<p style='margin:18px 0 0;padding:12px 14px;background:#fdf6e7;border:1px solid #eed7a8;border-radius:8px;color:#7a5a14;font-size:13px'>"
        "Para cualquier inquietud, responde este correo o contacta al equipo de Neodomus.</p>"
        "</div>"
        "<div style='background:#f6f4ef;padding:14px 26px;border-top:1px solid #e8e2d6'>"
        "<p style='margin:0;color:#999;font-size:12px'>Neodomus — Sistema de gestión inteligente.</p>"
        "</div></div></div>"
    )
    return subject, body


async def _notificar_cliente(cliente: Cliente, aprobada: bool, tipo: str) -> None:
    from app.utils.email import send_email

    try:
        nombre = f"{cliente.first_name} {cliente.last_name}".strip() or "cliente"
        subject, body = _plantilla_resultado_solicitud(nombre, aprobada, tipo)
        await send_email(cliente.email, subject, body)
    except HTTPException:
        pass


def _programar_correo(correo: str, subject: str, body: str) -> None:
    """Programa el envío de un correo en segundo plano (fire-and-forget).

    El SMTP se ejecuta en un hilo (asyncio.to_thread en email.py), por lo que
    programarlo como tarea no retrasa la respuesta del endpoint.
    """
    import asyncio

    from app.utils.email import send_email

    async def _tarea():
        try:
            await send_email(correo, subject, body)
        except HTTPException:
            pass
        except Exception as e:
            print(f"Error enviando correo en segundo plano a {correo}: {e}")

    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        return
    loop.create_task(_tarea())


def _rol_usuario(db: Session, usuario: User) -> str | None:
    if not usuario.id_rol_u:
        return None
    return db.execute(
        select(RolesUsuario.nombre_rol).where(RolesUsuario.id_rol == usuario.id_rol_u)
    ).scalar_one_or_none()


def _alertar_admin_nueva_solicitud(db: Session, persona: Cliente | User, tipo: str, motivo: str | None) -> None:
    """Envía un correo a los administradores cuando un cliente solicita
    inhabilitar o habilitar su cuenta, o un empleado (técnico) solicita
    habilitar la suya.

    Los destinatarios y el cuerpo se calculan dentro del request (antes de que
    cierre la sesión de BD) y el envío SMTP se programa en segundo plano.
    """
    from app.config import settings
    from app.models.user import User

    admins = (
        db.query(User)
        .join(RolesUsuario, RolesUsuario.id_rol == User.id_rol_u)
        .filter(RolesUsuario.nombre_rol.in_(["admin", "administrador"]), User.is_active == True)  # noqa: E712
        .all()
    )
    destinatarios = [a.email for a in admins if a.email] or [settings.SMTP_USERNAME]

    es_empleado = isinstance(persona, User)
    rol_nombre = _rol_usuario(db, persona) if es_empleado else None
    etiqueta_rol = (
        "Técnico"
        if rol_nombre == "tecnico"
        else (rol_nombre or "Empleado").capitalize()
        if es_empleado
        else "Cliente"
    )
    sujeto_quien = "técnico" if es_empleado else "cliente"

    nombre = f"{persona.first_name} {persona.last_name}".strip() or etiqueta_rol
    accion = "inhabilitar" if tipo == "inhabilitar" else "habilitar"
    accion_texto = "inhabilitación" if tipo == "inhabilitar" else "habilitación"
    subject = f"Nueva solicitud de {accion_texto} de cuenta en Neodomus"
    body = (
        "<div style='background:#f6f4ef;padding:24px;font-family:Arial,Helvetica,sans-serif'>"
        "<div style='max-width:600px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e8e2d6'>"
        "<div style='background:#1f1a12;padding:20px 26px;border-bottom:4px solid #d4a54b'>"
        "<h2 style='margin:0;color:#ffffff;font-size:19px'>Neodomus</h2>"
        "<p style='margin:4px 0 0;color:#ffd98a;font-size:12px;font-weight:600;letter-spacing:1px'>NUEVA SOLICITUD DE CUENTA</p></div>"
        "<div style='padding:26px'>"
        "<p style='margin:0 0 8px;color:#333;font-size:14px'>Hola,</p>"
        "<p style='margin:0 0 18px;color:#555;font-size:14px'>El {quien} <strong>{nombre}</strong> ({email}) solicitó la <strong>{accion}</strong> de su cuenta en la plataforma.</p>"
        "<table style='border-collapse:collapse;width:100%;font-family:Arial,Helvetica,sans-serif'>"
        "<tr><td style='padding:10px 12px;border:1px solid #eee;font-size:13px;color:#666'>Rol</td>"
        "<td style='padding:10px 12px;border:1px solid #eee;font-size:13px;color:#333;font-weight:700'>{rol}</td></tr>"
        "<tr><td style='padding:10px 12px;border:1px solid #eee;font-size:13px;color:#666'>Nombre</td>"
        "<td style='padding:10px 12px;border:1px solid #eee;font-size:13px;color:#333;font-weight:700'>{nombre}</td></tr>"
        "<tr><td style='padding:10px 12px;border:1px solid #eee;font-size:13px;color:#666'>Correo</td>"
        "<td style='padding:10px 12px;border:1px solid #eee;font-size:13px;color:#333'>{email}</td></tr>"
        "<tr><td style='padding:10px 12px;border:1px solid #eee;font-size:13px;color:#666'>Solicitud</td>"
        "<td style='padding:10px 12px;border:1px solid #eee;font-size:13px;color:#1f1a12;font-weight:700'>{accion}</td></tr>"
        "<tr><td style='padding:10px 12px;border:1px solid #eee;font-size:13px;color:#666'>Motivo</td>"
        "<td style='padding:10px 12px;border:1px solid #eee;font-size:13px;color:#333'>{motivo}</td></tr>"
        "</table>"
        "<p style='margin:18px 0 0;padding:12px 14px;background:#faf7f0;border:1px solid #e8e2d6;border-radius:8px;color:#7a6a4a;font-size:13px'>"
        "Ingresa al panel de administración para aprobar o rechazar la solicitud.</p>"
        "</div>"
        "<div style='background:#f6f4ef;padding:14px 26px;border-top:1px solid #e8e2d6'>"
        "<p style='margin:0;color:#999;font-size:12px'>Neodomus — Sistema de gestión inteligente.</p>"
        "</div></div></div>"
    ).format_map({
        "quien": sujeto_quien,
        "rol": etiqueta_rol,
        "nombre": nombre,
        "email": persona.email or "-",
        "accion": accion,
        "motivo": (motivo or "-").strip() or "-",
    })
    for correo in destinatarios:
        _programar_correo(correo, subject, body)


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


def _to_response(solicitud: SolicitudCuenta, cliente: Cliente) -> AdminSolicitudResponse:
    return AdminSolicitudResponse(
        id=solicitud.id,
        id_cliente=solicitud.id_cliente,
        tipo=solicitud.tipo,
        estado=solicitud.estado,
        motivo=solicitud.motivo,
        created_at=solicitud.created_at,
        resuelta_at=solicitud.resuelta_at,
        cliente_nombre=f"{cliente.first_name} {cliente.last_name}".strip(),
        cliente_email=cliente.email,
        cliente_activo=bool(cliente.is_active),
    )


@router.get("", response_model=List[AdminSolicitudResponse])
def listar_solicitudes(
    current_admin: User = Depends(_admin),
    db: Session = Depends(get_db),
):
    """Lista las solicitudes de inhabilitación/habilitación pendientes (solo admin).

    Las solicitudes respondidas (aprobadas o rechazadas) se eliminan al momento
    de resolverse, por lo que aquí solo aparecen las pendientes.
    """
    solicitudes = (
        db.query(SolicitudCuenta)
        .filter(SolicitudCuenta.estado == "pendiente")
        .join(Cliente, Cliente.id_cliente == SolicitudCuenta.id_cliente)
        .order_by(SolicitudCuenta.created_at.desc())
        .all()
    )
    clientes = {c.id_cliente: c for c in db.query(Cliente).all()}
    return [
        _to_response(s, clientes[s.id_cliente])
        for s in solicitudes
        if s.id_cliente in clientes
    ]


# Consulta Cliente, SolicitudCuenta; confirma los cambios con la sesión de base de datos.
async def _resolver(solicitud_id: int, db: Session, aprobar: bool, admin: User) -> AdminSolicitudResponse:
    solicitud = db.query(SolicitudCuenta).filter(SolicitudCuenta.id == solicitud_id).first()
    if not solicitud:
        raise HTTPException(status_code=404, detail="Solicitud no encontrada")
    if solicitud.estado != "pendiente":
        raise HTTPException(status_code=400, detail="La solicitud ya fue resuelta")
    cliente = db.query(Cliente).get(solicitud.id_cliente)
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")

    solicitud.estado = "aprobada" if aprobar else "rechazada"
    solicitud.resuelta_por = admin.id_usuario
    solicitud.resuelta_at = datetime.utcnow()
    if aprobar and solicitud.tipo in TIPOS_ACTIVACION:
        cliente.is_active = TIPOS_ACTIVACION[solicitud.tipo]

    db.commit()
    db.refresh(solicitud)
    await _notificar_cliente(cliente, aprobar, solicitud.tipo)
    respuesta = _to_response(solicitud, cliente)
    db.delete(solicitud)
    db.commit()
    return respuesta


@router.put("/{solicitud_id}/habilitar-cuenta", response_model=AdminSolicitudResponse)
async def habilitar_cuenta(
    solicitud_id: int,
    admin: User = Depends(_admin),
    db: Session = Depends(get_db),
):
    """Habilita la cuenta del cliente de inmediato y registra la solicitud como aprobada"""
    solicitud = db.query(SolicitudCuenta).filter(SolicitudCuenta.id == solicitud_id).first()
    if not solicitud:
        raise HTTPException(status_code=404, detail="Solicitud no encontrada")
    cliente = db.query(Cliente).get(solicitud.id_cliente)
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")
    if cliente.is_active:
        raise HTTPException(status_code=400, detail="La cuenta del cliente ya está activa")

    cliente.is_active = True
    solicitud.estado = "aprobada"
    solicitud.resuelta_por = admin.id_usuario
    solicitud.resuelta_at = datetime.utcnow()

    db.add(solicitud)
    db.commit()
    db.refresh(solicitud)
    await _notificar_cliente(cliente, aprobada=True, tipo="habilitar")
    respuesta = _to_response(solicitud, cliente)
    db.delete(solicitud)
    db.commit()
    return respuesta


@router.put("/{solicitud_id}/aprobar", response_model=AdminSolicitudResponse)
async def aprobar_solicitud(
    solicitud_id: int,
    admin: User = Depends(_admin),
    db: Session = Depends(get_db),
):
    """Aprueba la solicitud: inhabilita o habilita la cuenta según el tipo"""
    return await _resolver(solicitud_id, db, aprobar=True, admin=admin)


@router.put("/{solicitud_id}/rechazar", response_model=AdminSolicitudResponse)
async def rechazar_solicitud(
    solicitud_id: int,
    admin: User = Depends(_admin),
    db: Session = Depends(get_db),
):
    """Rechaza la solicitud de inhabilitación/habilitación"""
    return await _resolver(solicitud_id, db, aprobar=False, admin=admin)


# ──────────────────────────────────────────────────────────────────
# Solicitudes de habilitación de empleados (técnicos)
# ──────────────────────────────────────────────────────────────────


def _to_response_empleado(
    solicitud: SolicitudHabilitacionEmpleado,
    usuario: User,
    rol: str | None = None,
) -> AdminSolicitudEmpleadoResponse:
    return AdminSolicitudEmpleadoResponse(
        id=solicitud.id,
        id_usuario=solicitud.id_usuario,
        estado=solicitud.estado,
        created_at=solicitud.created_at,
        resuelta_at=solicitud.resuelta_at,
        empleado_nombre=f"{usuario.first_name} {usuario.last_name}".strip(),
        empleado_email=usuario.email,
        empleado_rol=(rol or "empleado").lower(),
        empleado_activo=bool(usuario.is_active),
    )


@router.get("/empleados", response_model=List[AdminSolicitudEmpleadoResponse])
def listar_solicitudes_empleados(
    current_admin: User = Depends(_admin),
    db: Session = Depends(get_db),
):
    """Lista las solicitudes de habilitación de empleados (técnicos) pendientes."""
    solicitudes = (
        db.query(SolicitudHabilitacionEmpleado)
        .filter(SolicitudHabilitacionEmpleado.estado == "pendiente")
        .join(User, User.id_usuario == SolicitudHabilitacionEmpleado.id_usuario)
        .order_by(SolicitudHabilitacionEmpleado.created_at.desc())
        .all()
    )
    usuarios = {u.id_usuario: u for u in db.query(User).all()}
    respuesta = []
    for s in solicitudes:
        usuario = usuarios.get(s.id_usuario)
        if not usuario:
            continue
        respuesta.append(
            _to_response_empleado(s, usuario, _rol_usuario(db, usuario))
        )
    return respuesta


# Consulta User, SolicitudHabilitacionEmpleado; confirma los cambios con la sesión de base de datos.
async def _resolver_empleado(
    solicitud_id: int,
    db: Session,
    aprobar: bool,
    admin: User,
) -> AdminSolicitudEmpleadoResponse:
    solicitud = (
        db.query(SolicitudHabilitacionEmpleado)
        .filter(SolicitudHabilitacionEmpleado.id == solicitud_id)
        .first()
    )
    if not solicitud:
        raise HTTPException(status_code=404, detail="Solicitud no encontrada")
    if solicitud.estado != "pendiente":
        raise HTTPException(status_code=400, detail="La solicitud ya fue resuelta")
    usuario = db.query(User).get(solicitud.id_usuario)
    if not usuario:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    solicitud.estado = "aprobada" if aprobar else "rechazada"
    solicitud.resuelta_por = admin.id_usuario
    solicitud.resuelta_at = datetime.utcnow()
    if aprobar:
        usuario.is_active = True
        usuario.desactivado_hasta = None

    db.commit()
    db.refresh(solicitud)

    nombre = f"{usuario.first_name} {usuario.last_name}".strip() or "empleado"
    subject, body = _plantilla_resultado_solicitud(nombre, aprobar, "habilitar")
    _programar_correo(usuario.email, subject, body)

    respuesta = _to_response_empleado(solicitud, usuario, _rol_usuario(db, usuario))
    db.delete(solicitud)
    db.commit()
    return respuesta


@router.put("/empleados/{solicitud_id}/aprobar", response_model=AdminSolicitudEmpleadoResponse)
async def aprobar_solicitud_empleado(
    solicitud_id: int,
    admin: User = Depends(_admin),
    db: Session = Depends(get_db),
):
    """Aprueba la solicitud: habilita la cuenta del técnico y le notifica."""
    return await _resolver_empleado(solicitud_id, db, aprobar=True, admin=admin)


@router.put("/empleados/{solicitud_id}/rechazar", response_model=AdminSolicitudEmpleadoResponse)
async def rechazar_solicitud_empleado(
    solicitud_id: int,
    admin: User = Depends(_admin),
    db: Session = Depends(get_db),
):
    """Rechaza la solicitud de habilitación del técnico."""
    return await _resolver_empleado(solicitud_id, db, aprobar=False, admin=admin)