from datetime import date, datetime

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel
from sqlalchemy import or_, select
from sqlalchemy.orm import Session
from typing import List, Optional

from app.database import get_db
from app.models.cliente import Cliente
from app.models.pedido import DetallePedido, Pedido
from app.models.producto import Producto
from app.models.roles_usuario import RolesUsuario
from app.models.tecnico import Tecnico
from app.models.ubicacion_tecnico import UbicacionTecnico
from app.models.user import User
from app.services.pagos_service import BANCOS_COLOMBIANOS, METODOS_PAGO
from app.services import pedidos_service
from app.utils.security import get_current_client, get_current_employee

router = APIRouter(prefix="/pedidos", tags=["Pedidos"])


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


# ── Esquemas de entrada ─────────────────────────────────────────

class ItemCarrito(BaseModel):
    id_producto: int
    cantidad: int = 1
    metros: Optional[float] = None
    color: Optional[str] = None
    id_variante: Optional[int] = None


class ServicioCheckout(BaseModel):
    nombre: str
    tipo_servicio: Optional[str] = None
    descripcion: Optional[str] = None
    fecha: Optional[str] = None
    hora: Optional[str] = None
    direccion: Optional[str] = None
    precio: Optional[float] = None
    id_tecnico: Optional[int] = None
    id_tecnico_2: Optional[int] = None


class DatosPago(BaseModel):
    metodo: str
    numero: Optional[str] = None
    titular: Optional[str] = None
    expiracion: Optional[str] = None
    cvv: Optional[str] = None
    banco: Optional[str] = None
    correo_paypal: Optional[str] = None
    resultado_simulacion: Optional[str] = None
    punto_pago: Optional[str] = None


class CheckoutRequest(BaseModel):
    items: List[ItemCarrito]
    servicios: List[ServicioCheckout] = []
    pago: DatosPago


# ── Helpers de serialización ────────────────────────────────────

def _serializar_pago(pago):
    return {
        "id_pago": pago.id_pago,
        "metodo_pago": METODOS_PAGO.get(pago.metodo_pago, pago.metodo_pago),
        "metodo_pago_codigo": pago.metodo_pago,
        "estado": pago.estado,
        "numero_transaccion": pago.numero_transaccion,
        "monto": pago.monto,
        "banco": pago.banco,
        "titular": pago.titular,
        "ultimos_digitos": pago.ultimos_digitos,
        "correo_paypal": pago.correo_paypal,
        "codigo_punto_pago": pago.codigo_punto_pago,
        "punto_pago": pago.punto_pago,
        "referencia_pago": pago.referencia_pago,
        "fecha_limite": pago.fecha_limite_pago.isoformat() if pago.fecha_limite_pago else None,
    }


def _serializar_detalle(det):
    return {
        "id_detalle": det.id_detalle,
        "id_producto_d": det.id_producto_d,
        "nombre": (det.descripcion_detalle or (det.producto.nombre_producto if det.producto else "Producto")),
        "cantidad": det.cantidad_detalle,
        "metros": det.cantidad_metros,
        "precio_unitario": det.precio_unitario_detalle,
        "subtotal": det.subtotal_detalle,
        "es_servicio": det.id_producto_d is None,
        "fecha_servicio": det.fecha_servicio.isoformat() if det.fecha_servicio else None,
        "hora_servicio": det.hora_servicio,
        "direccion_servicio": det.direccion_servicio,
    }


