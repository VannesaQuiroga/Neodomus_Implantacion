"""
Módulo: services/pedidos_service.py
Lógica de negocio para pedidos / checkout en NEODOMUS.

Flujo:
  1. Recibe los items del carrito + servicios opcionales + datos del pago.
  2. Valida productos, calcula totales (incluye venta por metros).
  3. Procesa el pago simulado (app/services/pagos_service.py).
  4. Crea el pedido, sus detalles y el pago.
  5. Si el pago es aprobado: genera la factura PDF y la envía por correo.
     Si el correo falla, el pago NO se marca como rechazado (solo se registra).
"""

from __future__ import annotations

from datetime import date, datetime, timedelta

from fastapi import HTTPException
from sqlalchemy import func, text
from sqlalchemy.orm import Session

from app.models.cita import Cita
from app.models.cliente import Cliente
from app.models.factura import Factura
from app.models.pago import Pago
from app.models.pedido import DetallePedido, Pedido
from app.models.producto import Producto
from app.models.tecnico import Tecnico
from app.services import pagos_service
from app.services.inventario_service import descontar_stock


# ────────────────────────────────────────────────────────────────────
# Pedido completado: entrega física O cita de instalación finalizada
# ────────────────────────────────────────────────────────────────────

def cita_de_pedido(db: Session, id_pedido: int) -> Cita | None:
    """Cita de instalación asociada a un pedido (creada en el checkout con
    numero_transaccion = 'PEDIDO-{id}')."""
    return (
        db.query(Cita)
        .filter(Cita.numero_transaccion == f"PEDIDO-{id_pedido}")
        .order_by(Cita.id_cita.desc())
        .first()
    )


def pedido_completado(db: Session, pedido: Pedido) -> bool:
    """Un pedido está completado —y sus productos calificables/devolubles—
    cuando el técnico marcó la entrega como 'Entregado' O cuando la cita de
    instalación vinculada quedó 'Finalizada' (el servicio terminó)."""
    if pedido.estado_entrega == "Entregado":
        return True
    cita = cita_de_pedido(db, pedido.id_pedido)
    return bool(cita and cita.estado == "Finalizada")
from app.services.especialidades import (
    tecnico_ocupado,
    duracion_desde_items,
    duracion_base_tipo,
)
from app.services.factura_service import (
    enviar_factura_por_correo,
    generar_factura_pdf,
)
from app.utils.fechas import fecha_bogota

# Precios de demostración para servicios técnicos comprados en el checkout.
PRECIOS_SERVICIOS_DEMO = {
    "instalacion": 120000,
    "mantenimiento": 80000,
    "reparacion": 90000,
    "revision": 60000,
    "soporte": 70000,
}


def normalizar_nombre_producto(nombre: str | None) -> str:
    """Normaliza la presentación del nombre de un producto:
    primera letra en MAYÚSCULA y el resto en minúsculas.

    Ejemplos: 'cable thhn' -> 'Cable thhn', 'INTERRUPTOR SENCILLO' -> 'Interruptor sencillo'.
    No modifica el valor guardado en la base de datos (solo presentación).
    """
    if not nombre:
        return ""
    texto = str(nombre).strip()
    if not texto:
        return ""
    return texto[:1].upper() + texto[1:].lower()


def _validar_y_preparar_items(db: Session, items: list[dict]) -> list[dict]:
    """Valida cada item del carrito y calcula subtotales."""
    preparados = []
    if not items:
        raise HTTPException(status_code=400, detail="El carrito está vacío")
    for item in items:
        id_producto = item.get("id_producto")
        cantidad = int(item.get("cantidad") or 1)
        metros = item.get("metros")
        color = (item.get("color") or "").strip() or None
        id_variante = item.get("id_variante")

        producto = db.query(Producto).filter(Producto.id_producto == id_producto).first()
        if not producto:
            raise HTTPException(status_code=404, detail=f"Producto {id_producto} no encontrado")
        if producto.estado_producto != "activo":
            raise HTTPException(status_code=400, detail=f"El producto {producto.nombre_producto} no está disponible")

        # Variante elegida (color/tamaño/medida): precio y stock propios.
        variante = None
        if id_variante is not None:
            from app.models.producto_variante import ProductoVariante

            variante = next(
                (v for v in (producto.variantes or []) if v.id == int(id_variante)),
                None,
            )
            if variante is None:
                raise HTTPException(
                    status_code=400,
                    detail="La combinación de color/medida seleccionada ya no existe",
                )
            if (variante.stock or 0) <= 0:
                raise HTTPException(
                    status_code=400,
                    detail=f"'{producto.nombre_producto}' en {variante.nombre}"
                    + (f" ({variante.tamaño})" if variante.tamaño else "")
                    + " está agotado",
                )

        precio_unitario = (
            (variante.precio if variante and variante.precio is not None else None)
            or producto.precio_venta_producto
            or 0
        )

        # Venta por metros: la cantidad ES la longitud en metros.
        if producto.venta_por_metros:
            try:
                metros = float(metros) if metros is not None else float(cantidad)
            except (TypeError, ValueError):
                raise HTTPException(status_code=400, detail="Cantidad en metros inválida")
            if metros <= 0:
                raise HTTPException(status_code=400, detail="Los metros deben ser mayores a cero")
            cantidad_linea = 1
            subtotal = precio_unitario * metros
        else:
            if cantidad < 1:
                raise HTTPException(status_code=400, detail="La cantidad debe ser al menos 1")
            metros = None
            cantidad_linea = cantidad
            subtotal = precio_unitario * cantidad_linea

        preparados.append({
            "producto": producto,
            "cantidad": cantidad_linea,
            "metros": metros,
            "color": color,
            "tamaño": (variante.tamaño if variante else None),
            "ancho_cm": (variante.ancho_cm if variante else None),
            "alto_cm": (variante.alto_cm if variante else None),
            "variante": variante,
            "precio_unitario": precio_unitario,
            "subtotal": round(subtotal, 2),
        })

    # ── Validación AGREGADA de stock ANTES de procesar el pago ──────
    # Suma lo solicitado por producto/variante en todas las líneas del
    # carrito y verifica contra el stock actual. Así un stock insuficiente
    # falla ANTES de cobrar al cliente (descontar_stock re-valida con
    # bloqueo pesimista al confirmar el pago).
    from collections import defaultdict

    requerido_prod: dict[int, float] = defaultdict(float)
    requerido_var: dict[int, float] = defaultdict(float)
    productos_por_id: dict[int, Producto] = {}
    variantes_por_id: dict[int, "ProductoVariante"] = {}
    for linea in preparados:
        p = linea["producto"]
        v = linea.get("variante")
        unidades = (
            float(linea["metros"])
            if (p.venta_por_metros and linea["metros"])
            else linea["cantidad"]
        )
        requerido_prod[p.id_producto] += unidades
        productos_por_id[p.id_producto] = p
        if v is not None:
            requerido_var[v.id] += unidades
            variantes_por_id[v.id] = v

    for pid, req in requerido_prod.items():
        prod = productos_por_id[pid]
        disponible = prod.stock_producto or 0
        if req > disponible:
            raise HTTPException(
                status_code=409,
                detail=(
                    f"Stock insuficiente de '{prod.nombre_producto}' "
                    f"(disponible: {disponible}, solicitado: {req:g})"
                ),
            )
    for vid, req in requerido_var.items():
        var = variantes_por_id[vid]
        disponible = var.stock or 0
        if req > disponible:
            nombre = (
                productos_por_id[var.id_producto].nombre_producto
                if var.id_producto in productos_por_id
                else "el producto"
            )
            raise HTTPException(
                status_code=409,
                detail=(
                    f"Stock insuficiente de '{nombre}' en la variante seleccionada "
                    f"(disponible: {disponible}, solicitado: {req:g})"
                ),
            )

    return preparados


