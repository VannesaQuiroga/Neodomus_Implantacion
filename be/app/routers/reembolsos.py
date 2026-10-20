"""Gestión de reembolsos (admin y clientes).

Citas: reembolso manual del administrador para citas pagadas canceladas.
Pedidos: el cliente dueño puede solicitar el reembolso de un pedido pagado
mientras aún NO haya sido entregado; si ya fue entregado, el camino es la
solicitud de devolución. El procesamiento usa la pasarela simulada.
"""
from typing import List, Optional

from fastapi import APIRouter, Body, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.cita import Cita
from app.models.cliente import Cliente
from app.models.especializacion import Reembolso
from app.models.pago import Pago
from app.models.pedido import Pedido
from app.models.roles_usuario import RolesUsuario
from app.models.user import User
from app.services.notificaciones import notificar_reembolso_cliente, notificar_reembolso_fallido_admin
from app.services.reembolso_service import crear_reembolso, procesar_reembolso
from app.utils.security import get_current_client, get_current_employee

router = APIRouter(prefix="/reembolsos", tags=["reembolsos"])

# Estados de pago que habilitan un reembolso
PAGOS_CITA_VALIDOS = ("aprobado", "pagado")
# Estados de reembolso que impiden crear otro para la misma cita
REEMBOLSOS_ACTIVOS = ("Pendiente", "Procesando", "Reembolsado")


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


# Consulta Cliente.
def _nombre_cliente(db: Session, id_cliente: Optional[int]) -> Optional[str]:
    if id_cliente is None:
        return None
    cliente = db.query(Cliente).filter(Cliente.id_cliente == id_cliente).first()
    if not cliente:
        return None
    return f"{cliente.first_name} {cliente.last_name}".strip()


# Consulta Cita, Pedido.
def _serializar_reembolso(db: Session, r: Reembolso) -> dict:
    cita = db.query(Cita).filter(Cita.id_cita == r.id_cita).first() if r.id_cita else None
    pedido = (
        db.query(Pedido).filter(Pedido.id_pedido == r.id_pedido).first() if r.id_pedido else None
    )
    id_cliente = pedido.id_cliente_pe if pedido else (cita.id_cliente if cita else None)
    if pedido:
        referencia = f"Pedido #{pedido.id_pedido}"
        detalle = f"Pedido · {pedido.fecha_peedido:%d/%m/%Y} · ${float(pedido.total_pedido or 0):,.0f}"
    elif cita:
        referencia = f"Cita #{cita.id_cita}"
        detalle = f"{cita.tipo_servicio} · {cita.fecha} {cita.hora}"
    else:
        referencia = "—"
        detalle = None
    return {
        "id_reembolso": r.id_reembolso,
        "id_cita": r.id_cita,
        "id_pedido": r.id_pedido,
        "tipo": "pedido" if pedido else "cita",
        "referencia": referencia,
        "cliente_nombre": _nombre_cliente(db, id_cliente),
        "detalle": detalle,
        "monto": r.monto,
        "costo_original": float(cita.costo_cita) if cita and cita.costo_cita else None,
        "estado": r.estado,
        "motivo": r.motivo,
        "numero_transaccion_original": r.numero_transaccion_original,
        "numero_transaccion_reembolso": r.numero_transaccion_reembolso,
        "created_at": r.created_at,
        "procesado_at": r.procesado_at,
    }


def _notificar_reembolso_cliente(db: Session, r: Reembolso) -> None:
    """Notifica (correo + plataforma) al cliente dueño de la cita o pedido."""
    try:
        id_cliente = None
        datos_referencia = None
        tipo_referencia = "Cita"
        if r.id_pedido:
            pedido = db.query(Pedido).filter(Pedido.id_pedido == r.id_pedido).first()
            if not pedido:
                return
            id_cliente = pedido.id_cliente_pe
            datos_referencia = pedido.id_pedido
            tipo_referencia = "Pedido"
        elif r.id_cita:
            cita = db.query(Cita).filter(Cita.id_cita == r.id_cita).first()
            if not cita or not cita.id_cliente:
                return
            id_cliente = cita.id_cliente
            datos_referencia = r.id_cita
        if id_cliente is None:
            return
        cliente = db.query(Cliente).filter(Cliente.id_cliente == id_cliente).first()
        if not cliente or not cliente.email:
            return
        monto_txt = f"${float(r.monto):,.0f} COP"
        notificar_reembolso_cliente(
            db,
            cliente_id=cliente.id_cliente,
            correo=cliente.email,
            cliente_nombre=f"{cliente.first_name} {cliente.last_name}".strip() or "Cliente",
            datos={
                "cita": datos_referencia,
                "monto": monto_txt,
                "estado": r.estado,
                "transaccion": r.numero_transaccion_reembolso or "—",
                "transaccion_original": r.numero_transaccion_original or "—",
                "motivo": r.motivo or "—",
            },
            referencia=tipo_referencia,
        )
    except Exception as e:
        print(f"Error notificando reembolso #{r.id_reembolso}: {e}")


