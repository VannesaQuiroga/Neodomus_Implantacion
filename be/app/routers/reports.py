# Rutas de reports. Las dependencias declaradas en cada endpoint determinan sus permisos de acceso.
from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import case, func, or_, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.cita import Cita
from app.models.cliente import Cliente
from app.models.otros import Comision
from app.models.pago import Pago
from app.models.pedido import DetallePedido, Pedido
from app.models.producto import Producto
from app.models.roles_usuario import RolesUsuario
from app.models.solicitud_cuenta import SolicitudCuenta
from app.models.tarifa_servicio import TarifaServicio
from app.models.tecnico import Tecnico
from app.models.user import User
from app.services.reportes_service import (
    generar_citas_pdf,
    generar_reporte_completo_pdf,
    generar_ventas_pdf,
)
from app.utils.security import get_current_employee

router = APIRouter(prefix="/reports", tags=["Reportes"])


# Valida las condiciones de esta operación y devuelve un error HTTP si no se cumplen.
def _admin(
    current_user: User = Depends(get_current_employee),
    db: Session = Depends(get_db),
) -> User:
    role = db.execute(select(RolesUsuario.nombre_rol).where(RolesUsuario.id_rol == current_user.id_rol_u)).scalar_one_or_none()
    if role not in ("admin", "administrador"):
        raise HTTPException(status_code=403, detail="Permisos insuficientes")
    return current_user


@router.get("/operativo")
def operativo_admin(
    _admin_user: User = Depends(_admin),
    db: Session = Depends(get_db),
):
    """Métricas operativas de citas/entregas/técnicos para el dashboard del
    administrador (solo admin)."""
    from datetime import date as _date

    from app.models.especializacion import (
        Especializacion,
        HistorialCita,
        Reembolso,
    )
    from app.services.especialidades import (
        ESTADOS_ENTREGA_OCUPAN,
        ESTADOS_OCUPAN,
        especializaciones_de_productos,
        especializaciones_de_tecnico,
    )

    hoy = _date.today()

    # ── Citas ───────────────────────────────────────────
    citas_pendientes_asignacion = (
        db.query(Cita)
        .filter(
            Cita.estado.in_(ESTADOS_OCUPAN),
            Cita.id_tecnico.is_(None),
        )
        .count()
    )
    citas_reprogramadas = (
        db.query(HistorialCita)
        .filter(HistorialCita.accion == "reprogramacion")
        .count()
    )
    citas_canceladas = db.query(Cita).filter(Cita.estado == "Cancelada").count()

    ids_tecnicos_inactivos = {
        t.id_tecnico
        for t in db.query(Tecnico).join(User, User.id_usuario == Tecnico.id_usuario_t).all()
        if not (t.usuario and t.usuario.is_active)
    }
    problemas = (
        db.query(Cita)
        .filter(
            Cita.fecha >= hoy,
            Cita.estado.in_(ESTADOS_OCUPAN),
            or_(
                Cita.id_tecnico.is_(None),
                Cita.id_tecnico.in_(ids_tecnicos_inactivos) if ids_tecnicos_inactivos else False,
            ),
        )
        .count()
    )

    # ── Técnicos hoy ────────────────────────────────────
    tecnicos_activos = (
        db.query(Tecnico)
        .join(User, User.id_usuario == Tecnico.id_usuario_t)
        .filter(User.is_active == True, User.id_rol_u == 2)  # noqa: E712
        .all()
    )
    ocupados_ids = set()

    def _ocupado_hoy(id_tecnico: int) -> bool:
        cita_hoy = (
            db.query(Cita)
            .filter(
                Cita.fecha == hoy,
                Cita.estado.in_(ESTADOS_OCUPAN),
                (Cita.id_tecnico == id_tecnico) | (Cita.id_tecnico_2 == id_tecnico),
            )
            .first()
        )
        if cita_hoy:
            return True
        entrega_hoy = (
            db.query(Pedido)
            .filter(
                Pedido.fecha_entrega == hoy,
                Pedido.estado_entrega.in_(ESTADOS_ENTREGA_OCUPAN),
                Pedido.id_tecnico_entrega == id_tecnico,
            )
            .first()
        )
        return entrega_hoy is not None

    for t in tecnicos_activos:
        if _ocupado_hoy(t.id_tecnico):
            ocupados_ids.add(t.id_tecnico)

    # ── Reembolsos pendientes (citas y pedidos) ──────────
    reembolsos_pendientes = (
        db.query(Reembolso)
        .filter(Reembolso.estado.in_(("Pendiente", "Procesando")))
        .count()
    )

    # ── Entregas ────────────────────────────────────────
    entregas_sin_tecnico = (
        db.query(Pedido)
        .filter(
            Pedido.estado_entrega == "Pendiente",
            Pedido.id_tecnico_entrega.is_(None),
        )
        .count()
    )
    entregas_asignadas = (
        db.query(Pedido).filter(Pedido.estado_entrega == "Asignada").count()
    )

    entregas_alternativas = 0
    entregas_activas = (
        db.query(Pedido)
        .filter(
            Pedido.fecha_entrega >= hoy,
            Pedido.estado_entrega.in_(ESTADOS_ENTREGA_OCUPAN),
        )
        .all()
    )
    for p in entregas_activas:
        productos = [d.producto for d in (p.detalles or []) if d.producto is not None]
        requeridas = set(especializaciones_de_productos(productos))
        tecnico_p = next(
            (t for t in tecnicos_activos if t.id_tecnico == p.id_tecnico_entrega), None
        )
        if requeridas and tecnico_p and not requeridas.issubset(set(especializaciones_de_tecnico(tecnico_p))):
            entregas_alternativas += 1

    return {
        "citas_pendientes_asignacion": citas_pendientes_asignacion,
        "citas_reprogramadas": citas_reprogramadas,
        "citas_canceladas": citas_canceladas,
        "citas_problemas_disponibilidad": problemas,
        "tecnicos_disponibles_hoy": len(tecnicos_activos) - len(ocupados_ids),
        "tecnicos_ocupados_hoy": len(ocupados_ids),
        "reembolsos_pendientes_citas": reembolsos_pendientes,
        "entregas_sin_tecnico": entregas_sin_tecnico,
        "entregas_asignadas": entregas_asignadas,
        "entregas_con_tecnico_alternativo": entregas_alternativas,
    }