def _preparar_servicios(
    db: Session,
    servicios: list[dict],
    duracion_items: float | None = None,
) -> list[dict]:
    """Prepara las líneas de servicio técnico opcionales (todas generan cita).
    `duracion_items` es la duración estimada (1-2.5 h) según los productos
    del carrito; se usa para validar que la franja elegida alcance."""
    from app.services.especialidades import (
        horas_laborales,
        slot_tomado,
        _dia_es_laboral,
    )
    from datetime import datetime as _dt

    preparados = []
    for serv in servicios or []:
        nombre = (serv.get("nombre") or "").strip()
        if not nombre:
            raise HTTPException(status_code=400, detail="El servicio debe tener un nombre")
        precio = serv.get("precio")
        if precio is None:
            precio = PRECIOS_SERVICIOS_DEMO.get(
                serv.get("tipo_servicio", "").lower(), 100000
            )
        descripcion = (serv.get("descripcion") or "").strip()
        fecha = serv.get("fecha")
        hora = (serv.get("hora") or "").strip() or "08:00"
        direccion = (serv.get("direccion") or "").strip()
        id_tecnico = serv.get("id_tecnico")
        tipo_servicio = (serv.get("tipo_servicio") or "").strip().lower() or "servicio"

        # Todo servicio agendado en el carrito genera una cita: se valida el
        # día laboral, que la franja alcance para la duración estimada y que
        # no esté reservada por otro cliente.
        try:
            f = date.fromisoformat(str(fecha)) if fecha else None
        except (TypeError, ValueError):
            f = None
        if f is None:
            f = (datetime.now() + timedelta(days=1)).date()
        if f < date.today():
            raise HTTPException(
                status_code=400,
                detail="La fecha del servicio no puede ser anterior a hoy.",
            )
        if not _dia_es_laboral(f):
            raise HTTPException(
                status_code=400,
                detail="Las citas solo se pueden agendar de lunes a sábado.",
            )
        duracion = (
            duracion_items
            if duracion_items is not None and tipo_servicio == "instalacion"
            else duracion_base_tipo(tipo_servicio)
        )
        if hora not in horas_laborales(f, duracion):
            raise HTTPException(
                status_code=400,
                detail="La hora debe ser una franja entre 08:00 y 18:00 con tiempo suficiente para el servicio (por ejemplo 09:00).",
            )
        if slot_tomado(db, f, hora, duracion_horas=duracion):
            raise HTTPException(
                status_code=400,
                detail=f"La franja del {f} a las {hora} ya fue reservada por otro cliente. Elige otra.",
            )
        if f == date.today():
            try:
                hh, mm = hora.split(":")[:2]
                seleccion = (int(hh), int(mm))
                actual = (_dt.now().hour, _dt.now().minute)
            except (TypeError, ValueError):
                seleccion, actual = None, None
            if seleccion is not None and seleccion <= actual:
                raise HTTPException(
                    status_code=400,
                    detail="La hora del servicio debe ser posterior a la hora actual.",
                )

        preparados.append({
            "nombre": nombre,
            "tipo_servicio": (serv.get("tipo_servicio") or "").strip().lower() or "servicio",
            "descripcion": descripcion,
            "fecha": f.isoformat(),
            "hora": hora,
            "direccion": direccion,
            "precio": float(precio or 0),
            "id_tecnico": id_tecnico,
        })
    return preparados


def _validar_fecha_instalacion(fecha: str | None, hora: str) -> None:
    """Rechaza instalaciones agendadas en una fecha pasada o, si es hoy,
    en una hora que ya pasó."""
    hoy = date.today()
    if not fecha:
        return
    try:
        f = date.fromisoformat(str(fecha))
    except (TypeError, ValueError):
        return
    if f < hoy:
        raise HTTPException(
            status_code=400,
            detail="La fecha de instalación no puede ser anterior a hoy.",
        )
    if f == hoy:
        try:
            hh, mm = (hora or "").split(":")[:2]
            seleccion = (int(hh), int(mm))
            actual = (datetime.now().hour, datetime.now().minute)
        except (TypeError, ValueError):
            return
        if seleccion <= actual:
            raise HTTPException(
                status_code=400,
                detail="La hora de instalación debe ser posterior a la hora actual.",
            )


def _buscar_servicio_bd(db: Session, tipo_servicio: str) -> int | None:
    """Busca el id_servicio real en la BD cuyo tipo coincida (LIKE) con el
    tipo de servicio enviado en el checkout. Devuelve None si no hay match."""
    if not tipo_servicio:
        return None
    fila = db.execute(
        text(
            """
            SELECT s.id_servicio
            FROM servicios s
            JOIN tipos_servicios t ON t.id_tipo_ser = s.id_tipo_ser
            WHERE LOWER(t.descripcion_tipo) LIKE LOWER(:nombre)
            ORDER BY s.id_servicio
            LIMIT 1
            """
        ),
        {"nombre": f"%{tipo_servicio.strip()}%"},
    ).fetchone()
    return fila[0] if fila else None


# ──────────────────────────────────────────────────────────────────
# 📦 Orden de instalación con técnico asignado
# ──────────────────────────────────────────────────────────────────

def _es_servicio_instalacion(tipo_servicio: str) -> bool:
    """True si el tipo de servicio corresponde a una instalación
    (compara normalizado: sin tildes, minúsculas)."""
    s = (tipo_servicio or "").strip().lower()
    for a, b in (("á", "a"), ("é", "e"), ("í", "i"), ("ó", "o"), ("ú", "u")):
        s = s.replace(a, b)
    return "instalacion" in s


def _asignar_tecnico(
    db: Session, tipo_servicio: str, fecha: date, hora: str,
    ids_especializacion: list[int] | None = None,
    duracion_horas: float = 1.0,
) -> Tecnico | None:
    """Elige el mejor técnico activo libre durante toda la duración del
    servicio a esa fecha y hora.

    Con especializaciones requeridas: solo candidatos que las cubren todas
    (prioriza cobertura completa). Sin especializaciones: primer activo libre.
    Devuelve None si no hay."""
    from app.services.especialidades import candidatos_para_especializaciones

    if ids_especializacion:
        return next(
            iter(
                candidatos_para_especializaciones(
                    db, ids_especializacion, fecha, hora, duracion_horas=duracion_horas
                )
            ),
            None,
        )

    from app.models.user import User

    candidatos = (
        db.query(Tecnico)
        .join(User, User.id_usuario == Tecnico.id_usuario_t)
        .filter(User.is_active == True, User.id_rol_u == 2)  # noqa: E712
        .all()
    )
    for t in candidatos:
        if not tecnico_ocupado(db, t.id_tecnico, fecha, hora, duracion_horas=duracion_horas):
            return t
    return None