def _notificar_reembolso_fallido(db: Session, r: Reembolso) -> None:
    """Notifica a los admins cuando un reembolso falla al procesarse."""
    try:
        admins = (
            db.query(User)
            .join(RolesUsuario, RolesUsuario.id_rol == User.id_rol_u)
            .filter(RolesUsuario.nombre_rol.in_(("admin", "administrador")))
            .all()
        )
        admin_ids = [a.id_usuario for a in admins]
        if admin_ids:
            notificar_reembolso_fallido_admin(
                db,
                admin_ids=admin_ids,
                reembolso_id=r.id_reembolso,
                motivo_fallo=r.motivo or "Error desconocido en la pasarela de pagos",
            )
    except Exception as e:
        print(f"Error notificando fallo de reembolso #{r.id_reembolso}: {e}")


def _validar_cita_reembolsable(db: Session, id_cita: int) -> tuple[float, str | None]:
    """Valida que la cita exista, esté cancelada, tenga pago aprobado y no
    tenga ya un reembolso activo. Devuelve (monto_pagado, transaccion_original)."""
    cita = db.query(Cita).filter(Cita.id_cita == id_cita).first()
    if not cita:
        raise HTTPException(status_code=404, detail="Cita no encontrada")
    if cita.estado != "Cancelada":
        raise HTTPException(
            status_code=400,
            detail="Solo se pueden reembolsar citas canceladas",
        )
    if cita.estado_pago not in PAGOS_CITA_VALIDOS:
        raise HTTPException(
            status_code=400,
            detail="La cita no tiene un pago aprobado para reembolsar",
        )
    monto = float(cita.costo_cita or 0)
    if monto <= 0:
        raise HTTPException(
            status_code=400,
            detail="La cita no tiene un valor pagado registrado",
        )
    existe = (
        db.query(Reembolso)
        .filter(
            Reembolso.id_cita == id_cita,
            Reembolso.estado.in_(REEMBOLSOS_ACTIVOS),
        )
        .first()
    )
    if existe:
        raise HTTPException(
            status_code=400,
            detail=f"Ya existe un reembolso {existe.estado.lower()} para esta cita",
        )
    return monto, cita.numero_transaccion


def _validar_pedido_reembolsable(db: Session, id_pedido: int) -> tuple[float, str | None, Pedido]:
    """Valida que el pedido exista, tenga pago aprobado, no esté entregado y
    no tenga ya un reembolso activo. Devuelve (monto_pagado, transaccion_original, pedido)."""
    pedido = db.query(Pedido).filter(Pedido.id_pedido == id_pedido).first()
    if not pedido:
        raise HTTPException(status_code=404, detail="Pedido no encontrado")
    if (pedido.estado_entrega or "") == "Entregado":
        raise HTTPException(
            status_code=400,
            detail=(
                "El pedido ya fue entregado; para este caso usa la solicitud "
                "de devolución del producto"
            ),
        )
    pago = (
        db.query(Pago)
        .filter(Pago.id_pedido == pedido.id_pedido)
        .order_by(Pago.id_pago.desc())
        .first()
    )
    if not pago or pago.estado != "aprobado":
        raise HTTPException(
            status_code=400,
            detail="El pedido no tiene un pago aprobado para reembolsar",
        )
    monto = float(pago.monto or 0)
    if monto <= 0:
        raise HTTPException(status_code=400, detail="El pedido no tiene un valor pagado registrado")
    existe = (
        db.query(Reembolso)
        .filter(
            Reembolso.id_pedido == id_pedido,
            Reembolso.estado.in_(REEMBOLSOS_ACTIVOS),
        )
        .first()
    )
    if existe:
        raise HTTPException(
            status_code=400,
            detail=f"Ya existe un reembolso {existe.estado.lower()} para este pedido",
        )
    return monto, pago.numero_transaccion, pedido


# Agrupa los campos de ReembolsoCreate: id_cita, id_pedido, monto, motivo.
class ReembolsoCreate(BaseModel):
    id_cita: Optional[int] = None
    id_pedido: Optional[int] = None
    monto: Optional[float] = Field(default=None, gt=0)
    motivo: Optional[str] = None


