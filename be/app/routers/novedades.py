"""
Módulo: routers/novedades.py

Gestión de novedades e incidencias reportadas por técnicos.
- Técnicos: crear, consultar, subir evidencia, buscar clientes/pedidos/citas.
- Admin: listar todas, cambiar estado, generar cupones, filtros avanzados.
"""
from datetime import date, datetime
from pathlib import Path
from typing import Optional
import uuid

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy import String, func, or_, select
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.models.novedad import Novedad, EvidenciaNovedad
from app.models.pedido import Pedido, DetallePedido
from app.models.cita import Cita
from app.models.cliente import Cliente
from app.models.roles_usuario import RolesUsuario
from app.models.tecnico import Tecnico
from app.models.user import User
from app.utils.security import get_current_client, get_current_employee
from app.services import novedades_service, minio_service

router = APIRouter(prefix="/novedades", tags=["Novedades"])

EXTENSIONES_EVIDENCIA = {".jpg", ".jpeg", ".png", ".webp", ".gif"}


def _admin(current_user: User = Depends(get_current_employee), db: Session = Depends(get_db)) -> User:
    role = db.execute(
        select(RolesUsuario.nombre_rol).where(RolesUsuario.id_rol == current_user.id_rol_u)
    ).scalar_one_or_none()
    if role not in ("admin", "administrador"):
        raise HTTPException(403, "Solo administradores pueden realizar esta acción")
    return current_user


def _tecnico(current_user: User = Depends(get_current_employee), db: Session = Depends(get_db)) -> tuple[User, int]:
    """Retorna (user, id_tecnico) validando que el usuario sea técnico."""
    role = db.execute(
        select(RolesUsuario.nombre_rol).where(RolesUsuario.id_rol == current_user.id_rol_u)
    ).scalar_one_or_none()
    if role != "tecnico":
        raise HTTPException(403, "Solo técnicos pueden realizar esta acción")
    tecnico = db.query(Tecnico).filter(Tecnico.id_usuario_t == current_user.id_usuario).first()
    if not tecnico:
        raise HTTPException(404, "No se encontró perfil de técnico")
    return current_user, tecnico.id_tecnico


# ── Tipos y catálogos ──────────────────────────────────────────────

@router.get("/tipos")
def tipos_novedad():
    return novedades_service.TIPOS_NOVEDAD


@router.get("/estados")
def estados_novedad():
    return novedades_service.ESTADOS_NOVEDAD


@router.get("/prioridades")
def prioridades_novedad():
    return novedades_service.PRIORIDADES


# ── Técnico: buscar clientes ────────────────────────────────────────

@router.get("/clientes-buscar")
def buscar_clientes_tecnico(
    q: Optional[str] = None,
    user_info: tuple = Depends(_tecnico),
    db: Session = Depends(get_db),
):
    """Busca clientes que tengan relación (pedidos o citas) con el técnico autenticado.
    Busca por nombre, apellido, documento, email o teléfono."""
    _, id_tecnico = user_info

    ids_clientes = set()

    # Clientes de pedidos asignados al técnico
    pedidos = (
        db.query(Pedido.id_cliente_pe)
        .filter(Pedido.id_tecnico_entrega == id_tecnico)
        .distinct()
        .all()
    )
    for p in pedidos:
        if p[0]:
            ids_clientes.add(p[0])

    # Clientes de citas asignadas al técnico
    citas = (
        db.query(Cita.id_cliente)
        .filter(
            or_(
                Cita.id_tecnico == id_tecnico,
                Cita.id_tecnico_2 == id_tecnico,
                Cita.id_tecnico_3 == id_tecnico,
            )
        )
        .distinct()
        .all()
    )
    for c in citas:
        if c[0]:
            ids_clientes.add(c[0])

    if not ids_clientes:
        return []

    q_clientes = db.query(Cliente).filter(Cliente.id_cliente.in_(ids_clientes))

    if q:
        patron = f"%{q}%"
        q_clientes = q_clientes.filter(
            (Cliente.first_name.ilike(patron))
            | (Cliente.last_name.ilike(patron))
            | (Cliente.email.ilike(patron))
            | (Cliente.documento_cliente.cast(String).ilike(patron))
            | (Cliente.telefono_cliente.cast(String).ilike(patron))
        )

    clientes = q_clientes.order_by(Cliente.first_name).all()
    return [
        {
            "id_cliente": c.id_cliente,
            "nombre": f"{c.first_name} {c.last_name}".strip() or "Cliente",
            "email": c.email,
            "telefono": c.telefono_cliente,
            "documento": c.documento_cliente,
            "direccion": c.address,
        }
        for c in clientes
    ]


