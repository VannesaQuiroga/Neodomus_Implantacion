"""
Servicio de novedades e incidencias.

Permite a los técnicos reportar incidencias sobre entregas, citas y productos.
El administrador revisa, cambia estado y genera compensaciones (cupones).
"""
from datetime import date, datetime
from typing import Optional
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.novedad import CuponDescuento, Novedad, NovedadHistorial
from app.models.tecnico import Tecnico
from app.models.user import User


# ── Tipos de novedad ────────────────────────────────────────────────
TIPOS_NOVEDAD = [
    "Retraso en entrega",
    "Cliente ausente",
    "Cliente no recibió el pedido",
    "Dirección incorrecta",
    "Producto dañado",
    "Producto faltante",
    "Producto equivocado",
    "Pérdida de producto",
    "Robo de productos",
    "Accidente",
    "Problema con el vehículo/transporte",
    "Problema técnico",
    "Problema durante una cita",
    "Cita no realizada",
    "Cita reprogramada",
    "Cliente solicita reprogramación",
    "Problema con instalación",
    "Retraso que afecta cita",
    "Otro",
    # Tipos de devolución
    "Producto recibido con daños",
    "Producto incompleto",
    "Cliente no tenía el producto disponible",
    "Producto diferente al solicitado",
    "Devolución no realizada",
    "Problema durante la recogida",
]

ESTADOS_NOVEDAD = ["Pendiente", "En revisión", "Aprobada", "Rechazada", "Resuelta", "Cerrada"]
PRIORIDADES = ["baja", "normal", "alta", "urgente"]


# ── CRUD novidades ──────────────────────────────────────────────────

def crear_novedad(
    db: Session,
    *,
    id_tecnico: int,
    tipo_novedad: str,
    descripcion: str,
    prioridad: str = "normal",
    id_pedido: Optional[int] = None,
    id_cita: Optional[int] = None,
    id_cliente: Optional[int] = None,
    id_devolucion: Optional[int] = None,
    lugar_ocurrencia: Optional[str] = None,
    evidencia_url: Optional[str] = None,
) -> Novedad:
    """Crea una novedad y registra el primer evento en el historial."""
    novedad = Novedad(
        id_tecnico_n=id_tecnico,
        tipo_novedad=tipo_novedad,
        descripcion_novedad=descripcion,
        prioridad=prioridad,
        estado_novedad="Pendiente",
        id_pedido=id_pedido,
        id_cita=id_cita,
        id_cliente=id_cliente,
        id_devolucion=id_devolucion,
        lugar_ocurrencia=lugar_ocurrencia,
        evidencia_url=evidencia_url,
    )
    db.add(novedad)
    db.flush()

    # Historial: creación
    db.add(NovedadHistorial(
        id_novedad=novedad.id_novedad,
        id_usuario=None,
        accion="Creación",
        detalle=f"Novedad reportada: {tipo_novedad}",
    ))
    db.commit()
    db.refresh(novedad)
    return novedad


def listar_novedades_tecnico(db: Session, id_tecnico: int) -> list[Novedad]:
    """Lista novedades reportadas por un técnico específico."""
    return (
        db.query(Novedad)
        .filter(Novedad.id_tecnico_n == id_tecnico)
        .order_by(Novedad.fecha_reporte_novedad.desc())
        .all()
    )


def listar_novedades_admin(
    db: Session,
    *,
    id_pedido: Optional[int] = None,
    id_tecnico: Optional[int] = None,
    id_cliente: Optional[int] = None,
    tipo_novedad: Optional[str] = None,
    estado: Optional[str] = None,
    prioridad: Optional[str] = None,
    fecha_desde: Optional[date] = None,
    fecha_hasta: Optional[date] = None,
) -> list[Novedad]:
    """Lista todas las novedades con filtros opcionales (admin)."""
    q = db.query(Novedad)
    if id_pedido is not None:
        q = q.filter(Novedad.id_pedido == id_pedido)
    if id_tecnico is not None:
        q = q.filter(Novedad.id_tecnico_n == id_tecnico)
    if id_cliente is not None:
        q = q.filter(Novedad.id_cliente == id_cliente)
    if tipo_novedad:
        q = q.filter(Novedad.tipo_novedad == tipo_novedad)
    if estado:
        q = q.filter(Novedad.estado_novedad == estado)
    if prioridad:
        q = q.filter(Novedad.prioridad == prioridad)
    if fecha_desde:
        q = q.filter(Novedad.fecha_reporte_novedad >= datetime.combine(fecha_desde, datetime.min.time()))
    if fecha_hasta:
        q = q.filter(Novedad.fecha_reporte_novedad <= datetime.combine(fecha_hasta, datetime.max.time()))
    return q.order_by(Novedad.fecha_reporte_novedad.desc()).all()


def obtener_novedad(db: Session, id_novedad: int) -> Optional[Novedad]:
    return db.query(Novedad).filter(Novedad.id_novedad == id_novedad).first()


def cambiar_estado_novedad(
    db: Session,
    *,
    id_novedad: int,
    nuevo_estado: str,
    id_admin: int,
    accion_detalle: Optional[str] = None,
) -> Novedad:
    """Cambia el estado de una novedad (solo admin)."""
    novedad = db.query(Novedad).filter(Novedad.id_novedad == id_novedad).first()
    if not novedad:
        raise ValueError("Novedad no encontrada")

    estado_anterior = novedad.estado_novedad
    novedad.estado_novedad = nuevo_estado

    if nuevo_estado in ("Resuelta", "Cerrada"):
        novedad.fecha_resolucion = datetime.now()
        novedad.id_admin_resuelve = id_admin

    # Historial
    db.add(NovedadHistorial(
        id_novedad=id_novedad,
        id_usuario=id_admin,
        accion=f"Cambio de estado: {estado_anterior} → {nuevo_estado}",
        detalle=accion_detalle,
    ))
    db.commit()
    db.refresh(novedad)
    return novedad