def _serializar_pedido(pedido, con_detalles=False, db: Session | None = None):
    data = {
        "id_pedido": pedido.id_pedido,
        "fecha": pedido.fecha_peedido.isoformat() if pedido.fecha_peedido else None,
        "total": pedido.total_pedido,
        "estado": pedido.estado_pedido,
        "fecha_entrega": pedido.fecha_entrega.isoformat() if pedido.fecha_entrega else None,
        "hora_entrega": pedido.hora_entrega,
        "hora_entrega_fin": pedido.hora_entrega_fin,
        "id_tecnico_entrega": pedido.id_tecnico_entrega,
        "nombre_tecnico_entrega": pedido.nombre_tecnico_entrega,
        "estado_entrega": pedido.estado_entrega,
        "telefono_tecnico_entrega": (
            pedido.tecnico_entrega.usuario.telefono_usuario if pedido.tecnico_entrega and pedido.tecnico_entrega.usuario else None
        ),
        "foto_tecnico_entrega": (
            pedido.tecnico_entrega.usuario.foto_url if pedido.tecnico_entrega and pedido.tecnico_entrega.usuario else None
        ),
    }
    # Cita de instalación vinculada (si la hay): permite al frontend habilitar
    # la calificación/devolución cuando el servicio quedó Finalizada aunque la
    # entrega física no se haya marcado como 'Entregado'.
    if db is not None:
        from app.services.pedidos_service import cita_de_pedido, pedido_completado

        cita = cita_de_pedido(db, pedido.id_pedido)
        data["cita"] = (
            {"id_cita": cita.id_cita, "estado": cita.estado, "tipo_servicio": cita.tipo_servicio}
            if cita
            else None
        )
        data["productos_calificables"] = pedido_completado(db, pedido)
    if con_detalles:
        data["detalles"] = [_serializar_detalle(d) for d in pedido.detalles]
    return data


# ── Endpoints ───────────────────────────────────────────────────

class RecomendacionRequest(BaseModel):
    items: List[ItemCarrito]
    fecha: Optional[str] = None
    hora: Optional[str] = None


@router.post("/recomendacion-tecnicos")
def recomendacion_tecnicos(
    data: RecomendacionRequest,
    cliente: Cliente = Depends(get_current_client),
    db: Session = Depends(get_db),
):
    """Analiza el carrito y recomienda técnicos según las especializaciones
    requeridas por los productos, la dificultad y el tiempo estimado.
    Requiere cliente autenticado."""
    from datetime import date as _date

    from app.services.recomendacion_service import recomendar_tecnicos

    fecha = None
    if data.fecha:
        try:
            fecha = _date.fromisoformat(str(data.fecha))
        except (TypeError, ValueError):
            fecha = None
    return recomendar_tecnicos(
        db,
        [item.dict() for item in data.items],
        fecha=fecha,
        hora=data.hora,
    )


@router.get("/metodos-pago")
def metodos_pago():
    """Lista los métodos de pago del simulador académico."""
    return {
        "metodos": METODOS_PAGO,
        "bancos": BANCOS_COLOMBIANOS,
        "modo": "simulador",
        "pasarela": None,
        "prueba": True,
    }


@router.post("")
async def checkout(
    data: CheckoutRequest,
    cliente: Cliente = Depends(get_current_client),
    db: Session = Depends(get_db),
):
    """Procesa el checkout: crea pedido, procesa pago con el simulador
    y genera factura."""
    result = await pedidos_service.crear_pedido(
        db,
        cliente,
        [i.model_dump() for i in data.items],
        [s.model_dump() for s in data.servicios],
        data.pago.metodo,
        data.pago.model_dump(exclude={"metodo"}),
    )
    pedido = result["pedido"]
    pago = result["pago"]
    factura = result["factura"]

    return {
        "pedido": _serializar_pedido(pedido, con_detalles=True, db=db),
        "pago": _serializar_pago(pago),
        "factura": (
            {
                "id_factura": factura.id_factura,
                "numero_factura": factura.numero_factura,
                "monto_total": factura.monto_total,
                "enviada_por_correo": factura.enviada_por_correo,
            }
            if factura
            else None
        ),
        "carrito_mantener": result["carrito_mantener"],
        "pdf_url": (
            f"/api/v1/pedidos/{pedido.id_pedido}/factura"
            if factura
            else None
        ),
        "ordenes_instalacion": result.get("ordenes_instalacion", []),
        "redirect_url": result.get("redirect_url"),
        "entrega": result.get("entrega"),
    }


