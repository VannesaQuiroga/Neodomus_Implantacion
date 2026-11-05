"""Servicio de devoluciones de productos.

Implementa el flujo tipo e-commerce moderno (estilo SHEIN):

  - Elegibilidad: solo pedidos ENTREGADOS, por producto y por unidad.
  - Devolución parcial o total: el cliente elige productos y cuántas
    unidades devolver de cada uno (nunca más de las compradas ni de las
    que aún no estén en otra solicitud activa).
  - Cabecera (SolicitudDevolucion) + detalle (Devolucion) normalizados.
  - Pipeline: Solicitada → En revisión → Aprobada → Producto en devolución
    → Recibida → Reembolso procesado   (+ Rechazada con motivo).
  - Reembolso calculado SOLO sobre los productos/cantidades devueltos,
    integrado con la pasarela simulada (pagos_service / reembolso_service).

Las filas legadas de ``devoluciones`` siguen funcionando: cada una queda
vinculada a su solicitud vía ``id_solicitud_dv``.
"""
from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import func as sqlfunc
from sqlalchemy.orm import Session

from app.models.cliente import Cliente
from app.models.devolucion import Devolucion
from app.models.especializacion import Reembolso
from app.models.pago import Pago
from app.models.pedido import DetallePedido, Pedido
from app.models.producto import Producto
from app.models.solicitud_devolucion import SolicitudDevolucion
from app.models.user import User

# ── Estados del pipeline ────────────────────────────────────────────
EST_SOLICITADA = "Solicitada"
EST_EN_REVISION = "En revisión"
EST_APROBADA = "Aprobada"
EST_EN_DEVOLUCION = "Producto en devolución"
EST_RECIBIDA = "Recibida"
EST_REEMBOLSO = "Reembolso procesado"
EST_RECHAZADA = "Rechazada"

ESTADOS_ACTIVOS = (
    EST_SOLICITADA,
    EST_EN_REVISION,
    EST_APROBADA,
    EST_EN_DEVOLUCION,
)

# Transiciones válidas del pipeline (forward-only).
TRANSICIONES = {
    EST_SOLICITADA: {EST_EN_REVISION, EST_APROBADA, EST_RECHAZADA},
    EST_EN_REVISION: {EST_APROBADA, EST_RECHAZADA},
    EST_APROBADA: {EST_EN_DEVOLUCION},
    EST_EN_DEVOLUCION: {EST_RECIBIDA},
    EST_RECIBIDA: {EST_REEMBOLSO},
}

# Catálogo de motivos estructurados.
MOTIVOS_DEVOLUCION = {
    "defectuoso": "Producto defectuoso",
    "danado": "Producto dañado",
    "incorrecto": "Producto incorrecto",
    "no_esperaba": "No era lo que esperaba",
    "diferente_descripcion": "Producto diferente a la descripción",
    "talla_incorrecta": "Talla o características incorrectas",
    "incompleto": "Pedido incompleto",
    "otro": "Otro",
}

RESOLUCIONES = ("Reembolso", "Cambio")


def _nombre_producto(detalle: DetallePedido | None, producto: Producto | None) -> str:
    if detalle and detalle.descripcion_detalle:
        return detalle.descripcion_detalle
    if producto:
        return producto.nombre_producto
    return f"Producto #{detalle.id_producto_d if detalle else '?'}"


# ────────────────────────────────────────────────────────────────────
# Elegibilidad y unidades disponibles
# ────────────────────────────────────────────────────────────────────

def unidades_comprometidas(db: Session, id_pedido: int) -> dict[int, int]:
    """Unidades por producto solicitadas en solicitudes NO RECHAZADAS.

    Las unidades cuentan como comprometidas incluso cuando la devolución ya
    terminó (Recibida / Reembolso procesado): un producto devuelto y
    procesado no puede volver a solicitarse. Solo un rechazo libera las
    unidades."""
    filas = (
        db.query(Devolucion.id_producto_d, sqlfunc.coalesce(sqlfunc.sum(Devolucion.cantidad), 0))
        .join(
            SolicitudDevolucion,
            SolicitudDevolucion.id_solicitud == Devolucion.id_solicitud_dv,
        )
        .filter(
            Devolucion.id_pedido_d == id_pedido,
            SolicitudDevolucion.estado != EST_RECHAZADA,
        )
        .group_by(Devolucion.id_producto_d)
        .all()
    )
    return {int(pid): int(qty) for pid, qty in filas if pid}