def _nombre_tecnico(tecnico: Tecnico | None) -> str | None:
    if tecnico is None or not tecnico.usuario:
        return None
    return f"{tecnico.usuario.first_name} {tecnico.usuario.last_name}".strip()


def _max_tecnicos_pedido(db: Session, pedido_id: int) -> int:
    """Máximo de técnicos que requieren los productos del pedido (mínimo 1)."""
    maximo = (
        db.query(func.max(Producto.tecnicos_requeridos))
        .join(DetallePedido, DetallePedido.id_producto_d == Producto.id_producto)
        .filter(
            DetallePedido.id_pedido_d == pedido_id,
            DetallePedido.id_producto_d.isnot(None),
        )
        .scalar()
    )
    return int(maximo or 1)


def _duracion_para_pedido(db: Session, pedido_id: int, tipo_servicio: str) -> float:
    """Duración estimada (1-2.5 h) de la cita según los productos del pedido;
    sin productos usa la duración base del tipo de servicio."""
    detalles = (
        db.query(DetallePedido)
        .filter(
            DetallePedido.id_pedido_d == pedido_id,
            DetallePedido.id_producto_d.isnot(None),
        )
        .all()
    )
    items = [
        {"id_producto": d.id_producto_d, "cantidad": d.cantidad_detalle or 1}
        for d in detalles
    ]
    return duracion_desde_items(db, items) or duracion_base_tipo(tipo_servicio)


def _asignar_tecnico_extra(
    db: Session, fecha: date, excluir_ids: set[int] | None, hora: str,
    ids_especializacion: list[int] | None = None,
    duracion_horas: float = 1.0,
) -> Tecnico | None:
    """Elige un técnico activo libre durante toda la duración del servicio a
    esa fecha y hora, distinto de todos los de `excluir_ids`. Con
    especializaciones requeridas, solo candidatos que las cubran todas."""
    from app.services.especialidades import candidatos_para_especializaciones

    excluir = set(excluir_ids or set())
    if ids_especializacion:
        return next(
            iter(
                candidatos_para_especializaciones(
                    db, ids_especializacion, fecha, hora, excluir,
                    duracion_horas=duracion_horas,
                )
            ),
            None,
        )

    from app.models.user import User

    candidatos = (
        db.query(Tecnico)
        .join(User, User.id_usuario == Tecnico.id_usuario_t)
        .filter(User.is_active == True, User.id_rol_u == 2)  # noqa: E712
        .all()
    )
    for t in candidatos:
        if t.id_tecnico in excluir:
            continue
        if not tecnico_ocupado(db, t.id_tecnico, fecha, hora, duracion_horas=duracion_horas):
            return t
    return None


def _productos_pedido(db: Session, pedido_id: int) -> list[str]:
    """Descripciones de las líneas de producto del pedido (sin servicios)."""
    detalles = (
        db.query(DetallePedido)
        .filter(
            DetallePedido.id_pedido_d == pedido_id,
            DetallePedido.id_producto_d.isnot(None),
        )
        .all()
    )
    return [
        d.descripcion_detalle or f"Producto #{d.id_producto_d}"
        for d in detalles
    ]


def _objetos_producto_pedido(db: Session, pedido_id: int) -> list[Producto]:
    """Objetos Producto de las líneas de producto del pedido."""
    detalles = (
        db.query(DetallePedido)
        .filter(
            DetallePedido.id_pedido_d == pedido_id,
            DetallePedido.id_producto_d.isnot(None),
        )
        .all()
    )
    productos = []
    for d in detalles:
        if d.producto is not None:
            productos.append(d.producto)
    return productos


def _especializaciones_requeridas_pedido(db: Session, pedido_id: int) -> tuple[list[int], list[str]]:
    """(ids, nombres) de las especializaciones requeridas por los productos
    del pedido, sin duplicados."""
    from app.services.especialidades import especializaciones_de_productos

    ids = especializaciones_de_productos(_objetos_producto_pedido(db, pedido_id))
    if not ids:
        return [], []
    from app.models.especializacion import Especializacion

    filas = (
        db.query(Especializacion)
        .filter(Especializacion.id_especializacion.in_(ids))
        .all()
    )
    nombres = {e.id_especializacion: e.nombre for e in filas}
    return ids, [nombres[i] for i in ids if i in nombres]


def _plantilla_correo_instalacion(destinatario: str, **datos) -> tuple[str, str]:
    """Asunto y cuerpo HTML del correo de orden de instalación.
    `destinatario` ('tecnico' | 'admin') ajusta el encabezado y el mensaje."""
    es_admin = destinatario == "admin"
    subject = (
        "Nueva orden de instalación en Neodomus"
        if es_admin
        else "Nueva orden de instalación asignada"
    )
    header = "ORDEN DE INSTALACIÓN" if es_admin else "INSTALACIÓN ASIGNADA"
    intro = (
        f"Se generó una orden de instalación para el pedido <strong>#{datos['pedido']}</strong> "
        f"del cliente <strong>{datos['cliente']}</strong>."
        if es_admin
        else f"Se te asignó una orden de instalación correspondiente al pedido <strong>#{datos['pedido']}</strong>."
    )
    tecnico_fila = (
        f"<tr><td style='padding:10px 12px;border:1px solid #eee;font-size:13px;color:#666'>Técnico asignado</td>"
        f"<td style='padding:10px 12px;border:1px solid #eee;font-size:13px;color:#333;font-weight:700'>{datos['tecnico']}</td></tr>"
        if es_admin
        else ""
    )
    productos = datos["productos"] or ["Productos del pedido"]
    filas_productos = "".join(
        f"<li style='margin:2px 0;color:#333;font-size:13px'>{p}</li>"
        for p in productos
    )
    saludo_html = f"Hola {datos['saludo']}," if datos.get("saludo") else "Hola,"
    body = (
        "<div style='background:#f6f4ef;padding:24px;font-family:Arial,Helvetica,sans-serif'>"
        "<div style='max-width:600px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e8e2d6'>"
        "<div style='background:#1f1a12;padding:20px 26px;border-bottom:4px solid #d4a54b'>"
        "<h2 style='margin:0;color:#ffffff;font-size:19px'>Neodomus</h2>"
        f"<p style='margin:4px 0 0;color:#ffd98a;font-size:12px;font-weight:600;letter-spacing:1px'>{header}</p></div>"
        "<div style='padding:26px'>"
        f"<p style='margin:0 0 8px;color:#333;font-size:14px'>{saludo_html}</p>"
        f"<p style='margin:0 0 18px;color:#555;font-size:14px'>{intro}</p>"
        "<table style='border-collapse:collapse;width:100%;font-family:Arial,Helvetica,sans-serif'>"
        "<tr><td style='padding:10px 12px;border:1px solid #eee;font-size:13px;color:#666'>Cliente</td>"
        f"<td style='padding:10px 12px;border:1px solid #eee;font-size:13px;color:#333'>{datos['cliente']}</td></tr>"
        "<tr><td style='padding:10px 12px;border:1px solid #eee;font-size:13px;color:#666'>Fecha</td>"
        f"<td style='padding:10px 12px;border:1px solid #eee;font-size:13px;color:#333'>{datos['fecha']}</td></tr>"
        "<tr><td style='padding:10px 12px;border:1px solid #eee;font-size:13px;color:#666'>Hora</td>"
        f"<td style='padding:10px 12px;border:1px solid #eee;font-size:13px;color:#333'>{datos['hora']}</td></tr>"
        "<tr><td style='padding:10px 12px;border:1px solid #eee;font-size:13px;color:#666'>Dirección</td>"
        f"<td style='padding:10px 12px;border:1px solid #eee;font-size:13px;color:#333'>{datos['direccion']}</td></tr>"
        "<tr><td style='padding:10px 12px;border:1px solid #eee;font-size:13px;color:#666'>Pedido</td>"
        f"<td style='padding:10px 12px;border:1px solid #eee;font-size:13px;color:#333;font-weight:700'>#{datos['pedido']}</td></tr>"
        f"{tecnico_fila}"
        "</table>"
        "<p style='margin:16px 0 4px;color:#555;font-size:13px'><strong>Productos a instalar:</strong></p>"
        f"<ul style='margin:0 0 6px 18px;padding:0'>{filas_productos}</ul>"
        "<p style='margin:18px 0 0;padding:12px 14px;background:#faf7f0;border:1px solid #e8e2d6;border-radius:8px;color:#7a6a4a;font-size:13px'>"
        "Revisa la agenda en el panel para ver el detalle de esta instalación.</p>"
        "</div>"
        "<div style='background:#f6f4ef;padding:14px 26px;border-top:1px solid #e8e2d6'>"
        "<p style='margin:0;color:#999;font-size:12px'>Neodomus — Sistema de gestión inteligente.</p>"
        "</div></div></div>"
    )
    return subject, body