@router.get("/mis-pedidos")
def mis_pedidos(
    cliente: Cliente = Depends(get_current_client),
    db: Session = Depends(get_db),
):
    """Lista los pedidos del cliente autenticado."""
    from app.models.factura import Factura
    from app.models.pago import Pago

    pedidos = (
        db.query(Pedido)
        .filter(Pedido.id_cliente_pe == cliente.id_cliente)
        .order_by(Pedido.id_pedido.desc())
        .all()
    )
    pagos = {p.id_pedido: p for p in db.query(Pago).filter(Pago.id_pedido.isnot(None)).all()}
    facturas = {f.id_pedido: f for f in db.query(Factura).filter(Factura.id_pedido.isnot(None)).all()}

    resultado = []
    for p in pedidos:
        data = _serializar_pedido(p, con_detalles=True, db=db)
        pago = pagos.get(p.id_pedido)
        factura = facturas.get(p.id_pedido)
        data["pago"] = _serializar_pago(pago) if pago else None
        data["factura"] = (
            {
                "id_factura": factura.id_factura,
                "numero_factura": factura.numero_factura,
                "monto_total": factura.monto_total,
                "enviada_por_correo": factura.enviada_por_correo,
                "pdf_url": (
                    f"/api/v1/pedidos/{p.id_pedido}/factura"
                    if factura
                    else None
                ),
            }
            if factura
            else None
        )
        resultado.append(data)
    return resultado


@router.get("/all-admin")
def listar_pedidos_admin(
    _admin_user: User = Depends(_admin),
    db: Session = Depends(get_db),
):
    """Lista todos los pedidos del sistema con datos del cliente (solo empleados/admin)."""
    pedidos = db.query(Pedido).order_by(Pedido.id_pedido.desc()).limit(100).all()
    clientes = {c.id_cliente: c for c in db.query(Cliente).all()}
    resultado = []
    for p in pedidos:
        cliente = clientes.get(p.id_cliente_pe)
        resultado.append({
            "id_pedido": p.id_pedido,
            "fecha_pedido": p.fecha_peedido.isoformat() if p.fecha_peedido else None,
            "total": p.total_pedido,
            "estado": p.estado_pedido,
            "cliente_nombre": (
                f"{cliente.first_name} {cliente.last_name}".strip()
                if cliente else None
            ),
            "cliente_email": cliente.email if cliente else None,
            "estado_entrega": p.estado_entrega,
            "fecha_entrega": p.fecha_entrega.isoformat() if p.fecha_entrega else None,
            "hora_entrega": p.hora_entrega,
            # Técnico 1 / encargado de la entrega del pedido.
            "id_tecnico_entrega": p.id_tecnico_entrega,
            "nombre_tecnico_entrega": p.nombre_tecnico_entrega,
        })
    return resultado


