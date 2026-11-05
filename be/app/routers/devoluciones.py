"""Devoluciones de productos solicitadas por el cliente.

Flujo (estilo e-commerce):
  - El cliente entra a su pedido entregado y pulsa "Solicitar devolución".
  - Elige uno o varios productos del pedido y cuántas unidades devolver
    (devolución parcial o total), indica el motivo estructurado y revisa
    un resumen antes de confirmar.
  - La solicitud queda en el pipeline: Solicitada → En revisión → Aprobada
    → Producto en devolución → Recibida → Reembolso procesado (+ Rechazada).
  - Los administradores la gestionan desde el panel y cada cambio de estado
    notifica al cliente. Las líneas legadas de ``devoluciones`` siguen
    alimentando el flujo de recogida del técnico.

Endpoints legados conservados: POST "" (una línea), PUT /{id}/estado,
recogidas y evidencias del técnico, reasignación de técnico.
"""
from datetime import datetime
from pathlib import Path
from typing import List, Optional

import uuid

from fastapi import APIRouter, Depends, HTTPException, File, Query, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy import and_, or_, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.cliente import Cliente
from app.models.devolucion import Devolucion
from app.models.pedido import DetallePedido, Pedido
from app.models.producto import Producto
from app.models.roles_usuario import RolesUsuario
from app.models.solicitud_devolucion import SolicitudDevolucion
from app.models.user import User
from app.services import devoluciones_service as dv_service
from app.services import minio_service
from app.services.notificaciones import (
    crear_notificacion,
    notificar_admin_devolucion_solicitada,
    notificar_devolucion_cliente,
)
from app.utils.security import get_current_client, get_current_employee, get_current_user

EXTENSIONES_EVIDENCIA = {".jpg", ".jpeg", ".png", ".webp", ".gif"}

router = APIRouter(prefix="/devoluciones", tags=["Devoluciones"])


def _url_evidencia_devolucion(id_devolucion: int, tipo: str) -> str:
    return f"/api/v1/devoluciones/{id_devolucion}/evidencia-{tipo}/archivo"


def _servir_evidencia_devolucion(db: Session, id_devolucion: int, tipo: str, current_user) -> Response:
    """Sirve la evidencia de recogida/cambio previa comprobación de rol/asignación."""
    from app.models.tecnico import Tecnico

    devolucion = db.query(Devolucion).filter(Devolucion.id_devolucion == id_devolucion).first()
    if not devolucion:
        raise HTTPException(status_code=404, detail="Devolución no encontrada")
    ref = devolucion.evidencia_recogida if tipo == "recogida" else devolucion.evidencia_cambio
    if not ref:
        raise HTTPException(status_code=404, detail="Evidencia no encontrada")

    if isinstance(current_user, Cliente):
        if devolucion.id_cliente_d != current_user.id_cliente:
            raise HTTPException(status_code=403, detail="No tienes permiso para ver esta evidencia")
    else:
        role = db.execute(
            select(RolesUsuario.nombre_rol).where(RolesUsuario.id_rol == current_user.id_rol_u)
        ).scalar_one_or_none()
        if role not in ("admin", "administrador"):
            ficha = db.query(Tecnico).filter(Tecnico.id_usuario_t == current_user.id_usuario).first()
            if not ficha or devolucion.id_tecnico_recogida != ficha.id_tecnico:
                raise HTTPException(status_code=403, detail="No tienes permiso para ver esta evidencia")
    try:
        contenido, media = minio_service.leer_archivo(ref)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Archivo no encontrado")
    return Response(content=contenido, media_type=media)