# ── Helpers de fecha ──────────────────────────────────────────────

_PERIODOS = {"dia", "semana", "mes", "anio"}


def _resolver_rango(
    periodo: str,
    fecha_inicio: Optional[date],
    fecha_fin: Optional[date],
) -> tuple[date, date]:
    """Devuelve (inicio, fin) según el periodo si el usuario no los definió."""
    hoy = date.today()
    if fecha_inicio and fecha_fin:
        return fecha_inicio, fecha_fin
    if periodo == "dia":
        return hoy, hoy
    if periodo == "semana":
        inicio = hoy - timedelta(days=hoy.weekday())
        fin = inicio + timedelta(days=6)
        return inicio, fin
    if periodo == "mes":
        inicio = hoy.replace(day=1)
        if hoy.month == 12:
            fin = hoy.replace(day=31)
        else:
            fin = hoy.replace(month=hoy.month + 1, day=1) - timedelta(days=1)
        return inicio, fin
    # anio
    return hoy.replace(month=1, day=1), hoy.replace(month=12, day=31)


def _group_expr(periodo: str, columna):
    """Expresión SQL de agrupación según el periodo."""
    if periodo == "dia":
        return func.date(columna)
    if periodo == "semana":
        return func.yearweek(columna)
    if periodo == "mes":
        return func.date_format(columna, "%Y-%m")
    return func.year(columna)


def _group_label(periodo: str) -> str:
    """Nombre legible del campo de agrupación."""
    return {"dia": "dia", "semana": "semana", "mes": "mes", "anio": "anio"}[periodo]


def _tecnico_ids(db: Session, id_tecnico: int) -> list[int]:
    """Devuelve los IDs de técnico que coinciden (id_tecnico directo)."""
    return [id_tecnico]