# ── Técnico: pedidos de un cliente ──────────────────────────────────

@router.get("/clientes/{cliente_id}/pedidos")
def pedidos_cliente_tecnico(
    cliente_id: int,
    user_info: tuple = Depends(_tecnico),
    db: Session = Depends(get_db),
):
    """Pedidos de un cliente asignados al técnico autenticado."""
    _, id_tecnico = user_info

    pedidos = (
        db.query(Pedido)
        .filter(
            Pedido.id_cliente_pe == cliente_id,
            Pedido.id_tecnico_entrega == id_tecnico,
        )
        .order_by(Pedido.fecha_peedido.desc())
        .all()
    )

    resultado = []
    for p in pedidos:
        detalles = []
        for d in (p.detalles or []):
            nombre_producto = d.producto.nombre_producto if d.producto else None
            detalles.append({
                "producto": nombre_producto,
                "cantidad": d.cantidad_detalle,
                "precio": d.precio_unitario_detalle,
            })

        resultado.append({
            "id_pedido": p.id_pedido,
            "fecha_pedido": p.fecha_peedido.isoformat() if p.fecha_peedido else None,
            "estado_pedido": p.estado_pedido,
            "total": p.total_pedido,
            "fecha_entrega": p.fecha_entrega.isoformat() if p.fecha_entrega else None,
            "hora_entrega": p.hora_entrega,
            "hora_entrega_fin": p.hora_entrega_fin,
            "estado_entrega": p.estado_entrega,
            "nombre_tecnico": p.nombre_tecnico_entrega,
            "detalles": detalles,
        })

    return resultado


# ── Técnico: citas de un cliente ────────────────────────────────────

@router.get("/clientes/{cliente_id}/citas")
def citas_cliente_tecnico(
    cliente_id: int,
    user_info: tuple = Depends(_tecnico),
    db: Session = Depends(get_db),
):
    """Citas de un cliente asignadas al técnico autenticado."""
    _, id_tecnico = user_info

    citas = (
        db.query(Cita)
        .filter(
            Cita.id_cliente == cliente_id,
            or_(
                Cita.id_tecnico == id_tecnico,
                Cita.id_tecnico_2 == id_tecnico,
                Cita.id_tecnico_3 == id_tecnico,
            ),
        )
        .order_by(Cita.fecha.desc(), Cita.hora.desc())
        .all()
    )

    resultado = []
    for c in citas:
        esp_nombre = c.especializacion.nombre if c.especializacion else None
        resultado.append({
            "id_cita": c.id_cita,
            "fecha": c.fecha.isoformat() if c.fecha else None,
            "hora": c.hora,
            "tipo_servicio": c.tipo_servicio,
            "especialidad": esp_nombre,
            "estado": c.estado,
            "direccion": c.direccion,
            "descripcion": c.descripcion,
            "costo": float(c.costo_cita) if c.costo_cita else None,
            "nombre_tecnico": c.nombre_tecnico,
            "id_tecnico": c.id_tecnico,
        })

    return resultado


# ── Técnico: crear novedad ──────────────────────────────────────────

class NovedadCrearRequest(BaseModel):
    tipo_novedad: str
    descripcion: str
    prioridad: str = "normal"
    id_pedido: Optional[int] = None
    id_cita: Optional[int] = None
    id_cliente: Optional[int] = None
    id_devolucion: Optional[int] = None
    lugar_ocurrencia: Optional[str] = None