@router.get("/{id_devolucion}/evidencia-recogida/archivo")
def descargar_evidencia_recogida(
    id_devolucion: int,
    current_user = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return _servir_evidencia_devolucion(db, id_devolucion, "recogida", current_user)


@router.get("/{id_devolucion}/evidencia-cambio/archivo")
def descargar_evidencia_cambio(
    id_devolucion: int,
    current_user = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return _servir_evidencia_devolucion(db, id_devolucion, "cambio", current_user)


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


# Agrupa los campos de DevolucionCreate: id_pedido, id_producto, motivo, preferencia.
class DevolucionCreate(BaseModel):
    id_pedido: int
    id_producto: int = Field(gt=0)
    motivo: Optional[str] = None
    preferencia: Optional[str] = None  # 'producto' | 'dinero'


def _serializar_devolucion(d: Devolucion, cliente=None, producto=None) -> dict:
    return {
        "id_devolucion": d.id_devolucion,
        "id_pedido": d.id_pedido_d,
        "id_producto": d.id_producto_d,
        "producto": (
            producto.nombre_producto
            if producto is not None
            else (f"Producto #{d.id_producto_d}" if d.id_producto_d else None)
        ),
        "cantidad": d.cantidad or 1,
        "id_solicitud": d.id_solicitud_dv,
        "preferencia": d.preferencia,
        "id_tecnico_recogida": d.id_tecnico_recogida,
        "recogida_estado": d.recogida_estado,
        "cliente": (
            f"{cliente.first_name} {cliente.last_name}".strip()
            if cliente is not None
            else None
        ),
        "motivo": d.motivo,
        "estado": d.estado,
        "resolucion": d.resolucion,
        "created_at": d.created_at.isoformat() if d.created_at else None,
        "resuelta_at": d.resuelta_at.isoformat() if d.resuelta_at else None,
    }


def _notificar_solicitud_creada(db: Session, client: Cliente, solicitud) -> None:
    """Notifica la creación de una solicitud: administradores, técnico(s) de
    recogida asignados y confirmación al cliente."""
    from app.services.notificaciones import programar_correo

    cliente_nombre = f"{client.first_name} {client.last_name}".strip() or "Cliente"
    lineas = (
        db.query(Devolucion)
        .filter(Devolucion.id_solicitud_dv == solicitud.id_solicitud)
        .all()
    )
    ids = [l.id_producto_d for l in lineas if l.id_producto_d]
    productos_map = (
        {p.id_producto: p for p in db.query(Producto).filter(Producto.id_producto.in_(ids)).all()}
        if ids
        else {}
    )
    detalles_map = (
        {
            d.id_producto_d: d
            for d in db.query(DetallePedido)
            .filter(
                DetallePedido.id_pedido_d == solicitud.id_pedido_s,
                DetallePedido.id_producto_d.in_(ids),
            )
            .all()
        }
        if ids
        else {}
    )

    resumen_productos = ", ".join(
        f"{l.cantidad}× {_nombre_linea(l, detalles_map, productos_map)}" for l in lineas
    )

    # Administradores.
    notificar_admin_devolucion_solicitada(
        db,
        solicitud.id_pedido_s,
        cliente_nombre,
        f"{resumen_productos} ({solicitud.numero})",
        dv_service.MOTIVOS_DEVOLUCION.get(solicitud.motivo_tipo or "", solicitud.motivo_tipo),
    )

    # Técnico(s) de recogida + aviso de dirección.
    direccion_cliente = (client.address or "").strip() or "Por definir"
    tecnicos_notificados: set[int] = set()
    for linea in lineas:
        if not linea.id_tecnico_recogida or linea.id_tecnico_recogida in tecnicos_notificados:
            continue
        tecnicos_notificados.add(linea.id_tecnico_recogida)
        from app.models.tecnico import Tecnico

        tecnico = (
            db.query(Tecnico)
            .filter(Tecnico.id_tecnico == linea.id_tecnico_recogida)
            .first()
        )
        if not tecnico or not tecnico.usuario:
            continue
        nombre_producto_txt = _nombre_linea(linea, detalles_map, productos_map)
        crear_notificacion(
            db,
            id_usuario=tecnico.usuario.id_usuario,
            id_cliente=None,
            tipo="recogida",
            titulo="Recogida por devolución asignada",
            mensaje=(
                f"Debes recoger '{nombre_producto_txt}' del pedido "
                f"#{solicitud.id_pedido_s} en: {direccion_cliente}."
            ),
        )
        if tecnico.usuario.email:
            nombre_tecnico = (
                f"{tecnico.usuario.first_name} {tecnico.usuario.last_name}".strip()
                or "Técnico"
            )
            programar_correo(
                tecnico.usuario.email,
                "Recogida por devolución asignada - Neodomus",
                "<div style='font-family:Arial,sans-serif;max-width:560px;margin:auto'>"
                "<h2 style='color:#1f1a12'>Recogida asignada</h2>"
                f"<p>Hola <strong>{nombre_tecnico}</strong>, te asignamos recoger el "
                f"<strong>{nombre_producto_txt}</strong> del pedido #{solicitud.id_pedido_s}.</p>"
                f"<p><strong>Dirección:</strong> {direccion_cliente}<br/>"
                f"<strong>Cliente:</strong> {cliente_nombre}</p>"
                "</div>",
            )

        crear_notificacion(
            db,
            id_usuario=None,
            id_cliente=client.id_cliente,
            tipo="recogida",
            titulo="Técnico asignado para tu devolución",
            mensaje=(
                f"Un técnico pasará a recoger los productos de tu devolución "
                f"{solicitud.numero} (pedido #{solicitud.id_pedido_s})."
            ),
        )

    # Confirmación al cliente.
    notificar_devolucion_cliente(
        db,
        client.id_cliente,
        client.email,
        cliente_nombre,
        numero=solicitud.numero,
        pedido_id=solicitud.id_pedido_s,
        evento="solicitada",
        monto=float(solicitud.monto_total or 0),
        productos_txt=resumen_productos,
    )


def _nombre_linea(linea: Devolucion, detalles_map: dict, productos_map: dict) -> str:
    det = detalles_map.get(linea.id_producto_d)
    prod = productos_map.get(linea.id_producto_d)
    if det is not None and det.descripcion_detalle:
        return det.descripcion_detalle
    if prod is not None:
        return prod.nombre_producto
    return f"Producto #{linea.id_producto_d or '?'}"


@router.post("")
def solicitar_devolucion(
    data: DevolucionCreate,
    client: Cliente = Depends(get_current_client),
    db: Session = Depends(get_db),
):
    """Endpoint LEGADO (una sola línea): delega en el servicio de solicitudes
    para que las reglas de cantidades y duplicados sean las mismas."""
    try:
        solicitud = dv_service.crear_solicitud(
            db,
            client,
            id_pedido=data.id_pedido,
            items=[{"id_producto": data.id_producto, "cantidad": 1}],
            motivo_tipo="otro",
            motivo_otro=(data.motivo or "").strip() or None,
            comentario=None,
        )
    except dv_service.ItemInvalido as e:
        raise HTTPException(status_code=400, detail=e.mensaje)

    _notificar_solicitud_creada(db, client, solicitud)

    linea = (
        db.query(Devolucion)
        .filter(Devolucion.id_solicitud_dv == solicitud.id_solicitud)
        .first()
    )
    producto = (
        db.query(Producto).filter(Producto.id_producto == data.id_producto).first()
    )
    return _serializar_devolucion(linea, producto=producto)


# ──────────────────────────────────────────────────────────────────
# Nuevo flujo: solicitudes con múltiples productos y cantidades
# ──────────────────────────────────────────────────────────────────

# Agrupa los campos de ItemDevolucionIn: id_producto, cantidad.
class ItemDevolucionIn(BaseModel):
    id_producto: int = Field(gt=0)
    cantidad: int = Field(default=1, ge=1)


# Agrupa los campos de SolicitudDevolucionCreate: id_pedido, items, motivo_tipo, motivo_otro, comentario.
class SolicitudDevolucionCreate(BaseModel):
    id_pedido: int
    items: List[ItemDevolucionIn]
    motivo_tipo: str  # clave del catálogo MOTIVOS_DEVOLUCION
    motivo_otro: Optional[str] = None  # obligatorio si motivo_tipo == 'otro'
    comentario: Optional[str] = None


@router.get("/elegibilidad/{id_pedido}")
def elegibilidad_devolucion(
    id_pedido: int,
    client: Cliente = Depends(get_current_client),
    db: Session = Depends(get_db),
):
    """Productos del pedido entregado con las unidades disponibles para
    devolver (compradas − ya solicitadas en solicitudes activas)."""
    try:
        return dv_service.elegibilidad_pedido(db, client, id_pedido)
    except PermissionError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/solicitudes")
def crear_solicitud_devolucion(
    data: SolicitudDevolucionCreate,
    client: Cliente = Depends(get_current_client),
    db: Session = Depends(get_db),
):
    """Crea una solicitud de devolución parcial o total con varias líneas."""
    try:
        solicitud = dv_service.crear_solicitud(
            db,
            client,
            id_pedido=data.id_pedido,
            items=[item.model_dump() for item in data.items],
            motivo_tipo=data.motivo_tipo,
            motivo_otro=data.motivo_otro,
            comentario=data.comentario,
        )
    except dv_service.ItemInvalido as e:
        raise HTTPException(status_code=400, detail=e.mensaje)

    _notificar_solicitud_creada(db, client, solicitud)
    return dv_service.serializar_solicitud(db, solicitud)


@router.get("/mis-solicitudes")
def mis_solicitudes_devolucion(
    client: Cliente = Depends(get_current_client),
    db: Session = Depends(get_db),
):
    """Solicitudes de devolución del cliente autenticado (más recientes primero)."""
    filas = (
        db.query(SolicitudDevolucion)
        .filter(SolicitudDevolucion.id_cliente_s == client.id_cliente)
        .order_by(SolicitudDevolucion.created_at.desc())
        .limit(100)
        .all()
    )
    return [dv_service.serializar_solicitud(db, s) for s in filas]


@router.get("/admin/solicitudes")
def listar_solicitudes_admin(
    estado: Optional[str] = Query(None),
    _admin_user: User = Depends(_admin),
    db: Session = Depends(get_db),
):
    """Todas las solicitudes de devolución con sus líneas (administradores)."""
    consulta = db.query(SolicitudDevolucion)
    if estado:
        consulta = consulta.filter(SolicitudDevolucion.estado == estado)
    filas = consulta.order_by(SolicitudDevolucion.created_at.desc()).limit(200).all()
    return [dv_service.serializar_solicitud(db, s) for s in filas]


# Agrupa los campos de EstadoSolicitudUpdate: estado, resolucion, motivo_rechazo, observaciones.
class EstadoSolicitudUpdate(BaseModel):
    estado: Optional[str] = None  # None → solo actualiza observaciones
    resolucion: Optional[str] = None
    motivo_rechazo: Optional[str] = None
    observaciones: Optional[str] = None


@router.put("/admin/solicitudes/{id_solicitud}/estado")
def cambiar_estado_solicitud(
    id_solicitud: int,
    data: EstadoSolicitudUpdate,
    admin: User = Depends(_admin),
    db: Session = Depends(get_db),
):
    """Avanza el pipeline de una devolución y notifica al cliente.

    Estados válidos: En revisión · Aprobada (+ Reembolso/Cambio)
    · Rechazada (+ motivo) · Producto en devolución · Recibida
    · Reembolso procesado.
    """
    solicitud = (
        db.query(SolicitudDevolucion)
        .filter(SolicitudDevolucion.id_solicitud == id_solicitud)
        .first()
    )
    if not solicitud:
        raise HTTPException(status_code=404, detail="Solicitud no encontrada")

    solo_observaciones = not data.estado
    if solo_observaciones and data.observaciones is None:
        raise HTTPException(status_code=400, detail="Nada que actualizar")

    try:
        if solo_observaciones:
            solicitud.observaciones_admin = (data.observaciones or "").strip() or None
            solicitud.updated_at = datetime.now()
            db.commit()
            db.refresh(solicitud)
            reembolso = None
        else:
            solicitud, reembolso = dv_service.cambiar_estado(
                db,
                solicitud,
                data.estado,
                resolucion=data.resolucion,
                motivo_rechazo=data.motivo_rechazo,
                observaciones=data.observaciones,
                admin_id=admin.id_usuario,
            )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # Notificaciones al cliente según el nuevo estado.
    if not solo_observaciones:
        cliente = (
            db.query(Cliente)
            .filter(Cliente.id_cliente == solicitud.id_cliente_s)
            .first()
        )
        evento = {
            dv_service.EST_EN_REVISION: "en_revision",
            dv_service.EST_APROBADA: "aprobada",
            dv_service.EST_RECHAZADA: "rechazada",
            dv_service.EST_RECIBIDA: "recibida",
            dv_service.EST_REEMBOLSO: "reembolso_procesado",
        }.get(solicitud.estado)
        if evento and cliente:
            lineas = (
                db.query(Devolucion)
                .filter(Devolucion.id_solicitud_dv == solicitud.id_solicitud)
                .all()
            )
            ids = [l.id_producto_d for l in lineas if l.id_producto_d]
            productos_map = (
                {
                    p.id_producto: p
                    for p in db.query(Producto).filter(Producto.id_producto.in_(ids)).all()
                }
                if ids
                else {}
            )
            productos_txt = ", ".join(
                f"{l.cantidad}× {_nombre_linea(l, {}, productos_map)}" for l in lineas
            )
            notificar_devolucion_cliente(
                db,
                cliente.id_cliente,
                cliente.email,
                f"{cliente.first_name} {cliente.last_name}".strip() or "Cliente",
                numero=solicitud.numero,
                pedido_id=solicitud.id_pedido_s or 0,
                evento=evento,
                monto=float(solicitud.monto_total or 0),
                motivo_rechazo=solicitud.motivo_rechazo,
                productos_txt=productos_txt,
            )

    respuesta = dv_service.serializar_solicitud(db, solicitud)
    respuesta["id_reembolso"] = reembolso.id_reembolso if reembolso else None
    return respuesta


@router.get("/mias")
def mis_devoluciones(
    client: Cliente = Depends(get_current_client),
    db: Session = Depends(get_db),
):
    """Devoluciones solicitadas por el cliente autenticado."""
    filas = (
        db.query(Devolucion)
        .filter(Devolucion.id_cliente_d == client.id_cliente)
        .order_by(Devolucion.created_at.desc())
        .all()
    )
    ids_productos = [f.id_producto_d for f in filas if f.id_producto_d]
    productos = (
        {p.id_producto: p for p in db.query(Producto).filter(Producto.id_producto.in_(ids_productos)).all()}
        if ids_productos
        else {}
    )
    return [_serializar_devolucion(f, producto=productos.get(f.id_producto_d)) for f in filas]


@router.get("")
def listar_devoluciones_admin(
    _admin_user: User = Depends(_admin),
    db: Session = Depends(get_db),
):
    """Todas las solicitudes de devolución (solo administradores)."""
    filas = (
        db.query(Devolucion)
        .order_by(Devolucion.created_at.desc())
        .limit(200)
        .all()
    )
    clientes = {c.id_cliente: c for c in db.query(Cliente).all()}
    ids_productos = [f.id_producto_d for f in filas if f.id_producto_d]
    productos = (
        {p.id_producto: p for p in db.query(Producto).filter(Producto.id_producto.in_(ids_productos)).all()}
        if ids_productos
        else {}
    )
    return [
        _serializar_devolucion(
            f,
            cliente=clientes.get(f.id_cliente_d),
            producto=productos.get(f.id_producto_d),
        )
        for f in filas
    ]


@router.get("/mis-recogidas")
def mis_recogidas(
    historial: bool = Query(False),
    current_user: User = Depends(get_current_employee),
    db: Session = Depends(get_db),
):
    """Devoluciones donde el técnico autenticado fue asignado a recoger
    el producto del cliente.

    Con ``historial=false`` (por defecto) devuelve solo las recogidas
    activas (Asignada / Recogida). Con ``historial=true`` devuelve TODAS,
    incluidas resueltas o rechazadas, para el historial del técnico.
    """
    from app.models.tecnico import Tecnico

    ficha = db.query(Tecnico).filter(Tecnico.id_usuario_t == current_user.id_usuario).first()
    if not ficha:
        return []

    consulta = db.query(Devolucion).filter(
        Devolucion.id_tecnico_recogida == ficha.id_tecnico
    )
    if not historial:
        # Activas = SOLO lo pendiente por hacer:
        #   - Asignada (falta recoger el producto), o
        #   - ya recogida pero con producto de CAMBIO pendiente de entrega.
        # Al confirmar la recogida con evidencia, la devolución sale de esta
        # lista y queda guardada en el HISTORIAL (historial=true).
        consulta = consulta.filter(
            or_(
                Devolucion.recogida_estado == "Asignada",
                and_(
                    Devolucion.recogida_estado == "Recogida",
                    Devolucion.resolucion == "Cambio",
                    Devolucion.evidencia_cambio.is_(None),
                ),
            )
        )
    filas = consulta.order_by(Devolucion.created_at.desc()).limit(200).all()

    resultado = []
    for d in filas:
        cliente = db.query(Cliente).filter(Cliente.id_cliente == d.id_cliente_d).first()
        pedido = db.query(Pedido).filter(Pedido.id_pedido == d.id_pedido_d).first()
        producto = (
            db.query(Producto).filter(Producto.id_producto == d.id_producto_d).first()
            if d.id_producto_d
            else None
        )
        resultado.append({
            "id_devolucion": d.id_devolucion,
            "id_pedido": d.id_pedido_d,
            "producto": (
                producto.nombre_producto if producto else f"Producto #{d.id_producto_d}"
            ),
            "cantidad": d.cantidad or 1,
            "producto_imagen": (
                producto.imagen_url if producto else None
            ),
            "cliente": (
                f"{cliente.first_name} {cliente.last_name}".strip() if cliente else "Cliente"
            ),
            "direccion": (cliente.address or "").strip() if cliente else "Por definir",
            "telefono": cliente.telefono_cliente if cliente else None,
            "email": cliente.email if cliente else None,
            "estado_devolucion": d.estado,
            "resolucion": d.resolucion,
            "preferencia": d.preferencia or "dinero",
            "recogida_estado": d.recogida_estado,
            "motivo": d.motivo,
            "fecha_solicitud": d.created_at.isoformat() if d.created_at else None,
            "evidencia_recogida_url": (
                _url_evidencia_devolucion(d.id_devolucion, "recogida")
                if d.evidencia_recogida
                else None
            ),
            "fecha_recogida": d.fecha_recogida.isoformat() if d.fecha_recogida else None,
            "evidencia_cambio_url": (
                _url_evidencia_devolucion(d.id_devolucion, "cambio")
                if d.evidencia_cambio
                else None
            ),
            "fecha_entrega_cambio": (
                d.fecha_entrega_cambio.isoformat() if d.fecha_entrega_cambio else None
            ),
        })
    return resultado


# Agrupa los campos de RecogidaUpdate: recogida.
class RecogidaUpdate(BaseModel):
    recogida: bool = True


@router.put("/{id_devolucion}/recogida")
def marcar_recogida(
    id_devolucion: int,
    data: RecogidaUpdate,
    current_user: User = Depends(get_current_employee),
    db: Session = Depends(get_db),
):
    """El técnico asignado confirma que recogió el producto."""
    from app.models.tecnico import Tecnico

    ficha = db.query(Tecnico).filter(Tecnico.id_usuario_t == current_user.id_usuario).first()
    devolucion = (
        db.query(Devolucion)
        .filter(
            Devolucion.id_devolucion == id_devolucion,
            Devolucion.id_tecnico_recogida == (ficha.id_tecnico if ficha else -1),
        )
        .first()
    )
    if not devolucion:
        raise HTTPException(status_code=404, detail="Recogida no encontrada")

    devolucion.recogida_estado = "Recogida" if data.recogida else "Asignada"
    db.commit()
    return {
        "id_devolucion": devolucion.id_devolucion,
        "recogida_estado": devolucion.recogida_estado,
    }


@router.post("/{id_devolucion}/evidencia-recogida")
async def subir_evidencia_recogida(
    id_devolucion: int,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_employee),
    db: Session = Depends(get_db),
):
    """El técnico asignado sube la evidencia fotográfica de que recogió el
    producto en casa del cliente. Al confirmarse:
      - recogida_estado -> 'Recogida' (con fecha y foto en MinIO)
      - el producto REGRESA al inventario (+1)
      - se notifica al cliente."""
    from app.models.tecnico import Tecnico

    ficha = db.query(Tecnico).filter(Tecnico.id_usuario_t == current_user.id_usuario).first()
    devolucion = (
        db.query(Devolucion)
        .filter(
            Devolucion.id_devolucion == id_devolucion,
            Devolucion.id_tecnico_recogida == (ficha.id_tecnico if ficha else -1),
        )
        .first()
    )
    if not devolucion:
        raise HTTPException(status_code=404, detail="Recogida no encontrada")
    if devolucion.estado != "Aprobada":
        raise HTTPException(status_code=400, detail="La devolución no está aprobada")
    if devolucion.recogida_estado == "Recogida":
        raise HTTPException(status_code=400, detail="Esta recogida ya fue confirmada")

    if not file or not file.filename:
        raise HTTPException(status_code=400, detail="Selecciona una foto de la recogida")
    ext = Path(file.filename or "").suffix.lower()
    if ext not in EXTENSIONES_EVIDENCIA:
        raise HTTPException(status_code=400, detail="Formato no permitido (usa JPG, PNG, WEBP o GIF)")
    contenido = await file.read()
    if not contenido:
        raise HTTPException(status_code=400, detail="El archivo está vacío")
    if len(contenido) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="La imagen supera los 5 MB")
    try:
        import io

        from PIL import Image

        Image.open(io.BytesIO(contenido)).verify()
    except Exception:
        raise HTTPException(status_code=400, detail="El archivo no es una imagen válida")

    nombre = f"{uuid.uuid4().hex}{ext}"
    clave = minio_service.subir_imagen_privada("recogidas", nombre, contenido)

    devolucion.evidencia_recogida = clave
    devolucion.fecha_recogida = datetime.now()
    devolucion.recogida_estado = "Recogida"

    # El producto físicamente regresó: ahora sí entra al inventario
    # (se reintegra la CANTIDAD devuelta, no una unidad fija).
    producto_devuelto = (
        db.query(Producto).filter(Producto.id_producto == devolucion.id_producto_d).first()
        if devolucion.id_producto_d
        else None
    )
    if producto_devuelto:
        producto_devuelto.stock_producto = (producto_devuelto.stock_producto or 0) + (
            devolucion.cantidad or 1
        )
    db.commit()

    # Avanza el pipeline de la solicitud asociada (→ En devolución /
    # Recibida / Reembolso procesado) y notifica al cliente si cambió.
    estado_previo = None
    if devolucion.id_solicitud_dv:
        solicitud_obj = (
            db.query(SolicitudDevolucion)
            .filter(SolicitudDevolucion.id_solicitud == devolucion.id_solicitud_dv)
            .first()
        )
        if solicitud_obj:
            estado_previo = solicitud_obj.estado
            dv_service.avanzar_por_recogida(db, devolucion)
            db.refresh(solicitud_obj)
            if solicitud_obj.estado != estado_previo and solicitud_obj.estado in (
                dv_service.EST_RECIBIDA,
                dv_service.EST_REEMBOLSO,
                dv_service.EST_EN_DEVOLUCION,
            ):
                cliente_sol = (
                    db.query(Cliente)
                    .filter(Cliente.id_cliente == solicitud_obj.id_cliente_s)
                    .first()
                )
                if cliente_sol:
                    notificar_devolucion_cliente(
                        db,
                        cliente_sol.id_cliente,
                        cliente_sol.email,
                        f"{cliente_sol.first_name} {cliente_sol.last_name}".strip() or "Cliente",
                        numero=solicitud_obj.numero,
                        pedido_id=solicitud_obj.id_pedido_s or 0,
                        evento=(
                            "reembolso_procesado"
                            if solicitud_obj.estado == dv_service.EST_REEMBOLSO
                            else "recibida"
                        ),
                        monto=float(solicitud_obj.monto_total or 0),
                    )

    cliente = db.query(Cliente).filter(Cliente.id_cliente == devolucion.id_cliente_d).first()
    if cliente is not None:
        crear_notificacion(
            db,
            id_usuario=None,
            id_cliente=cliente.id_cliente,
            tipo="entrega",
            titulo=f"Devolución #{devolucion.id_devolucion} recogida",
            mensaje=(
                "El técnico recogió tu producto. "
                + (
                    "Tu reembolso continúa el proceso por el medio de pago original."
                    if (devolucion.resolucion or "") == "Reembolso"
                    else "Coordinaremos el envío de tu producto de cambio."
                )
            ),
        )

    # ── Notificar al ADMINISTRADOR que se recogió el producto ──────
    from app.models.user import User as UserModel

    nombre_cliente = (
        f"{cliente.first_name} {cliente.last_name}".strip()
        if cliente is not None
        else "Cliente"
    )
    producto_nombre = (
        db.query(Producto).filter(Producto.id_producto == devolucion.id_producto_d).first()
    )
    producto_txt = (
        producto_devuelto.nombre_producto
        if producto_devuelto
        else f"Producto #{devolucion.id_producto_d or '?'}"
    )
    admins_activos = (
        db.query(UserModel)
        .filter(UserModel.id_rol_u == 1, UserModel.is_active == True)  # noqa: E712
        .all()
    )
    for adm in admins_activos:
        crear_notificacion(
            db,
            id_usuario=adm.id_usuario,
            id_cliente=None,
            tipo="recogida",
            titulo="Devolución recogida por técnico",
            mensaje=(
                f"El técnico recogió '{producto_txt}' de {nombre_cliente} "
                f"(devolución #{devolucion.id_devolucion}, pedido #{devolucion.id_pedido_d}). "
                f"Evidencia fotográfica disponible en MinIO."
            ),
        )

    return {
        "id_devolucion": devolucion.id_devolucion,
        "recogida_estado": devolucion.recogida_estado,
        "evidencia_recogida_url": _url_evidencia_devolucion(devolucion.id_devolucion, "recogida"),
        "fecha_recogida": devolucion.fecha_recogida.isoformat(),
        "stock_reintegrado": bool(producto_devuelto),
    }