@router.get("/resumen")
def resumen_admin(
    fecha_inicio: Optional[date] = None,
    fecha_fin: Optional[date] = None,
    _admin_user: User = Depends(_admin),
    db: Session = Depends(get_db),
):
    """Resumen de métricas reales del sistema (solo admin).
    Si se indican fecha_inicio y fecha_fin, las métricas dependientes de la
    fecha se calculan únicamente dentro de ese rango."""
    if (fecha_inicio is None) != (fecha_fin is None):
        raise HTTPException(status_code=400, detail="Debes indicar la fecha de inicio y la fecha de fin")
    if fecha_inicio and fecha_fin and fecha_fin < fecha_inicio:
        raise HTTPException(status_code=400, detail="La fecha final no puede ser anterior a la fecha inicial")

    filtro_pedidos = ()
    filtro_citas = ()
    filtro_clientes = ()
    if fecha_inicio and fecha_fin:
        filtro_pedidos = (
            func.date(Pedido.fecha_peedido) >= fecha_inicio,
            func.date(Pedido.fecha_peedido) <= fecha_fin,
        )
        filtro_citas = (
            Cita.fecha >= fecha_inicio,
            Cita.fecha <= fecha_fin,
        )
        filtro_clientes = (
            func.date(Cliente.created_at) >= fecha_inicio,
            func.date(Cliente.created_at) <= fecha_fin,
        )

    # ── Ventas y pedidos ────────────────────────────────
    q_pedidos_data = db.query(
        func.date_format(Pedido.fecha_peedido, "%Y-%m").label("mes"),
        func.count(Pedido.id_pedido).label("cantidad"),
        func.coalesce(func.sum(Pedido.total_pedido), 0).label("ventas"),
    ).filter(Pedido.fecha_peedido.isnot(None), Pedido.estado_pedido != 'Entregado')
    if filtro_pedidos:
        q_pedidos_data = q_pedidos_data.filter(*filtro_pedidos)
    pedidos_data = q_pedidos_data.group_by("mes").order_by("mes").all()

    q_ventas_total = db.query(func.coalesce(func.sum(Pedido.total_pedido), 0)).filter(Pedido.estado_pedido != 'Entregado')
    q_pedidos_total = db.query(func.count(Pedido.id_pedido)).filter(Pedido.estado_pedido != 'Entregado')
    if filtro_pedidos:
        q_ventas_total = q_ventas_total.filter(*filtro_pedidos)
        q_pedidos_total = q_pedidos_total.filter(*filtro_pedidos)
    ventas_total = q_ventas_total.scalar() or 0
    pedidos_total = q_pedidos_total.scalar() or 0

    # ── Productos más vendidos ──────────────────────────
    q_top = (
        db.query(
            Producto.nombre_producto,
            func.coalesce(func.sum(DetallePedido.cantidad_detalle), 0).label("cantidad"),
            func.coalesce(func.sum(DetallePedido.subtotal_detalle), 0).label("total"),
        )
        .join(Pedido, Pedido.id_pedido == DetallePedido.id_pedido_d)
        .join(Producto, Producto.id_producto == DetallePedido.id_producto_d)
    )
    if filtro_pedidos:
        q_top = q_top.filter(*filtro_pedidos)
    top = (
        q_top.group_by(Producto.id_producto)
        .order_by(func.sum(DetallePedido.cantidad_detalle).desc())
        .limit(6)
        .all()
    )

    # ── Clientes ────────────────────────────────────────
    q_clientes_total = db.query(func.count(Cliente.id_cliente))
    if filtro_clientes:
        q_clientes_total = q_clientes_total.filter(*filtro_clientes)
    clientes_total = q_clientes_total.scalar() or 0

    # ── Citas ───────────────────────────────────────────
    q_citas_total = db.query(func.count(Cita.id_cita))
    q_citas_por_estado = {
        e: db.query(func.count(Cita.id_cita)).filter(Cita.estado == e)
        for e in ("Pendiente", "Confirmada", "Finalizada", "Cancelada")
    }
    q_citas_por_mes = db.query(
        func.date_format(Cita.fecha, "%Y-%m").label("mes"),
        func.count(Cita.id_cita).label("cantidad"),
    )
    if filtro_citas:
        q_citas_total = q_citas_total.filter(*filtro_citas)
        for e in q_citas_por_estado:
            q_citas_por_estado[e] = q_citas_por_estado[e].filter(*filtro_citas)
        q_citas_por_mes = q_citas_por_mes.filter(*filtro_citas)
    citas_total = q_citas_total.scalar() or 0
    citas_por_estado = {
        e: (q_citas_por_estado[e].scalar() or 0) for e in ("Pendiente", "Confirmada", "Finalizada", "Cancelada")
    }
    citas_por_mes = (
        q_citas_por_mes.group_by(func.date_format(Cita.fecha, "%Y-%m")).order_by("mes").all()
    )

    # ── Técnicos ────────────────────────────────────────
    tecnicos_total = db.query(func.count(Tecnico.id_tecnico)).scalar() or 0
    tecnicos_activos = (
        db.query(func.count(User.id_usuario))
        .filter(User.id_rol_u == 2, User.is_active == True)  # noqa: E712
        .scalar() or 0
    )

    # ── Productos ───────────────────────────────────────
    productos_total = db.query(func.count(Producto.id_producto)).scalar() or 0
    productos_activos = (
        db.query(func.count(Producto.id_producto))
        .filter(Producto.estado_producto == "activo")
        .scalar() or 0
    )

    # ── Solicitudes pendientes ──────────────────────────
    solicitudes_pendientes = (
        db.query(func.count(SolicitudCuenta.id))
        .filter(SolicitudCuenta.estado == "pendiente")
        .scalar() or 0
    )

    pedidos_por_mes = [
        {"mes": m, "cantidad": int(c), "ventas": float(v)}
        for m, c, v in pedidos_data
    ]

    return {
        "ventas_total": float(ventas_total),
        "pedidos_total": int(pedidos_total),
        "pedidos_por_mes": pedidos_por_mes,
        "productos_mas_vendidos": [
            {"nombre_producto": n, "cantidad": int(c), "total": float(t)}
            for n, c, t in top
        ],
        "clientes_total": int(clientes_total),
        "citas_total": int(citas_total),
        "citas_por_estado": citas_por_estado,
        "citas_por_mes": [
            {"mes": m, "cantidad": int(c)} for m, c in citas_por_mes
        ],
        "tecnicos_total": int(tecnicos_total),
        "tecnicos_activos": int(tecnicos_activos),
        "productos_total": int(productos_total),
        "productos_activos": int(productos_activos),
        "solicitudes_pendientes": int(solicitudes_pendientes),
    }


# ── Reporte de ventas ─────────────────────────────────────────────


@router.get("/ventas")
def reporte_ventas(
    periodo: str = Query("mes", regex="^(dia|semana|mes|anio)$"),
    fecha_inicio: Optional[date] = None,
    fecha_fin: Optional[date] = None,
    id_tecnico: Optional[int] = None,
    _admin_user: User = Depends(_admin),
    db: Session = Depends(get_db),
):
    """Reporte de ventas (pedidos + ingresos por citas) filtrado por periodo."""
    inicio, fin = _resolver_rango(periodo, fecha_inicio, fecha_fin)
    grupo = _group_expr(periodo, Pedido.fecha_peedido)

    # ── Pedidos (ventas de productos) ────────────────────
    q_pedidos = (
        db.query(
            grupo.label("g"),
            func.count(Pedido.id_pedido).label("cantidad"),
            func.coalesce(func.sum(Pedido.total_pedido), 0).label("ventas"),
        )
        .filter(
            Pedido.fecha_peedido.isnot(None),
            func.date(Pedido.fecha_peedido) >= inicio,
            func.date(Pedido.fecha_peedido) <= fin,
        )
    )
    if id_tecnico is not None:
        q_pedidos = q_pedidos.filter(Pedido.id_tecnico_entrega == id_tecnico)

    filas_pedidos = q_pedidos.group_by("g").order_by("g").all()
    pedidos_por_grupo = {str(r.g): {"pedidos": int(r.cantidad), "ventas_pedidos": float(r.ventas)} for r in filas_pedidos}

    # ── Citas (ingresos por servicios) ───────────────────
    q_citas = (
        db.query(
            _group_expr(periodo, Cita.fecha).label("g"),
            func.count(Cita.id_cita).label("cantidad"),
            func.coalesce(func.sum(Cita.costo_cita), 0).label("ingresos"),
        )
        .filter(
            Cita.fecha >= inicio,
            Cita.fecha <= fin,
            Cita.estado_pago == "aprobado",
        )
    )
    if id_tecnico is not None:
        q_citas = q_citas.filter(Cita.id_tecnico == id_tecnico)

    filas_citas = q_citas.group_by("g").order_by("g").all()
    citas_por_grupo = {str(r.g): {"ingresos_citas": float(r.ingresos)} for r in filas_citas}

    # ── Unir periodos ────────────────────────────────────
    todos_los_grupos = sorted(set(list(pedidos_por_grupo.keys()) + list(citas_por_grupo.keys())))
    ventas_por_periodo = []
    total_pedidos_count = 0
    total_ventas_pedidos = 0.0
    total_ingresos_citas = 0.0

    for g in todos_los_grupos:
        p = pedidos_por_grupo.get(g, {"pedidos": 0, "ventas_pedidos": 0.0})
        c = citas_por_grupo.get(g, {"ingresos_citas": 0.0})
        subtotal = p["ventas_pedidos"] + c["ingresos_citas"]
        total_pedidos_count += p["pedidos"]
        total_ventas_pedidos += p["ventas_pedidos"]
        total_ingresos_citas += c["ingresos_citas"]
        ventas_por_periodo.append({
            "periodo": g,
            "pedidos": p["pedidos"],
            "ventas_pedidos": p["ventas_pedidos"],
            "ingresos_citas": c["ingresos_citas"],
            "total": subtotal,
        })

    return {
        "periodo": periodo,
        "fecha_inicio": str(inicio),
        "fecha_fin": str(fin),
        "id_tecnico_filtro": id_tecnico,
        "resumen": {
            "total_pedidos": total_pedidos_count,
            "total_ventas_pedidos": total_ventas_pedidos,
            "total_ingresos_citas": total_ingresos_citas,
            "total_ingresos": total_ventas_pedidos + total_ingresos_citas,
        },
        "ventas_por_periodo": ventas_por_periodo,
    }