@router.post("")
def crear_novedad(
    data: NovedadCrearRequest,
    user_info: tuple = Depends(_tecnico),
    db: Session = Depends(get_db),
):
    user, id_tecnico = user_info
    if data.tipo_novedad not in novedades_service.TIPOS_NOVEDAD:
        raise HTTPException(400, f"Tipo de novedad no válido. Use: {', '.join(novedades_service.TIPOS_NOVEDAD)}")
    if data.prioridad not in novedades_service.PRIORIDADES:
        raise HTTPException(400, f"Prioridad no válida. Use: {', '.join(novedades_service.PRIORIDADES)}")

    # ── Validar relación del técnico con el pedido/cita ──────────────
    if data.id_pedido:
        pedido = (
            db.query(Pedido)
            .filter(
                Pedido.id_pedido == data.id_pedido,
                Pedido.id_tecnico_entrega == id_tecnico,
            )
            .first()
        )
        if not pedido:
            raise HTTPException(
                403,
                "No tienes autorización para registrar una novedad sobre este pedido.",
            )
        # Auto-asignar cliente del pedido si no se envía
        if not data.id_cliente and pedido.id_cliente_pe:
            data.id_cliente = pedido.id_cliente_pe

    if data.id_cita:
        cita = (
            db.query(Cita)
            .filter(
                Cita.id_cita == data.id_cita,
                or_(
                    Cita.id_tecnico == id_tecnico,
                    Cita.id_tecnico_2 == id_tecnico,
                    Cita.id_tecnico_3 == id_tecnico,
                ),
            )
            .first()
        )
        if not cita:
            raise HTTPException(
                403,
                "No tienes autorización para registrar una novedad sobre esta cita.",
            )
        # Auto-asignar cliente de la cita si no se envía
        if not data.id_cliente and cita.id_cliente:
            data.id_cliente = cita.id_cliente

    if data.id_devolucion:
        from app.models.devolucion import Devolucion
        devolucion = db.query(Devolucion).filter(Devolucion.id_devolucion == data.id_devolucion).first()
        if not devolucion:
            raise HTTPException(404, "Devolución no encontrada")
        # Auto-asignar cliente de la devolución si no se envía
        if not data.id_cliente and devolucion.id_cliente_d:
            data.id_cliente = devolucion.id_cliente_d
        # Auto-asignar pedido de la devolución si no se envía
        if not data.id_pedido and devolucion.id_pedido_d:
            data.id_pedido = devolucion.id_pedido_d

    # Validar que el cliente corresponda al pedido/cita si ambos se envían
    if data.id_pedido and data.id_cita and data.id_cliente:
        pedido = db.query(Pedido).filter(Pedido.id_pedido == data.id_pedido).first()
        cita = db.query(Cita).filter(Cita.id_cita == data.id_cita).first()
        if pedido and pedido.id_cliente_pe != data.id_cliente:
            raise HTTPException(400, "El cliente no corresponde al pedido seleccionado")
        if cita and cita.id_cliente != data.id_cliente:
            raise HTTPException(400, "El cliente no corresponde a la cita seleccionada")

    novedad = novedades_service.crear_novedad(
        db,
        id_tecnico=id_tecnico,
        tipo_novedad=data.tipo_novedad,
        descripcion=data.descripcion,
        prioridad=data.prioridad,
        id_pedido=data.id_pedido,
        id_cita=data.id_cita,
        id_cliente=data.id_cliente,
        id_devolucion=data.id_devolucion,
        lugar_ocurrencia=data.lugar_ocurrencia,
    )

    # Notificar al admin
    from app.services.notificaciones import crear_notificacion
    novedad_full = (
        db.query(Novedad)
        .options(joinedload(Novedad.tecnico))
        .filter(Novedad.id_novedad == novedad.id_novedad)
        .first()
    )
    nombre_tecnico = "Técnico"
    if novedad_full and novedad_full.tecnico and novedad_full.tecnico.usuario:
        nombre_tecnico = f"{novedad_full.tecnico.usuario.first_name} {novedad_full.tecnico.usuario.last_name}".strip()

    crear_notificacion(
        db,
        id_usuario=None,
        tipo="novedad",
        titulo=f"Nueva novedad: {data.tipo_novedad}",
        mensaje=(
            f"El técnico {nombre_tecnico} reportó una novedad"
            f"{f' en el pedido #{data.id_pedido}' if data.id_pedido else ''}"
            f"{f' en la cita #{data.id_cita}' if data.id_cita else ''}"
            f": {data.descripcion[:200]}"
        ),
    )

    return {"id_novedad": novedad.id_novedad, "mensaje": "Novedad creada correctamente"}


# ── Técnico: subir evidencia ────────────────────────────────────────