@router.get("/admin/entregas")
def listar_entregas_admin(
    _admin_user: User = Depends(_admin),
    db: Session = Depends(get_db),
):
    """Todas las entregas (pedidos con fecha de entrega o estado de entrega):
    permite ver cuáles no tienen técnico asignado y reasignarlas."""
    pedidos = (
        db.query(Pedido)
        .filter(or_(Pedido.fecha_entrega.isnot(None), Pedido.estado_entrega.isnot(None)))
        .order_by(Pedido.fecha_entrega.desc(), Pedido.id_pedido.desc())
        .limit(100)
        .all()
    )
    clientes = {c.id_cliente: c for c in db.query(Cliente).all()}
    tecnicos = {t.id_tecnico: t for t in db.query(Tecnico).all()}
    ids_pedidos = [p.id_pedido for p in pedidos]
    detalles = (
        db.query(DetallePedido)
        .filter(DetallePedido.id_pedido_d.in_(ids_pedidos), DetallePedido.id_producto_d.isnot(None))
        .all()
        if ids_pedidos
        else []
    )
    productos = {p.id_producto: p for p in db.query(Producto).all()}
    productos_por_pedido: dict[int, list[str]] = {}
    for d in detalles:
        nombre = (
            d.descripcion_detalle
            or (
                productos[d.id_producto_d].nombre_producto
                if d.id_producto_d in productos
                else f"Producto #{d.id_producto_d}"
            )
        )
        productos_por_pedido.setdefault(d.id_pedido_d, []).append(nombre)

    return [
        {
            "id_pedido": p.id_pedido,
            "cliente": (
                f"{clientes[p.id_cliente_pe].first_name} {clientes[p.id_cliente_pe].last_name}".strip()
                if p.id_cliente_pe in clientes
                else None
            ),
            "direccion": (
                (clientes[p.id_cliente_pe].address or "").strip()
                if p.id_cliente_pe in clientes
                else None
            ),
            "telefono": (
                clientes[p.id_cliente_pe].telefono_cliente
                if p.id_cliente_pe in clientes
                else None
            ),
            "fecha_entrega": p.fecha_entrega.isoformat() if p.fecha_entrega else None,
            "hora_entrega": p.hora_entrega,
            "estado_entrega": p.estado_entrega,
            "entrega_actualizada_en": (
                p.entrega_actualizada_en.isoformat() if p.entrega_actualizada_en else None
            ),
            "id_tecnico_entrega": p.id_tecnico_entrega,
            "nombre_tecnico": p.nombre_tecnico_entrega,
            "productos": productos_por_pedido.get(p.id_pedido, []),
        }
        for p in pedidos
    ]


@router.get("/admin/horarios-disponibles")
def horarios_disponibles_entrega(
    fecha: date,
    tecnico_id: Optional[int] = None,
    _admin_user: User = Depends(_admin),
    db: Session = Depends(get_db),
):
    """Horarios disponibles para entrega en la fecha indicada.
    Filtra franjas pasadas si es hoy y valida disponibilidad del técnico."""
    from datetime import timedelta
    from app.services.especialidades import (
        _dia_es_laboral,
        tecnico_libre_en_rango,
        HORA_INICIO,
        HORA_FIN,
    )

    hoy = date.today()
    ahora = datetime.now()

    if not _dia_es_laboral(fecha) or fecha < hoy:
        return []

    # Franjas de entrega: cada 3 horas desde las 8 hasta las 17
    paso = 3
    todas = [f"{h:02d}:00" for h in range(HORA_INICIO, HORA_FIN, paso)]

    disponibles = []
    for h in todas:
        # Si es hoy, descartar horarios que ya pasaron
        if fecha == hoy:
            partes = h.split(":")
            h_min = int(partes[0]) * 60 + int(partes[1])
            ahora_min = ahora.hour * 60 + ahora.minute
            if h_min <= ahora_min:
                continue

        # Si se especifica técnico, validar que esté libre
        if tecnico_id is not None:
            libre = tecnico_libre_en_rango(db, tecnico_id, fecha, h, excluir_pedido_id=None)
            if not libre:
                continue

        disponibles.append(h)

    return disponibles


class EntregaAsignarRequest(BaseModel):
    id_tecnico: Optional[int] = None
    fecha_entrega: Optional[date] = None
    hora_entrega: Optional[str] = None
    hora_entrega_fin: Optional[str] = None