# ── Reporte de citas ──────────────────────────────────────────────


@router.get("/citas")
def reporte_citas(
    periodo: str = Query("mes", regex="^(dia|semana|mes|anio)$"),
    fecha_inicio: Optional[date] = None,
    fecha_fin: Optional[date] = None,
    id_tecnico: Optional[int] = None,
    _admin_user: User = Depends(_admin),
    db: Session = Depends(get_db),
):
    """Reporte de citas por periodo y estado, con filtro opcional por técnico."""
    inicio, fin = _resolver_rango(periodo, fecha_inicio, fecha_fin)
    grupo = _group_expr(periodo, Cita.fecha)

    q = db.query(
        grupo.label("g"),
        Cita.estado,
        func.count(Cita.id_cita).label("cantidad"),
    ).filter(
        Cita.fecha >= inicio,
        Cita.fecha <= fin,
    )
    if id_tecnico is not None:
        q = q.filter(Cita.id_tecnico == id_tecnico)

    filas = q.group_by("g", Cita.estado).order_by("g").all()

    # ── Agrupar por periodo ──────────────────────────────
    datos: dict[str, dict] = {}
    for r in filas:
        g = str(r.g)
        if g not in datos:
            datos[g] = {"total": 0, "Pendiente": 0, "Confirmada": 0, "Finalizada": 0, "Cancelada": 0}
        datos[g][r.estado] = datos[g].get(r.estado, 0) + int(r.cantidad)
        datos[g]["total"] += int(r.cantidad)

    citas_por_periodo = []
    total_general = 0
    totales_estado: dict[str, int] = {"Pendiente": 0, "Confirmada": 0, "Finalizada": 0, "Cancelada": 0}

    for g in sorted(datos.keys()):
        d = datos[g]
        total_general += d["total"]
        for e in totales_estado:
            totales_estado[e] += d.get(e, 0)
        citas_por_periodo.append({
            "periodo": g,
            "total": d["total"],
            "Pendiente": d.get("Pendiente", 0),
            "Confirmada": d.get("Confirmada", 0),
            "Finalizada": d.get("Finalizada", 0),
            "Cancelada": d.get("Cancelada", 0),
        })

    # ── Ingresos por citas finalizadas con pago aprobado ──
    q_ing = db.query(func.coalesce(func.sum(Cita.costo_cita), 0)).filter(
        Cita.fecha >= inicio,
        Cita.fecha <= fin,
        Cita.estado == "Finalizada",
        Cita.estado_pago == "aprobado",
    )
    if id_tecnico is not None:
        q_ing = q_ing.filter(Cita.id_tecnico == id_tecnico)
    ingresos_total = float(q_ing.scalar() or 0)

    return {
        "periodo": periodo,
        "fecha_inicio": str(inicio),
        "fecha_fin": str(fin),
        "id_tecnico_filtro": id_tecnico,
        "resumen": {
            "total_citas": total_general,
            "por_estado": totales_estado,
            "ingresos_total": ingresos_total,
        },
        "citas_por_periodo": citas_por_periodo,
    }


# ── Reporte por técnico ───────────────────────────────────────────