@router.get("", response_model=List[dict])
def listar_reembolsos(
    _admin_user: User = Depends(_admin),
    db: Session = Depends(get_db),
    limit: int = 100,
):
    """Lista todos los reembolsos registrados (solo admin)."""
    reembolsos = (
        db.query(Reembolso)
        .order_by(Reembolso.id_reembolso.desc())
        .limit(max(1, min(limit, 300)))
        .all()
    )
    return [_serializar_reembolso(db, r) for r in reembolsos]


@router.get("/mis", response_model=List[dict])
def mis_reembolsos(
    cliente: Cliente = Depends(get_current_client),
    db: Session = Depends(get_db),
):
    """Lista los reembolsos del cliente autenticado (citas y pedidos)."""
    reembolsos = (
        db.query(Reembolso)
        .outerjoin(Cita, Cita.id_cita == Reembolso.id_cita)
        .outerjoin(Pedido, Pedido.id_pedido == Reembolso.id_pedido)
        .filter(
            or_(
                Cita.id_cliente == cliente.id_cliente,
                Pedido.id_cliente_pe == cliente.id_cliente,
            )
        )
        .order_by(Reembolso.id_reembolso.desc())
        .all()
    )
    return [_serializar_reembolso(db, r) for r in reembolsos]


@router.get("/elegibles", response_model=list[dict])
def elegibles_reembolso(
    _admin_user: User = Depends(_admin),
    db: Session = Depends(get_db),
):
    """Citas canceladas con pago aprobado y pedidos pagados sin entregar que
    aún no tienen un reembolso activo."""
    activos = db.query(Reembolso).filter(Reembolso.estado.in_(REEMBOLSOS_ACTIVOS)).all()
    citas_con = {r.id_cita for r in activos if r.id_cita}
    pedidos_con = {r.id_pedido for r in activos if r.id_pedido}

    citas = (
        db.query(Cita)
        .filter(Cita.estado_pago.in_(PAGOS_CITA_VALIDOS), Cita.estado == "Cancelada")
        .order_by(Cita.fecha.desc())
        .limit(300)
        .all()
    )
    elegibles = []
    for c in citas:
        if c.id_cita in citas_con or float(c.costo_cita or 0) <= 0:
            continue
        elegibles.append(
            {
                "tipo": "cita",
                "id_cita": c.id_cita,
                "etiqueta": (
                    f"Cita #{c.id_cita} · {_nombre_cliente(db, c.id_cliente)} · "
                    f"{c.tipo_servicio} · {c.fecha}"
                ),
                "monto_pagado": float(c.costo_cita),
                "estado_pago": c.estado_pago,
            }
        )

    pedidos = (
        db.query(Pedido)
        .join(Pago, Pago.id_pedido == Pedido.id_pedido)
        .filter(
            Pago.estado == "aprobado",
            or_(
                Pedido.estado_entrega.is_(None),
                Pedido.estado_entrega != "Entregado",
            ),
        )
        .order_by(Pedido.fecha_peedido.desc())
        .limit(300)
        .all()
    )
    vistos = set()
    for p in pedidos:
        if p.id_pedido in pedidos_con or p.id_pedido in vistos:
            continue
        vistos.add(p.id_pedido)
        pago = (
            db.query(Pago)
            .filter(Pago.id_pedido == p.id_pedido)
            .order_by(Pago.id_pago.desc())
            .first()
        )
        monto = float(pago.monto or 0) if pago else 0
        if monto <= 0:
            continue
        elegibles.append(
            {
                "tipo": "pedido",
                "id_pedido": p.id_pedido,
                "etiqueta": (
                    f"Pedido #{p.id_pedido} · {_nombre_cliente(db, p.id_cliente_pe)} · "
                    f"{p.fecha_peedido:%d/%m/%Y}"
                ),
                "monto_pagado": monto,
                "estado_pago": pago.estado,
                "estado_entrega": p.estado_entrega,
            }
        )
    return elegibles