def _crear_orden_instalacion(
    db: Session,
    pedido: Pedido,
    cliente: Cliente,
    serv: dict,
) -> dict | None:
    """Crea una cita para una línea de servicio del pedido: usa el técnico
    elegido por el cliente (validado) o asigna automáticamente uno disponible,
    y notifica por correo al técnico. Devuelve el resumen de la cita.
    Si el servicio es instalación y los productos del pedido requieren 2
    técnicos, también se asigna (o valida) un segundo técnico."""
    from app.services.especialidades import slot_tomado

    try:
        fecha = date.fromisoformat(str(serv["fecha"])) if serv.get("fecha") else None
    except (TypeError, ValueError):
        fecha = None
    if fecha is None:
        fecha = (datetime.now() + timedelta(days=1)).date()
    else:
        # Regla de negocio: mínimo 3 horas de anticipación. HOY es posible si
        # la franja elegida queda fuera de esas 3 horas y hay agenda libre
        # (la disponibilidad se valida más abajo con slot_tomado/técnicos).
        try:
            partes_hora = str(serv.get("hora") or "08:00").split(":")
            fecha_hora_servicio = datetime.combine(
                fecha,
                datetime.min.time(),
            ).replace(hour=int(partes_hora[0]), minute=int(partes_hora[1]))
        except (TypeError, ValueError, IndexError):
            fecha_hora_servicio = datetime.combine(fecha, datetime.min.time())
        if fecha_hora_servicio < datetime.now() + timedelta(hours=3):
            raise HTTPException(
                status_code=400,
                detail=(
                    "Los servicios se agendan con al menos 3 horas de "
                    "anticipación. Si es para hoy, elige una hora posterior."
                ),
            )
    hora = serv.get("hora") or "08:00"
    direccion = (
        (serv.get("direccion") or "").strip()
        or (cliente.address or "").strip()
        or "Por definir"
    )
    tipo_servicio = serv.get("tipo_servicio") or "servicio"
    duracion_cita = _duracion_para_pedido(db, pedido.id_pedido, tipo_servicio)

    # Costo del servicio según la tarifa vigente (visible para el admin y
    # base del reembolso si se cancela).
    from app.models.tarifa_servicio import TarifaServicio

    tarifa = (
        db.query(TarifaServicio)
        .filter(TarifaServicio.tipo_servicio == tipo_servicio)
        .first()
    )
    costo_cita = float(tarifa.costo) if tarifa else None

    if slot_tomado(db, fecha, hora, duracion_horas=duracion_cita):
        raise HTTPException(
            status_code=400,
            detail=f"La franja del {fecha.isoformat()} a las {hora} ya fue reservada por otro cliente.",
        )

    tecnicos_necesarios = 1
    import unicodedata

    tipo_norm = "".join(
        c for c in unicodedata.normalize("NFD", str(tipo_servicio).lower())
        if unicodedata.category(c) != "Mn"
    )
    if tipo_norm == "instalacion":
        tecnicos_necesarios = _max_tecnicos_pedido(db, pedido.id_pedido)

    # Especializaciones requeridas por los productos del pedido (solo
    # informativas: ya no se exige que el técnico las cubra, se supone que
    # cualquier técnico sabe de todo).
    ids_esp, nombres_esp = _especializaciones_requeridas_pedido(db, pedido.id_pedido)

    id_tecnico_sel = serv.get("id_tecnico")
    tecnico = None
    if id_tecnico_sel is not None:
        tecnico = db.query(Tecnico).filter(Tecnico.id_tecnico == id_tecnico_sel).first()
        if (
            not tecnico
            or not tecnico.usuario
            or not tecnico.usuario.is_active
            or tecnico.usuario.id_rol_u != 2
        ):
            raise HTTPException(
                status_code=400,
                detail="El técnico seleccionado no existe o no está activo",
            )
        if tecnico_ocupado(db, tecnico.id_tecnico, fecha, hora, duracion_horas=duracion_cita):
            raise HTTPException(
                status_code=400,
                detail="El técnico seleccionado ya está ocupado a esa hora. Elige otro técnico u hora.",
            )
    else:
        tecnico = _asignar_tecnico(
            db, tipo_servicio, fecha, hora,
            duracion_horas=duracion_cita,
        )
        if tecnico is None:
            raise HTTPException(
                status_code=400,
                detail="No hay técnicos disponibles para esa fecha. Elige otra fecha.",
            )

    # Técnicos adicionales (2..N): el cliente pudo elegirlos todos de una vez
    # (id_tecnico_2, id_tecnico_3) o se asignan automáticamente.
    tecnicos_extra = []
    elegidos_previos = {tecnico.id_tecnico if tecnico else None}
    for slot in range(2, max(tecnicos_necesarios, 1) + 1):
        extra = None
        id_sel = serv.get(f"id_tecnico_{slot}")
        if id_sel is not None:
            if id_sel in elegidos_previos:
                raise HTTPException(
                    status_code=400,
                    detail=f"El técnico {slot} debe ser diferente de los ya seleccionados.",
                )
            extra = (
                db.query(Tecnico)
                .filter(Tecnico.id_tecnico == id_sel)
                .first()
            )
            if (
                not extra
                or not extra.usuario
                or not extra.usuario.is_active
                or extra.usuario.id_rol_u != 2
            ):
                raise HTTPException(
                    status_code=400,
                    detail=f"El técnico {slot} seleccionado no existe o no está activo",
                )
            if tecnico_ocupado(db, extra.id_tecnico, fecha, hora, duracion_horas=duracion_cita):
                raise HTTPException(
                    status_code=400,
                    detail=f"El técnico {slot} ya está ocupado a esa hora. Elige otro técnico u hora.",
                )
        elif slot <= tecnicos_necesarios or id_sel is not None:
            extra = _asignar_tecnico_extra(
                db, fecha, excluir_ids=elegidos_previos.copy(), hora=hora,
                duracion_horas=duracion_cita,
            )
            if extra is None:
                raise HTTPException(
                    status_code=400,
                    detail=(
                        f"No hay {slot} técnicos disponibles para esa fecha y hora. "
                        "Elige otra fecha u horario."
                    ),
                )
        if extra is None:
            break
        tecnicos_extra.append(extra)
        elegidos_previos.add(extra.id_tecnico)

    nombre_tecnico = _nombre_tecnico(tecnico)
    nombre_tecnico_2 = _nombre_tecnico(tecnicos_extra[0]) if len(tecnicos_extra) > 0 else None
    nombre_tecnico_3 = _nombre_tecnico(tecnicos_extra[1]) if len(tecnicos_extra) > 1 else None
    productos = _productos_pedido(db, pedido.id_pedido)

    cita_kwargs = dict(
        id_cliente=cliente.id_cliente,
        id_tecnico=tecnico.id_tecnico if tecnico else None,
        nombre_tecnico=nombre_tecnico,
        tipo_servicio=tipo_servicio,
        fecha=fecha,
        hora=hora,
        direccion=direccion,
        descripcion="; ".join(productos),
        estado="Confirmada",
        costo_cita=costo_cita,
        metodo_pago="checkout",
        estado_pago=pedido.estado_pedido or "Pagado",
        numero_transaccion=f"PEDIDO-{pedido.id_pedido}",
        id_especializacion=ids_esp[0] if len(ids_esp) == 1 else None,
    )
    if len(tecnicos_extra) > 0:
        cita_kwargs["id_tecnico_2"] = tecnicos_extra[0].id_tecnico
        cita_kwargs["nombre_tecnico_2"] = nombre_tecnico_2
    if len(tecnicos_extra) > 1:
        cita_kwargs["id_tecnico_3"] = tecnicos_extra[1].id_tecnico
        cita_kwargs["nombre_tecnico_3"] = nombre_tecnico_3
    cita = Cita(**cita_kwargs)
    db.add(cita)
    db.commit()
    db.refresh(cita)

    nombre_cliente = f"{cliente.first_name} {cliente.last_name}".strip() or "Cliente"
    fecha_texto = fecha.strftime("%d/%m/%Y")

    tecnicos_a_notificar = [t for t in (tecnico, *tecnicos_extra) if t is not None]
    for t in tecnicos_a_notificar:
        if t.usuario and t.usuario.email:
            from app.services.notificaciones import notificar_cita_asignada_tecnico

            notificar_cita_asignada_tecnico(
                db,
                t.usuario.id_usuario,
                t.usuario.email,
                _nombre_tecnico(t) or "técnico",
                {
                    "cliente": nombre_cliente,
                    "servicio": tipo_servicio,
                    "fecha": fecha_texto,
                    "hora": hora,
                    "direccion": direccion,
                    "telefono": cliente.telefono_cliente,
                    "descripcion": " | ".join(productos) if productos else None,
                },
            )

    # El TÉCNICO 1 queda encargado de despachar también los productos del
    # pedido: la entrega se agenda el mismo día de la instalación a su nombre.
    entrega_info: dict | None = None
    tiene_productos = any(
        d.id_producto_d is not None for d in (pedido.detalles or [])
    )
    if tiene_productos and tecnico is not None:
        pedido.fecha_entrega = fecha
        pedido.hora_entrega = hora
        pedido.hora_entrega_fin = None
        pedido.id_tecnico_entrega = tecnico.id_tecnico
        pedido.nombre_tecnico_entrega = nombre_tecnico
        pedido.estado_entrega = "Asignada"
        db.commit()

        if tecnico.usuario and tecnico.usuario.email:
            from app.services.notificaciones import notificar_entrega_asignada_tecnico

            notificar_entrega_asignada_tecnico(
                db,
                tecnico.usuario.id_usuario,
                tecnico.usuario.email,
                nombre_tecnico or "técnico",
                {
                    "pedido": pedido.id_pedido,
                    "cliente": nombre_cliente,
                    "direccion": direccion,
                    "telefono": cliente.telefono_cliente,
                    "fecha": fecha_texto,
                    "hora": hora,
                },
            )

        entrega_info = {
            "id_pedido": pedido.id_pedido,
            "fecha_entrega": fecha.isoformat(),
            "hora_entrega": hora,
            "id_tecnico": tecnico.id_tecnico,
            "nombre_tecnico": nombre_tecnico,
            "telefono_tecnico": (
                tecnico.usuario.telefono_usuario if tecnico.usuario else None
            ),
            "foto_tecnico": tecnico.usuario.foto_url if tecnico.usuario else None,
            "estado_entrega": pedido.estado_entrega,
        }

    return {
        "id_cita": cita.id_cita,
        "id_tecnico": cita.id_tecnico,
        "nombre_tecnico": nombre_tecnico,
        "id_tecnico_2": cita.id_tecnico_2,
        "nombre_tecnico_2": nombre_tecnico_2,
        "id_tecnico_3": cita.id_tecnico_3,
        "nombre_tecnico_3": nombre_tecnico_3,
        "tipo_servicio": tipo_servicio,
        "fecha": fecha.isoformat(),
        "hora": hora,
        "direccion": direccion,
        "estado": cita.estado,
        "entrega": entrega_info,
    }