@router.get("/tecnico")
def reporte_tecnico(
    id_tecnico: int = Query(...),
    periodo: str = Query("mes", regex="^(dia|semana|mes|anio)$"),
    fecha_inicio: Optional[date] = None,
    fecha_fin: Optional[date] = None,
    _admin_user: User = Depends(_admin),
    db: Session = Depends(get_db),
):
    """Reporte detallado de un técnico: citas, ingresos y comisiones."""
    tecnico = db.query(Tecnico).filter(Tecnico.id_tecnico == id_tecnico).first()
    if not tecnico:
        raise HTTPException(status_code=404, detail="Técnico no encontrado")

    user = db.query(User).filter(User.id_usuario == tecnico.id_usuario_t).first()
    nombre = f"{user.first_name} {user.last_name}".strip() if user else "Técnico"

    inicio, fin = _resolver_rango(periodo, fecha_inicio, fecha_fin)
    grupo = _group_expr(periodo, Cita.fecha)

    # ── Citas del técnico ────────────────────────────────
    filas = (
        db.query(
            grupo.label("g"),
            Cita.estado,
            func.count(Cita.id_cita).label("cantidad"),
        )
        .filter(Cita.id_tecnico == id_tecnico, Cita.fecha >= inicio, Cita.fecha <= fin)
        .group_by("g", Cita.estado)
        .order_by("g")
        .all()
    )

    datos: dict[str, dict] = {}
    for r in filas:
        g = str(r.g)
        if g not in datos:
            datos[g] = {"total": 0, "Pendiente": 0, "Confirmada": 0, "Finalizada": 0, "Cancelada": 0}
        datos[g][r.estado] = datos[g].get(r.estado, 0) + int(r.cantidad)
        datos[g]["total"] += int(r.cantidad)

    totales_estado: dict[str, int] = {"Pendiente": 0, "Confirmada": 0, "Finalizada": 0, "Cancelada": 0}
    total_citas = 0
    detalles_por_periodo = []

    for g in sorted(datos.keys()):
        d = datos[g]
        total_citas += d["total"]
        for e in totales_estado:
            totales_estado[e] += d.get(e, 0)
        detalles_por_periodo.append({
            "periodo": g,
            "total": d["total"],
            "Pendiente": d.get("Pendiente", 0),
            "Confirmada": d.get("Confirmada", 0),
            "Finalizada": d.get("Finalizada", 0),
            "Cancelada": d.get("Cancelada", 0),
        })

    # ── Ingresos por citas aprobadas ─────────────────────
    ingresos = float(
        db.query(func.coalesce(func.sum(Cita.costo_cita), 0))
        .filter(
            Cita.id_tecnico == id_tecnico,
            Cita.fecha >= inicio,
            Cita.fecha <= fin,
            Cita.estado_pago == "aprobado",
        )
        .scalar() or 0
    )

    # ── Comisiones ganadas ───────────────────────────────
    comisiones = float(
        db.query(func.coalesce(func.sum(Comision.valor_comision), 0))
        .join(Cita, Cita.id_comision_c == Comision.id_comision)
        .filter(
            Cita.id_tecnico == id_tecnico,
            Cita.fecha >= inicio,
            Cita.fecha <= fin,
        )
        .scalar() or 0
    )

    return {
        "tecnico": {
            "id_tecnico": id_tecnico,
            "nombre": nombre,
            "certificacion": tecnico.certificacion_t,
        },
        "periodo": periodo,
        "fecha_inicio": str(inicio),
        "fecha_fin": str(fin),
        "resumen": {
            "total_citas": total_citas,
            "por_estado": totales_estado,
            "ingresos_generados": ingresos,
            "comisiones_ganadas": comisiones,
        },
        "detalles_por_periodo": detalles_por_periodo,
    }


# ── Lista de técnicos con métricas ────────────────────────────────


@router.get("/tecnicos")
def lista_tecnicos_reporte(
    q: Optional[str] = None,
    skip: int = 0,
    limit: int = 50,
    _admin_user: User = Depends(_admin),
    db: Session = Depends(get_db),
):
    """Lista de técnicos con sus métricas agregadas (citas, ingresos, comisiones).
    Permite buscar por nombre con el parámetro q."""
    query = (
        db.query(Tecnico)
        .join(User, User.id_usuario == Tecnico.id_usuario_t)
    )
    if q:
        like = f"%{q}%"
        query = query.filter(
            (User.first_name.ilike(like)) | (User.last_name.ilike(like))
        )
    tecnicos = query.offset(skip).limit(limit).all()

    resultado = []
    for t in tecnicos:
        user = t.usuario
        nombre = f"{user.first_name} {user.last_name}".strip() if user else "Técnico"

        total_citas = db.query(func.count(Cita.id_cita)).filter(
            Cita.id_tecnico == t.id_tecnico
        ).scalar() or 0

        citas_finalizadas = db.query(func.count(Cita.id_cita)).filter(
            Cita.id_tecnico == t.id_tecnico, Cita.estado == "Finalizada"
        ).scalar() or 0

        ingresos = float(
            db.query(func.coalesce(func.sum(Cita.costo_cita), 0))
            .filter(
                Cita.id_tecnico == t.id_tecnico,
                Cita.estado_pago == "aprobado",
            )
            .scalar() or 0
        )

        comisiones = float(
            db.query(func.coalesce(func.sum(Comision.valor_comision), 0))
            .join(Cita, Cita.id_comision_c == Comision.id_comision)
            .filter(Cita.id_tecnico == t.id_tecnico)
            .scalar() or 0
        )

        promedio = float(
            db.query(func.avg(Cita.costo_cita))
            .filter(
                Cita.id_tecnico == t.id_tecnico,
                Cita.costo_cita.isnot(None),
            )
            .scalar() or 0
        )

        resultado.append({
            "id_tecnico": t.id_tecnico,
            "nombre": nombre,
            "certificacion": t.certificacion_t,
            "activo": user.is_active if user else False,
            "total_citas": int(total_citas),
            "citas_finalizadas": int(citas_finalizadas),
            "ingresos_generados": ingresos,
            "comisiones_ganadas": comisiones,
            "promedio_costo_cita": round(promedio, 2),
        })

    return resultado


# ── Helpers para datos de descarga ───────────────────────────────


# Consulta Tecnico, User.
def _resolver_nombre_tecnico(db: Session, id_tecnico: int | None) -> str | None:
    if id_tecnico is None:
        return None
    t = db.query(Tecnico).filter(Tecnico.id_tecnico == id_tecnico).first()
    if not t:
        return None
    user = db.query(User).filter(User.id_usuario == t.id_usuario_t).first()
    if user:
        return f"{user.first_name} {user.last_name}".strip()
    return None