@router.post("/{id_devolucion}/evidencia-cambio")
async def subir_evidencia_cambio(
    id_devolucion: int,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_employee),
    db: Session = Depends(get_db),
):
    """El técnico asignado sube la evidencia fotográfica de la ENTREGA del
    producto de cambio al cliente (resolución 'Cambio'). Al confirmarse se
    guarda la foto en MinIO, la fecha de entrega y se notifica al cliente y
    a los administradores."""
    from app.models.tecnico import Tecnico

    ficha = db.query(Tecnico).filter(Tecnico.id_usuario_t == current_user.id_usuario).first()
    devolucion = (
        db.query(Devolucion)
        .filter(
            Devolucion.id_devolucion == id_devolucion,
            Devolucion.id_tecnico_recogida == (ficha.id_tecnico if ficha else -1),
        )
        .first()
    )
    if not devolucion:
        raise HTTPException(status_code=404, detail="Devolución no encontrada")
    if devolucion.recogida_estado != "Recogida":
        raise HTTPException(
            status_code=400,
            detail="Primero debes confirmar la recogida del producto original",
        )
    if (devolucion.resolucion or "").lower() != "cambio":
        raise HTTPException(
            status_code=400,
            detail="Esta devolución no tiene resolución de cambio de producto",
        )
    if devolucion.evidencia_cambio:
        raise HTTPException(
            status_code=400, detail="La entrega del producto de cambio ya fue confirmada"
        )

    if not file or not file.filename:
        raise HTTPException(status_code=400, detail="Selecciona una foto de la entrega")
    ext = Path(file.filename or "").suffix.lower()
    if ext not in EXTENSIONES_EVIDENCIA:
        raise HTTPException(status_code=400, detail="Formato no permitido (usa JPG, PNG, WEBP o GIF)")
    contenido = await file.read()
    if not contenido:
        raise HTTPException(status_code=400, detail="El archivo está vacío")
    if len(contenido) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="La imagen supera los 5 MB")
    try:
        import io

        from PIL import Image

        Image.open(io.BytesIO(contenido)).verify()
    except Exception:
        raise HTTPException(status_code=400, detail="El archivo no es una imagen válida")

    nombre = f"{uuid.uuid4().hex}{ext}"
    clave = minio_service.subir_imagen_privada("recogidas", nombre, contenido)

    devolucion.evidencia_cambio = clave
    devolucion.fecha_entrega_cambio = datetime.now()
    db.commit()

    cliente = db.query(Cliente).filter(Cliente.id_cliente == devolucion.id_cliente_d).first()
    if cliente is not None:
        crear_notificacion(
            db,
            id_usuario=None,
            id_cliente=cliente.id_cliente,
            tipo="entrega",
            titulo=f"Cambio entregado - Devolución #{devolucion.id_devolucion}",
            mensaje=(
                "El técnico entregó tu producto de cambio. ¡Gracias por tu paciencia!"
            ),
        )

    from app.models.user import User as UserModel

    nombre_cliente = (
        f"{cliente.first_name} {cliente.last_name}".strip()
        if cliente is not None
        else "Cliente"
    )
    admins_activos = (
        db.query(UserModel)
        .filter(UserModel.id_rol_u == 1, UserModel.is_active == True)  # noqa: E712
        .all()
    )
    for adm in admins_activos:
        crear_notificacion(
            db,
            id_usuario=adm.id_usuario,
            id_cliente=None,
            tipo="recogida",
            titulo="Producto de cambio entregado",
            mensaje=(
                f"El técnico entregó el producto de cambio de la devolución "
                f"#{devolucion.id_devolucion} a {nombre_cliente} "
                f"(pedido #{devolucion.id_pedido_d})."
            ),
        )

    return {
        "id_devolucion": devolucion.id_devolucion,
        "evidencia_cambio_url": _url_evidencia_devolucion(devolucion.id_devolucion, "cambio"),
        "fecha_entrega_cambio": devolucion.fecha_entrega_cambio.isoformat(),
    }