@router.put("/admin/{pedido_id}/entrega")
def asignar_entrega_admin(
    pedido_id: int,
    data: EntregaAsignarRequest,
    admin_user: User = Depends(_admin),
    db: Session = Depends(get_db),
):
    """Asigna o reasigna el técnico responsable de entregar un pedido.
    Con id_tecnico null deja la entrega sin técnico (estado Pendiente)."""
    pedido = db.query(Pedido).filter(Pedido.id_pedido == pedido_id).first()
    if not pedido:
        raise HTTPException(status_code=404, detail="Pedido no encontrado")

    from app.services.notificaciones import (
        crear_notificacion,
        notificar_entrega_asignada_tecnico,
        notificar_entrega_programada_cliente,
    )

    cliente = (
        db.query(Cliente).filter(Cliente.id_cliente == pedido.id_cliente_pe).first()
    )

    if data.id_tecnico is None:
        anterior = pedido.nombre_tecnico_entrega
        pedido.id_tecnico_entrega = None
        pedido.nombre_tecnico_entrega = None
        pedido.estado_entrega = "Pendiente"
        pedido.entrega_actualizada_en = datetime.now()
        db.commit()

        # Notificar al cliente que se removió el técnico de entrega.
        if cliente:
            try:
                from app.services.notificaciones import notificar_entrega_desasignada_cliente

                nombre_cliente = f"{cliente.first_name} {cliente.last_name}".strip() or "Cliente"
                notificar_entrega_desasignada_cliente(
                    db,
                    cliente_id=cliente.id_cliente,
                    correo=cliente.email,
                    cliente_nombre=nombre_cliente,
                    pedido_id=pedido.id_pedido,
                )
                db.commit()
            except Exception:
                pass

        return {
            "id_pedido": pedido.id_pedido,
            "estado_entrega": pedido.estado_entrega,
            "nombre_tecnico": None,
            "mensaje": f"Entrega del pedido #{pedido_id} sin técnico (antes: {anterior or '—'})",
        }

    tecnico = (
        db.query(Tecnico)
        .join(User, User.id_usuario == Tecnico.id_usuario_t)
        .filter(
            Tecnico.id_tecnico == data.id_tecnico,
            User.is_active == True,  # noqa: E712
        )
        .first()
    )
    if not tecnico:
        raise HTTPException(status_code=404, detail="Técnico no encontrado o inactivo")

    # Actualización opcional de fecha/rango de entrega.
    rango_cambiado = False
    if data.fecha_entrega is not None:
        from app.services.especialidades import _dia_es_laboral

        if not _dia_es_laboral(data.fecha_entrega):
            raise HTTPException(
                status_code=400,
                detail="Las entregas solo se programan de lunes a sábado",
            )
        # No permitir fechas pasadas
        if data.fecha_entrega < date.today():
            raise HTTPException(
                status_code=400,
                detail="No es posible programar una entrega en una fecha pasada",
            )
        # Si es hoy, validar que la hora no haya pasado
        if data.fecha_entrega == date.today() and data.hora_entrega:
            ahora = datetime.now()
            partes = data.hora_entrega.split(":")
            hora_sel = int(partes[0])
            min_sel = int(partes[1]) if len(partes) > 1 else 0
            if hora_sel < ahora.hour or (hora_sel == ahora.hour and min_sel <= ahora.minute):
                raise HTTPException(
                    status_code=400,
                    detail="El horario seleccionado ya pasó. Seleccione un horario disponible",
                )
        rango_cambiado = pedido.fecha_entrega != data.fecha_entrega
        pedido.fecha_entrega = data.fecha_entrega
    if data.hora_entrega is not None:
        rango_cambiado = rango_cambiado or pedido.hora_entrega != data.hora_entrega
        pedido.hora_entrega = data.hora_entrega
    if data.hora_entrega_fin is not None:
        rango_cambiado = (
            rango_cambiado or (pedido.hora_entrega_fin or "") != data.hora_entrega_fin
        )
        pedido.hora_entrega_fin = data.hora_entrega_fin

    # Validar que el técnico esté libre dentro del rango de la entrega.
    if pedido.fecha_entrega is not None:
        from app.services.especialidades import tecnico_libre_en_rango

        libre = tecnico_libre_en_rango(
            db,
            tecnico.id_tecnico,
            pedido.fecha_entrega,
            pedido.hora_entrega or "10:00",
            pedido.hora_entrega_fin,
            excluir_pedido_id=pedido.id_pedido,
        )
        if not libre:
            db.rollback()
            raise HTTPException(
                status_code=409,
                detail=(
                    "El técnico ya tiene una cita o entrega que se cruza con el "
                    "rango de entrega indicado"
                ),
            )

    pedido.id_tecnico_entrega = tecnico.id_tecnico
    pedido.nombre_tecnico_entrega = (
        f"{tecnico.usuario.first_name} {tecnico.usuario.last_name}".strip()
        if tecnico.usuario
        else "Técnico"
    )
    if pedido.estado_entrega != "En camino":
        pedido.estado_entrega = "Asignada"
    pedido.entrega_actualizada_en = datetime.now()
    db.commit()

    fecha_txt = (
        pedido.fecha_entrega.strftime("%d/%m/%Y") if pedido.fecha_entrega else "-"
    )
    hora_txt = (
        f"{pedido.hora_entrega or '-'} - {pedido.hora_entrega_fin}"
        if pedido.hora_entrega_fin
        else (pedido.hora_entrega or "-")
    )

    # Notificar al técnico asignado.
    if tecnico.usuario and tecnico.usuario.email:
        notificar_entrega_asignada_tecnico(
            db,
            tecnico.usuario.id_usuario,
            tecnico.usuario.email,
            pedido.nombre_tecnico_entrega or "técnico",
            {
                "pedido": pedido.id_pedido,
                "cliente": (
                    f"{cliente.first_name} {cliente.last_name}".strip() if cliente else "Cliente"
                ),
                "direccion": ((cliente.address or "").strip() if cliente else "") or "Por definir",
                "telefono": cliente.telefono_cliente if cliente else None,
                "fecha": fecha_txt,
                "hora": hora_txt,
            },
        )

    # Notificar al cliente sobre la entrega programada.
    if cliente:
        datos_cliente = {
            "pedido": pedido.id_pedido,
            "fecha": fecha_txt,
            "hora": hora_txt,
            "tecnico": pedido.nombre_tecnico_entrega or "técnico",
        }
        crear_notificacion(
            db,
            id_usuario=None,
            id_cliente=cliente.id_cliente,
            tipo="entrega",
            titulo="Rango de entrega actualizado" if rango_cambiado else "Entrega asignada a un técnico",
            mensaje=(
                f"Tu pedido #{pedido.id_pedido} será entregado el {fecha_txt} "
                f"en la franja {hora_txt} por {datos_cliente['tecnico']}."
            ),
        )
        if cliente.email:
            notificar_entrega_programada_cliente(
                db,
                cliente.id_cliente,
                cliente.email,
                f"{cliente.first_name} {cliente.last_name}".strip() or "Cliente",
                datos_cliente,
            )

    return {
        "id_pedido": pedido.id_pedido,
        "estado_entrega": pedido.estado_entrega,
        "id_tecnico_entrega": pedido.id_tecnico_entrega,
        "nombre_tecnico": pedido.nombre_tecnico_entrega,
    }