@router.post("/{novedad_id}/evidencia")
async def subir_evidencia_novedad(
    novedad_id: int,
    file: UploadFile = File(...),
    descripcion: str = Form(""),
    user_info: tuple = Depends(_tecnico),
    db: Session = Depends(get_db),
):
    """El técnico sube una evidencia (foto) a una novedad que le pertenece.
    Todo se almacena en MinIO, nada se queda en el backend."""
    _, id_tecnico = user_info

    novedad = novedades_service.obtener_novedad(db, novedad_id)
    if not novedad:
        raise HTTPException(404, "Novedad no encontrada")
    if novedad.id_tecnico_n != id_tecnico:
        raise HTTPException(403, "No tienes acceso a esta novedad")

    if not file or not file.filename:
        raise HTTPException(400, "Selecciona un archivo")

    ext = Path(file.filename).suffix.lower()
    if ext not in EXTENSIONES_EVIDENCIA:
        raise HTTPException(400, "Formato no permitido (usa JPG, PNG, WEBP o GIF)")

    contenido = await file.read()
    if not contenido:
        raise HTTPException(400, "El archivo está vacío")
    if len(contenido) > 5 * 1024 * 1024:
        raise HTTPException(400, "La imagen supera los 5 MB")

    try:
        import io
        from PIL import Image
        Image.open(io.BytesIO(contenido)).verify()
    except Exception:
        raise HTTPException(400, "El archivo no es una imagen válida")

    nombre = f"{uuid.uuid4().hex}{ext}"
    url = minio_service.subir_imagen("evidencias_novedades", nombre, contenido)

    evidencia = EvidenciaNovedad(
        id_novedad=novedad_id,
        url_archivo=url,
        descripcion=descripcion or None,
    )
    db.add(evidencia)

    # Registrar en historial
    from app.models.novedad import NovedadHistorial
    db.add(NovedadHistorial(
        id_novedad=novedad_id,
        id_usuario=user_info[0].id_usuario,
        accion="Evidencia subida",
        detalle=f"Evidencia adjuntada: {file.filename}",
    ))

    db.commit()
    db.refresh(evidencia)

    return {
        "id_evidencia_n": evidencia.id_evidencia_n,
        "url": evidencia.url_archivo,
        "mensaje": "Evidencia subida correctamente",
    }


@router.get("/{novedad_id}/evidencias")
def listar_evidencias_novedad(
    novedad_id: int,
    current_user: User = Depends(get_current_employee),
    db: Session = Depends(get_db),
):
    """Lista las evidencias de una novedad. Técnicos solo ven sus propias novedades."""
    role = db.execute(
        select(RolesUsuario.nombre_rol).where(RolesUsuario.id_rol == current_user.id_rol_u)
    ).scalar_one_or_none()

    novedad = novedades_service.obtener_novedad(db, novedad_id)
    if not novedad:
        raise HTTPException(404, "Novedad no encontrada")

    if role == "tecnico":
        tecnico = db.query(Tecnico).filter(Tecnico.id_usuario_t == current_user.id_usuario).first()
        if not tecnico or novedad.id_tecnico_n != tecnico.id_tecnico:
            raise HTTPException(403, "No tienes acceso a esta novedad")
    elif role not in ("admin", "administrador"):
        raise HTTPException(403, "Sin permisos")

    evidencias = (
        db.query(EvidenciaNovedad)
        .filter(EvidenciaNovedad.id_novedad == novedad_id)
        .order_by(EvidenciaNovedad.fecha_subida.desc())
        .all()
    )

    return [
        {
            "id_evidencia_n": e.id_evidencia_n,
            "url": e.url_archivo,
            "descripcion": e.descripcion,
            "fecha_subida": e.fecha_subida.isoformat() if e.fecha_subida else None,
        }
        for e in evidencias
    ]


# ── Técnico: listar sus novedades ──────────────────────────────────

@router.get("/mis-novedades")
def mis_novedades(
    user_info: tuple = Depends(_tecnico),
    db: Session = Depends(get_db),
):
    _, id_tecnico = user_info
    novedades = novedades_service.listar_novedades_tecnico(db, id_tecnico)
    return _serializar_novedades(novedades, db)


# ── Admin: listar, cambiar estado, cupones ──────────────────────────

@router.get("")
def listar_novedades_admin(
    id_pedido: Optional[int] = None,
    id_tecnico: Optional[int] = None,
    id_cliente: Optional[int] = None,
    tipo_novedad: Optional[str] = None,
    estado: Optional[str] = None,
    prioridad: Optional[str] = None,
    fecha_desde: Optional[date] = None,
    fecha_hasta: Optional[date] = None,
    con_evidencia: Optional[bool] = None,
    tipo_origen: Optional[str] = None,
    _admin_user: User = Depends(_admin),
    db: Session = Depends(get_db),
):
    novedades = novedades_service.listar_novedades_admin(
        db,
        id_pedido=id_pedido,
        id_tecnico=id_tecnico,
        id_cliente=id_cliente,
        tipo_novedad=tipo_novedad,
        estado=estado,
        prioridad=prioridad,
        fecha_desde=fecha_desde,
        fecha_hasta=fecha_hasta,
    )

    # Filtros adicionales que dependen de evidencias
    if con_evidencia is not None:
        if con_evidencia:
            novedades = [n for n in novedades if n.evidencias]
        else:
            novedades = [n for n in novedades if not n.evidencias]

    if tipo_origen:
        if tipo_origen == "pedido":
            novedades = [n for n in novedades if n.id_pedido and not n.id_cita]
        elif tipo_origen == "cita":
            novedades = [n for n in novedades if n.id_cita and not n.id_pedido]
        elif tipo_origen == "pedido_cita":
            novedades = [n for n in novedades if n.id_pedido and n.id_cita]
        elif tipo_origen == "devolucion":
            novedades = [n for n in novedades if n.id_devolucion]

    return _serializar_novedades(novedades, db)