def _datos_ventas(db, id_tecnico, inicio, fin, periodo):
    grupo = _group_expr(periodo, Pedido.fecha_peedido)
    q_ped = (
        db.query(
            grupo.label("g"),
            func.count(Pedido.id_pedido).label("cantidad"),
            func.coalesce(func.sum(Pedido.total_pedido), 0).label("ventas"),
        )
        .filter(
            Pedido.fecha_peedido.isnot(None),
            func.date(Pedido.fecha_peedido) >= inicio,
            func.date(Pedido.fecha_peedido) <= fin,
        )
    )
    if id_tecnico is not None:
        q_ped = q_ped.filter(Pedido.id_tecnico_entrega == id_tecnico)
    pedidos_por_grupo = {
        str(r.g): {"pedidos": int(r.cantidad), "ventas_pedidos": float(r.ventas)}
        for r in q_ped.group_by("g").order_by("g").all()
    }

    q_cit = (
        db.query(
            _group_expr(periodo, Cita.fecha).label("g"),
            func.coalesce(func.sum(Cita.costo_cita), 0).label("ingresos"),
        )
        .filter(Cita.fecha >= inicio, Cita.fecha <= fin, Cita.estado_pago == "aprobado")
    )
    if id_tecnico is not None:
        q_cit = q_cit.filter(Cita.id_tecnico == id_tecnico)
    citas_por_grupo = {
        str(r.g): {"ingresos_citas": float(r.ingresos)}
        for r in q_cit.group_by("g").order_by("g").all()
    }

    todos = sorted(set(list(pedidos_por_grupo.keys()) + list(citas_por_grupo.keys())))
    total_p = 0
    total_vp = 0.0
    total_ic = 0.0
    detalle = []
    for g in todos:
        p = pedidos_por_grupo.get(g, {"pedidos": 0, "ventas_pedidos": 0.0})
        c = citas_por_grupo.get(g, {"ingresos_citas": 0.0})
        sub = p["ventas_pedidos"] + c["ingresos_citas"]
        total_p += p["pedidos"]
        total_vp += p["ventas_pedidos"]
        total_ic += c["ingresos_citas"]
        detalle.append({
            "periodo": g, "pedidos": p["pedidos"],
            "ventas_pedidos": p["ventas_pedidos"],
            "ingresos_citas": c["ingresos_citas"], "total": sub,
        })

    resumen = {
        "total_pedidos": total_p,
        "total_ventas_pedidos": total_vp,
        "total_ingresos_citas": total_ic,
        "total_ingresos": total_vp + total_ic,
    }
    return resumen, detalle


def _datos_citas(db, id_tecnico, inicio, fin, periodo):
    grupo = _group_expr(periodo, Cita.fecha)
    q = db.query(
        grupo.label("g"),
        Cita.estado,
        func.count(Cita.id_cita).label("cantidad"),
    ).filter(
        Cita.fecha >= inicio, Cita.fecha <= fin,
    )
    if id_tecnico is not None:
        q = q.filter(Cita.id_tecnico == id_tecnico)

    datos: dict[str, dict] = {}
    for r in q.group_by("g", Cita.estado).order_by("g").all():
        g = str(r.g)
        if g not in datos:
            datos[g] = {"total": 0, "Pendiente": 0, "Confirmada": 0, "Finalizada": 0, "Cancelada": 0}
        datos[g][r.estado] = datos[g].get(r.estado, 0) + int(r.cantidad)
        datos[g]["total"] += int(r.cantidad)

    totales = {"Pendiente": 0, "Confirmada": 0, "Finalizada": 0, "Cancelada": 0}
    total_gen = 0
    detalle = []
    for g in sorted(datos.keys()):
        d = datos[g]
        total_gen += d["total"]
        for e in totales:
            totales[e] += d.get(e, 0)
        detalle.append({
            "periodo": g, "total": d["total"],
            "Pendiente": d.get("Pendiente", 0), "Confirmada": d.get("Confirmada", 0),
            "Finalizada": d.get("Finalizada", 0), "Cancelada": d.get("Cancelada", 0),
        })

    q_ing = db.query(func.coalesce(func.sum(Cita.costo_cita), 0)).filter(
        Cita.fecha >= inicio, Cita.fecha <= fin,
        Cita.estado == "Finalizada", Cita.estado_pago == "aprobado",
    )
    if id_tecnico is not None:
        q_ing = q_ing.filter(Cita.id_tecnico == id_tecnico)
    ingresos = float(q_ing.scalar() or 0)

    resumen = {
        "total_citas": total_gen,
        "por_estado": totales,
        "ingresos_total": ingresos,
    }
    return resumen, detalle


# ── Descargas: Reporte de Ventas ─────────────────────────────────


@router.get("/ventas/pdf")
def ventas_pdf(
    periodo: str = Query("mes", regex="^(dia|semana|mes|anio)$"),
    fecha_inicio: Optional[date] = None,
    fecha_fin: Optional[date] = None,
    id_tecnico: Optional[int] = None,
    _admin_user: User = Depends(_admin),
    db: Session = Depends(get_db),
):
    """Descargar reporte de ventas en PDF."""
    inicio, fin = _resolver_rango(periodo, fecha_inicio, fecha_fin)
    resumen, detalle = _datos_ventas(db, id_tecnico, inicio, fin, periodo)
    nombre_tec = _resolver_nombre_tecnico(db, id_tecnico)
    buf = generar_ventas_pdf(resumen, detalle, periodo, inicio, fin, nombre_tec)
    fecha_str = datetime.now().strftime("%Y%m%d_%H%M")
    return StreamingResponse(
        buf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="reporte_ventas_{periodo}_{fecha_str}.pdf"'},
    )


# ── Descargas: Reporte de Citas ──────────────────────────────────