def agregar_accion_admin(
    db: Session,
    *,
    id_novedad: int,
    id_admin: int,
    accion: str,
    detalle: Optional[str] = None,
) -> None:
    """Registra una acción del admin en el historial de la novedad."""
    db.add(NovedadHistorial(
        id_novedad=id_novedad,
        id_usuario=id_admin,
        accion=accion,
        detalle=detalle,
    ))
    db.commit()


def responder_novedad(
    db: Session,
    *,
    id_novedad: int,
    id_admin: int,
    respuesta: str,
) -> Novedad:
    """El admin responde a una novedad del técnico."""
    novedad = db.query(Novedad).filter(Novedad.id_novedad == id_novedad).first()
    if not novedad:
        raise ValueError("Novedad no encontrada")

    novedad.accion_admin = respuesta
    novedad.id_admin_resuelve = id_admin
    novedad.estado_novedad = "En revisión"

    db.add(NovedadHistorial(
        id_novedad=id_novedad,
        id_usuario=id_admin,
        accion="Respuesta del administrador",
        detalle=respuesta,
    ))
    db.commit()
    db.refresh(novedad)
    return novedad


def cambiar_tecnico_novedad(
    db: Session,
    *,
    id_novedad: int,
    id_nuevo_tecnico: int,
    id_admin: int,
    motivo: Optional[str] = None,
) -> Novedad:
    """Cambia el técnico asignado al pedido/cita de una novedad."""
    novedad = db.query(Novedad).filter(Novedad.id_novedad == id_novedad).first()
    if not novedad:
        raise ValueError("Novedad no encontrada")

    tecnico_anterior_id = novedad.id_tecnico_n
    novedad.id_tecnico_n = id_nuevo_tecnico

    detalle_parts = [f"Técnico anterior: {tecnico_anterior_id}", f"Nuevo técnico: {id_nuevo_tecnico}"]
    if motivo:
        detalle_parts.append(f"Motivo: {motivo}")

    db.add(NovedadHistorial(
        id_novedad=id_novedad,
        id_usuario=id_admin,
        accion="Cambio de técnico",
        detalle=" | ".join(detalle_parts),
    ))
    db.commit()
    db.refresh(novedad)
    return novedad


# ── Cupones ─────────────────────────────────────────────────────────

def crear_cupon(
    db: Session,
    *,
    codigo: str,
    tipo_descuento: str,
    valor_descuento: float,
    id_cliente: int,
    id_novedad: Optional[int] = None,
    id_admin: int,
    fecha_vencimiento: Optional[date] = None,
    compra_minima: float = 0,
    usos_maximos: int = 1,
    aplica_tienda_completa: bool = True,
    categorias_aplicables: Optional[str] = None,
) -> CuponDescuento:
    """Crea un cupón de descuento asociado a una novedad y cliente."""
    # Verificar que el código no exista
    existente = db.query(CuponDescuento).filter(CuponDescuento.codigo == codigo).first()
    if existente:
        raise ValueError(f"Ya existe un cupón con el código {codigo}")

    cupon = CuponDescuento(
        codigo=codigo.upper(),
        tipo_descuento=tipo_descuento,
        valor_descuento=valor_descuento,
        fecha_vencimiento=fecha_vencimiento,
        compra_minima=compra_minima,
        usos_maximos=usos_maximos,
        aplica_tienda_completa=aplica_tienda_completa,
        categorias_aplicables=categorias_aplicables,
        id_cliente=id_cliente,
        id_novedad=id_novedad,
        id_admin_crea=id_admin,
        activo=True,
    )
    db.add(cupon)

    # Registrar en historial de novedad si existe
    if id_novedad:
        db.add(NovedadHistorial(
            id_novedad=id_novedad,
            id_usuario=id_admin,
            accion="Cupón generado",
            detalle=f"Cupón {codigo.upper()} — {tipo_descuento} {valor_descuento}%",
        ))

    db.commit()
    db.refresh(cupon)
    return cupon


def listar_cupones_cliente(db: Session, id_cliente: int) -> list[CuponDescuento]:
    """Lista cupones activos de un cliente."""
    return (
        db.query(CuponDescuento)
        .filter(
            CuponDescuento.id_cliente == id_cliente,
            CuponDescuento.activo == True,  # noqa: E712
        )
        .order_by(CuponDescuento.created_at.desc())
        .all()
    )


def validar_cupon(db: Session, codigo: str, id_cliente: int) -> Optional[CuponDescuento]:
    """Valida si un cupón es válido para un cliente. Retorna el cupón o None."""
    cupon = (
        db.query(CuponDescuento)
        .filter(
            CuponDescuento.codigo == codigo.upper(),
            CuponDescuento.activo == True,  # noqa: E712
        )
        .first()
    )
    if not cupon:
        return None
    if cupon.id_cliente and cupon.id_cliente != id_cliente:
        return None
    if cupon.fecha_vencimiento and cupon.fecha_vencimiento < date.today():
        return None
    if cupon.usos_realizados >= cupon.usos_maximos:
        return None
    return cupon