@router.get("/admin/facturas")
def listar_facturas_admin(
    admin_user: User = Depends(_admin),
    db: Session = Depends(get_db),
):
    """Lista todas las facturas generadas (pedidos y citas) para el admin."""
    from app.models.factura import Factura

    facturas = db.query(Factura).order_by(Factura.created_at.desc()).all()
    resultado = []
    for f in facturas:
        cliente = None
        pedido_info = None
        cita_info = None

        if f.pedido:
            cliente = (
                db.query(Cliente)
                .filter(Cliente.id_cliente == f.pedido.id_cliente_pe)
                .first()
            )
            pedido_info = {
                "id_pedido": f.pedido.id_pedido,
                "total": f.pedido.total_pedido,
                "estado": f.pedido.estado_pedido,
            }
        elif f.cita:
            cliente = (
                db.query(Cliente)
                .filter(Cliente.id_cliente == f.cita.id_cliente_c)
                .first()
            )
            cita_info = {
                "id_cita": f.cita.id_cita,
                "tipo_servicio": f.cita.tipo_servicio,
                "fecha": f.cita.fecha.isoformat() if f.cita.fecha else None,
                "costo": f.cita.costo_cita,
            }

        nombre_cliente = ""
        if cliente:
            nombre_cliente = f"{cliente.first_name} {cliente.last_name}".strip()

        resultado.append({
            "id_factura": f.id_factura,
            "numero_factura": f.numero_factura,
            "fecha_factura": f.fecha_factura.isoformat() if f.fecha_factura else None,
            "monto_total": f.monto_total,
            "metodo_pago": f.metodo_pago,
            "estado_pago": f.estado_pago,
            "enviada_por_correo": f.enviada_por_correo,
            "nombre_cliente": nombre_cliente,
            "email_cliente": cliente.email if cliente else None,
            "pedido": pedido_info,
            "cita": cita_info,
            "pdf_url": f"/api/v1/pedidos/{f.pedido.id_pedido}/factura" if f.id_pedido else None,
        })

    return resultado