def _crear_ordenes_instalacion_pedido(
    db: Session,
    pedido: Pedido,
    cliente: Cliente,
    lineas_servicio: list[dict],
) -> list[dict]:
    """Crea las órdenes de instalación para las líneas de servicio del pedido
    una vez el pago está aprobado."""
    creadas = []
    for serv in lineas_servicio:
        orden = _crear_orden_instalacion(db, pedido, cliente, serv)
        if orden:
            creadas.append(orden)
    return creadas


def _tipo_servicio_detalle(db: Session, detalle: DetallePedido) -> str:
    """Resuelve el tipo de servicio de un detalle (id_servicio_d en BD)."""
    if detalle.id_servicio_d:
        fila = db.execute(
            text(
                """
                SELECT LOWER(t.descripcion_tipo)
                FROM servicios s
                JOIN tipos_servicios t ON t.id_tipo_ser = s.id_tipo_ser
                WHERE s.id_servicio = :id
                """
            ),
            {"id": detalle.id_servicio_d},
        ).fetchone()
        if fila and fila[0]:
            for clave in ("instalacion", "mantenimiento", "reparacion", "revision", "soporte"):
                if clave in fila[0]:
                    return clave
    texto = (detalle.descripcion_detalle or "").strip().lower()
    for clave in ("instalacion", "mantenimiento", "reparacion", "revision", "soporte"):
        if clave in texto:
            return clave
    return "servicio"


