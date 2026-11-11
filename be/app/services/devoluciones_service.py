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
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from typing import Optional

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


DINERO_PRECISION = Decimal("0.01")


def _dinero(valor: Decimal | float | int) -> Decimal:
    """Redondea un importe a la precisión monetaria (2 decimales, HALF_UP)."""
    return Decimal(str(valor)).quantize(DINERO_PRECISION, rounding=ROUND_HALF_UP)


def _metros_solicitados(valor) -> Decimal:
    """Convierte la longitud solicitada a Decimal exacto.

    Rechaza valores no finitos, <= 0 y con más de 2 decimales (no se
    redondea silenciosamente una entrada con mayor precisión), igual que
    hace el checkout (``pedidos_service._decimal_metros``)."""
    try:
        d = Decimal(str(valor))
    except (TypeError, ValueError, InvalidOperation):
        raise ItemInvalido("Cantidad en metros inválida.")
    if not d.is_finite() or d <= 0:
        raise ItemInvalido("Los metros a devolver deben ser mayores a cero.")
    if d.as_tuple().exponent < -2:
        raise ItemInvalido("La longitud admite como máximo 2 decimales.")
    return d


def _formato_metros(d: Decimal) -> str:
    """'2.50' → '2,5' para los mensajes al cliente."""
    texto = f"{d.normalize():f}".rstrip("0").rstrip(".") if d == d.to_integral() else f"{d:f}"
    return texto.replace(".", ",").replace(",00", "")


# ────────────────────────────────────────────────────────────────────
# Elegibilidad y unidades disponibles
# ────────────────────────────────────────────────────────────────────

def compromiso_por_producto(db: Session, id_pedido: int) -> dict:
    """Cantidades por producto comprometidas en solicitudes NO rechazadas.

    Las cantidades cuentan como comprometidas incluso cuando la devolución
    ya terminó (Recibida / Reembolso procesado): un producto devuelto y
    procesado no puede volver a solicitarse. Solo un rechazo libera.

    Devuelve ``{"unidades": {pid: int}, "metros": {pid: Decimal},
    "metros_comprados": {pid: Decimal}}``:

    - Filas nuevas por metros traen ``cantidad_metros`` (se suma exacta).
    - Filas legadas (``cantidad_metros`` NULL) de un detalle vendido por
      metros comprometen el corte completo de ese detalle: el flujo antiguo
      trataba el corte como una unidad entera.
    - ``metros_comprados`` totaliza la longitud comprada por producto para
      poder validar que la devolución corresponda al corte completo.
    """
    filas = (
        db.query(
            Devolucion.id_producto_d,
            Devolucion.cantidad,
            Devolucion.cantidad_metros,
        )
        .join(
            SolicitudDevolucion,
            SolicitudDevolucion.id_solicitud == Devolucion.id_solicitud_dv,
        )
        .filter(
            Devolucion.id_pedido_d == id_pedido,
            SolicitudDevolucion.estado != EST_RECHAZADA,
        )
        .all()
    )

    detalles = (
        db.query(DetallePedido)
        .filter(
            DetallePedido.id_pedido_d == id_pedido,
            DetallePedido.id_producto_d.isnot(None),
        )
        .all()
    )
    metros_por_producto: dict[int, Decimal] = {}
    for d in detalles:
        if d.cantidad_metros is not None:
            metros_por_producto[int(d.id_producto_d)] = metros_por_producto.get(
                int(d.id_producto_d), Decimal("0")
            ) + Decimal(str(d.cantidad_metros))

    unidades: dict[int, int] = {}
    metros: dict[int, Decimal] = {}
    filas_legadas_metro: set[int] = set()
    for pid, cantidad, metros_fila in filas:
        if not pid:
            continue
        pid = int(pid)
        if metros_fila is not None:
            metros[pid] = metros.get(pid, Decimal("0")) + Decimal(str(metros_fila))
        elif pid in metros_por_producto:
            # Fila legada de un corte: compromete el corte completo.
            metros[pid] = metros.get(pid, Decimal("0")) + metros_por_producto[pid]
            filas_legadas_metro.add(pid)
        else:
            unidades[pid] = unidades.get(pid, 0) + int(cantidad or 1)

    # No se puede comprometer más longitud de la comprada (defensivo).
    for pid, total in metros.items():
        comprado = metros_por_producto.get(pid)
        if comprado is not None and total > comprado:
            metros[pid] = comprado

    return {
        "unidades": unidades,
        "metros": metros,
        "metros_comprados": metros_por_producto,
    }