def elegibilidad_pedido(db: Session, client: Cliente, id_pedido: int) -> dict:
    """Productos del pedido con las unidades aún disponibles para devolver."""
    pedido = (
        db.query(Pedido)
        .filter(Pedido.id_pedido == id_pedido, Pedido.id_cliente_pe == client.id_cliente)
        .first()
    )
    if not pedido:
        raise PermissionError("Pedido no encontrado")

    detalles = (
        db.query(DetallePedido)
        .filter(
            DetallePedido.id_pedido_d == pedido.id_pedido,
            DetallePedido.id_producto_d.isnot(None),
        )
        .all()
    )

    comprometido = unidades_comprometidas(db, pedido.id_pedido)
    ids = [d.id_producto_d for d in detalles]
    productos_map = (
        {p.id_producto: p for p in db.query(Producto).filter(Producto.id_producto.in_(ids)).all()}
        if ids
        else {}
    )

    lineas = []
    alguna_disponible = False
    for d in detalles:
        comprada = int(d.cantidad_detalle or 1)
        disponible = max(0, comprada - comprometido.get(int(d.id_producto_d), 0))
        precio = float(d.precio_unitario_detalle or 0)
        if disponible > 0:
            alguna_disponible = True
        lineas.append({
            "id_detalle": d.id_detalle,
            "id_producto": int(d.id_producto_d),
            "nombre": _nombre_producto(d, productos_map.get(d.id_producto_d)),
            "cantidad_comprada": comprada,
            "cantidad_disponible": disponible,
            "precio_unitario": round(precio, 2),
            "monto_maximo": round(disponible * precio, 2),
        })

    # Entregado por el técnico O con la cita de instalación finalizada.
    from app.services.pedidos_service import pedido_completado

    completado = pedido_completado(db, pedido)
    elegible = completado and alguna_disponible and bool(lineas)
    razon = None
    if not completado:
        razon = (
            "El pedido debe estar entregado (o con la instalación finalizada) "
            "para poder solicitar una devolución."
        )
    elif not lineas:
        razon = "Este pedido no contiene productos registrados."
    elif not alguna_disponible:
        razon = "Todos los productos de este pedido ya fueron devueltos o están en proceso."

    return {
        "elegible": elegible,
        "razon": razon,
        "pedido": {
            "id_pedido": pedido.id_pedido,
            "total": float(pedido.total_pedido or 0),
            "estado_entrega": pedido.estado_entrega,
        },
        "productos": lineas,
        "motivos": [{"key": k, "label": v} for k, v in MOTIVOS_DEVOLUCION.items()],
    }


# ────────────────────────────────────────────────────────────────────
# Creación de solicitudes
# ────────────────────────────────────────────────────────────────────

def _asignar_tecnico_recogida(db: Session, linea: Devolucion) -> None:
    """Asigna un técnico activo aleatorio para recoger el producto (legado)."""
    import random

    from app.models.tecnico import Tecnico
    from app.models.user import User

    tecnicos_activos = (
        db.query(Tecnico)
        .join(User, User.id_usuario == Tecnico.id_usuario_t)
        .filter(User.is_active == True, User.id_rol_u == 2)  # noqa: E712
        .all()
    )
    tecnico = random.choice(tecnicos_activos) if tecnicos_activos else None
    if tecnico is not None:
        linea.id_tecnico_recogida = tecnico.id_tecnico
        linea.recogida_estado = "Asignada"


class ItemInvalido(Exception):
    def __init__(self, mensaje: str):
        super().__init__(mensaje)
        self.mensaje = mensaje