def _crear_ordenes_instalacion_desde_detalles(
    db: Session,
    pedido: Pedido,
    cliente: Cliente,
) -> list[dict]:
    """Para pedidos confirmados después (pago pendiente→aprobado): genera las
    citas a partir de las líneas de servicio ya guardadas."""
    detalles_servicio = (
        db.query(DetallePedido)
        .filter(
            DetallePedido.id_pedido_d == pedido.id_pedido,
            DetallePedido.id_producto_d.is_(None),
        )
        .all()
    )
    creadas = []
    for d in detalles_servicio:
        if not d.descripcion_detalle:
            continue
        fecha = d.fecha_servicio.date() if d.fecha_servicio else None
        hora = (d.hora_servicio or "").strip() or "08:00"
        direccion = (d.direccion_servicio or "").strip() or (cliente.address or "")
        serv = {
            "tipo_servicio": _tipo_servicio_detalle(db, d),
            "fecha": fecha.isoformat() if fecha else None,
            "hora": hora,
            "direccion": direccion,
        }
        orden = _crear_orden_instalacion(db, pedido, cliente, serv)
        if orden:
            creadas.append(orden)
    return creadas


async def _crear_factura_y_enviar(
    db: Session, pedido: Pedido, pago: Pago, cliente: Cliente
) -> Factura:
    """Crea la factura, genera su PDF en memoria y la envía por correo.

    El PDF NO se guarda en disco. Si el correo falla, el pago NO se marca
    rechazado: solo se registra el error.
    """
    numero_factura = f"FAC-{fecha_bogota().strftime('%Y%m%d')}-{pedido.id_pedido:06d}"
    factura = Factura(
        id_pedido=pedido.id_pedido,
        numero_factura=numero_factura,
        fecha_factura=fecha_bogota(),
        monto_total=pedido.total_pedido or 0,
        metodo_pago=pago.metodo_pago,
        estado_pago=pago.estado,
        numero_transaccion=pago.numero_transaccion,
    )
    db.add(factura)
    db.commit()
    db.refresh(factura)

    detalles = (
        db.query(DetallePedido)
        .filter(DetallePedido.id_pedido_d == pedido.id_pedido)
        .all()
    )
    try:
        pdf_buffer = generar_factura_pdf(factura, pedido, cliente, detalles)
    except Exception as e:
        print(f"Error generando PDF de factura {numero_factura}: {e}")
        return factura

    try:
        enviado = await enviar_factura_por_correo(cliente.email, pdf_buffer)
    except Exception as e:
        enviado = False
        print(f"Error enviando factura {numero_factura} a {cliente.email}: {e}")
    if enviado:
        factura.enviada_por_correo = True
        db.commit()

    return factura