@router.get("/admin/filtros")
def filtros_admin_novedades(
    _admin_user: User = Depends(_admin),
    db: Session = Depends(get_db),
):
    """Retorna listas de técnicos y clientes para los filtros del admin.
    Solo incluye usuarios cuyo rol sea 'tecnico'."""
    from app.models.roles_usuario import RolesUsuario as RU

    rol_tecnico = db.execute(
        select(RU.id_rol).where(RU.nombre_rol == "tecnico")
    ).scalar_one_or_none()

    tecnicos_rows = (
        db.query(Tecnico)
        .join(Tecnico.usuario)
        .filter(User.is_active == True, User.id_rol_u == rol_tecnico)
        .all()
    )
    tecnicos_list = []
    for t in tecnicos_rows:
        u = t.usuario
        if u:
            tecnicos_list.append({
                "id_tecnico": t.id_tecnico,
                "nombre": f"{u.first_name} {u.last_name}".strip(),
            })

    clientes_rows = (
        db.query(Cliente)
        .filter(Cliente.is_active == True)
        .order_by(Cliente.first_name)
        .all()
    )
    clientes_list = [
        {
            "id_cliente": c.id_cliente,
            "nombre": f"{c.first_name} {c.last_name}".strip(),
        }
        for c in clientes_rows
    ]

    return {
        "tecnicos": tecnicos_list,
        "clientes": clientes_list,
        "tipos": novedades_service.TIPOS_NOVEDAD,
        "estados": novedades_service.ESTADOS_NOVEDAD,
        "prioridades": novedades_service.PRIORIDADES,
    }


@router.get("/cliente/{cliente_id}/cupones")
def cupones_cliente(
    cliente_id: int,
    _admin_user: User = Depends(_admin),
    db: Session = Depends(get_db),
):
    cupones = novedades_service.listar_cupones_cliente(db, cliente_id)
    return [
        {
            "id_cupon": c.id_cupon,
            "codigo": c.codigo,
            "tipo_descuento": c.tipo_descuento,
            "valor_descuento": c.valor_descuento,
            "fecha_vencimiento": c.fecha_vencimiento.isoformat() if c.fecha_vencimiento else None,
            "usos_maximos": c.usos_maximos,
            "usos_realizados": c.usos_realizados,
            "activo": c.activo,
        }
        for c in cupones
    ]


@router.get("/{novedad_id}")
def obtener_novedad(
    novedad_id: int,
    current_user: User = Depends(get_current_employee),
    db: Session = Depends(get_db),
):
    role = db.execute(
        select(RolesUsuario.nombre_rol).where(RolesUsuario.id_rol == current_user.id_rol_u)
    ).scalar_one_or_none()

    novedad = novedades_service.obtener_novedad(db, novedad_id)
    if not novedad:
        raise HTTPException(404, "Novedad no encontrada")

    if role == "tecnico":
        tecnico = db.query(Tecnico).filter(Tecnico.id_usuario_t == current_user.id_usuario).first()
        if not tecnico or novedad.id_tecnico_n != tecnico.id_tecnico:
            raise HTTPException(403, "No tienes acceso a esta novedad")
    elif role not in ("admin", "administrador"):
        raise HTTPException(403, "Sin permisos")

    return _serializar_novedad_detalle(novedad, db)


class CambiarEstadoRequest(BaseModel):
    nuevo_estado: str
    accion_detalle: Optional[str] = None