def crear_solicitud(
    db: Session,
    client: Cliente,
    *,
    id_pedido: int,
    items: list[dict],
    motivo_tipo: str | None,
    motivo_otro: str | None,
    comentario: str | None,
) -> SolicitudDevolucion:
    """Crea una solicitud de devolución (parcial o total) con sus líneas.

    ``items``: [{'id_producto': int, 'cantidad': int}, ...]
    """
    info = elegibilidad_pedido(db, client, id_pedido)
    if not info["elegible"]:
        raise ItemInvalido(info["razon"] or "El pedido no es elegible para devolución.")

    if not items:
        raise ItemInvalido("Selecciona al menos un producto para devolver.")

    motivo_tipo_norm = (motivo_tipo or "").strip().lower()
    if motivo_tipo_norm not in MOTIVOS_DEVOLUCION:
        raise ItemInvalido("Indica el motivo de la devolución.")
    if motivo_tipo_norm == "otro" and not (motivo_otro or "").strip():
        raise ItemInvalido("Cuéntanos el motivo de tu devolución.")
    if motivo_tipo_norm != "otro":
        motivo_otro = None

    disponibles = {p["id_producto"]: p for p in info["productos"]}

    # Validar items y consolidar duplicados.
    consolidado: dict[int, int] = {}
    for it in items:
        try:
            pid = int(it.get("id_producto"))
            cant = int(it.get("cantidad", 1))
        except (TypeError, ValueError):
            raise ItemInvalido("Producto o cantidad inválidos.")
        if pid not in disponibles:
            raise ItemInvalido("Ese producto no pertenece a este pedido.")
        if cant <= 0:
            raise ItemInvalido("La cantidad a devolver debe ser mayor a cero.")
        disp = disponibles[pid]["cantidad_disponible"]
        total = consolidado.get(pid, 0) + cant
        if total > disp:
            raise ItemInvalido(
                f"Solo puedes devolver {disp} unidad(es) de '{disponibles[pid]['nombre']}'."
            )
        consolidado[pid] = total

    monto_total = sum(
        round(disponibles[pid]["precio_unitario"] * cant, 2) for pid, cant in consolidado.items()
    )

    # ¿Queda algo sin devolver después de esta solicitud? → parcial/total.
    quedan = any(
        disponibles[p["id_producto"]]["cantidad_disponible"] - consolidado.get(p["id_producto"], 0) > 0
        for p in info["productos"]
    )
    tipo = "parcial" if quedan else "total"

    solicitud = SolicitudDevolucion(
        numero="PENDIENTE",  # se asigna tras el flush con el id
        id_cliente_s=client.id_cliente,
        id_pedido_s=id_pedido,
        motivo_tipo=motivo_tipo_norm,
        motivo_otro=(motivo_otro or "").strip() or None,
        comentario=(comentario or "").strip() or None,
        estado=EST_SOLICITADA,
        tipo_devolucion=tipo,
        monto_total=round(monto_total, 2),
    )
    db.add(solicitud)
    db.flush()
    solicitud.numero = f"DEV-{solicitud.id_solicitud:06d}"

    etiqueta_motivo = MOTIVOS_DEVOLUCION[motivo_tipo_norm]
    texto_motivo = (
        f"[{etiqueta_motivo}] {motivo_otro.strip()}"
        if motivo_tipo_norm == "otro"
        else f"[{etiqueta_motivo}]"
    )

    for pid, cant in consolidado.items():
        linea = Devolucion(
            id_cliente_d=client.id_cliente,
            id_pedido_d=id_pedido,
            id_producto_d=pid,
            cantidad=cant,
            motivo=texto_motivo,
            estado="Pendiente",
            preferencia=None,
            id_solicitud_dv=solicitud.id_solicitud,
        )
        _asignar_tecnico_recogida(db, linea)
        db.add(linea)

    db.commit()
    db.refresh(solicitud)
    return solicitud


# ────────────────────────────────────────────────────────────────────
# Serialización
# ────────────────────────────────────────────────────────────────────