@router.get("/{pedido_id}/seguimiento")
def seguimiento_pedido(
    pedido_id: int,
    cliente: Cliente = Depends(get_current_client),
    db: Session = Depends(get_db),
):
    """Rastreo del pedido para el cliente: línea de progreso, datos del
    técnico y ubicación GPS real (solo mientras esté En camino)."""
    pedido = (
        db.query(Pedido)
        .filter(Pedido.id_pedido == pedido_id, Pedido.id_cliente_pe == cliente.id_cliente)
        .first()
    )
    if not pedido:
        raise HTTPException(status_code=404, detail="Pedido no encontrado")

    from app.services.especialidades import auto_en_camino

    # Regla automática: faltan 5 min para cumplirse las 3 h → En camino.
    auto_en_camino(db, pedido)

    estado_entrega = pedido.estado_entrega
    confirmado = bool(pedido.estado_pedido and pedido.estado_pedido.lower().startswith("pag"))
    asignado = pedido.id_tecnico_entrega is not None
    recogido = estado_entrega in ("Recogido", "En camino", "Entregado")
    en_camino = estado_entrega == "En camino"
    entregado = estado_entrega == "Entregado"
    pasos = [
        {"paso": "Confirmado", "completado": confirmado},
        {"paso": "Asignado", "completado": asignado},
        {"paso": "Recogido", "completado": recogido},
        {"paso": "En camino", "completado": en_camino or entregado},
        {"paso": "Entregado", "completado": entregado},
    ]

    tecnico_data = None
    if pedido.tecnico_entrega and pedido.tecnico_entrega.usuario:
        u = pedido.tecnico_entrega.usuario
        tecnico_data = {
            "nombre": pedido.nombre_tecnico_entrega,
            "telefono": u.telefono_usuario,
            "foto": u.foto_url,
        }

    ubicacion_data = None
    if en_camino and pedido.id_tecnico_entrega is not None:
        ub = (
            db.query(UbicacionTecnico)
            .filter(UbicacionTecnico.id_tecnico_ut == pedido.id_tecnico_entrega)
            .first()
        )
        if ub:
            ubicacion_data = {
                "latitud": ub.latitud,
                "longitud": ub.longitud,
                "actualizado_en": (
                    ub.actualizado_en.isoformat() if ub.actualizado_en else None
                ),
            }

    return {
        "id_pedido": pedido.id_pedido,
        "estado_pedido": pedido.estado_pedido,
        "estado_entrega": estado_entrega,
        "pasos": pasos,
        "fecha_entrega": pedido.fecha_entrega.isoformat() if pedido.fecha_entrega else None,
        "hora_entrega": pedido.hora_entrega,
        "hora_entrega_fin": pedido.hora_entrega_fin,
        "evidencia_entrega_url": pedido.evidencia_entrega_url,
        "rango_entrega": (
            f"{pedido.hora_entrega or '10:00'} - {pedido.hora_entrega_fin}"
            if pedido.hora_entrega_fin
            else (pedido.hora_entrega or None)
        ),
        "tecnico": tecnico_data,
        "ubicacion": ubicacion_data,
        "entrega_actualizada_en": (
            pedido.entrega_actualizada_en.isoformat()
            if pedido.entrega_actualizada_en
            else None
        ),
    }