@router.put("/{novedad_id}/estado")
def cambiar_estado(
    novedad_id: int,
    data: CambiarEstadoRequest,
    admin_user: User = Depends(_admin),
    db: Session = Depends(get_db),
):
    if data.nuevo_estado not in novedades_service.ESTADOS_NOVEDAD:
        raise HTTPException(400, f"Estado no válido. Use: {', '.join(novedades_service.ESTADOS_NOVEDAD)}")
    try:
        novedad = novedades_service.cambiar_estado_novedad(
            db,
            id_novedad=novedad_id,
            nuevo_estado=data.nuevo_estado,
            id_admin=admin_user.id_usuario,
            accion_detalle=data.accion_detalle,
        )
    except ValueError as e:
        raise HTTPException(404, str(e))

    from app.services.notificaciones import crear_notificacion
    if novedad.id_tecnico_n:
        tecnico = db.query(Tecnico).filter(Tecnico.id_tecnico == novedad.id_tecnico_n).first()
        if tecnico and tecnico.usuario:
            crear_notificacion(
                db,
                id_usuario=tecnico.usuario.id_usuario,
                tipo="novedad",
                titulo=f"Novedad #{novedad_id} — {data.nuevo_estado}",
                mensaje=(
                    f"Tu reporte del pedido"
                    f"{f' #{novedad.id_pedido}' if novedad.id_pedido else ''}"
                    f"{f' de la cita #{novedad.id_cita}' if novedad.id_cita else ''}"
                    f" fue revisado y marcado como {data.nuevo_estado}."
                    f"{f' {data.accion_detalle}' if data.accion_detalle else ''}"
                ),
            )

    return {"mensaje": f"Estado actualizado a {data.nuevo_estado}"}


# ── Admin: responder novedad ────────────────────────────────────

class ResponderNovedadRequest(BaseModel):
    respuesta: str


@router.post("/{novedad_id}/responder")
def responder_novedad(
    novedad_id: int,
    data: ResponderNovedadRequest,
    admin_user: User = Depends(_admin),
    db: Session = Depends(get_db),
):
    """El administrador responde a una novedad del técnico."""
    try:
        novedad = novedades_service.responder_novedad(
            db,
            id_novedad=novedad_id,
            id_admin=admin_user.id_usuario,
            respuesta=data.respuesta,
        )
    except ValueError as e:
        raise HTTPException(404, str(e))

    from app.services.notificaciones import crear_notificacion
    if novedad.id_tecnico_n:
        tecnico = db.query(Tecnico).filter(Tecnico.id_tecnico == novedad.id_tecnico_n).first()
        if tecnico and tecnico.usuario:
            crear_notificacion(
                db,
                id_usuario=tecnico.usuario.id_usuario,
                tipo="novedad",
                titulo=f"Novedad #{novedad_id} — Respuesta del administrador",
                mensaje=(
                    f"El administrador respondió a tu novedad"
                    f"{f' del pedido #{novedad.id_pedido}' if novedad.id_pedido else ''}"
                    f"{f' de la cita #{novedad.id_cita}' if novedad.id_cita else ''}"
                    f": {data.respuesta[:300]}"
                ),
            )

    return {"mensaje": "Respuesta registrada y técnico notificado"}


# ── Admin: cambiar técnico desde novedad ────────────────────────

class CambiarTecnicoRequest(BaseModel):
    id_nuevo_tecnico: int
    motivo: Optional[str] = None


@router.put("/{novedad_id}/cambiar-tecnico")
def cambiar_tecnico_novedad(
    novedad_id: int,
    data: CambiarTecnicoRequest,
    admin_user: User = Depends(_admin),
    db: Session = Depends(get_db),
):
    """Cambia el técnico asignado al pedido/cita de una novedad."""
    try:
        novedad = novedades_service.cambiar_tecnico_novedad(
            db,
            id_novedad=novedad_id,
            id_nuevo_tecnico=data.id_nuevo_tecnico,
            id_admin=admin_user.id_usuario,
            motivo=data.motivo,
        )
    except ValueError as e:
        raise HTTPException(404, str(e))

    # Notificar al nuevo técnico
    from app.services.notificaciones import crear_notificacion
    nuevo_tecnico = db.query(Tecnico).filter(Tecnico.id_tecnico == data.id_nuevo_tecnico).first()
    if nuevo_tecnico and nuevo_tecnico.usuario:
        crear_notificacion(
            db,
            id_usuario=nuevo_tecnico.usuario.id_usuario,
            tipo="asignacion",
            titulo="Nueva asignación desde novedad",
            mensaje=(
                f"Se te ha asignado una atención desde la novedad #{novedad_id}"
                f"{f' (pedido #{novedad.id_pedido})' if novedad.id_pedido else ''}"
                f"{f' (cita #{novedad.id_cita})' if novedad.id_cita else ''}"
                f"{f'. Motivo: {data.motivo}' if data.motivo else ''}"
            ),
        )

    # Notificar al técnico anterior
    if novedad.id_tecnico_n and novedad.id_tecnico_n != data.id_nuevo_tecnico:
        tecnico_anterior = db.query(Tecnico).filter(Tecnico.id_tecnico == novedad.id_tecnico_n).first()
        if tecnico_anterior and tecnico_anterior.usuario:
            crear_notificacion(
                db,
                id_usuario=tecnico_anterior.usuario.id_usuario,
                tipo="novedad",
                titulo=f"Asignación modificada — Novedad #{novedad_id}",
                mensaje=(
                    f"La atención del pedido"
                    f"{f' #{novedad.id_pedido}' if novedad.id_pedido else ''}"
                    f"{f' / cita #{novedad.id_cita}' if novedad.id_cita else ''}"
                    f" fue reasignada a otro técnico."
                    f"{f' Motivo: {data.motivo}' if data.motivo else ''}"
                ),
            )

    return {"mensaje": "Técnico cambiado y notificaciones enviadas"}