def unidades_comprometidas(db: Session, id_pedido: int) -> dict[int, int]:
    """Unidades por producto solicitadas en solicitudes NO RECHAZADAS.

    Mantenida por compatibilidad con flujos existentes; la elegibilidad usa
    ``compromiso_por_producto`` (unidades + metros)."""
    return compromiso_por_producto(db, id_pedido)["unidades"]


def elegibilidad_pedido(db: Session, client: Cliente, id_pedido: int) -> dict:
    """Productos del pedido con las cantidades aún disponibles para devolver.

    Para productos vendidos por metros la devolución aplica al CORTE
    COMPLETO: se reporta la longitud comprada y la longitud aún disponible;
    una fracción no autorizada no es devoluble (PEN-09)."""
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

    compromiso = compromiso_por_producto(db, pedido.id_pedido)
    ids = [d.id_producto_d for d in detalles]
    productos_map = (
        {p.id_producto: p for p in db.query(Producto).filter(Producto.id_producto.in_(ids)).all()}
        if ids
        else {}
    )

    lineas = []
    alguna_disponible = False
    for d in detalles:
        pid = int(d.id_producto_d)
        precio = float(d.precio_unitario_detalle or 0)
        if d.cantidad_metros is not None:
            # Venta por metros: la devolución es del corte completo.
            metros_comprados = Decimal(str(d.cantidad_metros))
            metros_disponibles = max(
                Decimal("0"), metros_comprados - compromiso["metros"].get(pid, Decimal("0"))
            )
            # Solo es devoluble el corte completo e intacto.
            corte_intacto = metros_disponibles >= metros_comprados
            disponible = 1 if corte_intacto else 0
            monto_maximo = float(_dinero(metros_disponibles * Decimal(str(precio))))
            if disponible > 0:
                alguna_disponible = True
            lineas.append({
                "id_detalle": d.id_detalle,
                "id_producto": pid,
                "nombre": _nombre_producto(d, productos_map.get(pid)),
                "cantidad_comprada": int(d.cantidad_detalle or 1),
                "cantidad_disponible": disponible,
                "precio_unitario": round(precio, 2),
                "monto_maximo": monto_maximo,
                "venta_por_metros": True,
                "metros_comprados": float(metros_comprados),
                "metros_disponibles": float(metros_disponibles),
            })
            continue

        comprada = int(d.cantidad_detalle or 1)
        disponible = max(0, comprada - compromiso["unidades"].get(pid, 0))
        if disponible > 0:
            alguna_disponible = True
        lineas.append({
            "id_detalle": d.id_detalle,
            "id_producto": pid,
            "nombre": _nombre_producto(d, productos_map.get(pid)),
            "cantidad_comprada": comprada,
            "cantidad_disponible": disponible,
            "precio_unitario": round(precio, 2),
            "monto_maximo": round(disponible * precio, 2),
            "venta_por_metros": False,
            "metros_comprados": None,
            "metros_disponibles": None,
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
    import secrets

    from app.models.tecnico import Tecnico
    from app.models.user import User

    tecnicos_activos = (
        db.query(Tecnico)
        .join(User, User.id_usuario == Tecnico.id_usuario_t)
        .filter(User.is_active == True, User.id_rol_u == 2)  # noqa: E712
        .all()
    )
    tecnico = secrets.choice(tecnicos_activos) if tecnicos_activos else None
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

    ``items``: [{'id_producto': int, 'cantidad': int, 'metros'?: número}, ...]

    Reglas de negocio (PEN-09):

    - Productos vendidos por metros: la devolución debe corresponder al
      CORTE COMPLETO comprado. Se acepta el campo ``metros`` igual a la
      longitud comprada, o la forma legada ``cantidad=1`` (corte entero).
      Una fracción distinta se rechaza: no hay devoluciones parciales no
      autorizadas, y la validación vive SOLO en el backend.
    - Productos por unidades: ``cantidad`` entera, sin exceder lo disponible.
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

    # Validar items y consolidar duplicados (unidades y metros por producto).
    consolidado: dict[int, int] = {}
    consolidado_metros: dict[int, Decimal] = {}
    for it in items:
        if not isinstance(it, dict):
            raise ItemInvalido("Producto o cantidad inválidos.")
        try:
            pid = int(it.get("id_producto"))
        except (TypeError, ValueError):
            raise ItemInvalido("Producto o cantidad inválidos.")
        if pid not in disponibles:
            raise ItemInvalido("Ese producto no pertenece a este pedido.")
        linea = disponibles[pid]

        if linea["venta_por_metros"]:
            # ── Corte por metros: devolución del corte completo ──
            metros_comprados = Decimal(str(linea["metros_comprados"]))
            metros_disponibles = Decimal(str(linea["metros_disponibles"]))
            if metros_disponibles < metros_comprados:
                raise ItemInvalido(
                    f"El corte de '{linea['nombre']}' ya tiene una devolución "
                    "en proceso; no puedes volver a solicitarla."
                )
            metros_in = it.get("metros")
            if metros_in is None:
                # Forma legada: cantidad=1 representa el corte completo.
                try:
                    cant = int(it.get("cantidad", 1))
                except (TypeError, ValueError):
                    raise ItemInvalido("Producto o cantidad inválidos.")
                if cant != 1:
                    raise ItemInvalido(
                        "La devolución del corte debe corresponder al corte "
                        f"completo ({_formato_metros(metros_comprados)} m)."
                    )
                metros = metros_comprados
            else:
                metros = _metros_solicitados(metros_in)
                if metros != metros_comprados:
                    raise ItemInvalido(
                        "La devolución del corte debe corresponder al corte "
                        f"completo ({_formato_metros(metros_comprados)} m); "
                        f"recibimos {_formato_metros(metros)} m."
                    )
            if pid in consolidado_metros:
                raise ItemInvalido(
                    f"'{linea['nombre']}' ya está en esta solicitud."
                )
            consolidado_metros[pid] = metros
            continue

        # ── Producto por unidades enteras (flujo existente) ──
        if it.get("metros") is not None:
            raise ItemInvalido(f"'{linea['nombre']}' no se vendió por metros.")
        try:
            cant = int(it.get("cantidad", 1))
        except (TypeError, ValueError):
            raise ItemInvalido("Producto o cantidad inválidos.")
        if cant <= 0:
            raise ItemInvalido("La cantidad a devolver debe ser mayor a cero.")
        disp = int(linea["cantidad_disponible"])
        total = consolidado.get(pid, 0) + cant
        if total > disp:
            raise ItemInvalido(
                f"Solo puedes devolver {disp} unidad(es) de '{linea['nombre']}'."
            )
        consolidado[pid] = total

    if not consolidado and not consolidado_metros:
        raise ItemInvalido("Selecciona al menos un producto para devolver.")

    # Monto con aritmética decimal exacta sobre los valores HISTÓRICOS del
    # pedido (precio unitario congelado en el checkout × cantidad devuelta).
    monto_total = Decimal("0")
    for pid, cant in consolidado.items():
        monto_total += _dinero(
            Decimal(str(disponibles[pid]["precio_unitario"])) * cant
        )
    for pid, metros in consolidado_metros.items():
        monto_total += _dinero(
            Decimal(str(disponibles[pid]["precio_unitario"])) * metros
        )

    # ¿Queda algo sin devolver después de esta solicitud? → parcial/total.
    quedan = False
    for p in info["productos"]:
        pid = p["id_producto"]
        if p["venta_por_metros"]:
            metros = consolidado_metros.get(pid, Decimal("0"))
            if Decimal(str(p["metros_disponibles"])) - metros > 0:
                quedan = True
        else:
            if int(p["cantidad_disponible"]) - consolidado.get(pid, 0) > 0:
                quedan = True
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
        monto_total=float(monto_total),
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

    for pid, metros in consolidado_metros.items():
        linea = Devolucion(
            id_cliente_d=client.id_cliente,
            id_pedido_d=id_pedido,
            id_producto_d=pid,
            cantidad=1,  # el corte es una pieza; la longitud vive en metros
            cantidad_metros=metros,
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
        reembolso = _reembolso_de_solicitud(db, s)

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
        metros = float(l.cantidad_metros) if l.cantidad_metros is not None else None
        if metros is not None:
            # Corte por metros: el precio unitario es POR METRO.
            subtotal = float(_dinero(Decimal(str(precio)) * Decimal(str(l.cantidad_metros))))
        else:
            subtotal = round(precio * l.cantidad, 2)
        items.append({
            "id_devolucion": l.id_devolucion,
            "id_producto": l.id_producto_d,
            "producto": _nombre_producto(det, prod),
            "cantidad": l.cantidad,
            "metros": metros,
            "venta_por_metros": metros is not None,
            "precio_unitario": round(precio, 2),
            "subtotal_linea": subtotal,
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


def _reembolso_de_solicitud(db: Session, s: SolicitudDevolucion) -> Reembolso | None:
    """Reembolso asociado a esta solicitud (por origen explícito o por el
    motivo legado 'DEV-nnnnnn'), el más reciente primero."""
    return (
        db.query(Reembolso)
        .filter(
            (
                (Reembolso.id_solicitud_origen == s.id_solicitud)
                | (
                    (Reembolso.id_pedido == s.id_pedido_s)
                    & Reembolso.motivo.like(f"%{s.numero}%")
                )
            )
        )
        .order_by(Reembolso.id_reembolso.desc())
        .first()
    )


def _crear_reembolso_solicitud(db: Session, s: SolicitudDevolucion):
    """Registra el reembolso SOLO del valor de esta solicitud (parcial o
    total) usando la pasarela simulada. Devuelve el Reembolso o None.

    Idempotencia (PEN-10): la deduplicación usa el vínculo explícito
    ``id_solicitud_origen`` y el motivo legado; el índice único de
    ``reembolsos.id_solicitud_origen`` impide en la base de datos un segundo
    reembolso para la misma devolución."""
    from sqlalchemy.exc import IntegrityError

    from app.services.reembolso_service import crear_reembolso

    existe = (
        db.query(Reembolso)
        .filter(
            (
                (Reembolso.id_solicitud_origen == s.id_solicitud)
                | (
                    (Reembolso.id_pedido == s.id_pedido_s)
                    & Reembolso.motivo.like(f"%{s.numero}%")
                )
            ),
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
    try:
        return crear_reembolso(
            db,
            monto=float(s.monto_total),
            motivo=f"Devolución {s.numero} ({s.tipo_devolucion}) aprobada — pedido #{s.id_pedido_s}",
            pedido_id=s.id_pedido_s,
            numero_transaccion_original=(pago.numero_transaccion if pago else None),
            solicitud_origen_id=s.id_solicitud,
        )
    except IntegrityError:
        # Última barrera: otro proceso registró el reembolso de esta misma
        # solicitud. El rollback deja la transacción limpia (sin estado a
        # medias) y se informa para que el administrador reconsulte.
        db.rollback()
        existe = _reembolso_de_solicitud(db, s)
        if existe is not None:
            raise ItemInvalido(
                "Esta devolución ya tiene un reembolso registrado."
            ) from None
        raise


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
    """Aplica una transición del pipeline con validaciones y efectos.

    Idempotencia y concurrencia (PEN-10): la fila de la solicitud se bloquea
    (SELECT ... FOR UPDATE) y se relee antes de validar la transición, de
    modo que dos administradores simultáneos se serialicen: el segundo ve el
    estado ya confirmado y recibe un error de transición inválida. El estado
    aprobado y el reembolso creado se confirman en la MISMA transacción.
    """
    bloqueada = (
        db.query(SolicitudDevolucion)
        .with_for_update()
        .populate_existing()
        .filter(SolicitudDevolucion.id_solicitud == s.id_solicitud)
        .first()
    )
    if bloqueada is not None:
        s = bloqueada

    if nuevo_estado not in TRANSICIONES.get(s.estado, set()):
        raise ValueError(
            f"No puedes pasar la devolución de '{s.estado}' a '{nuevo_estado}'."
        )

    if nuevo_estado == EST_APROBADA:
        resolucion_norm = (resolucion or "Reembolso").strip().capitalize()
        if resolucion_norm not in RESOLUCIONES:
            raise ValueError("Resolución no válida (Reembolso / Cambio).")
        s.resolucion = resolucion_norm
        s.resuelta_por = admin_id
        s.resuelta_at = datetime.now()
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

    reembolso = None
    if nuevo_estado == EST_APROBADA and (s.resolucion or "") == "Reembolso":
        # ``crear_reembolso`` confirma su propia transacción: el estado de la
        # solicitud se consolida junto con el reembolso en ese mismo commit.
        reembolso = _crear_reembolso_solicitud(db, s)
    else:
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
        reembolso = _reembolso_de_solicitud(db, s)
        if reembolso is not None and reembolso.estado == "Reembolsado":
            s.estado = EST_REEMBOLSO

    db.commit()