@router.get("/citas/pdf")
def citas_pdf(
    periodo: str = Query("mes", regex="^(dia|semana|mes|anio)$"),
    fecha_inicio: Optional[date] = None,
    fecha_fin: Optional[date] = None,
    id_tecnico: Optional[int] = None,
    _admin_user: User = Depends(_admin),
    db: Session = Depends(get_db),
):
    """Descargar reporte de citas en PDF."""
    inicio, fin = _resolver_rango(periodo, fecha_inicio, fecha_fin)
    resumen, detalle = _datos_citas(db, id_tecnico, inicio, fin, periodo)
    nombre_tec = _resolver_nombre_tecnico(db, id_tecnico)
    buf = generar_citas_pdf(resumen, detalle, periodo, inicio, fin, nombre_tec)
    fecha_str = datetime.now().strftime("%Y%m%d_%H%M")
    return StreamingResponse(
        buf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="reporte_citas_{periodo}_{fecha_str}.pdf"'},
    )


# ── Descarga: Reporte General (PDF) ───────────────────────────────

_MESES_NOMBRE = [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
]


def _nombre_archivo_reporte(periodo: str, inicio: date, fin: date | None = None) -> str:
    """Nombre del archivo PDF según el período del reporte."""
    if periodo == "personalizado":
        return f"Reporte_Personalizado_{inicio.isoformat()}_al_{fin.isoformat()}.pdf"
    if periodo == "semana":
        return f"Reporte_Semanal_{inicio.isoformat()}.pdf"
    if periodo == "mes":
        return f"Reporte_Mensual_{_MESES_NOMBRE[inicio.month - 1]}_{inicio.year}.pdf"
    return f"Reporte_Anual_{inicio.year}.pdf"


def _datos_reporte_completo(db: Session, inicio: date, fin: date, periodo: str) -> dict:
    """Reúne todos los datos reales del período para el reporte general."""
    res_ventas, det_ventas = _datos_ventas(db, None, inicio, fin, periodo)
    res_citas, det_citas = _datos_citas(db, None, inicio, fin, periodo)

    # ── Detalle de citas del período ─────────────────────
    citas_detalle = []
    for c in (
        db.query(Cita)
        .filter(Cita.fecha >= inicio, Cita.fecha <= fin)
        .order_by(Cita.fecha, Cita.hora)
        .all()
    ):
        nombre_cliente = ""
        if c.cliente:
            nombre_cliente = f"{c.cliente.first_name} {c.cliente.last_name}".strip()
        citas_detalle.append({
            "id_cita": c.id_cita,
            "fecha": c.fecha,
            "hora": c.hora or "",
            "cliente": nombre_cliente,
            "tecnico": c.nombre_tecnico or "",
            "servicio": c.tipo_servicio,
            "estado": c.estado,
            "costo": float(c.costo_cita or 0),
            "estado_pago": c.estado_pago or "",
        })

    # ── Servicios por tipo en el período ─────────────────
    servicios = []
    filas_serv = (
        db.query(
            Cita.tipo_servicio,
            func.count(Cita.id_cita).label("cantidad"),
        )
        .filter(Cita.fecha >= inicio, Cita.fecha <= fin)
        .group_by(Cita.tipo_servicio)
        .order_by(Cita.tipo_servicio)
        .all()
    )
    for tipo, cant in filas_serv:
        por_estado = {
            e: (
                db.query(func.count(Cita.id_cita))
                .filter(
                    Cita.fecha >= inicio, Cita.fecha <= fin,
                    Cita.tipo_servicio == tipo, Cita.estado == e,
                )
                .scalar() or 0
            )
            for e in ("Pendiente", "Confirmada", "Finalizada", "Cancelada")
        }
        ingresos = float(
            db.query(func.coalesce(func.sum(Cita.costo_cita), 0))
            .filter(
                Cita.fecha >= inicio, Cita.fecha <= fin,
                Cita.tipo_servicio == tipo, Cita.estado_pago == "aprobado",
            )
            .scalar() or 0
        )
        servicios.append({
            "tipo_servicio": tipo,
            "cantidad": int(cant),
            "por_estado": por_estado,
            "ingresos": ingresos,
        })

    # ── Tarifas actuales (configuración) ─────────────────
    tarifas = [
        {
            "tipo_servicio": t.tipo_servicio,
            "costo": float(t.costo),
            "descripcion": t.descripcion or "",
        }
        for t in db.query(TarifaServicio).order_by(TarifaServicio.tipo_servicio).all()
    ]

    # ── Rendimiento por técnico en el período ───────────
    tecnicos_reporte = []
    filas_tec = (
        db.query(
            Cita.id_tecnico,
            Cita.nombre_tecnico,
            func.count(Cita.id_cita).label("total"),
            func.coalesce(
                func.sum(case((Cita.estado == "Finalizada", 1), else_=0)), 0
            ).label("finalizadas"),
            func.coalesce(
                func.sum(case((Cita.estado_pago == "aprobado", Cita.costo_cita), else_=0)), 0
            ).label("ingresos"),
        )
        .filter(Cita.fecha >= inicio, Cita.fecha <= fin, Cita.id_tecnico.isnot(None))
        .group_by(Cita.id_tecnico, Cita.nombre_tecnico)
        .order_by(func.count(Cita.id_cita).desc())
        .all()
    )
    for id_t, nombre_t, total, finalizadas, ingresos in filas_tec:
        tecnicos_reporte.append({
            "id_tecnico": id_t,
            "nombre": nombre_t or "Técnico",
            "total_citas": int(total),
            "finalizadas": int(finalizadas),
            "ingresos": float(ingresos),
        })

    # ── Clientes con citas en el período (top 15) ───────
    clientes_citas = []
    filas_cli = (
        db.query(
            Cliente.id_cliente,
            Cliente.first_name,
            Cliente.last_name,
            func.count(Cita.id_cita).label("total"),
            func.coalesce(
                func.sum(case((Cita.estado_pago == "aprobado", Cita.costo_cita), else_=0)), 0
            ).label("gasto"),
        )
        .join(Cita, Cita.id_cliente == Cliente.id_cliente)
        .filter(Cita.fecha >= inicio, Cita.fecha <= fin)
        .group_by(Cliente.id_cliente)
        .order_by(func.count(Cita.id_cita).desc())
        .limit(15)
        .all()
    )
    for id_cli, first, last, total, gasto in filas_cli:
        clientes_citas.append({
            "id_cliente": id_cli,
            "nombre": f"{first} {last}".strip() or "Cliente",
            "citas": int(total),
            "gasto": float(gasto),
        })

    # ── Valor promedio de cita en el período ────────────
    promedio_costo_cita = float(
        db.query(func.avg(Cita.costo_cita))
        .filter(Cita.fecha >= inicio, Cita.fecha <= fin, Cita.costo_cita.isnot(None))
        .scalar() or 0
    )

    # ── Métricas complementarias ─────────────────────────
    clientes_registrados = (
        db.query(func.count(Cliente.id_cliente))
        .filter(
            func.date(Cliente.created_at) >= inicio,
            func.date(Cliente.created_at) <= fin,
        )
        .scalar() or 0
    )
    clientes_total = db.query(func.count(Cliente.id_cliente)).scalar() or 0
    tecnicos_total = db.query(func.count(Tecnico.id_tecnico)).scalar() or 0
    tecnicos_activos = (
        db.query(func.count(User.id_usuario))
        .filter(User.id_rol_u == 2, User.is_active == True)  # noqa: E712
        .scalar() or 0
    )
    tecnicos_con_citas = (
        db.query(func.count(func.distinct(Cita.id_tecnico)))
        .filter(Cita.fecha >= inicio, Cita.fecha <= fin, Cita.id_tecnico.isnot(None))
        .scalar() or 0
    )
    productos_total = db.query(func.count(Producto.id_producto)).scalar() or 0
    productos_activos = (
        db.query(func.count(Producto.id_producto))
        .filter(Producto.estado_producto == "activo")
        .scalar() or 0
    )
    solicitudes_pendientes = (
        db.query(func.count(SolicitudCuenta.id))
        .filter(SolicitudCuenta.estado == "pendiente")
        .scalar() or 0
    )

    hay_datos = bool(det_ventas or det_citas or citas_detalle or servicios or tecnicos_reporte or clientes_citas)

    return {
        "resumen": {
            "ventas_total": res_ventas["total_ventas_pedidos"],
            "pedidos_total": res_ventas["total_pedidos"],
            "ingresos_citas": res_ventas["total_ingresos_citas"],
            "total_ingresos": res_ventas["total_ingresos"],
            "citas_total": res_citas["total_citas"],
            "citas_por_estado": res_citas["por_estado"],
            "ingresos_citas_finalizadas": res_citas["ingresos_total"],
            "promedio_costo_cita": round(promedio_costo_cita, 2),
            "servicios_distintos": len(servicios),
            "clientes_registrados": int(clientes_registrados),
            "clientes_total": int(clientes_total),
            "tecnicos_activos": int(tecnicos_activos),
            "tecnicos_total": int(tecnicos_total),
            "tecnicos_con_citas": int(tecnicos_con_citas),
            "productos_activos": int(productos_activos),
            "productos_total": int(productos_total),
            "solicitudes_pendientes": int(solicitudes_pendientes),
        },
        "ventas_por_periodo": det_ventas,
        "citas_por_periodo": det_citas,
        "citas_detalle": citas_detalle,
        "servicios": servicios,
        "tarifas": tarifas,
        "tecnicos_reporte": tecnicos_reporte,
        "clientes_citas": clientes_citas,
        "hay_datos": hay_datos,
    }