# Agrupa los campos de ReasignarTecnicoIn: id_tecnico.
class ReasignarTecnicoIn(BaseModel):
    id_tecnico: int


@router.put("/admin/{id_devolucion}/reasignar-tecnico")
def reasignar_tecnico_recogida(
    id_devolucion: int,
    data: ReasignarTecnicoIn,
    admin: User = Depends(_admin),
    db: Session = Depends(get_db),
):
    """El administrador cambia el técnico asignado para recoger la devolución
    (por ejemplo, si la cuenta del técnico anterior fue inhabilitada).
    Notifica al nuevo técnico y al cliente."""
    from app.models.tecnico import Tecnico as TecnicoModel
    from app.services.notificaciones import crear_notificacion, programar_correo

    devolucion = (
        db.query(Devolucion).filter(Devolucion.id_devolucion == id_devolucion).first()
    )
    if not devolucion:
        raise HTTPException(status_code=404, detail="Devolución no encontrada")

    nuevo = (
        db.query(TecnicoModel)
        .join(User, User.id_usuario == TecnicoModel.id_usuario_t)
        .filter(
            TecnicoModel.id_tecnico == data.id_tecnico,
            User.is_active == True,  # noqa: E712
        )
        .first()
    )
    if not nuevo:
        raise HTTPException(status_code=404, detail="Técnico no encontrado o inactivo")

    anterior_id = devolucion.id_tecnico_recogida
    if anterior_id == nuevo.id_tecnico:
        raise HTTPException(status_code=400, detail="Ese técnico ya está asignado")

    devolucion.id_tecnico_recogida = nuevo.id_tecnico
    devolucion.recogida_estado = "Asignada"
    db.commit()

    cliente = db.query(Cliente).filter(Cliente.id_cliente == devolucion.id_cliente_d).first()
    nombre_cliente = (
        f"{cliente.first_name} {cliente.last_name}".strip() if cliente else "Cliente"
    )
    nombre_nuevo = (
        f"{nuevo.usuario.first_name} {nuevo.usuario.last_name}".strip()
        if nuevo.usuario
        else "Técnico"
    )
    direccion = ((cliente.address or "").strip() if cliente else "") or "Por definir"

    # Notificar al NUEVO técnico (plataforma + correo).
    if nuevo.usuario:
        crear_notificacion(
            db,
            id_usuario=nuevo.usuario.id_usuario,
            id_cliente=None,
            tipo="recogida",
            titulo="Nueva recogida por devolución reasignada",
            mensaje=(
                f"Te asignaron recoger el producto de la devolución "
                f"#{id_devolucion} en: {direccion}."
            ),
        )
        if nuevo.usuario.email:
            programar_correo(
                nuevo.usuario.email,
                "Recogida por devolución - Neodomus",
                "<div style='font-family:Arial,sans-serif;max-width:560px;margin:auto'>"
                "<h2 style='color:#1f1a12'>Recogida por devolución</h2>"
                f"<p>Hola <strong>{nombre_nuevo}</strong>, se te reasignó la recogida "
                f"de la devolución #{id_devolucion}.</p>"
                f"<p><strong>Dirección:</strong> {direccion}</p></div>",
            )

    # Notificar al CLIENTE sobre el cambio de técnico.
    crear_notificacion(
        db,
        id_usuario=None,
        id_cliente=devolucion.id_cliente_d,
        tipo="recogida",
        titulo="Cambio de técnico para tu devolución",
        mensaje=(
            f"{nombre_nuevo} será el nuevo técnico encargado de recoger tu "
            f"devolución #{id_devolucion}."
        ),
    )

    return {
        "id_devolucion": id_devolucion,
        "id_tecnico_anterior": anterior_id,
        "id_tecnico_nuevo": nuevo.id_tecnico,
        "nombre_tecnico": nombre_nuevo,
        "mensaje": "Técnico reasignado y notificado",
    }