class CrearCuponRequest(BaseModel):
    codigo: str
    tipo_descuento: str = "porcentaje"
    valor_descuento: float
    fecha_vencimiento: Optional[date] = None
    compra_minima: float = 0
    usos_maximos: int = 1
    aplica_tienda_completa: bool = True
    categorias_aplicables: Optional[str] = None


@router.get("/cupones/validar")
def validar_cupon_endpoint(
    codigo: str,
    cliente: Cliente = Depends(get_current_client),
    db: Session = Depends(get_db),
):
    """Valida un código de cupón y retorna su información si es válido."""
    cupon = novedades_service.validar_cupon(db, codigo, cliente.id_cliente)
    if not cupon:
        raise HTTPException(status_code=404, detail="Cupón no válido o expirado")
    return {
        "id_cupon": cupon.id_cupon,
        "codigo": cupon.codigo,
        "tipo_descuento": cupon.tipo_descuento,
        "valor_descuento": cupon.valor_descuento,
        "fecha_vencimiento": cupon.fecha_vencimiento.isoformat() if cupon.fecha_vencimiento else None,
    }


@router.post("/{novedad_id}/cupon")
def crear_cupon_novedad(
    novedad_id: int,
    data: CrearCuponRequest,
    admin_user: User = Depends(_admin),
    db: Session = Depends(get_db),
):
    novedad = novedades_service.obtener_novedad(db, novedad_id)
    if not novedad:
        raise HTTPException(404, "Novedad no encontrada")
    if not novedad.id_cliente:
        raise HTTPException(400, "La novedad no tiene un cliente asociado")

    try:
        cupon = novedades_service.crear_cupon(
            db,
            codigo=data.codigo,
            tipo_descuento=data.tipo_descuento,
            valor_descuento=data.valor_descuento,
            id_cliente=novedad.id_cliente,
            id_novedad=novedad_id,
            id_admin=admin_user.id_usuario,
            fecha_vencimiento=data.fecha_vencimiento,
            compra_minima=data.compra_minima,
            usos_maximos=data.usos_maximos,
            aplica_tienda_completa=data.aplica_tienda_completa,
            categorias_aplicables=data.categorias_aplicables,
        )
    except ValueError as e:
        raise HTTPException(400, str(e))

    from app.services.notificaciones import crear_notificacion
    crear_notificacion(
        db,
        id_usuario=None,
        id_cliente=novedad.id_cliente,
        tipo="cupon",
        titulo="Cupón de descuento generado",
        mensaje=(
            f"Debido al inconveniente presentado con tu pedido"
            f"{f' #{novedad.id_pedido}' if novedad.id_pedido else ''}, "
            f"se ha generado un cupón de descuento para tu próxima compra.\n"
            f"Código: {cupon.codigo}\n"
            f"Descuento: {cupon.valor_descuento}{'%' if cupon.tipo_descuento == 'porcentaje' else ' COP'}"
            f"{f'\nVálido hasta: {cupon.fecha_vencimiento}' if cupon.fecha_vencimiento else ''}"
        ),
    )

    return {
        "id_cupon": cupon.id_cupon,
        "codigo": cupon.codigo,
        "mensaje": "Cupón generado y notificación enviada al cliente",
    }


# ── Helpers de serialización ────────────────────────────────────────