@router.post("", response_model=dict, status_code=201)
def crear_reembolso_manual(
    data: ReembolsoCreate,
    _admin_user: User = Depends(_admin),
    db: Session = Depends(get_db),
):
    """Registra y procesa un reembolso manual para una cita o un pedido (admin)."""
    if bool(data.id_cita) == bool(data.id_pedido):
        raise HTTPException(
            status_code=400,
            detail="Indica exactamente uno de los dos: id_cita o id_pedido",
        )
    if data.id_cita:
        monto_pagado, original = _validar_cita_reembolsable(db, data.id_cita)
        cita_id, pedido_id = data.id_cita, None
    else:
        monto_pagado, original, _pedido = _validar_pedido_reembolsable(db, data.id_pedido)
        cita_id, pedido_id = None, data.id_pedido
    monto = data.monto if data.monto is not None else monto_pagado
    if monto <= 0:
        raise HTTPException(status_code=400, detail="El monto debe ser mayor a 0")
    if monto > monto_pagado + 0.01:
        raise HTTPException(
            status_code=400,
            detail=f"El monto excede lo pagado ({monto_pagado})",
        )
    reembolso = crear_reembolso(
        db,
        monto=monto,
        motivo=data.motivo,
        cita_id=cita_id,
        pedido_id=pedido_id,
        numero_transaccion_original=original,
    )
    _notificar_reembolso_cliente(db, reembolso)

    # Si el reembolso falló, notificar al admin.
    if reembolso.estado == "Rechazado":
        _notificar_reembolso_fallido(db, reembolso)

    return _serializar_reembolso(db, reembolso)


# Agrupa los campos de ReembolsoPedidoSolicitud: motivo.
class ReembolsoPedidoSolicitud(BaseModel):
    motivo: Optional[str] = None


@router.post("/pedido/{id_pedido}", response_model=dict, status_code=201)
def solicitar_reembolso_pedido(
    id_pedido: int,
    data: ReembolsoPedidoSolicitud,
    cliente: Cliente = Depends(get_current_client),
    db: Session = Depends(get_db),
):
    """El cliente solicita el reembolso de su propio pedido pagado mientras
    no haya sido entregado. Queda PENDIENTE hasta confirmación del admin."""
    pedido = db.query(Pedido).filter(Pedido.id_pedido == id_pedido).first()
    if not pedido or pedido.id_cliente_pe != cliente.id_cliente:
        raise HTTPException(status_code=404, detail="Pedido no encontrado")
    monto_pagado, original, _pedido = _validar_pedido_reembolsable(db, id_pedido)

    from app.models.especializacion import Reembolso as ReembolsoModel

    reembolso = ReembolsoModel(
        id_pedido=id_pedido,
        monto=round(float(monto_pagado), 2),
        estado="Pendiente",
        numero_transaccion_original=original,
    )
    db.add(reembolso)
    db.commit()
    db.refresh(reembolso)

    # Notificar al cliente.
    _notificar_reembolso_cliente(db, reembolso)
    return _serializar_reembolso(db, reembolso)


# Agrupa los campos de ProcesarReembolsoIn: porcentaje_cliente.
class ProcesarReembolsoIn(BaseModel):
    porcentaje_cliente: Optional[float] = Field(default=None, ge=0, le=100)


@router.post("/{id_reembolso}/procesar", response_model=dict)
def reprocesar_reembolso(
    id_reembolso: int,
    data: ProcesarReembolsoIn = Body(default=ProcesarReembolsoIn()),
    _admin_user: User = Depends(_admin),
    db: Session = Depends(get_db),
):
    """Reintenta el procesamiento de un reembolso pendiente o rechazado.
    El administrador puede ajustar el porcentaje que se le devuelve al cliente
    (por defecto usa el monto ya registrado)."""
    reembolso = db.query(Reembolso).filter(Reembolso.id_reembolso == id_reembolso).first()
    if not reembolso:
        raise HTTPException(status_code=404, detail="Reembolso no encontrado")
    if reembolso.estado not in ("Pendiente", "Rechazado"):
        raise HTTPException(
            status_code=400,
            detail=f"El reembolso ya está {reembolso.estado.lower()}",
        )
    if data.porcentaje_cliente is not None and reembolso.numero_transaccion_original:
        # Recalcular monto según el porcentaje que el admin decida.
        transaccion_original = reembolso.numero_transaccion_original
        cita = (
            db.query(Cita)
            .filter(Cita.numero_transaccion == transaccion_original)
            .first()
        )
        base = float(cita.costo_cita) if cita and cita.costo_cita else None
        if base is None:
            pedido_ref = (
                db.query(Pedido)
                .filter(Pedido.id_pedido == reembolso.id_pedido)
                .first()
            )
            base = float(pedido_ref.total_pedido) if pedido_ref and pedido_ref.total_pedido else None
        if base is not None:
            nuevo_monto = round(base * data.porcentaje_cliente / 100, 2)
            if nuevo_monto > 0:
                reembolso.monto = nuevo_monto

    procesar_reembolso(db, reembolso)
    _notificar_reembolso_cliente(db, reembolso)

    # Si el reembolso falló, notificar al admin.
    if reembolso.estado == "Rechazado":
        _notificar_reembolso_fallido(db, reembolso)

    return _serializar_reembolso(db, reembolso)