@router.get("/{pedido_id}")
def detalle_pedido(
    pedido_id: int,
    cliente: Cliente = Depends(get_current_client),
    db: Session = Depends(get_db),
):
    """Detalle de un pedido propio del cliente."""
    pedido = (
        db.query(Pedido)
        .filter(Pedido.id_pedido == pedido_id, Pedido.id_cliente_pe == cliente.id_cliente)
        .first()
    )
    if not pedido:
        raise HTTPException(status_code=404, detail="Pedido no encontrado")
    return _serializar_pedido(pedido, con_detalles=True, db=db)


@router.get("/{pedido_id}/factura")
def descargar_factura(
    pedido_id: int,
    cliente: Cliente = Depends(get_current_client),
    db: Session = Depends(get_db),
):
    """Genera y descarga el PDF de la factura de un pedido aprobado en tiempo real."""
    pedido = (
        db.query(Pedido)
        .filter(Pedido.id_pedido == pedido_id, Pedido.id_cliente_pe == cliente.id_cliente)
        .first()
    )
    if not pedido:
        raise HTTPException(status_code=404, detail="Pedido no encontrado")

    from app.models.factura import Factura

    factura = db.query(Factura).filter(Factura.id_pedido == pedido.id_pedido).first()
    if not factura:
        raise HTTPException(status_code=404, detail="La factura aún no está disponible")

    detalles = (
        db.query(DetallePedido)
        .filter(DetallePedido.id_pedido_d == pedido.id_pedido)
        .all()
    )

    from app.services.factura_service import generar_factura_pdf

    try:
        pdf_buffer = generar_factura_pdf(factura, pedido, cliente, detalles)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generando la factura: {e}")

    return StreamingResponse(
        pdf_buffer,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="factura_{factura.numero_factura}.pdf"'
        },
    )


@router.get("/admin/{pedido_id}/factura")
def descargar_factura_admin(
    pedido_id: int,
    admin_user: User = Depends(_admin),
    db: Session = Depends(get_db),
):
    """Genera y descarga el PDF de la factura de un pedido (solo admin)."""
    pedido = (
        db.query(Pedido)
        .filter(Pedido.id_pedido == pedido_id)
        .first()
    )
    if not pedido:
        raise HTTPException(status_code=404, detail="Pedido no encontrado")

    cliente = db.query(Cliente).get(pedido.id_cliente_pe)

    from app.models.factura import Factura

    factura = db.query(Factura).filter(Factura.id_pedido == pedido.id_pedido).first()
    if not factura:
        raise HTTPException(status_code=404, detail="La factura aún no está disponible")

    detalles = (
        db.query(DetallePedido)
        .filter(DetallePedido.id_pedido_d == pedido.id_pedido)
        .all()
    )

    from app.services.factura_service import generar_factura_pdf

    try:
        pdf_buffer = generar_factura_pdf(factura, pedido, cliente, detalles)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generando la factura: {e}")

    return StreamingResponse(
        pdf_buffer,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="factura_{factura.numero_factura}.pdf"'
        },
    )


@router.post("/{pedido_id}/confirmar-pago")
async def confirmar_pago(
    pedido_id: int,
    cliente: Cliente = Depends(get_current_client),
    db: Session = Depends(get_db),
):
    """Confirma un pago pendiente (ej. punto de pago Efecty) y genera la factura."""
    result = await pedidos_service.confirmar_pago_pendiente(db, pedido_id, cliente)
    pedido = result["pedido"]
    pago = result["pago"]
    factura = result["factura"]
    return {
        "pedido": _serializar_pedido(pedido, db=db),
        "pago": _serializar_pago(pago),
        "factura": (
            {
                "id_factura": factura.id_factura,
                "numero_factura": factura.numero_factura,
                "monto_total": factura.monto_total,
                "enviada_por_correo": factura.enviada_por_correo,
            }
            if factura
            else None
        ),
        "pdf_url": f"/api/v1/pedidos/{pedido.id_pedido}/factura" if factura else None,
        "ordenes_instalacion": result.get("ordenes_instalacion", []),
        "entrega": result.get("entrega"),
    }