def _serializar_novedades(novedades, db):
    from app.models.tecnico import Tecnico as TecnicoModel
    result = []
    for n in novedades:
        tecnico_nombre = None
        if n.id_tecnico_n:
            t = db.query(TecnicoModel).filter(TecnicoModel.id_tecnico == n.id_tecnico_n).first()
            if t and t.usuario:
                tecnico_nombre = f"{t.usuario.first_name} {t.usuario.last_name}".strip()
        cliente_nombre = None
        if n.id_cliente and n.cliente:
            cliente_nombre = f"{n.cliente.first_name} {n.cliente.last_name}".strip()

        # Evidencias
        evidencias = []
        for e in (n.evidencias or []):
            evidencias.append({
                "id_evidencia_n": e.id_evidencia_n,
                "url": e.url_archivo,
                "descripcion": e.descripcion,
                "fecha_subida": e.fecha_subida.isoformat() if e.fecha_subida else None,
            })

        # Pedido info
        pedido_info = None
        if n.pedido:
            pedido_info = {
                "id_pedido": n.pedido.id_pedido,
                "estado": n.pedido.estado_pedido,
                "fecha_entrega": n.pedido.fecha_entrega.isoformat() if n.pedido.fecha_entrega else None,
            }

        # Cita info
        cita_info = None
        if n.cita:
            cita_info = {
                "id_cita": n.cita.id_cita,
                "tipo_servicio": n.cita.tipo_servicio,
                "fecha": n.cita.fecha.isoformat() if n.cita.fecha else None,
                "hora": n.cita.hora,
                "estado": n.cita.estado,
            }

        # Devolucion info
        devolucion_info = None
        if n.devolucion:
            devolucion_info = {
                "id_devolucion": n.devolucion.id_devolucion,
                "estado": n.devolucion.estado,
                "motivo": n.devolucion.motivo,
            }

        result.append({
            "id_novedad": n.id_novedad,
            "tipo_novedad": n.tipo_novedad,
            "descripcion_novedad": n.descripcion_novedad,
            "prioridad": n.prioridad,
            "estado_novedad": n.estado_novedad,
            "fecha_reporte": n.fecha_reporte_novedad.isoformat() if n.fecha_reporte_novedad else None,
            "lugar_ocurrencia": n.lugar_ocurrencia,
            "evidencia_url": n.evidencia_url,
            "id_pedido": n.id_pedido,
            "id_cita": n.id_cita,
            "id_cliente": n.id_cliente,
            "id_devolucion": n.id_devolucion,
            "id_tecnico": n.id_tecnico_n,
            "tecnico_nombre": tecnico_nombre,
            "cliente_nombre": cliente_nombre,
            "accion_admin": n.accion_admin,
            "fecha_resolucion": n.fecha_resolucion.isoformat() if n.fecha_resolucion else None,
            "evidencias": evidencias,
            "pedido_info": pedido_info,
            "cita_info": cita_info,
            "devolucion_info": devolucion_info,
        })
    return result


def _serializar_novedad_detalle(novedad, db):
    items = _serializar_novedades([novedad], db)
    item = items[0] if items else {}

    # Historial
    historial = []
    for h in (novedad.historial or []):
        usuario_nombre = None
        if h.usuario:
            usuario_nombre = f"{h.usuario.first_name} {h.usuario.last_name}".strip()
        historial.append({
            "id_historial": h.id_historial,
            "accion": h.accion,
            "detalle": h.detalle,
            "fecha": h.fecha.isoformat() if h.fecha else None,
            "usuario_nombre": usuario_nombre,
        })
    item["historial"] = historial

    # Info completa del cliente
    if novedad.cliente:
        c = novedad.cliente
        item["cliente_info"] = {
            "id_cliente": c.id_cliente,
            "nombre": f"{c.first_name} {c.last_name}".strip(),
            "email": c.email,
            "telefono": c.telefono_cliente,
            "documento": c.documento_cliente,
            "direccion": c.address,
        }

    # Info completa del pedido
    if novedad.pedido:
        p = novedad.pedido
        item["pedido_info_completo"] = {
            "id_pedido": p.id_pedido,
            "estado": p.estado_pedido,
            "fecha_pedido": p.fecha_peedido.isoformat() if p.fecha_peedido else None,
            "total": p.total_pedido,
            "fecha_entrega": p.fecha_entrega.isoformat() if p.fecha_entrega else None,
            "hora_entrega": p.hora_entrega,
            "estado_entrega": p.estado_entrega,
            "nombre_tecnico": p.nombre_tecnico_entrega,
        }

    # Info completa de la cita
    if novedad.cita:
        ci = novedad.cita
        item["cita_info_completo"] = {
            "id_cita": ci.id_cita,
            "tipo_servicio": ci.tipo_servicio,
            "fecha": ci.fecha.isoformat() if ci.fecha else None,
            "hora": ci.hora,
            "estado": ci.estado,
            "direccion": ci.direccion,
            "especialidad": ci.especializacion.nombre if ci.especializacion else None,
        }

    # Info completa de la devolución
    if novedad.devolucion:
        dv = novedad.devolucion
        item["devolucion_info_completo"] = {
            "id_devolucion": dv.id_devolucion,
            "estado": dv.estado,
            "motivo": dv.motivo,
            "descripcion": dv.descripcion,
            "fecha_solicitud": dv.created_at.isoformat() if dv.created_at else None,
        }

    return item