def _programar_envio_correo(correo: str, subject: str, body: str) -> None:
    """Programa el envío de un correo en segundo plano (fire-and-forget).

    El envío (SMTP o API de Brevo) se ejecuta en un hilo (asyncio.to_thread en
    email.py), por lo que programarlo como tarea no retrasa el checkout ni
    bloquea el event loop.
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


def _alertar_admin_stock_agotado(db: Session, agotados: list) -> None:
    """Envía correo a los administradores cuando un producto queda sin stock.

    Solo se avisa una vez por transacción: los productos que llegaron a stock 0
    durante el checkout. Si falla el envío, no se interrumpe el pedido.
    """
    if not agotados:
        return
    from app.models.roles_usuario import RolesUsuario
    from app.models.user import User
    from app.config import settings

    admins = (
        db.query(User)
        .join(RolesUsuario, RolesUsuario.id_rol == User.id_rol_u)
        .filter(RolesUsuario.nombre_rol.in_(["admin", "administrador"]), User.is_active == True)  # noqa: E712
        .all()
    )
    destinatarios = [a.email for a in admins if a.email] or [settings.SMTP_USERNAME]

    filas = "".join(
        f"<tr style='background:{'#ffffff' if i % 2 == 0 else '#faf7f0'}'>"
        f"<td style='padding:10px 12px;border:1px solid #eee;font-size:13px;color:#333'><strong>{p.nombre_producto}</strong></td>"
        f"<td style='padding:10px 12px;border:1px solid #eee;font-size:13px;color:#666'>{p.referencia_producto or '-'}</td>"
        f"<td style='padding:10px 12px;border:1px solid #eee;font-size:13px;color:#c0392b;font-weight:700;text-align:center'>0</td>"
        f"</tr>"
        for i, p in enumerate(agotados)
    )
    subject = "Alerta: productos sin stock en Neodomus"
    body = (
        "<div style='background:#f6f4ef;padding:24px;font-family:Arial,Helvetica,sans-serif'>"
        "<div style='max-width:600px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e8e2d6'>"
        "<div style='background:#3d1212;padding:20px 26px;border-bottom:4px solid #e05c5c'>"
        "<h2 style='margin:0;color:#ffffff;font-size:19px'>Neodomus</h2>"
        "<p style='margin:4px 0 0;color:#ff9b9b;font-size:12px;font-weight:600;letter-spacing:1px'>ALERTA DE STOCK AGOTADO</p></div>"
        "<div style='padding:26px'>"
        "<p style='margin:0 0 8px;color:#333;font-size:14px'>Hola,</p>"
        "<p style='margin:0 0 18px;color:#555;font-size:14px'>Los siguientes productos se <strong>agotaron</strong> tras una compra y ya no son visibles en la tienda:</p>"
        "<table style='border-collapse:collapse;width:100%;font-family:Arial,Helvetica,sans-serif'>"
        "<thead><tr style='background:#1f1a12'>"
        "<th style='padding:10px 12px;border:1px solid #1f1a12;color:#ffffff;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;text-align:left'>Producto</th>"
        "<th style='padding:10px 12px;border:1px solid #1f1a12;color:#ffffff;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;text-align:left'>Referencia</th>"
        "<th style='padding:10px 12px;border:1px solid #1f1a12;color:#ffd98a;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;text-align:center'>Stock</th>"
        "</tr></thead><tbody>"
        f"{filas}"
        "</tbody></table>"
        "<p style='margin:18px 0 0;padding:12px 14px;background:#fdf0ee;border:1px solid #f0c9c2;border-radius:8px;color:#8a2c22;font-size:13px'>"
        "Revisa el catálogo y repón el inventario o solicita reabastecimiento al proveedor.</p>"
        "</div>"
        "<div style='background:#f6f4ef;padding:14px 26px;border-top:1px solid #e8e2d6'>"
        "<p style='margin:0;color:#999;font-size:12px'>Neodomus — Sistema de gestión inteligente.</p>"
        "</div></div></div>"
    )
    for correo in destinatarios:
        _programar_envio_correo(correo, subject, body)


def _asignar_entrega(db: Session, pedido: Pedido, cliente: Cliente) -> dict | None:
    """Asigna un técnico para entregar un pedido de solo productos: la fecha
    de entrega queda entre 1 y 5 días hábiles, en franja de 1 hora, y el día
    del técnico queda ocupado para otros clientes. Notifica al técnico."""
    from app.models.user import User
    from app.services.especialidades import _dia_es_laboral
    from app.services.notificaciones import notificar_entrega_asignada_tecnico

    candidatos = (
        db.query(Tecnico)
        .join(User, User.id_usuario == Tecnico.id_usuario_t)
        .filter(User.is_active == True, User.id_rol_u == 2)  # noqa: E712
        .all()
    )
    hoy = date.today()
    fecha = None
    tecnico = None
    for delta in range(1, 6):
        f = hoy + timedelta(days=delta)
        if not _dia_es_laboral(f):
            continue
        libre = next(
            (t for t in candidatos if not tecnico_ocupado(db, t.id_tecnico, f, "10:00")),
            None,
        )
        if libre is not None:
            fecha, tecnico = f, libre
            break
    if fecha is None or tecnico is None:
        return None

    pedido.fecha_entrega = fecha
    pedido.hora_entrega = "10:00"
    pedido.id_tecnico_entrega = tecnico.id_tecnico
    pedido.nombre_tecnico_entrega = _nombre_tecnico(tecnico)
    pedido.estado_entrega = "Asignada"
    db.commit()

    nombre_cliente = f"{cliente.first_name} {cliente.last_name}".strip() or "Cliente"
    if tecnico.usuario and tecnico.usuario.email:
        notificar_entrega_asignada_tecnico(
            db,
            tecnico.usuario.id_usuario,
            tecnico.usuario.email,
            pedido.nombre_tecnico_entrega or "técnico",
            {
                "pedido": pedido.id_pedido,
                "cliente": nombre_cliente,
                "direccion": (cliente.address or "").strip() or "Por definir",
                "telefono": cliente.telefono_cliente,
                "fecha": fecha.strftime("%d/%m/%Y"),
                "hora": "10:00",
            },
        )

    # Notificar al cliente que su entrega fue programada.
    try:
        from app.services.notificaciones import notificar_entrega_asignada_cliente

        notificar_entrega_asignada_cliente(
            db,
            cliente_id=cliente.id_cliente,
            correo=cliente.email,
            cliente_nombre=nombre_cliente,
            datos={
                "pedido": pedido.id_pedido,
                "fecha": fecha.strftime("%d/%m/%Y"),
                "hora": "10:00",
                "tecnico": pedido.nombre_tecnico_entrega or "técnico",
            },
        )
        db.commit()
    except Exception:
        pass

    return {
        "id_pedido": pedido.id_pedido,
        "fecha_entrega": fecha.isoformat(),
        "hora_entrega": "10:00",
        "id_tecnico": tecnico.id_tecnico,
        "nombre_tecnico": pedido.nombre_tecnico_entrega,
        "telefono_tecnico": tecnico.usuario.telefono_usuario if tecnico.usuario else None,
        "foto_tecnico": tecnico.usuario.foto_url if tecnico.usuario else None,
        "estado_entrega": "Asignada",
    }


async def crear_pedido(
    db: Session,
    cliente: Cliente,
    items: list[dict],
    servicios: list[dict] | None,
    metodo_pago: str,
    datos_pago: dict,
    codigo_cupon: str | None = None,
) -> dict:
    """Crea un pedido con sus detalles y procesa el pago simulado."""
    lineas_producto = _validar_y_preparar_items(db, items)
    # Duración estimada (1-2.5 h) de la instalación según los productos del
    # carrito: se usa para validar que las franjas elegidas alcancen.
    duracion_items = duracion_desde_items(db, items)
    lineas_servicio = _preparar_servicios(db, servicios or [], duracion_items)
    # La calificación del técnico es VOLUNTARIA: ya no bloquea nuevas citas.
    # En su lugar, el scheduler envía recordatorios periódicos al cliente.

    total = round(
        sum(l["subtotal"] for l in lineas_producto)
        + sum(s["precio"] for s in lineas_servicio),
        2,
    )

    # Aplicar cupón de descuento si se proporcionó.
    descuento_cupon = 0.0
    cupon = None
    if codigo_cupon:
        from app.services import novedades_service
        cupon = novedades_service.validar_cupon(db, codigo_cupon, cliente.id_cliente)
        if not cupon:
            raise HTTPException(400, "Cupón no válido o expirado")
        if cupon.compra_minima and total < cupon.compra_minima:
            raise HTTPException(
                400,
                f"El cupón requiere una compra mínima de ${cupon.compra_minima:,.0f}",
            )
        if cupon.tipo_descuento == "porcentaje":
            descuento_cupon = round(total * cupon.valor_descuento / 100, 2)
        else:
            descuento_cupon = min(cupon.valor_descuento, total)
        total = round(total - descuento_cupon, 2)
        cupon.usos_realizados += 1
        db.add(cupon)

    # Procesar pago con el simulador.
    resultado_pago = pagos_service.procesar_pago(
        metodo_pago,
        datos_pago or {},
        monto=total,
        reference=f"NEODOMUS-{cliente.id_cliente}-{int(datetime.now().timestamp())}",
        customer_email=cliente.email,
    )
    estado_pago = resultado_pago["estado"]

    estado_pedido = {
        "aprobado": "Pagado",
        "rechazado": "Pago rechazado",
        "pendiente": "Pago pendiente",
    }.get(estado_pago, "Pago pendiente")

    pedido = Pedido(
        id_cliente_pe=cliente.id_cliente,
        fecha_peedido=datetime.now(),
        total_pedido=total,
        estado_pedido=estado_pedido,
    )
    db.add(pedido)
    db.commit()
    db.refresh(pedido)

    # Detalles de productos.
    agotados: list = []
    for linea in lineas_producto:
        producto = linea["producto"]
        variante = linea.get("variante")
        nombre = normalizar_nombre_producto(producto.nombre_producto)
        descripcion = nombre
        if producto.marca:
            descripcion = f"{nombre} - Marca: {producto.marca}"
        if linea["metros"] is not None:
            descripcion = f"{nombre} - {linea['metros']:g} metros"
        medida_txt = None
        if variante is not None and (variante.ancho_cm or variante.alto_cm or variante.tamaño):
            if variante.ancho_cm and variante.alto_cm:
                medida_txt = f"{variante.ancho_cm} cm por {variante.alto_cm} cm"
            else:
                medida_txt = variante.tamaño
        if linea.get("color"):
            descripcion = f"{descripcion} - Color: {linea['color']}"
        if linea.get("tamaño") or medida_txt:
            descripcion = f"{descripcion} - Medida: {linea.get('tamaño') or medida_txt}"
        detalle = DetallePedido(
            id_pedido_d=pedido.id_pedido,
            id_producto_d=producto.id_producto,
            cantidad_detalle=linea["cantidad"],
            cantidad_metros=linea["metros"],
            precio_unitario_detalle=linea["precio_unitario"],
            subtotal_detalle=linea["subtotal"],
            descripcion_detalle=descripcion,
        )
        db.add(detalle)
        if estado_pago == "aprobado":
            if producto.venta_por_metros and linea["metros"]:
                unidades = linea["metros"]
            else:
                unidades = linea["cantidad"]
            # El stock se descuenta de la VARIANTE si el item la lleva;
            # el stock general del producto también baja por control total.
            resultado = descontar_stock(db, producto, variante, unidades)
            if resultado["producto_agotado"] or resultado["variante_agotada"]:
                agotados.append(producto)

    # Detalles de servicios.
    for serv in lineas_servicio:
        descripcion = serv["nombre"]
        if serv["descripcion"]:
            descripcion = f"{serv['nombre']}\n{serv['descripcion']}"
        fecha = None
        if serv["fecha"]:
            try:
                fecha = datetime.fromisoformat(str(serv["fecha"]))
            except ValueError:
                fecha = None
        detalle = DetallePedido(
            id_pedido_d=pedido.id_pedido,
            id_producto_d=None,
            id_servicio_d=_buscar_servicio_bd(db, serv["tipo_servicio"]),
            cantidad_detalle=1,
            precio_unitario_detalle=serv["precio"],
            subtotal_detalle=serv["precio"],
            descripcion_detalle=descripcion,
            fecha_servicio=fecha,
            hora_servicio=(serv.get("hora") or "").strip() or None,
            direccion_servicio=(cliente.address or "").strip() or None,
        )
        db.add(detalle)

    # Registrar el pago.
    pago = Pago(
        id_pedido=pedido.id_pedido,
        metodo_pago=metodo_pago,
        estado=estado_pago,
        numero_transaccion=resultado_pago.get("numero_transaccion"),
        monto=total,
        banco=resultado_pago.get("banco"),
        titular=resultado_pago.get("titular"),
        ultimos_digitos=resultado_pago.get("ultimos_digitos"),
        correo_paypal=resultado_pago.get("correo_paypal"),
        codigo_punto_pago=resultado_pago.get("codigo_punto_pago"),
        punto_pago=resultado_pago.get("punto_pago"),
        referencia_pago=resultado_pago.get("referencia_pago"),
        fecha_limite_pago=(
            datetime.fromisoformat(resultado_pago["fecha_limite"])
            if resultado_pago.get("fecha_limite")
            else None
        ),
    )
    db.add(pago)
    db.commit()
    db.refresh(pago)

    factura = None
    ordenes_instalacion: list[dict] = []
    entrega: dict | None = None
    if estado_pago == "aprobado":
        factura = await _crear_factura_y_enviar(db, pedido, pago, cliente)
        if lineas_servicio:
            ordenes_instalacion = _crear_ordenes_instalacion_pedido(
                db, pedido, cliente, lineas_servicio
            )
            # El técnico 1 de la instalación queda encargado del despacho.
            for orden in ordenes_instalacion:
                if orden.get("entrega"):
                    entrega = orden["entrega"]
                    break
        elif lineas_producto:
            # Pedido de solo productos: se asigna técnico para la entrega con
            # fecha dentro de los próximos 5 días hábiles.
            entrega = _asignar_entrega(db, pedido, cliente)

    # Notificar al cliente sobre el pedido creado.
    try:
        from app.services.notificaciones import (
            notificar_pedido_creado_cliente,
        )

        nombre_cliente = f"{cliente.first_name} {cliente.last_name}".strip() or "Cliente"
        notificar_pedido_creado_cliente(
            db,
            cliente_id=cliente.id_cliente,
            correo=cliente.email,
            cliente_nombre=nombre_cliente,
            datos={
                "pedido": pedido.id_pedido,
                "total": float(total),
                "estado_pago": estado_pedido,
            },
        )
        db.commit()
    except Exception:
        pass

    # Notificar al administrador por stock agotado en segundo plano
    # (no bloquea el checkout).
    _alertar_admin_stock_agotado(db, agotados)

    return {
        "pedido": pedido,
        "pago": pago,
        "factura": factura,
        "carrito_mantener": estado_pago == "rechazado",
        "ordenes_instalacion": ordenes_instalacion,
        "entrega": entrega,
        "redirect_url": resultado_pago.get("redirect_url"),
    }


async def confirmar_pago_pendiente(db: Session, pedido_id: int, cliente: Cliente) -> dict:
    """Confirma un pago pendiente (punto de pago) y completa la factura."""
    pedido = (
        db.query(Pedido)
        .filter(Pedido.id_pedido == pedido_id, Pedido.id_cliente_pe == cliente.id_cliente)
        .first()
    )
    if not pedido:
        raise HTTPException(status_code=404, detail="Pedido no encontrado")

    pago = db.query(Pago).filter(Pago.id_pedido == pedido.id_pedido).first()
    if not pago:
        raise HTTPException(status_code=404, detail="Pago no encontrado para este pedido")
    if pago.estado == "aprobado":
        factura = (
            db.query(Factura).filter(Factura.id_pedido == pedido.id_pedido).first()
        )
        return {"pedido": pedido, "pago": pago, "factura": factura}

    resultado = pagos_service.confirmar_pago_pendiente(pago)
    pedido.estado_pedido = "Pagado"
    db.commit()
    db.refresh(pago)

    # Descontar stock de los productos del pedido.
    agotados: list = []

    def _variante_por_descripcion(prod, desc: str | None):
        """Recupera la variante (color/medida) desde la descripción guardada."""
        import re as _re

        if not prod or not prod.variantes:
            return None
        m_c = _re.search(r"- Color:\s*([^-|]+)", desc or "")
        m_m = _re.search(r"- Medida:\s*([^-|]+)", desc or "")
        if not m_c:
            return None
        color_txt = m_c.group(1).strip().lower()
        medida_txt = m_m.group(1).strip().lower() if m_m else None
        for v in prod.variantes:
            ok_color = (v.nombre or "").strip().lower() == color_txt
            if not ok_color:
                continue
            if medida_txt is None:
                return v
            etiqueta = (
                f"{v.ancho_cm} cm por {v.alto_cm} cm"
                if (v.ancho_cm and v.alto_cm)
                else (v.tamaño or "").strip()
            ).lower()
            if medida_txt == etiqueta or (v.tamaño or "").strip().lower() == medida_txt:
                return v
        return None

    for detalle in db.query(DetallePedido).filter(DetallePedido.id_pedido_d == pedido.id_pedido):
        if detalle.id_producto_d and detalle.producto:
            if detalle.cantidad_metros:
                descuento = max(int(detalle.cantidad_metros), 1)
            else:
                descuento = max(int(detalle.cantidad_detalle or 1), 1)
            variante = _variante_por_descripcion(detalle.producto, detalle.descripcion_detalle)
            resultado = descontar_stock(db, detalle.producto, variante, descuento)
            if resultado["producto_agotado"]:
                agotados.append(detalle.producto)

    factura = await _crear_factura_y_enviar(db, pedido, pago, cliente)

    # Notificar al cliente que su pago fue confirmado.
    try:
        from app.services.notificaciones import notificar_pago_confirmado_cliente

        nombre_cliente = f"{cliente.first_name} {cliente.last_name}".strip() or "Cliente"
        notificar_pago_confirmado_cliente(
            db,
            cliente_id=cliente.id_cliente,
            correo=cliente.email,
            cliente_nombre=nombre_cliente,
            datos={
                "pedido": pedido.id_pedido,
                "total": float(pedido.total_pedido or 0),
            },
        )
        db.commit()
    except Exception:
        pass

    detalles_servicio = (
        db.query(DetallePedido)
        .filter(
            DetallePedido.id_pedido_d == pedido.id_pedido,
            DetallePedido.id_producto_d.is_(None),
        )
        .count()
    )
    entrega: dict | None = None
    if detalles_servicio:
        ordenes_instalacion = _crear_ordenes_instalacion_desde_detalles(
            db, pedido, cliente
        )
        # El técnico 1 de la instalación queda encargado del despacho.
        for orden in ordenes_instalacion:
            if orden.get("entrega"):
                entrega = orden["entrega"]
                break
    else:
        # Pedido de solo productos confirmado después: asignar entrega.
        ordenes_instalacion = []
        entrega = _asignar_entrega(db, pedido, cliente)

    # Notificar al administrador por stock agotado en segundo plano
    # (no bloquea la confirmación).
    _alertar_admin_stock_agotado(db, agotados)

    return {
        "pedido": pedido,
        "pago": pago,
        "factura": factura,
        "ordenes_instalacion": ordenes_instalacion,
        "entrega": entrega,
    }