# Consulta Cliente, Devolucion, Producto, DetallePedido y otras entidades.
def serializar_solicitud(db: Session, s: SolicitudDevolucion) -> dict:
    cliente = db.query(Cliente).filter(Cliente.id_cliente == s.id_cliente_s).first()
    lineas = (
        db.query(Devolucion)
        .filter(Devolucion.id_solicitud_dv == s.id_solicitud)
        .order_by(Devolucion.id_devolucion.asc())
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
                DetallePedido.id_pedido_d == s.id_pedido_s,
                DetallePedido.id_producto_d.in_(ids),
            )
            .all()
        }
        if ids and s.id_pedido_s
        else {}
    )

    reembolso = None
    if s.estado == EST_REEMBOLSO or (s.resolucion or "") == "Reembolso":
        reembolso = (
            db.query(Reembolso)
            .filter(
                Reembolso.id_pedido == s.id_pedido_s,
                Reembolso.motivo.like(f"%{s.numero}%"),
            )
            .order_by(Reembolso.id_reembolso.desc())
            .first()
        )

    items = []
    recogidos = 0
    # Nombres de los técnicos de recogida asignados (para el panel admin).
    ids_tecnicos = {l.id_tecnico_recogida for l in lineas if l.id_tecnico_recogida}
    tecnicos_map = {}
    if ids_tecnicos:
        from app.models.tecnico import Tecnico

        filas_tec = (
            db.query(Tecnico, User)
            .join(User, User.id_usuario == Tecnico.id_usuario_t)
            .filter(Tecnico.id_tecnico.in_(ids_tecnicos))
            .all()
        )
        tecnicos_map = {t.id_tecnico: u for t, u in filas_tec}
    for l in lineas:
        prod = productos_map.get(l.id_producto_d)
        det = detalles_map.get(l.id_producto_d)
        precio = float(det.precio_unitario_detalle or 0) if det else 0.0
        if l.recogida_estado == "Recogida":
            recogidos += 1
        usuario_tec = tecnicos_map.get(l.id_tecnico_recogida)
        items.append({
            "id_devolucion": l.id_devolucion,
            "id_producto": l.id_producto_d,
            "producto": _nombre_producto(det, prod),
            "cantidad": l.cantidad,
            "precio_unitario": round(precio, 2),
            "subtotal_linea": round(precio * l.cantidad, 2),
            "estado_linea": l.estado,
            "recogida_estado": l.recogida_estado,
            "id_tecnico_recogida": l.id_tecnico_recogida,
            "tecnico_recogida_nombre": (
                f"{usuario_tec.first_name} {usuario_tec.last_name}".strip()
                if usuario_tec
                else None
            ),
            "evidencia_recogida_url": None,
            "fecha_recogida": l.fecha_recogida.isoformat() if l.fecha_recogida else None,
        })

    todos_recogidos = bool(items) and recogidos == len(items)
    return {
        "id_solicitud": s.id_solicitud,
        "numero": s.numero,
        "id_pedido": s.id_pedido_s,
        "cliente": (
            f"{cliente.first_name} {cliente.last_name}".strip() if cliente else None
        ),
        "cliente_email": cliente.email if cliente else None,
        "motivo_tipo": s.motivo_tipo,
        "motivo_label": MOTIVOS_DEVOLUCION.get(s.motivo_tipo or "", s.motivo_tipo),
        "motivo_otro": s.motivo_otro,
        "comentario": s.comentario,
        "estado": s.estado,
        "tipo_devolucion": s.tipo_devolucion,
        "monto_total": float(s.monto_total or 0),
        "resolucion": s.resolucion,
        "motivo_rechazo": s.motivo_rechazo,
        "observaciones_admin": s.observaciones_admin,
        "created_at": s.created_at.isoformat() if s.created_at else None,
        "resuelta_at": s.resuelta_at.isoformat() if s.resuelta_at else None,
        "items": items,
        "recogidas": recogidos,
        "todos_recogidos": todos_recogidos,
        "reembolso": (
            {
                "id_reembolso": reembolso.id_reembolso,
                "estado": reembolso.estado,
                "monto": float(reembolso.monto or 0),
                "numero_transaccion_reembolso": reembolso.numero_transaccion_reembolso,
            }
            if reembolso
            else None
        ),
    }


# ────────────────────────────────────────────────────────────────────
# Cambio de estado (pipeline)
# ────────────────────────────────────────────────────────────────────

def _sincronizar_lineas(db: Session, s: SolicitudDevolucion) -> None:
    """Refleja el estado de la solicitud en las líneas legadas para que los
    flujos existentes (recogida del técnico, listados) sigan operando."""
    mapa_estado = {
        EST_SOLICITADA: "Pendiente",
        EST_EN_REVISION: "Pendiente",
        EST_APROBADA: "Aprobada",
        EST_EN_DEVOLUCION: "Aprobada",
        EST_RECIBIDA: "Aprobada",
        EST_REEMBOLSO: "Aprobada",
        EST_RECHAZADA: "Rechazada",
    }
    nuevo = mapa_estado.get(s.estado, "Pendiente")
    lineas = (
        db.query(Devolucion).filter(Devolucion.id_solicitud_dv == s.id_solicitud).all()
    )
    ahora = datetime.now()
    for l in lineas:
        l.estado = nuevo
        if s.estado == EST_RECHAZADA:
            l.recogida_estado = None
            l.resolucion = None
        elif nuevo == "Aprobada":
            l.resolucion = s.resolucion
            if s.resuelta_por and not l.resuelta_por:
                l.resuelta_por = s.resuelta_por
                l.resuelta_at = ahora