def _crear_reembolso_desde_devolucion(db: Session, devolucion: Devolucion):
    """Al aprobar una devolución con resolución 'Reembolso' registra un
    reembolso PENDIENTE por el valor pagado del producto, para que el
    administrador lo confirme desde la pestaña Reembolsos."""
    from app.models.especializacion import Reembolso
    from app.models.pago import Pago

    existe = (
        db.query(Reembolso)
        .filter(
            Reembolso.id_pedido == devolucion.id_pedido_d,
            Reembolso.estado.in_(("Pendiente", "Procesando", "Reembolsado")),
        )
        .first()
    )
    if existe:
        return None

    # Preferir el subtotal pagado por EL PRODUCTO devuelto.
    monto = 0.0
    detalle = (
        db.query(DetallePedido)
        .filter(
            DetallePedido.id_pedido_d == devolucion.id_pedido_d,
            DetallePedido.id_producto_d == devolucion.id_producto_d,
        )
        .first()
        if devolucion.id_producto_d
        else None
    )
    if detalle and detalle.subtotal_detalle:
        monto = float(detalle.subtotal_detalle)
    pago = (
        db.query(Pago)
        .filter(Pago.id_pedido == devolucion.id_pedido_d)
        .order_by(Pago.id_pago.desc())
        .first()
    )
    if monto <= 0:
        monto = float(pago.monto or 0) if pago else 0.0
    if monto <= 0:
        return None

    reembolso = Reembolso(
        id_cita=None,
        id_pedido=devolucion.id_pedido_d,
        monto=round(monto, 2),
        estado="Pendiente",
        motivo=f"Devolución #{devolucion.id_devolucion} aprobada",
        numero_transaccion_original=(pago.numero_transaccion if pago else None),
    )
    db.add(reembolso)
    db.flush()
    return reembolso