@router.get("/pdf")
def reporte_pdf(
    periodo: str = Query("mes", regex="^(semana|mes|anio)$"),
    fecha_inicio: Optional[date] = None,
    fecha_fin: Optional[date] = None,
    _admin_user: User = Depends(_admin),
    db: Session = Depends(get_db),
):
    """Descarga el reporte general del panel en PDF profesional: portada
    con logo, resumen ejecutivo, análisis con gráficas, detalle con tablas
    y resumen final. Si se indican fecha_inicio y fecha_fin, el reporte se
    calcula sobre ese rango personalizado; si no, se usa el periodo."""
    if (fecha_inicio is None) != (fecha_fin is None):
        raise HTTPException(status_code=400, detail="Debes indicar la fecha de inicio y la fecha de fin")
    if fecha_inicio and fecha_fin and fecha_fin < fecha_inicio:
        raise HTTPException(status_code=400, detail="La fecha final no puede ser anterior a la fecha inicial")
    inicio, fin = _resolver_rango(periodo, fecha_inicio, fecha_fin)
    es_personalizado = bool(fecha_inicio and fecha_fin)
    grupo = "mes" if es_personalizado else periodo
    datos = _datos_reporte_completo(db, inicio, fin, grupo)
    label_periodo = "personalizado" if es_personalizado else periodo
    nombre_admin = f"{_admin_user.first_name} {_admin_user.last_name}".strip()
    buf = generar_reporte_completo_pdf(
        datos,
        label_periodo,
        inicio,
        fin,
        preparado_por=nombre_admin or "Equipo Administrativo NEODOMUS",
    )
    return StreamingResponse(
        buf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{_nombre_archivo_reporte(label_periodo, inicio, fin)}"'},
    )