def _crear_reembolso_solicitud(db: Session, s: SolicitudDevolucion):
    """Registra el reembolso SOLO del valor de esta solicitud (parcial o
    total) usando la pasarela simulada. Devuelve el Reembolso o None."""
    from app.services.reembolso_service import crear_reembolso

    existe = (
        db.query(Reembolso)
        .filter(
            Reembolso.id_pedido == s.id_pedido_s,
            Reembolso.motivo.like(f"%{s.numero}%"),
            Reembolso.estado.in_(("Pendiente", "Procesando", "Reembolsado")),
        )
        .first()
    )
    if existe:
        return existe
    if float(s.monto_total or 0) <= 0:
        return None

    pago = (
        db.query(Pago)
        .filter(Pago.id_pedido == s.id_pedido_s)
        .order_by(Pago.id_pago.desc())
        .first()
    )
    return crear_reembolso(
        db,
        monto=float(s.monto_total),
        motivo=f"Devolución {s.numero} ({s.tipo_devolucion}) aprobada — pedido #{s.id_pedido_s}",
        pedido_id=s.id_pedido_s,
        numero_transaccion_original=(pago.numero_transaccion if pago else None),
    )


def cambiar_estado(
    db: Session,
    s: SolicitudDevolucion,
    nuevo_estado: str,
    *,
    resolucion: str | None = None,
    motivo_rechazo: str | None = None,
    observaciones: str | None = None,
    admin_id: int | None = None,
) -> tuple[SolicitudDevolucion, Optional[Reembolso]]:
    """Aplica una transición del pipeline con validaciones y efectos."""
    if nuevo_estado not in TRANSICIONES.get(s.estado, set()):
        raise ValueError(
            f"No puedes pasar la devolución de '{s.estado}' a '{nuevo_estado}'."
        )

    reembolso = None
    if nuevo_estado == EST_APROBADA:
        resolucion_norm = (resolucion or "Reembolso").strip().capitalize()
        if resolucion_norm not in RESOLUCIONES:
            raise ValueError("Resolución no válida (Reembolso / Cambio).")
        s.resolucion = resolucion_norm
        s.resuelta_por = admin_id
        s.resuelta_at = datetime.now()
        if resolucion_norm == "Reembolso":
            reembolso = _crear_reembolso_solicitud(db, s)
    elif nuevo_estado == EST_RECHAZADA:
        if not (motivo_rechazo or "").strip():
            raise ValueError("Indica el motivo del rechazo.")
        s.motivo_rechazo = motivo_rechazo.strip()
        s.resolucion = None
        s.resuelta_por = admin_id
        s.resuelta_at = datetime.now()

    if observaciones is not None:
        s.observaciones_admin = observaciones.strip() or None

    s.estado = nuevo_estado
    s.updated_at = datetime.now()
    _sincronizar_lineas(db, s)
    db.commit()
    db.refresh(s)
    return s, reembolso


def avanzar_por_recogida(db: Session, linea: Devolucion) -> None:
    """Se llama cuando el técnico confirma la recogida de una línea.

    Avanza el pipeline de la solicitud asociada:
      Aprobada → Producto en devolución → Recibida → Reembolso procesado.
    """
    if not linea.id_solicitud_dv:
        return
    s = (
        db.query(SolicitudDevolucion)
        .filter(SolicitudDevolucion.id_solicitud == linea.id_solicitud_dv)
        .first()
    )
    if not s:
        return

    lineas = (
        db.query(Devolucion).filter(Devolucion.id_solicitud_dv == s.id_solicitud).all()
    )
    recogidas = sum(1 for l in lineas if l.recogida_estado == "Recogida")
    todos = len(lineas) > 0 and recogidas == len(lineas)

    nuevo = None
    if s.estado == EST_APROBADA:
        nuevo = EST_RECIBIDA if todos else EST_EN_DEVOLUCION
    elif s.estado == EST_EN_DEVOLUCION and todos:
        nuevo = EST_RECIBIDA

    if nuevo is None:
        return

    s.estado = nuevo
    s.updated_at = datetime.now()

    if nuevo == EST_RECIBIDA and (s.resolucion or "") == "Reembolso":
        reembolso = (
            db.query(Reembolso)
            .filter(
                Reembolso.id_pedido == s.id_pedido_s,
                Reembolso.motivo.like(f"%{s.numero}%"),
            )
            .order_by(Reembolso.id_reembolso.desc())
            .first()
        )
        if reembolso is not None and reembolso.estado == "Reembolsado":
            s.estado = EST_REEMBOLSO

    db.commit()