# Agrupa los campos de EstadoDevolucionUpdate: estado, resolucion.
class EstadoDevolucionUpdate(BaseModel):
    estado: str
    resolucion: Optional[str] = None


@router.put("/{id_devolucion}/estado")
def resolver_devolucion(
    id_devolucion: int,
    data: EstadoDevolucionUpdate,
    admin: User = Depends(_admin),
    db: Session = Depends(get_db),
):
    """Aprueba o rechaza una solicitud de devolución (solo administradores).

    Al aprobar se define la resolución: 'Reembolso' (devolver el dinero)
    o 'Cambio' (enviar un producto de reemplazo).
    Si la línea pertenece a una solicitud del nuevo pipeline, la decisión
    se aplica a TODA la solicitud para mantener un único historial.
    """
    estado = data.estado.strip().capitalize()
    if estado not in ("Aprobada", "Rechazada"):
        raise HTTPException(status_code=400, detail="Estado no válido (Aprobada / Rechazada)")

    resolucion = data.resolucion.strip().capitalize() if data.resolucion else None
    if estado == "Aprobada":
        if resolucion not in ("Reembolso", "Cambio"):
            raise HTTPException(
                status_code=400,
                detail="Debes indicar la resolución: Reembolso o Cambio",
            )
    else:
        resolucion = None

    devolucion = (
        db.query(Devolucion).filter(Devolucion.id_devolucion == id_devolucion).first()
    )
    if not devolucion:
        raise HTTPException(status_code=404, detail="Devolución no encontrada")

    # ── Línea vinculada al nuevo pipeline: delegar en la solicitud ──
    if devolucion.id_solicitud_dv:
        solicitud = (
            db.query(SolicitudDevolucion)
            .filter(SolicitudDevolucion.id_solicitud == devolucion.id_solicitud_dv)
            .first()
        )
        if solicitud and solicitud.estado in (
            dv_service.EST_SOLICITADA,
            dv_service.EST_EN_REVISION,
        ):
            try:
                solicitud, _ = dv_service.cambiar_estado(
                    db,
                    solicitud,
                    dv_service.EST_APROBADA if estado == "Aprobada" else dv_service.EST_RECHAZADA,
                    resolucion=resolucion,
                    motivo_rechazo=(
                        resolucion if estado == "Rechazada" and resolucion else None
                    )
                    or "No cumple con las políticas de devolución",
                    admin_id=admin.id_usuario,
                )
            except ValueError as e:
                raise HTTPException(status_code=400, detail=str(e))

            cliente = (
                db.query(Cliente)
                .filter(Cliente.id_cliente == solicitud.id_cliente_s)
                .first()
            )
            if cliente:
                notificar_devolucion_cliente(
                    db,
                    cliente.id_cliente,
                    cliente.email,
                    f"{cliente.first_name} {cliente.last_name}".strip() or "Cliente",
                    numero=solicitud.numero,
                    pedido_id=solicitud.id_pedido_s or 0,
                    evento="aprobada" if estado == "Aprobada" else "rechazada",
                    monto=float(solicitud.monto_total or 0),
                    motivo_rechazo=solicitud.motivo_rechazo,
                )
            return {
                "id_devolucion": id_devolucion,
                "estado": estado,
                "resolucion": solicitud.resolucion if estado == "Aprobada" else None,
                "id_solicitud": solicitud.id_solicitud,
                "solicitud_estado": solicitud.estado,
            }

    if devolucion.estado != "Pendiente":
        raise HTTPException(status_code=400, detail="Esta devolución ya fue resuelta")

    devolucion.estado = estado
    devolucion.resolucion = resolucion
    devolucion.resuelta_por = admin.id_usuario
    devolucion.resuelta_at = datetime.now()

    # NOTA: el producto NO vuelve al inventario aquí; entra cuando el técnico
    # confirma la recogida física con evidencia (endpoint evidencia-recogida).

    from app.services.notificaciones import crear_notificacion

    if estado == "Aprobada" and resolucion == "Reembolso":
        mensaje = (
            f"Tu solicitud de devolución #{devolucion.id_devolucion} fue aprobada. "
            "Se devolverá el dinero de tu producto por el mismo medio de pago."
        )
    elif estado == "Aprobada":
        mensaje = (
            f"Tu solicitud de devolución #{devolucion.id_devolucion} fue aprobada. "
            "Coordinaremos el envío de tu producto de cambio."
        )
    else:
        mensaje = (
            f"Tu solicitud de devolución #{devolucion.id_devolucion} fue rechazada "
            "por el equipo de Neodomus."
        )

    crear_notificacion(
        db,
        id_usuario=None,
        id_cliente=devolucion.id_cliente_d,
        tipo="entrega",
        titulo=f"Devolución {estado.lower()}",
        mensaje=mensaje,
    )

    # Aprobada como Reembolso → registrar el reembolso pendiente del dinero.
    if estado == "Aprobada" and resolucion == "Reembolso":
        _crear_reembolso_desde_devolucion(db, devolucion)

    db.commit()
    return {
        "id_devolucion": devolucion.id_devolucion,
        "estado": devolucion.estado,
        "resolucion": devolucion.resolucion,
    }
