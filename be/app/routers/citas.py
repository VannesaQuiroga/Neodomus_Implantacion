from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select, or_, text
from sqlalchemy.orm import Session

from app.models.oferta_horario import OfertaHorario
from typing import List, Optional
from datetime import datetime, date, time, timedelta
from decimal import Decimal
import json
from pydantic import BaseModel
try:
    from zoneinfo import ZoneInfo
    _BOGOTA_TZ = ZoneInfo("America/Bogota")
except Exception:
    _BOGOTA_TZ = None

from app.database import get_db
from app.models.cliente import Cliente
from app.models.roles_usuario import RolesUsuario
from app.models.cita import Cita
from app.models.cita_producto import CitaProducto
from app.models.producto import Producto
from app.models.producto_variante import ProductoVariante
from app.models.tarifa_servicio import TarifaServicio
from app.models.tecnico import Tecnico
from app.models.otros import Comision
from app.models.pedido import Pedido
from app.models.user import User
from app.schemas.cita import (
    CitaCreate,
    CitaUpdate,
    CitaResponse,
    CrearCitaResponse,
)
from app.services.especialidades import (
    tecnico_ocupado,
    slot_tomado,
    horas_laborales,
    _dia_es_laboral,
    _hora_a_minutos,
    _se_solapan,
    _tecnicos_activos,
    HORA_INICIO,
    HORA_FIN,
    duracion_estimada_cita,
    duracion_base_tipo,
    duracion_desde_items,
    DURACION_MIN,
    ESTADOS_OCUPAN,
    ESTADOS_ENTREGA_OCUPAN,
)
from app.services import pagos_service
from app.services.notificaciones import crear_notificacion, notificar_cita_asignada_tecnico, notificar_cita_reagendada_tecnico, notificar_recordatorio_cita, notificar_cita_reasignada_cliente
from app.models.calificacion import Calificacion
from app.utils.security import get_current_client, get_current_employee, oauth2_scheme, decode_token

router = APIRouter(prefix="/citas", tags=["Citas"])

ESTADOS_EDITABLES = ("Pendiente", "Confirmada")

ESTADOS_CITA = ("Pendiente", "Confirmada", "Finalizada", "Cancelada")

# Ventana (horas) que tiene un cliente para aceptar una oferta de horario liberado.
OFERTA_VENTANA_HORAS = 6

# Umbral para considerar cliente preferencial/frecuente con un técnico
PUNTAJE_PREFERENCIAL_MIN = 2


def _es_cliente_preferencial(db, id_cliente: int, id_tecnico: int | None) -> bool:
    """True si el cliente es frecuente con el técnico (historial de compras + servicios)."""
    if id_tecnico is None:
        return False
    try:
        compras = (
            db.execute(
                text(
                    "SELECT COUNT(*) FROM pedidos WHERE id_cliente_pe = :c "
                    "AND id_tecnico_entrega = :t AND estado_pedido = 'Pagado'"
                ),
                {"c": id_cliente, "t": id_tecnico},
            ).scalar()
            or 0
        )
        servicios = (
            db.execute(
                text(
                    "SELECT COUNT(*) FROM citas WHERE id_cliente = :c AND id_tecnico = :t"
                ),
                {"c": id_cliente, "t": id_tecnico},
            ).scalar()
            or 0
        )
        return int(compras) + int(servicios) >= PUNTAJE_PREFERENCIAL_MIN
    except Exception:
        return False


def _tiene_oferta_activa(db, id_cliente: int, fecha, hora: str, id_tecnico: int | None) -> bool:
    """True si el cliente tiene una oferta activa para ese hueco exacto."""
    if id_tecnico is None:
        return False
    return (
        db.query(OfertaHorario)
        .filter(
            OfertaHorario.id_cliente == id_cliente,
            OfertaHorario.fecha == fecha,
            OfertaHorario.hora == hora,
            OfertaHorario.id_tecnico == id_tecnico,
            OfertaHorario.estado == "Ofrecida",
            OfertaHorario.expira_en > datetime.now(),
        )
        .first()
        is not None
    )


def _generar_ofertas_por_cancelacion(
    db: Session,
    *,
    fecha,
    hora: str,
    tipo_servicio: str,
    id_tecnico: int | None,
    nombre_tecnico: str | None,
    id_cliente_excluido: int | None = None,
) -> int:
    """Ofrece la franja de una cita cancelada a clientes con citas FUTURAS
    con el mismo técnico, priorizando por lealtad (pedidos pagados + citas).

    Crea una fila de oferta por candidato con la misma ventana de tiempo;
    el primero que acepte gana y las demás pasan a 'Perdida'."""
    from app.models.cliente import Cliente as ClienteModel

    if id_tecnico is None:
        return 0
    ahora = datetime.now()
    try:
        h, m = str(hora).split(":")[:2]
        franja_dt = datetime.combine(fecha, datetime.min.time()).replace(
            hour=int(h), minute=int(m)
        )
    except (ValueError, IndexError):
        return 0
    if franja_dt <= ahora + timedelta(hours=1):
        return 0  # franja demasiado cercana o pasada: no se ofrece

    futuras = (
        db.query(Cita)
        .filter(
            Cita.id_tecnico == id_tecnico,
            Cita.estado.in_(("Pendiente", "Confirmada")),
            Cita.fecha > fecha,
            Cita.id_cliente.isnot(None),
        )
        .all()
    )
    candidatos: dict[int, dict] = {}
    for c in futuras:
        if c.id_cliente == id_cliente_excluido:
            continue
        actual = candidatos.get(c.id_cliente)
        if actual is None or (c.fecha, c.hora) < (actual["cita"].fecha, actual["cita"].hora):
            candidatos[c.id_cliente] = {"cita": c}

    if not candidatos:
        return 0

    expira = ahora + timedelta(hours=OFERTA_VENTANA_HORAS)
    filas: list[tuple[int, dict]] = []
    for id_cliente, info in candidatos.items():
        # Lealtad CON ESTE TÉCNICO: citas previas juntos + pedidos que él
        # le entregó (instalaciones/compras asociadas a su agenda).
        compras = (
            db.execute(
                text(
                    "SELECT COUNT(*) FROM pedidos WHERE id_cliente_pe = :c "
                    "AND id_tecnico_entrega = :t AND estado_pedido = 'Pagado'"
                ),
                {"c": id_cliente, "t": id_tecnico},
            ).scalar()
            or 0
        )
        servicios = (
            db.execute(
                text(
                    "SELECT COUNT(*) FROM citas WHERE id_cliente = :c "
                    "AND id_tecnico = :t"
                ),
                {"c": id_cliente, "t": id_tecnico},
            ).scalar()
            or 0
        )
        info["puntaje"] = int(compras) + int(servicios)
        filas.append((id_cliente, info))

    # Prioridad: mayor lealtad primero; a igual puntaje, la cita más antigua.
    filas.sort(key=lambda f: (-f[1]["puntaje"], f[1]["cita"].fecha, f[1]["cita"].hora))

    creadas = 0
    for posicion, (id_cliente, info) in enumerate(filas, start=1):
        cliente = db.get(ClienteModel, id_cliente)
        db.add(
            OfertaHorario(
                id_cliente=id_cliente,
                fecha=fecha,
                hora=hora,
                tipo_servicio=tipo_servicio,
                id_tecnico=id_tecnico,
                nombre_tecnico=nombre_tecnico,
                puntaje=info["puntaje"],
                estado="Ofrecida",
                expira_en=expira,
            )
        )
        creadas += 1
        if cliente and cliente.email:
            from app.services.notificaciones import notificar_oferta_horario

            notificar_oferta_horario(
                db,
                id_cliente,
                cliente.email,
                f"{cliente.first_name} {cliente.last_name}".strip() or "Cliente",
                {
                    "fecha": fecha.strftime("%d/%m/%Y"),
                    "hora": hora,
                    "tecnico": nombre_tecnico or "tu técnico",
                    "horas": OFERTA_VENTANA_HORAS,
                    "prioridad": posicion,
                    "puntaje": info["puntaje"],
                },
            )
    db.commit()
    return creadas


class AdminCitaUpdate(BaseModel):
    estado: Optional[str] = None
    id_tecnico: Optional[int] = None
    nombre_tecnico: Optional[str] = None
    id_tecnico_2: Optional[int] = None
    nombre_tecnico_2: Optional[str] = None
    id_tecnico_3: Optional[int] = None
    nombre_tecnico_3: Optional[str] = None
    id_comision_c: Optional[int] = None
    comision_porcentaje: Optional[float] = None
    comision_valor: Optional[float] = None


class AdminCitaResponse(CitaResponse):
    cliente_nombre: Optional[str] = None
    cliente_email: Optional[str] = None
    id_comision_c: Optional[int] = None
    comision_porcentaje: Optional[float] = None
    comision_valor: Optional[float] = None
    especializacion_requerida: Optional[dict] = None
    reembolso: Optional[dict] = None


class ReasignarCitaRequest(BaseModel):
    id_tecnico: int
    fecha: Optional[date] = None
    hora: Optional[str] = None
    id_tecnico_2: Optional[int] = None
    id_tecnico_3: Optional[int] = None
    motivo: Optional[str] = None


class ClienteCitaResponse(CitaResponse):
    """Cita visto por el cliente: incluye datos del técnico asignado."""
    tecnico_nombre: Optional[str] = None
    tecnico_telefono: Optional[int] = None
    tecnico_email: Optional[str] = None
    tecnico_foto_url: Optional[str] = None
    tecnico_certificacion: Optional[str] = None
    tecnico_2_nombre: Optional[str] = None
    tecnico_2_telefono: Optional[int] = None
    calificada: Optional[bool] = None


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


def _nombre_tecnico_real(db: Session, id_tecnico: int) -> str | None:
    """Devuelve el nombre real del técnico (join a usuarios) o None si no existe."""
    if id_tecnico is None:
        return None
    tecnico = db.query(Tecnico).filter(Tecnico.id_tecnico == id_tecnico).first()
    if not tecnico or not tecnico.usuario:
        return None
    u = tecnico.usuario
    return f"{u.first_name} {u.last_name}".strip()


def _datos_tecnico(
    db: Session, id_tecnico: int,
) -> tuple[int | None, str | None, str | None, str | None, str | None]:
    """Devuelve (teléfono, email, foto, nombre, certificación) del técnico."""
    if id_tecnico is None:
        return None, None, None, None, None
    tecnico = db.query(Tecnico).filter(Tecnico.id_tecnico == id_tecnico).first()
    if not tecnico or not tecnico.usuario:
        return None, None, None, None, None
    u = tecnico.usuario
    nombre = f"{u.first_name} {u.last_name}".strip()
    return u.telefono_usuario, u.email, u.foto_url, nombre, tecnico.certificacion_t


def _notificar_tecnicos_cita(db: Session, cita: Cita, cliente: Optional[Cliente], solo_ids: Optional[set] = None) -> None:
    """Envía el correo de cita asignada a TODOS los técnicos vinculados
    (principal, segundo y tercero). Con ``solo_ids`` se limita a esos ids,
    útil tras un cambio del admin para avisar solo a los nuevos asignados."""
    from app.models.tecnico import Tecnico

    nombre_cliente = (
        f"{cliente.first_name} {cliente.last_name}".strip() or "Cliente"
        if cliente
        else "Cliente"
    )
    ids = [cita.id_tecnico, cita.id_tecnico_2, cita.id_tecnico_3]
    for id_tecnico in ids:
        if id_tecnico is None:
            continue
        if solo_ids is not None and id_tecnico not in solo_ids:
            continue
        tecnico_obj = db.query(Tecnico).filter(Tecnico.id_tecnico == id_tecnico).first()
        if not tecnico_obj or not tecnico_obj.usuario or not tecnico_obj.usuario.email:
            continue
        notificar_cita_asignada_tecnico(
            db,
            tecnico_obj.usuario.id_usuario,
            tecnico_obj.usuario.email,
            tecnico_obj.usuario.first_name or "técnico",
            {
                "cliente": nombre_cliente,
                "servicio": cita.tipo_servicio,
                "fecha": cita.fecha.strftime("%d/%m/%Y"),
                "hora": cita.hora,
                "direccion": cita.direccion,
                "telefono": cliente.telefono_cliente if cliente else None,
                "descripcion": cita.descripcion,
            },
        )


def _notificar_tecnicos_cita_reagendada(
    db: Session, cita: Cita, cliente: Optional[Cliente], solo_ids: Optional[set] = None
) -> None:
    """Avisa por correo + plataforma a los técnicos vinculados cuando el
    cliente (o el admin) reagenda la cita a una nueva fecha/hora. Con
    ``solo_ids`` se limita a esos ids (para no avisar a los recién asignados)."""
    from app.models.tecnico import Tecnico

    nombre_cliente = (
        f"{cliente.first_name} {cliente.last_name}".strip() or "Cliente"
        if cliente
        else "Cliente"
    )
    for id_tecnico in (cita.id_tecnico, cita.id_tecnico_2, cita.id_tecnico_3):
        if id_tecnico is None:
            continue
        if solo_ids is not None and id_tecnico not in solo_ids:
            continue
        tecnico_obj = db.query(Tecnico).filter(Tecnico.id_tecnico == id_tecnico).first()
        if not tecnico_obj or not tecnico_obj.usuario or not tecnico_obj.usuario.email:
            continue
        notificar_cita_reagendada_tecnico(
            db,
            tecnico_obj.usuario.id_usuario,
            tecnico_obj.usuario.email,
            tecnico_obj.usuario.first_name or "técnico",
            {
                "cliente": nombre_cliente,
                "servicio": cita.tipo_servicio,
                "fecha": cita.fecha.strftime("%d/%m/%Y"),
                "hora": cita.hora,
                "direccion": cita.direccion,
                "telefono": cliente.telefono_cliente if cliente else None,
                "descripcion": cita.descripcion,
            },
        )


def _info_comision(db: Session, cita: Cita) -> tuple[Optional[int], Optional[float], Optional[float]]:
    """Devuelve (id_comision, porcentaje, valor) de la comisión ligada a la cita."""
    if cita.id_comision_c is None:
        return None, None, None
    com = db.query(Comision).filter(Comision.id_comision == cita.id_comision_c).first()
    if not com:
        return None, None, None
    return (
        com.id_comision,
        float(com.porcentaje_comision) if com.porcentaje_comision is not None else None,
        float(com.valor_comision) if com.valor_comision is not None else None,
    )


def _verificar_recordatorio_cita(db: Session, cliente: Cliente, cita: Cita) -> None:
    """Envía recordatorio al cliente si la cita está a <=12 horas y no se envió.
    La lógica vive en tareas_programadas para compartirla con el scheduler."""
    from app.services.tareas_programadas import enviar_recordatorio_si_corresponde

    enviar_recordatorio_si_corresponde(db, cliente, cita)


def _serializar_cita_cliente(db: Session, cita: Cita) -> ClienteCitaResponse:
    telefono, email, foto, nombre, certificacion = _datos_tecnico(db, cita.id_tecnico)
    telefono_2, _, _, nombre_2, _ = _datos_tecnico(db, cita.id_tecnico_2)
    calificada = (
        db.query(Calificacion)
        .filter(
            Calificacion.id_cita_c == cita.id_cita,
            Calificacion.id_cliente_c == cita.id_cliente,
        )
        .first()
        is not None
    )
    return ClienteCitaResponse(
        id_cita=cita.id_cita,
        id_cliente=cita.id_cliente,
        id_tecnico=cita.id_tecnico,
        nombre_tecnico=cita.nombre_tecnico,
        id_tecnico_2=cita.id_tecnico_2,
        nombre_tecnico_2=cita.nombre_tecnico_2,
        tecnico_nombre=nombre,
        tecnico_telefono=telefono,
        tecnico_email=email,
        tecnico_foto_url=foto,
        tecnico_certificacion=certificacion,
        tecnico_2_nombre=nombre_2,
        tecnico_2_telefono=telefono_2,
        tipo_servicio=cita.tipo_servicio,
        fecha=cita.fecha,
        hora=cita.hora,
        direccion=cita.direccion,
        descripcion=cita.descripcion,
        estado=cita.estado,
        costo_cita=float(cita.costo_cita) if cita.costo_cita is not None else None,
        metodo_pago=cita.metodo_pago,
        estado_pago=cita.estado_pago,
        numero_transaccion=cita.numero_transaccion,
        created_at=cita.created_at,
        calificada=calificada,
    )


def _validar_tecnico_cita(
    db: Session,
    id_tecnico: Optional[int],
    tipo_servicio: str,
    fecha: date,
    hora: str,
    excluir_cita_id: Optional[int] = None,
    duracion_horas: float = DURACION_MIN,
) -> None:
    """Valida que el técnico exista y esté libre durante el intervalo que
    ocupa el servicio en la fecha y hora indicadas. Lanza HTTPException si
    no. No se restringe por especialidad: cualquier técnico puede atender
    cualquier servicio."""
    if id_tecnico is None:
        return
    tecnico = db.query(Tecnico).filter(Tecnico.id_tecnico == id_tecnico).first()
    if (
        not tecnico
        or not tecnico.usuario
        or not tecnico.usuario.is_active
        or tecnico.usuario.id_rol_u != 2
    ):
        raise HTTPException(status_code=400, detail="El técnico seleccionado no existe o no está activo")
    if tecnico_ocupado(db, id_tecnico, fecha, hora, excluir_cita_id, duracion_horas=duracion_horas):
        raise HTTPException(
            status_code=400,
            detail="El técnico seleccionado no está disponible en esa fecha y hora",
        )


@router.get("/all-admin", response_model=List[AdminCitaResponse])
def listar_citas_admin(
    current_admin: User = Depends(_admin),
    db: Session = Depends(get_db),
):
    """Lista todas las citas/instalaciones del sistema (solo admin)"""
    citas = (
        db.query(Cita)
        .order_by(Cita.fecha.desc(), Cita.hora.desc())
        .all()
    )
    clientes = {c.id_cliente: c for c in db.query(Cliente).all()}
    respuesta = []
    for cita in citas:
        data = AdminCitaResponse(
            id_cita=cita.id_cita,
            id_cliente=cita.id_cliente,
            id_tecnico=cita.id_tecnico,
            nombre_tecnico=cita.nombre_tecnico,
            id_tecnico_2=cita.id_tecnico_2,
            nombre_tecnico_2=cita.nombre_tecnico_2,
            tipo_servicio=cita.tipo_servicio,
            fecha=cita.fecha,
            hora=cita.hora,
            direccion=cita.direccion,
            descripcion=cita.descripcion,
            estado=cita.estado,
            created_at=cita.created_at,
            cliente_nombre=None,
            cliente_email=None,
        )
        cliente = clientes.get(cita.id_cliente)
        if cliente:
            data.cliente_nombre = f"{cliente.first_name} {cliente.last_name}".strip()
            data.cliente_email = cliente.email
        id_comision, com_porcentaje, com_valor = _info_comision(db, cita)
        data.id_comision_c = id_comision
        data.comision_porcentaje = com_porcentaje
        data.comision_valor = com_valor
        respuesta.append(data)
    return respuesta


def _validar_franja_cita(
    fecha: date,
    hora: str,
    excluir_cita_id: Optional[int] = None,
    duracion_horas: float = DURACION_MIN,
) -> None:
    """Valida que la cita sea en día laboral, que la hora sea un inicio
    válido (08:00-18:00, dejando terminar el servicio dentro de la jornada)
    y que la franja no esté reservada por otro cliente."""
    if not _dia_es_laboral(fecha):
        raise HTTPException(
            status_code=400,
            detail="Las citas solo se pueden agendar de lunes a sábado.",
        )
    if hora not in horas_laborales(fecha, duracion_horas):
        raise HTTPException(
            status_code=400,
            detail="La hora debe ser una franja entre 08:00 y 18:00 con tiempo suficiente para el servicio (por ejemplo 09:00).",
        )


def _es_cliente_con_cita(db: Session, cita_id: int, id_cliente: int) -> bool:
    return (
        db.query(Cita)
        .filter(Cita.id_cita == cita_id, Cita.id_cliente == id_cliente)
        .first()
        is not None
    )


def _get_own_cita(cita_id: int, client: Cliente, db: Session) -> Cita:
    cita = (
        db.query(Cita)
        .filter(Cita.id_cita == cita_id, Cita.id_cliente == client.id_cliente)
        .first()
    )
    if not cita:
        raise HTTPException(status_code=404, detail="Cita no encontrada")
    return cita


@router.post("", response_model=CrearCitaResponse)
def crear_cita(
    data: CitaCreate,
    client: Cliente = Depends(get_current_client),
    db: Session = Depends(get_db),
):
    """Registra una nueva cita para el cliente autenticado.

    El costo se toma de la tarifa fija del servicio y se paga al agendar
    con el simulador académico local."""
    if data.fecha < datetime.now().date():
        raise HTTPException(status_code=400, detail="La fecha de la cita no puede ser anterior a hoy")
    hora_cita = datetime.strptime(data.hora, "%H:%M").time() if ":" in data.hora else time(int(data.hora), 0)
    fecha_hora_cita = datetime.combine(data.fecha, hora_cita)
    minimo = datetime.now() + timedelta(hours=3)
    if fecha_hora_cita < minimo:
        raise HTTPException(
            status_code=400,
            detail="Las citas deben agendarse con al menos 3 horas de anticipación",
        )
    duracion = duracion_base_tipo(data.tipo_servicio)
    _validar_franja_cita(data.fecha, data.hora, duracion_horas=duracion)
    # La calificación del técnico es voluntaria: ya no bloquea nuevas citas
    # (el scheduler envía recordatorios periódicos al cliente).
    if slot_tomado(db, data.fecha, data.hora, duracion_horas=duracion):
        raise HTTPException(
            status_code=400,
            detail="Esa fecha y hora ya fue reservada por otro cliente. Elige otra franja.",
        )
    tarifa = (
        db.query(TarifaServicio)
        .filter(TarifaServicio.tipo_servicio == data.tipo_servicio.lower().strip())
        .first()
    )
    if not tarifa:
        raise HTTPException(
            status_code=400,
            detail="No hay una tarifa configurada para este servicio. Contacta al administrador.",
        )
    if not data.metodo_pago:
        raise HTTPException(status_code=400, detail="Debes seleccionar un método de pago")
    # El técnico debe ser uno real: se ignora el nombre enviado por el cliente
    # y se valida especialidad + disponibilidad en la BD.
    nombre_tecnico = None
    if data.id_tecnico is not None:
        _validar_tecnico_cita(
            db,
            data.id_tecnico,
            data.tipo_servicio,
            data.fecha,
            data.hora,
            duracion_horas=duracion,
        )
        nombre_tecnico = _nombre_tecnico_real(db, data.id_tecnico)
    cita = Cita(
        id_cliente=client.id_cliente,
        **data.model_dump(
            exclude={
                "id_tecnico",
                "nombre_tecnico",
                "metodo_pago",
                "datos_pago",
                "costo_cita",
                "estado_pago",
                "numero_transaccion",
            }
        ),
        id_tecnico=data.id_tecnico,
        nombre_tecnico=nombre_tecnico,
        estado="Confirmada",
        costo_cita=tarifa.costo,
    )
    db.add(cita)
    db.commit()
    db.refresh(cita)

    try:
        resultado_pago = pagos_service.procesar_pago(
            data.metodo_pago,
            data.datos_pago or {},
            monto=float(tarifa.costo),
            reference=f"CITA-{cita.id_cita}",
            customer_email=client.email,
        )
    except HTTPException:
        # El pago falló: la cita no debe quedar reservando la franja.
        cita.estado = "Cancelada"
        db.commit()
        raise
    cita.metodo_pago = data.metodo_pago
    cita.estado_pago = resultado_pago.get("estado")
    cita.numero_transaccion = resultado_pago.get("numero_transaccion")
    db.commit()
    db.refresh(cita)

    # Notificar al cliente que su cita fue agendada (solo plataforma, sin correo)
    crear_notificacion(
        db,
        id_usuario=None,
        id_cliente=client.id_cliente,
        tipo="cita",
        titulo="Cita agendada",
        mensaje=(
            f"Tu cita de {cita.tipo_servicio} para el {cita.fecha.strftime('%d/%m/%Y')} "
            f"a las {cita.hora} ha sido agendada exitosamente."
        ),
    )

    # Notificar por correo a TODOS los técnicos asignados (1, 2 y 3).
    if cita.id_tecnico is not None:
        _notificar_tecnicos_cita(db, cita, client)

    # Generar factura PDF y enviarla por correo si el pago fue aprobado.
    if cita.estado_pago == "aprobado":
        from app.services.factura_service import crear_factura_cita

        try:
            crear_factura_cita(db, cita, client)
        except Exception as e:
            print(f"Error generando factura para cita {cita.id_cita}: {e}")

    return CrearCitaResponse(
        **CitaResponse.model_validate(cita).model_dump(),
        redirect_url=resultado_pago.get("redirect_url"),
    )


@router.get("/horas-disponibles")
def horas_disponibles_cita(
    fecha: date,
    tecnico_id: Optional[int] = None,
    excluir_cita_id: Optional[int] = None,
    tipo_servicio: Optional[str] = None,
    items: Optional[str] = None,
    request: Request = None,  # inyectado sin requerir auth; permite extraer cliente opcional
    token: Optional[str] = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
):
    """Franjas horarias libres para la fecha indicada: no cruzadas por otra
    cita y donde exista disponibilidad real de técnicos. Si se indica
    `tecnico_id`, ese técnico debe estar libre durante todo el intervalo;
    si no se indica, basta con que AL MENOS UN técnico activo esté libre.
    `items` (JSON [{id_producto, cantidad}]) permite calcular la duración
    real según los productos (máx. 2.5 h por desplazamiento); sin items se
    usa la duración base del tipo de servicio. Vacío si la fecha es fin de
    semana o pasada."""
    # Hora actual en Colombia (America/Bogota) para filtrar franjas pasadas de hoy.
    if _BOGOTA_TZ is not None:
        ahora = datetime.now(_BOGOTA_TZ)
    else:
        ahora = datetime.now() - timedelta(hours=5)
    hoy = ahora.date()
    if not _dia_es_laboral(fecha) or fecha < hoy:
        return []
    # Si la fecha es hoy, se requieren 3 h de anticipación: una cita a las
    # 13:00 solo puede agendarse desde las 16:00 en adelante. También se
    # descartan las horas ya pasadas.
    duracion = DURACION_MIN
    if items:
        try:
            duracion = duracion_desde_items(db, json.loads(items)) or duracion_base_tipo(tipo_servicio)
        except ValueError:
            duracion = duracion_base_tipo(tipo_servicio)
    else:
        duracion = duracion_base_tipo(tipo_servicio)

    tecnicos_activos = _tecnicos_activos(db)

    # Cliente opcional para exención 3h por oferta (no falla si no autenticado)
    # Se intenta obtener desde Authorization header / cookie sin exigir autenticación.
    cliente_oferta: Optional[Cliente] = None
    try:
        hdr_token = token
        if not hdr_token and request is not None:
            hdr_token = request.cookies.get("access_token")
            if not hdr_token:
                auth = request.headers.get("Authorization") or request.headers.get("authorization")
                if auth and auth.lower().startswith("bearer "):
                    hdr_token = auth.split(None, 1)[1].strip()
        if hdr_token:
            payload = decode_token(hdr_token)
            if payload and payload.get("user_type") == "client":
                uid = payload.get("uid")
                if uid is not None:
                    try:
                        cliente_oferta = db.query(Cliente).filter(Cliente.id_cliente == int(uid)).first()
                    except Exception:
                        cliente_oferta = None
                if cliente_oferta is None and payload.get("sub"):
                    cliente_oferta = db.query(Cliente).filter(Cliente.email == payload.get("sub")).first()
                if cliente_oferta is not None and not cliente_oferta.is_active:
                    cliente_oferta = None
    except Exception:
        cliente_oferta = None

    def _hay_disponibilidad(hora: str) -> bool:
        """True si el intervalo [hora, hora+duracion) es agendable."""
        if tecnico_id is not None:
            return not tecnico_ocupado(
                db, tecnico_id, fecha, hora, excluir_cita_id, duracion_horas=duracion
            )
        # Sin técnico elegido aún: al menos uno debe estar libre.
        return any(
            not tecnico_ocupado(db, t.id_tecnico, fecha, hora, duracion_horas=duracion)
            for t in tecnicos_activos
        )

    def _es_hora_pasada(h: str) -> bool:
        """True si la franja 'h' ya no puede empezar hoy: requiere 3 h de
        anticipación (13:00 → 16:00) y descarta horas pasadas.
        Exención: cliente preferencial (puntaje >=2 con el técnico) que tenga
        una oferta activa para fecha/hora/tecnico exactos ve el hueco aunque
        esté dentro de las 3 h; es para reagendamiento vía oferta sin bloqueo
        de tiempo (mismo servicio, mismo técnico).
        """
        if fecha != hoy:
            return False
        try:
            hora_franja = int(h.split(":")[0])
        except (ValueError, IndexError):
            return False
        ahora_min = ahora.hour * 60 + ahora.minute
        # 3 horas = 180 min de anticipación mínima para agendar hoy
        if hora_franja * 60 < ahora_min + 180:
            # Exención 3h para cliente preferencial con oferta activa en este hueco exacto
            if cliente_oferta is not None:
                try:
                    if tecnico_id is not None:
                        # Verificar oferta activa exacta para tecnico_id
                        if _es_cliente_preferencial(db, cliente_oferta.id_cliente, tecnico_id) and _tiene_oferta_activa(
                            db, cliente_oferta.id_cliente, fecha, h, tecnico_id
                        ):
                            # Si se filtra por tipo_servicio, asegurar coherencia del servicio ofertado
                            if tipo_servicio:
                                of = (
                                    db.query(OfertaHorario)
                                    .filter(
                                        OfertaHorario.id_cliente == cliente_oferta.id_cliente,
                                        OfertaHorario.fecha == fecha,
                                        OfertaHorario.hora == h,
                                        OfertaHorario.id_tecnico == tecnico_id,
                                        OfertaHorario.estado == "Ofrecida",
                                        OfertaHorario.expira_en > datetime.now(),
                                    )
                                    .first()
                                )
                                if of is not None and of.tipo_servicio.lower().strip() != tipo_servicio.lower().strip():
                                    pass
                                else:
                                    return False
                            else:
                                return False
                    else:
                        # Sin tecnico_id elegido: si el cliente tiene alguna oferta activa para este hueco
                        # con algún técnico donde sea preferencial, no filtrar.
                        ofertas = (
                            db.query(OfertaHorario)
                            .filter(
                                OfertaHorario.id_cliente == cliente_oferta.id_cliente,
                                OfertaHorario.fecha == fecha,
                                OfertaHorario.hora == h,
                                OfertaHorario.estado == "Ofrecida",
                                OfertaHorario.expira_en > datetime.now(),
                            )
                            .all()
                        )
                        for of in ofertas:
                            if _es_cliente_preferencial(db, cliente_oferta.id_cliente, of.id_tecnico):
                                if tipo_servicio and of.tipo_servicio.lower().strip() != tipo_servicio.lower().strip():
                                    continue
                                return False
                except Exception:
                    pass
            return True
        return False

    # Si se filtra por técnico específico, la disponibilidad es solo si ESE técnico está libre
    # (no se bloquea por citas de otros técnicos en ese horario).
    if tecnico_id is not None:
        return [
            h
            for h in horas_laborales(fecha, duracion)
            if not _es_hora_pasada(h)
            and not tecnico_ocupado(db, tecnico_id, fecha, h, excluir_cita_id, duracion_horas=duracion)
        ]
    return [
        h
        for h in horas_laborales(fecha, duracion)
        if not _es_hora_pasada(h)
        and not slot_tomado(db, fecha, h, excluir_cita_id, duracion_horas=duracion)
        and _hay_disponibilidad(h)
    ]


@router.get("/tecnico-ocupado")
def tecnico_ocupado_fecha(
    tecnico_id: int,
    fecha: date,
    db: Session = Depends(get_db),
):
    """Horas puntuales donde el técnico ya tiene citas activas o entregas
    asignadas en la fecha. Cada cita bloquea su intervalo completo (según la
    duración estimada del servicio), que se expande en franjas de 1 hora.
    Usado para ocultar solo esos horarios (el resto del día queda
    disponible)."""
    horas: set[str] = set()
    citas = (
        db.query(Cita)
        .filter(
            or_(
                Cita.id_tecnico == tecnico_id,
                Cita.id_tecnico_2 == tecnico_id,
            ),
            Cita.fecha == fecha,
            Cita.estado.in_(ESTADOS_OCUPAN),
        )
        .all()
    )
    for c in citas:
        ini = _hora_a_minutos(c.hora)
        if ini is None:
            horas.add(c.hora)
            continue
        fin = ini + round(duracion_estimada_cita(db, c) * 60)
        for h in range(HORA_INICIO * 60, HORA_FIN * 60, 60):
            if _se_solapan(h, h + 60, ini, fin):
                horas.add(f"{h // 60:02d}:00")
    entregas = (
        db.query(Pedido)
        .filter(
            Pedido.id_tecnico_entrega == tecnico_id,
            Pedido.fecha_entrega == fecha,
            Pedido.estado_entrega.in_(ESTADOS_ENTREGA_OCUPAN),
        )
        .all()
    )
    horas.update(e.hora_entrega for e in entregas if e.hora_entrega)
    return {"horas": sorted(horas)}


@router.put("/admin/{cita_id}", response_model=AdminCitaResponse)
def gestionar_cita_admin(
    cita_id: int,
    data: AdminCitaUpdate,
    current_admin: User = Depends(_admin),
    db: Session = Depends(get_db),
):
    """Actualiza estado y técnico asignado de una cita (solo admin)"""
    cita = db.query(Cita).filter(Cita.id_cita == cita_id).first()
    if not cita:
        raise HTTPException(status_code=404, detail="Cita no encontrada")
    # Recordar los técnicos previos para avisar por correo SOLO a los nuevos.
    tecnicos_previos = {cita.id_tecnico, cita.id_tecnico_2, cita.id_tecnico_3}
    estado_previo = cita.estado
    if data.estado is not None:
        if data.estado not in ESTADOS_CITA:
            raise HTTPException(status_code=400, detail="Estado de cita no válido")
        cita.estado = data.estado
    # Al asignar un técnico se valida que exista, sea compatible con el
    # servicio y esté libre en la fecha/hora (sin contar esta misma cita).
    if "id_tecnico" in data.model_fields_set:
        if data.id_tecnico is None:
            cita.id_tecnico = None
            cita.nombre_tecnico = None
        else:
            _validar_tecnico_cita(
                db,
                data.id_tecnico,
                cita.tipo_servicio,
                cita.fecha,
                cita.hora,
                excluir_cita_id=cita.id_cita,
                duracion_horas=duracion_estimada_cita(db, cita),
            )
            cita.id_tecnico = data.id_tecnico
            cita.nombre_tecnico = _nombre_tecnico_real(db, data.id_tecnico)
    elif data.nombre_tecnico is not None:
        cita.nombre_tecnico = data.nombre_tecnico
    # Segundo técnico (instalaciones que requieren 2 técnicos).
    if "id_tecnico_2" in data.model_fields_set:
        if data.id_tecnico_2 is None:
            cita.id_tecnico_2 = None
            cita.nombre_tecnico_2 = None
        else:
            _validar_tecnico_cita(
                db,
                data.id_tecnico_2,
                cita.tipo_servicio,
                cita.fecha,
                cita.hora,
                excluir_cita_id=cita.id_cita,
                duracion_horas=duracion_estimada_cita(db, cita),
            )
            cita.id_tecnico_2 = data.id_tecnico_2
            cita.nombre_tecnico_2 = _nombre_tecnico_real(db, data.id_tecnico_2)
    elif data.nombre_tecnico_2 is not None:
        cita.nombre_tecnico_2 = data.nombre_tecnico_2
    # Tercer técnico (instalaciones que requieren 3 técnicos).
    if "id_tecnico_3" in data.model_fields_set:
        if data.id_tecnico_3 is None:
            cita.id_tecnico_3 = None
            cita.nombre_tecnico_3 = None
        else:
            _validar_tecnico_cita(
                db,
                data.id_tecnico_3,
                cita.tipo_servicio,
                cita.fecha,
                cita.hora,
                excluir_cita_id=cita.id_cita,
                duracion_horas=duracion_estimada_cita(db, cita),
            )
            cita.id_tecnico_3 = data.id_tecnico_3
            cita.nombre_tecnico_3 = _nombre_tecnico_real(db, data.id_tecnico_3)
    elif data.nombre_tecnico_3 is not None:
        cita.nombre_tecnico_3 = data.nombre_tecnico_3
    # Comisión por el servicio: comision_porcentaje crea o actualiza una
    # comisión con ese % sobre el costo de la cita; comision_valor con un monto
    # fijo. Si la cita ya tiene comisión, se actualiza (no se crea otra).
    if data.comision_porcentaje is not None or data.comision_valor is not None:
        if data.comision_porcentaje is not None:
            if data.comision_porcentaje <= 0:
                raise HTTPException(
                    status_code=400,
                    detail="El porcentaje de la comisión debe ser mayor a cero",
                )
            if cita.costo_cita is None:
                raise HTTPException(
                    status_code=400,
                    detail="La cita no tiene costo para calcular la comisión por porcentaje",
                )
            pct = Decimal(str(data.comision_porcentaje)).quantize(Decimal("0.01"))
            valor = (cita.costo_cita * pct / Decimal("100")).quantize(Decimal("0.01"))
        else:
            if data.comision_valor <= 0:
                raise HTTPException(
                    status_code=400,
                    detail="El valor de la comisión debe ser mayor a cero",
                )
            valor = Decimal(str(data.comision_valor)).quantize(Decimal("0.01"))
            pct = (
                (valor / cita.costo_cita * Decimal("100")).quantize(Decimal("0.01"))
                if cita.costo_cita
                else None
            )
        if cita.id_comision_c is not None:
            comision = (
                db.query(Comision).filter(Comision.id_comision == cita.id_comision_c).first()
            )
        else:
            comision = None
        if comision:
            comision.porcentaje_comision = pct
            comision.valor_comision = valor
        else:
            comision = Comision(porcentaje_comision=pct, valor_comision=valor)
            db.add(comision)
            db.flush()
            cita.id_comision_c = comision.id_comision
    elif "id_comision_c" in data.model_fields_set:
        if data.id_comision_c is None:
            cita.id_comision_c = None
        elif not db.query(Comision).filter(Comision.id_comision == data.id_comision_c).first():
            raise HTTPException(status_code=400, detail="La comisión indicada no existe")
        else:
            cita.id_comision_c = data.id_comision_c
    db.commit()
    db.refresh(cita)

    # Correo a los técnicos NUEVAMENTE asignados (si hubo cambio de personal).
    tecnicos_actuales = {cita.id_tecnico, cita.id_tecnico_2, cita.id_tecnico_3}
    nuevos = {t for t in tecnicos_actuales if t is not None} - {
        t for t in tecnicos_previos if t is not None
    }
    if nuevos:
        cliente = (
            db.query(Cliente).filter(Cliente.id_cliente == cita.id_cliente).first()
        )
        _notificar_tecnicos_cita(db, cita, cliente, solo_ids=nuevos)

    # Cancelación por el administrador: reembolso automático SOLO del servicio
    # (el valor de los productos no se toca; esos los entrega el técnico).
    reembolso_resumen = None
    if data.estado == "Cancelada" and estado_previo not in (None, "Cancelada"):
        from app.services.asignacion_service import cancelar_cita_con_reembolso

        reembolso_resumen = cancelar_cita_con_reembolso(
            db,
            cita,
            motivo="Cancelación realizada por el administrador",
            administrador_id=current_admin.id_usuario,
        )

    # Requisito: POR CADA cambio de estado se notifica al cliente (correo +
    # plataforma) con estado nuevo, fecha/hora del cambio y descripción.
    if data.estado is not None and data.estado != estado_previo:
        from app.services.notificaciones import notificar_cita_estado_cliente

        cliente_cambio = (
            db.query(Cliente).filter(Cliente.id_cliente == cita.id_cliente).first()
        )
        if cliente_cambio:
            notificar_cita_estado_cliente(
                db,
                cliente_id=cliente_cambio.id_cliente,
                correo=cliente_cambio.email,
                cliente_nombre=(
                    f"{cliente_cambio.first_name} {cliente_cambio.last_name}".strip()
                    or "Cliente"
                ),
                datos={
                    "servicio": cita.tipo_servicio,
                    "fecha": cita.fecha.strftime("%d/%m/%Y"),
                    "hora": cita.hora,
                    "tecnico": cita.nombre_tecnico or "Por asignar",
                    "descripcion": cita.descripcion,
                },
                nuevo_estado=cita.estado,
                motivo=reembolso_resumen and "El servicio cancelado será reembolsado.",
            )

    cliente = db.query(Cliente).filter(Cliente.id_cliente == cita.id_cliente).first()
    id_comision, com_porcentaje, com_valor = _info_comision(db, cita)
    respuesta = AdminCitaResponse(
        id_cita=cita.id_cita,
        id_cliente=cita.id_cliente,
        id_tecnico=cita.id_tecnico,
        nombre_tecnico=cita.nombre_tecnico,
        id_tecnico_2=cita.id_tecnico_2,
        nombre_tecnico_2=cita.nombre_tecnico_2,
        tipo_servicio=cita.tipo_servicio,
        fecha=cita.fecha,
        hora=cita.hora,
        direccion=cita.direccion,
        descripcion=cita.descripcion,
        estado=cita.estado,
        costo_cita=float(cita.costo_cita) if cita.costo_cita is not None else None,
        metodo_pago=cita.metodo_pago,
        estado_pago=cita.estado_pago,
        numero_transaccion=cita.numero_transaccion,
        created_at=cita.created_at,
        cliente_nombre=f"{cliente.first_name} {cliente.last_name}".strip() if cliente else None,
        cliente_email=cliente.email if cliente else None,
        id_comision_c=id_comision,
        comision_porcentaje=com_porcentaje,
        comision_valor=com_valor,
        reembolso=reembolso_resumen,
    )

    # Las citas canceladas se ELIMINAN del sistema: el reembolso y el historial
    # se preservan (FK SET NULL / CASCADE), las evidencias y productos de la
    # cita caen por CASCADE y las facturas quedan desvinculadas.
    if data.estado == "Cancelada" and estado_previo not in (None, "Cancelada"):
        # Capturar el hueco ANTES de borrar para ofrecerlo a otros clientes.
        hueco = {
            "fecha": cita.fecha,
            "hora": cita.hora,
            "tipo_servicio": cita.tipo_servicio,
            "id_tecnico": cita.id_tecnico,
            "nombre_tecnico": cita.nombre_tecnico,
            "id_cliente_excluido": cita.id_cliente,
        }
        db.execute(
            text("DELETE FROM calificaciones WHERE id_cita_c = :id"),
            {"id": cita.id_cita},
        )
        db.execute(
            text("UPDATE facturas SET id_cita = NULL WHERE id_cita = :id"),
            {"id": cita.id_cita},
        )
        db.execute(
            text("UPDATE citas SET id_comision_c = NULL WHERE id_cita = :id"),
            {"id": cita.id_cita},
        )
        db.commit()
        db.execute(
            text("DELETE FROM citas WHERE id_cita = :id"),
            {"id": cita.id_cita},
        )
        db.commit()
        _generar_ofertas_por_cancelacion(db, **hueco)

    return respuesta


def _respuesta_admin_cita(db: Session, cita: Cita) -> AdminCitaResponse:
    """Serializa una cita para el panel de administración (cliente + comisión)."""
    from app.services.asignacion_service import especializacion_requerida_cita

    cliente = db.query(Cliente).filter(Cliente.id_cliente == cita.id_cliente).first()
    id_comision, com_porcentaje, com_valor = _info_comision(db, cita)
    esp = especializacion_requerida_cita(db, cita)
    return AdminCitaResponse(
        id_cita=cita.id_cita,
        id_cliente=cita.id_cliente,
        id_tecnico=cita.id_tecnico,
        nombre_tecnico=cita.nombre_tecnico,
        id_tecnico_2=cita.id_tecnico_2,
        nombre_tecnico_2=cita.nombre_tecnico_2,
        tipo_servicio=cita.tipo_servicio,
        fecha=cita.fecha,
        hora=cita.hora,
        direccion=cita.direccion,
        descripcion=cita.descripcion,
        estado=cita.estado,
        costo_cita=float(cita.costo_cita) if cita.costo_cita is not None else None,
        metodo_pago=cita.metodo_pago,
        estado_pago=cita.estado_pago,
        numero_transaccion=cita.numero_transaccion,
        created_at=cita.created_at,
        cliente_nombre=f"{cliente.first_name} {cliente.last_name}".strip() if cliente else None,
        cliente_email=cliente.email if cliente else None,
        id_comision_c=id_comision,
        comision_porcentaje=com_porcentaje,
        comision_valor=com_valor,
        especializacion_requerida=(
            {"id_especializacion": esp.id_especializacion, "nombre": esp.nombre}
            if esp
            else None
        ),
    )


@router.get("/admin/reasignar-pendientes", response_model=List[dict])
def citas_pendientes_reasignar(
    current_admin: User = Depends(_admin),
    db: Session = Depends(get_db),
):
    """Citas activas futuras cuyo técnico principal está inhabilitado y
    esperan que el administrador las reasigne o aplace."""
    subq = (
        select(Tecnico.id_tecnico)
        .join(User, User.id_usuario == Tecnico.id_usuario_t)
        .where(User.is_active == False, User.id_rol_u == 2)  # noqa: E712
    )
    citas = (
        db.query(Cita)
        .filter(
            Cita.id_tecnico.in_(subq),
            Cita.estado.in_(("Pendiente", "Confirmada")),
            Cita.fecha >= date.today(),
        )
        .order_by(Cita.fecha.asc(), Cita.hora.asc())
        .all()
    )
    clientes = {c.id_cliente: c for c in db.query(Cliente).all()}
    respuesta = []
    for cita in citas:
        cliente = clientes.get(cita.id_cliente)
        ficha = db.query(Tecnico).filter(Tecnico.id_tecnico == cita.id_tecnico).first()
        usuario = ficha.usuario if ficha else None
        respuesta.append(
            {
                "id_cita": cita.id_cita,
                "id_cliente": cita.id_cliente,
                "cliente_nombre": f"{cliente.first_name} {cliente.last_name}".strip() if cliente else None,
                "cliente_email": cliente.email if cliente else None,
                "cliente_telefono": cliente.telefono_cliente if cliente else None,
                "tipo_servicio": cita.tipo_servicio,
                "fecha": cita.fecha,
                "hora": cita.hora,
                "direccion": cita.direccion,
                "estado": cita.estado,
                "tecnico_actual_id": cita.id_tecnico,
                "tecnico_actual": cita.nombre_tecnico,
                "tecnico_actual_email": usuario.email if usuario else None,
            }
        )
    return respuesta


@router.get("/admin/{cita_id}/tecnicos-disponibles", response_model=List[dict])
def tecnicos_disponibles_cita(
    cita_id: int,
    current_admin: User = Depends(_admin),
    db: Session = Depends(get_db),
):
    """Técnicos activos que están libres el mismo día y hora de la cita
    (sin contar esta cita). Anota si cubren la especialización requerida por
    la cita y los ordena con los que cubren primero. Sirve de filtro al
    reasignar."""
    from app.services.asignacion_service import especializacion_requerida_cita

    cita = db.query(Cita).filter(Cita.id_cita == cita_id).first()
    if not cita:
        raise HTTPException(status_code=404, detail="Cita no encontrada")
    esp_requerida = especializacion_requerida_cita(db, cita)
    fichas = (
        db.query(Tecnico)
        .join(User, User.id_usuario == Tecnico.id_usuario_t)
        .filter(User.is_active == True, User.id_rol_u == 2)  # noqa: E712
        .all()
    )
    disponibles = []
    duracion_cita = duracion_estimada_cita(db, cita)
    for ficha in fichas:
        if tecnico_ocupado(
            db,
            ficha.id_tecnico,
            cita.fecha,
            cita.hora,
            excluir_cita_id=cita.id_cita,
            duracion_horas=duracion_cita,
        ):
            continue
        u = ficha.usuario
        propias = [
            {"id_especializacion": e.id_especializacion, "nombre": e.nombre}
            for e in (ficha.especializaciones or [])
        ]
        cubre = (
            esp_requerida is None
            or any(e["id_especializacion"] == esp_requerida.id_especializacion for e in propias)
        )
        disponibles.append(
            {
                "id_tecnico": ficha.id_tecnico,
                "id_usuario": u.id_usuario,
                "nombre": f"{u.first_name} {u.last_name}".strip(),
                "email": u.email,
                "certificacion_t": ficha.certificacion_t,
                "especializaciones": propias,
                "cubre_especializacion": cubre,
                "especializacion_requerida": (
                    {
                        "id_especializacion": esp_requerida.id_especializacion,
                        "nombre": esp_requerida.nombre,
                    }
                    if esp_requerida
                    else None
                ),
            }
        )
    disponibles.sort(key=lambda d: (not d["cubre_especializacion"], d["nombre"].lower()))
    return disponibles


@router.get("/admin/{cita_id}/historial", response_model=List[dict])
def historial_cita(
    cita_id: int,
    current_admin: User = Depends(_admin),
    db: Session = Depends(get_db),
):
    """Historial de trazabilidad de una cita (reasignaciones, cancelaciones…)."""
    from app.models.especializacion import HistorialCita

    cita = db.query(Cita).filter(Cita.id_cita == cita_id).first()
    if not cita:
        raise HTTPException(status_code=404, detail="Cita no encontrada")
    entradas = (
        db.query(HistorialCita)
        .filter(HistorialCita.id_cita == cita_id)
        .order_by(HistorialCita.created_at.desc(), HistorialCita.id_historial.desc())
        .all()
    )
    return [
        {
            "id_historial": h.id_historial,
            "id_cita": h.id_cita,
            "accion": h.accion,
            "tecnico_anterior_id": h.tecnico_anterior_id,
            "tecnico_anterior_nombre": h.tecnico_anterior_nombre,
            "tecnico_nuevo_id": h.tecnico_nuevo_id,
            "tecnico_nuevo_nombre": h.tecnico_nuevo_nombre,
            "administrador_id": h.administrador_id,
            "motivo": h.motivo,
            "detalle": h.detalle,
            "created_at": h.created_at,
        }
        for h in entradas
    ]


@router.get("/admin/reasignaciones-historial", response_model=List[dict])
def historial_reasignaciones(
    current_admin: User = Depends(_admin),
    db: Session = Depends(get_db),
    limit: int = 50,
):
    """Resumen para el panel admin: últimas reasignaciones/cancelaciones con
    datos de la cita y del reembolso si lo hubo."""
    from app.models.especializacion import HistorialCita, Reembolso

    entradas = (
        db.query(HistorialCita)
        .filter(HistorialCita.accion.in_(("reasignacion", "cancelacion")))
        .order_by(HistorialCita.created_at.desc(), HistorialCita.id_historial.desc())
        .limit(max(1, min(limit, 200)))
        .all()
    )
    citas_ids = {h.id_cita for h in entradas}
    citas = (
        {c.id_cita: c for c in db.query(Cita).filter(Cita.id_cita.in_(citas_ids)).all()}
        if citas_ids
        else {}
    )
    clientes = {c.id_cliente: c for c in db.query(Cliente).all()}
    reembolsos = {}
    if citas_ids:
        for r in db.query(Reembolso).filter(Reembolso.id_cita.in_(citas_ids)).all():
            reembolsos.setdefault(r.id_cita, r)
    respuesta = []
    for h in entradas:
        cita = citas.get(h.id_cita)
        cliente = clientes.get(cita.id_cliente) if cita else None
        reembolso = reembolsos.get(h.id_cita)
        respuesta.append(
            {
                "id_historial": h.id_historial,
                "id_cita": h.id_cita,
                "accion": h.accion,
                "fecha_cita": cita.fecha if cita else None,
                "hora_cita": cita.hora if cita else None,
                "tipo_servicio": cita.tipo_servicio if cita else None,
                "estado_cita": cita.estado if cita else None,
                "cliente_nombre": f"{cliente.first_name} {cliente.last_name}".strip()
                if cliente
                else None,
                "tecnico_anterior_nombre": h.tecnico_anterior_nombre,
                "tecnico_nuevo_nombre": h.tecnico_nuevo_nombre,
                "motivo": h.motivo,
                "detalle": h.detalle,
                "created_at": h.created_at,
                "reembolso": (
                    {
                        "id_reembolso": reembolso.id_reembolso,
                        "monto": reembolso.monto,
                        "estado": reembolso.estado,
                        "numero_transaccion_reembolso": reembolso.numero_transaccion_reembolso,
                    }
                    if reembolso
                    else None
                ),
            }
        )
    return respuesta


@router.get("/admin/{cita_id}/proxima-fecha", response_model=dict)
def proxima_fecha_reasignacion(
    cita_id: int,
    current_admin: User = Depends(_admin),
    db: Session = Depends(get_db),
):
    """Busca la fecha laboral más próxima (desde mañana) en la que haya al
    menos un técnico activo libre a la hora de la cita. Si el técnico original
    fue rehabilitado, también puede aparecer en la sugerencia."""
    cita = db.query(Cita).filter(Cita.id_cita == cita_id).first()
    if not cita:
        raise HTTPException(status_code=404, detail="Cita no encontrada")
    dia = max(cita.fecha + timedelta(days=1), date.today())
    fichas = (
        db.query(Tecnico)
        .join(User, User.id_usuario == Tecnico.id_usuario_t)
        .filter(User.is_active == True, User.id_rol_u == 2)  # noqa: E712
        .all()
    )
    for _ in range(45):
        if _dia_es_laboral(dia):
            duracion_cita = duracion_estimada_cita(db, cita)
            for ficha in fichas:
                if not tecnico_ocupado(
                    db,
                    ficha.id_tecnico,
                    dia,
                    cita.hora,
                    excluir_cita_id=cita.id_cita,
                    duracion_horas=duracion_cita,
                ):
                    u = ficha.usuario
                    return {
                        "fecha": dia,
                        "hora": cita.hora,
                        "id_tecnico": ficha.id_tecnico,
                        "nombre_tecnico": f"{u.first_name} {u.last_name}".strip(),
                    }
        dia += timedelta(days=1)
    raise HTTPException(
        status_code=404,
        detail="No se encontró una fecha próxima con técnicos disponibles",
    )


@router.post("/admin/{cita_id}/reasignar", response_model=AdminCitaResponse)
def reasignar_cita_admin(
    cita_id: int,
    data: ReasignarCitaRequest,
    current_admin: User = Depends(_admin),
    db: Session = Depends(get_db),
):
    """Reasigna una cita a otro técnico y, opcionalmente, la aplaza a otra
    fecha/hora. Valida que el nuevo técnico cubra la especialización requerida
    por la cita. Notifica al nuevo técnico, registra el historial y envía
    correo al cliente avisando que su cita fue re agendada."""
    from app.services.asignacion_service import (
        especializacion_requerida_cita,
        registrar_historial,
    )

    cita = db.query(Cita).filter(Cita.id_cita == cita_id).first()
    if not cita:
        raise HTTPException(status_code=404, detail="Cita no encontrada")
    if cita.estado not in ("Pendiente", "Confirmada"):
        raise HTTPException(status_code=400, detail="Solo se puede reasignar una cita pendiente o confirmada")
    nueva_fecha = data.fecha or cita.fecha
    nueva_hora = data.hora or cita.hora
    duracion_cita = duracion_estimada_cita(db, cita)
    _validar_franja_cita(nueva_fecha, nueva_hora, duracion_horas=duracion_cita)
    if slot_tomado(db, nueva_fecha, nueva_hora, excluir_cita_id=cita.id_cita, duracion_horas=duracion_cita):
        raise HTTPException(status_code=400, detail="Esa fecha y hora ya están reservadas por otra cita")

    # Validación de especialización requerida por la cita.
    esp_requerida = especializacion_requerida_cita(db, cita)
    tecnico_nuevo = db.query(Tecnico).filter(Tecnico.id_tecnico == data.id_tecnico).first()
    if esp_requerida is not None and tecnico_nuevo is not None:
        propias = {e.id_especializacion for e in (tecnico_nuevo.especializaciones or [])}
        if esp_requerida.id_especializacion not in propias:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"El técnico no tiene la especialización requerida "
                    f"'{esp_requerida.nombre}' para esta cita."
                ),
            )

    _validar_tecnico_cita(
        db,
        data.id_tecnico,
        cita.tipo_servicio,
        nueva_fecha,
        nueva_hora,
        excluir_cita_id=cita.id_cita,
        duracion_horas=duracion_cita,
    )
    if data.id_tecnico_2 is not None:
        _validar_tecnico_cita(
            db,
            data.id_tecnico_2,
            cita.tipo_servicio,
            nueva_fecha,
            nueva_hora,
            excluir_cita_id=cita.id_cita,
            duracion_horas=duracion_cita,
        )
    if data.id_tecnico_3 is not None:
        _validar_tecnico_cita(
            db,
            data.id_tecnico_3,
            cita.tipo_servicio,
            nueva_fecha,
            nueva_hora,
            excluir_cita_id=cita.id_cita,
            duracion_horas=duracion_cita,
        )
    # Recordar técnicos previos: el correo va solo a los recién asignados.
    tecnicos_previos = {cita.id_tecnico, cita.id_tecnico_2, cita.id_tecnico_3}
    tecnico_anterior_id = cita.id_tecnico
    fecha_anterior = cita.fecha
    cita.fecha = nueva_fecha
    cita.hora = nueva_hora
    cita.id_tecnico = data.id_tecnico
    cita.nombre_tecnico = _nombre_tecnico_real(db, data.id_tecnico)
    if data.id_tecnico_2 is not None:
        cita.id_tecnico_2 = data.id_tecnico_2
        cita.nombre_tecnico_2 = _nombre_tecnico_real(db, data.id_tecnico_2)
    if data.id_tecnico_3 is not None:
        cita.id_tecnico_3 = data.id_tecnico_3
        cita.nombre_tecnico_3 = _nombre_tecnico_real(db, data.id_tecnico_3)
    db.commit()
    db.refresh(cita)

    # Correo a cada técnico nuevo asignado (principal, 2 o 3).
    nuevos = {t for t in (data.id_tecnico, data.id_tecnico_2, data.id_tecnico_3) if t is not None} - {
        t for t in tecnicos_previos if t is not None
    }
    cliente = db.query(Cliente).filter(Cliente.id_cliente == cita.id_cliente).first()
    if nuevos:
        _notificar_tecnicos_cita(db, cita, cliente, solo_ids=nuevos)
    # Si el admin reagendó la fecha/hora, avisar a los técnicos que YA estaban
    # asignados (los nuevos ya recibieron el correo de cita asignada).
    if data.fecha or data.hora:
        vigentes = {
            t for t in (cita.id_tecnico, cita.id_tecnico_2, cita.id_tecnico_3) if t is not None
        } - nuevos
        if vigentes:
            _notificar_tecnicos_cita_reagendada(db, cita, cliente, solo_ids=vigentes)

    # Si cambió el técnico ENCARGADO, la entrega del pedido lo sigue al nuevo
    # encargado, ajustada a la nueva fecha/hora de la instalación.
    if data.id_tecnico != tecnico_anterior_id:
        from app.services.notificaciones import notificar_entrega_asignada_tecnico

        pedidos_entrega = (
            db.query(Pedido)
            .filter(
                Pedido.id_tecnico_entrega == tecnico_anterior_id,
                Pedido.fecha_entrega == fecha_anterior,
                Pedido.estado_entrega.in_(ESTADOS_ENTREGA_OCUPAN),
            )
            .all()
        )
        nuevo_encargado = (
            db.query(Tecnico).filter(Tecnico.id_tecnico == data.id_tecnico).first()
        )
        for pedido in pedidos_entrega:
            pedido.id_tecnico_entrega = data.id_tecnico
            pedido.nombre_tecnico_entrega = cita.nombre_tecnico
            pedido.fecha_entrega = nueva_fecha
            pedido.hora_entrega = nueva_hora
        if pedidos_entrega:
            db.commit()
        if (
            pedidos_entrega
            and nuevo_encargado
            and nuevo_encargado.usuario
            and nuevo_encargado.usuario.email
        ):
            for pedido in pedidos_entrega:
                cliente_pedido = pedido.cliente or cliente
                notificar_entrega_asignada_tecnico(
                    db,
                    nuevo_encargado.usuario.id_usuario,
                    nuevo_encargado.usuario.email,
                    cita.nombre_tecnico or "técnico",
                    {
                        "pedido": pedido.id_pedido,
                        "cliente": (
                            f"{cliente_pedido.first_name} {cliente_pedido.last_name}".strip()
                            if cliente_pedido
                            else "Cliente"
                        ),
                        "direccion": (
                            (cliente_pedido.address if cliente_pedido else "")
                            or (cliente.address if cliente else "")
                            or ""
                        ),
                        "telefono": cliente.telefono_cliente if cliente else None,
                        "fecha": nueva_fecha.strftime("%d/%m/%Y"),
                        "hora": nueva_hora,
                    },
                )

    # Trazabilidad de la reasignación.
    registrar_historial(
        db,
        cita.id_cita,
        accion="reasignacion",
        tecnico_anterior_id=None,
        tecnico_anterior_nombre=None,
        tecnico_nuevo_id=data.id_tecnico,
        tecnico_nuevo_nombre=cita.nombre_tecnico,
        administrador_id=current_admin.id_usuario,
        motivo=data.motivo,
        detalle=(
            f"Reasignación manual{f' ({data.fecha.isoformat()} {data.hora})' if data.fecha or data.hora else ''}"
            + (f" — Especialización: {esp_requerida.nombre}" if esp_requerida else "")
        ),
    )

    cliente = db.query(Cliente).filter(Cliente.id_cliente == cita.id_cliente).first()
    if cliente and cliente.email:
        from app.config import settings as _settings

        # Cambio de técnico: el cliente no se notifica si está desactivado
        # por configuración (modificaciones al técnico desde el admin).
        if _settings.NOTIFICAR_CLIENTE_CAMBIOS_TECNICO:
            notificar_cita_reasignada_cliente(
                db,
                cliente_id=cliente.id_cliente,
                correo=cliente.email,
                cliente_nombre=f"{cliente.first_name} {cliente.last_name}".strip() or "Cliente",
                datos={
                    "servicio": cita.tipo_servicio,
                    "fecha": cita.fecha.strftime("%d/%m/%Y"),
                    "hora": cita.hora,
                    "tecnico": cita.nombre_tecnico or "técnico",
                },
            )
    return _respuesta_admin_cita(db, cita)


@router.get("/mis-citas", response_model=List[ClienteCitaResponse])
def mis_citas(
    client: Cliente = Depends(get_current_client),
    db: Session = Depends(get_db),
):
    """Lista las citas del cliente autenticado, ordenadas por fecha y hora"""
    citas = (
        db.query(Cita)
        .filter(Cita.id_cliente == client.id_cliente)
        .order_by(Cita.fecha.asc(), Cita.hora.asc())
        .all()
    )
    for cita in citas:
        _verificar_recordatorio_cita(db, client, cita)
    return [_serializar_cita_cliente(db, cita) for cita in citas]


@router.put("/{cita_id}", response_model=CitaResponse)
def editar_cita(
    cita_id: int,
    data: CitaUpdate,
    client: Cliente = Depends(get_current_client),
    db: Session = Depends(get_db),
):
    """Actualiza los datos de una cita propia aún modificable"""
    cita = _get_own_cita(cita_id, client, db)
    if cita.estado not in ESTADOS_EDITABLES:
        raise HTTPException(status_code=400, detail="No se puede modificar una cita finalizada o cancelada")
    update_data = data.model_dump(exclude_unset=True)
    nueva_fecha = update_data.get("fecha", cita.fecha)
    nueva_hora = update_data.get("hora", cita.hora)
    hora_reag = datetime.strptime(nueva_hora, "%H:%M").time() if ":" in nueva_hora else time(int(nueva_hora), 0)
    fecha_hora_reag = datetime.combine(nueva_fecha, hora_reag)
    # Exención 3h para cliente preferencial con oferta activa vía reagendamiento:
    # si el cliente es frecuente con el técnico (puntaje >=2) y tiene una oferta
    # activa para el nuevo hueco exacto (misma fecha/hora/tecnico y mismo servicio
    # que su cita existente), se permite mover dentro de las 3h sin bloqueo.
    exime_3h_reag = False
    if cita.id_tecnico is not None:
        try:
            oferta_match = (
                db.query(OfertaHorario)
                .filter(
                    OfertaHorario.id_cliente == client.id_cliente,
                    OfertaHorario.fecha == nueva_fecha,
                    OfertaHorario.hora == nueva_hora,
                    OfertaHorario.id_tecnico == cita.id_tecnico,
                    OfertaHorario.tipo_servicio == cita.tipo_servicio,
                    OfertaHorario.estado == "Ofrecida",
                    OfertaHorario.expira_en > datetime.now(),
                )
                .first()
            )
            if (
                oferta_match is not None
                and _es_cliente_preferencial(db, client.id_cliente, cita.id_tecnico)
                and _tiene_oferta_activa(db, client.id_cliente, nueva_fecha, nueva_hora, cita.id_tecnico)
            ):
                exime_3h_reag = True
        except Exception:
            exime_3h_reag = False
    if not exime_3h_reag and fecha_hora_reag < datetime.now() + timedelta(hours=3):
        raise HTTPException(status_code=400, detail="Las citas deben reagendarse con al menos 3 horas de anticipación")
    duracion_cita = duracion_estimada_cita(db, cita)
    _validar_franja_cita(nueva_fecha, nueva_hora, duracion_horas=duracion_cita)
    if slot_tomado(db, nueva_fecha, nueva_hora, excluir_cita_id=cita.id_cita, duracion_horas=duracion_cita):
        raise HTTPException(
            status_code=400,
            detail="Esa fecha y hora ya fue reservada por otro cliente. Elige otra franja.",
        )
    if cita.id_tecnico is not None:
        _validar_tecnico_cita(
            db,
            cita.id_tecnico,
            update_data.get("tipo_servicio", cita.tipo_servicio),
            update_data.get("fecha", cita.fecha),
            update_data.get("hora", cita.hora),
            excluir_cita_id=cita.id_cita,
            duracion_horas=duracion_cita,
        )
    for field, value in update_data.items():
        setattr(cita, field, value)
    # La cita queda confirmada desde su creación (el pago ya fue procesado):
    # editar fechas/hora no la regresa a Pendiente.
    db.commit()
    db.refresh(cita)
    # Avisar a los técnicos asignados cuando el cliente reagenda (cambia fecha/hora).
    if cita.id_tecnico is not None and ("fecha" in update_data or "hora" in update_data):
        _notificar_tecnicos_cita_reagendada(db, cita, client)
    return cita


@router.delete("/{cita_id}", response_model=dict)
def cancelar_cita(
    cita_id: int,
    client: Cliente = Depends(get_current_client),
    db: Session = Depends(get_db),
):
    """Cancela una cita propia. Si estaba pagada, procesa automáticamente
    el reembolso del 85% del servicio (se retiene el 15%) y notifica al
    administrador como comprobante."""
    cita = _get_own_cita(cita_id, client, db)
    if cita.estado == "Finalizada":
        raise HTTPException(status_code=400, detail="No se puede cancelar una cita ya finalizada")
    if cita.estado == "Cancelada":
        raise HTTPException(status_code=400, detail="La cita ya está cancelada")

    estado_anterior = cita.estado
    nombre_cliente = f"{client.first_name} {client.last_name}".strip() or "Cliente"
    hueco = {
        "fecha": cita.fecha,
        "hora": cita.hora,
        "tipo_servicio": cita.tipo_servicio,
        "id_tecnico": cita.id_tecnico,
        "nombre_tecnico": cita.nombre_tecnico,
        "id_cliente_excluido": client.id_cliente,
    }
    cita.estado = "Cancelada"

    # ── Reembolso del 85% si la cita tenía pago aprobado ─────────
    # Queda PENDIENTE hasta que el administrador lo confirme.
    reembolso_info = None
    if cita.estado_pago in ("aprobado", "pagado") and cita.costo_cita:
        from app.models.especializacion import Reembolso

        monto_reembolso = round(float(cita.costo_cita) * 0.85, 2)
        retenido = round(float(cita.costo_cita) - monto_reembolso, 2)
        motivo_reembolso = (
            f"Cancelación realizada por el cliente. Se retiene el 15% "
            f"del servicio (${retenido:,.0f} COP)."
        )
        reembolso = Reembolso(
            id_cita=cita.id_cita,
            monto=monto_reembolso,
            estado="Pendiente",
            motivo=motivo_reembolso,
            numero_transaccion_original=cita.numero_transaccion,
        )
        db.add(reembolso)
        db.flush()

        # Notificación de plataforma + correo a los administradores.
        admins = (
            db.query(User)
            .filter(User.id_rol_u == 1, User.is_active == True)  # noqa: E712
            .all()
        )
        from app.services.notificaciones import programar_correo

        for admin in admins:
            crear_notificacion(
                db,
                id_usuario=admin.id_usuario,
                id_cliente=None,
                tipo="reembolso",
                titulo="Reembolso pendiente por cancelación de cliente",
                mensaje=(
                    f"{nombre_cliente} canceló la cita #{cita.id_cita} "
                    f"({cita.tipo_servicio}, {cita.fecha}). Confirma el reembolso "
                    f"del 85% del servicio (${monto_reembolso:,.0f} COP); se retiene "
                    f"el 15% (${retenido:,.0f} COP)."
                ),
            )
            if admin.email:
                programar_correo(
                    admin.email,
                    f"Reembolso pendiente - Cita #{cita.id_cita} cancelada",
                    "<div style='font-family:Arial,sans-serif;max-width:600px;margin:auto;"
                    "background:#fff;border-radius:12px;border:1px solid #e8e2d6;overflow:hidden'>"
                    "<div style='background:#1f1a12;padding:20px 26px;border-bottom:4px solid #d4a54b'>"
                    "<h2 style='margin:0;color:#fff;font-size:18px'>Neodomus</h2>"
                    "<p style='margin:4px 0 0;color:#d4a54b;font-size:12px;font-weight:600'>"
                    "REEMBOLSO PENDIENTE DE CONFIRMACIÓN</p></div>"
                    "<div style='padding:24px'>"
                    f"<p>Hola, <strong>{nombre_cliente}</strong> canceló la cita #{cita.id_cita}.</p>"
                    f"<p><strong>Servicio:</strong> {cita.tipo_servicio}<br/>"
                    f"<strong>Valor pagado:</strong> ${float(cita.costo_cita):,.0f} COP<br/>"
                    f"<strong>A reembolsar (85%):</strong> ${monto_reembolso:,.0f} COP<br/>"
                    f"<strong>Retención (15%):</strong> ${retenido:,.0f} COP</p>"
                    f"<p style='color:#666;font-size:13px'>{motivo_reembolso}</p>"
                    "<p style='color:#b8860b;font-weight:700'>Confirma el reembolso desde el panel administrativo.</p>"
                    "</div></div>",
                )

        reembolso_info = {
            "id_reembolso": reembolso.id_reembolso,
            "monto": monto_reembolso,
            "estado": "Pendiente",
        }

    db.commit()
    db.refresh(cita)

    # Requisito: notificar al CLIENTE el cambio de estado (Cancelada) con
    # estado nuevo, fecha/hora del cambio y descripción del servicio.
    from app.services.notificaciones import notificar_cita_estado_cliente

    notificar_cita_estado_cliente(
        db,
        cliente_id=client.id_cliente,
        correo=client.email,
        cliente_nombre=nombre_cliente,
        datos={
            "servicio": cita.tipo_servicio,
            "fecha": cita.fecha.strftime("%d/%m/%Y"),
            "hora": cita.hora,
            "tecnico": cita.nombre_tecnico or "Por asignar",
            "descripcion": cita.descripcion,
        },
        nuevo_estado="Cancelada",
        motivo=(
            "Reembolso del 85% del servicio pendiente de confirmación."
            if reembolso_info
            else None
        ),
    )

    # El hueco liberado se ofrece a otros clientes con citas futuras
    # con el mismo técnico (prioridad por lealtad).
    _generar_ofertas_por_cancelacion(db, **hueco)

    return {
        "id_cita": cita.id_cita,
        "estado": cita.estado,
        "estado_anterior": estado_anterior,
        "reembolso": reembolso_info,
    }


# ============================================================
# Ofertas de horarios liberados (cliente)
# ============================================================

@router.get("/ofertas-pendientes", response_model=List[dict])
def ofertas_pendientes(
    client: Cliente = Depends(get_current_client),
    db: Session = Depends(get_db),
):
    """Ofertas activas para el cliente: huecos liberados por cancelaciones
    donde puede ADELANTAR su cita con el mismo técnico."""
    ahora = datetime.now()
    filas = (
        db.query(OfertaHorario)
        .filter(
            OfertaHorario.id_cliente == client.id_cliente,
            OfertaHorario.estado == "Ofrecida",
            OfertaHorario.expira_en > ahora,
        )
        .order_by(OfertaHorario.expira_en.asc())
        .all()
    )
    resultado = []
    for o in filas:
        mi_cita = (
            db.query(Cita)
            .filter(
                Cita.id_cliente == client.id_cliente,
                Cita.id_tecnico == o.id_tecnico,
                Cita.estado.in_(("Pendiente", "Confirmada")),
                Cita.fecha >= o.fecha,
            )
            .order_by(Cita.fecha.asc(), Cita.hora.asc())
            .first()
        )
        if not mi_cita:
            continue
        resultado.append({
            "id_oferta": o.id_oferta,
            "fecha_nueva": o.fecha.isoformat(),
            "hora_nueva": o.hora,
            "tipo_servicio": o.tipo_servicio,
            "tecnico": o.nombre_tecnico,
            "mi_cita_id": mi_cita.id_cita,
            "mi_fecha_actual": mi_cita.fecha.isoformat(),
            "mi_hora_actual": mi_cita.hora,
            "expira_en": o.expira_en.isoformat(),
        })
    return resultado


@router.post("/ofertas/{id_oferta}/aceptar", response_model=dict)
def aceptar_oferta(
    id_oferta: int,
    client: Cliente = Depends(get_current_client),
    db: Session = Depends(get_db),
):
    """El cliente acepta mover su cita al horario ofrecido. Gana el primero:
    si otra fila del mismo hueco tiene MAYOR puntaje (lealtad) aún activa, se
    exige que esa responda primero; al aceptar uno, el resto pasa a 'Perdida'."""
    oferta = (
        db.query(OfertaHorario)
        .filter(
            OfertaHorario.id_oferta == id_oferta,
            OfertaHorario.id_cliente == client.id_cliente,
        )
        .with_for_update()
        .first()
    )
    if not oferta or oferta.estado != "Ofrecida":
        raise HTTPException(status_code=409, detail="Esta oferta ya no está disponible")

    ahora = datetime.now()
    if oferta.expira_en <= ahora:
        oferta.estado = "Expirada"
        db.commit()
        raise HTTPException(status_code=410, detail="La oferta expiró")

    # Prioridad por lealtad: alguien con más puntaje sigue decidiendo.
    mayor_pendiente = (
        db.query(OfertaHorario)
        .filter(
            OfertaHorario.fecha == oferta.fecha,
            OfertaHorario.hora == oferta.hora,
            OfertaHorario.id_tecnico == oferta.id_tecnico,
            OfertaHorario.estado == "Ofrecida",
            OfertaHorario.puntaje > oferta.puntaje,
            OfertaHorario.expira_en > ahora,
        )
        .first()
    )
    if mayor_pendiente:
        minutos = max(1, int((mayor_pendiente.expira_en - ahora).total_seconds() // 60))
        raise HTTPException(
            status_code=403,
            detail=(
                "Hay clientes con mayor prioridad evaluando este horario. "
                f"Podrás aceptarlo en ~{minutos} min si no lo toman."
            ),
        )

    # Validación: oferta debe corresponder a la misma cita existente (mismo servicio, mismo técnico).
    # La query filtra por id_tecnico igual al de la oferta; reforzamos con tipo_servicio para
    # asegurar que el cliente mueve su cita del mismo servicio al hueco liberado (no cambiar de servicio).
    mi_cita = (
        db.query(Cita)
        .filter(
            Cita.id_cliente == client.id_cliente,
            Cita.id_tecnico == oferta.id_tecnico,
            Cita.estado.in_(("Pendiente", "Confirmada")),
        )
        .order_by(Cita.fecha.asc(), Cita.hora.asc())
        .first()
    )
    if not mi_cita:
        raise HTTPException(status_code=409, detail="Ya no tienes una cita movible para este técnico")
    # Mismo servicio: evita que una oferta de 'instalacion' mueva una cita de 'reparacion' con mismo técnico.
    if mi_cita.tipo_servicio.lower().strip() != oferta.tipo_servicio.lower().strip():
        raise HTTPException(status_code=409, detail="La oferta corresponde a un tipo de servicio diferente al de tu cita con este técnico")
    if (mi_cita.fecha, mi_cita.hora) <= (oferta.fecha, oferta.hora):
        raise HTTPException(status_code=409, detail="Tu cita ya está agendada en un horario igual o mejor")

    # Nota exención 3h: aceptar_oferta NO aplica la restricción de 3h de anticipación.
    # Clientes preferenciales (puntaje >=2 con el técnico) con oferta activa pueden mover su cita
    # incluso si el hueco ofertado está dentro de las 3 h; es el flujo de reagendamiento vía oferta.
    # _validar_franja_cita solo valida día laboral / franja válida y no bloquea por 3h.
    # El 1h mínimo ya lo garantiza _generar_ofertas_por_cancelacion (no ofrece franjas <=1h).
    # Para trazabilidad, si es preferencial dejamos pasar explícitamente aun dentro de 3h.
    # No se lanza 400 por 3h aquí — frontend tampoco debe mostrar error en aceptarOferta.
    _validar_franja_cita(
        oferta.fecha,
        oferta.hora,
        excluir_cita_id=mi_cita.id_cita,
        duracion_horas=duracion_estimada_cita(db, mi_cita),
    )

    fecha_anterior, hora_anterior = mi_cita.fecha, mi_cita.hora
    mi_cita.fecha = oferta.fecha
    mi_cita.hora = oferta.hora

    oferta.estado = "Aceptada"
    oferta.aceptada_por_cliente = client.id_cliente

    # Las demás ofertas del mismo hueco desaparecen.
    db.query(OfertaHorario).filter(
        OfertaHorario.fecha == oferta.fecha,
        OfertaHorario.hora == oferta.hora,
        OfertaHorario.id_tecnico == oferta.id_tecnico,
        OfertaHorario.id_oferta != oferta.id_oferta,
        OfertaHorario.estado == "Ofrecida",
    ).update({"estado": "Perdida"}, synchronize_session=False)

    db.commit()

    from app.services.notificaciones import crear_notificacion, notificar_cita_reasignada_cliente

    tecnico_ficha = (
        db.query(Tecnico).filter(Tecnico.id_tecnico == oferta.id_tecnico).first()
    )
    if tecnico_ficha and tecnico_ficha.usuario:
        crear_notificacion(
            db,
            id_usuario=tecnico_ficha.usuario.id_usuario,
            id_cliente=None,
            tipo="cita",
            titulo="Cita adelantada a horario libre",
            mensaje=(
                f"{client.first_name} {client.last_name} movió su cita de "
                f"{fecha_anterior.strftime('%d/%m')} {hora_anterior} al {oferta.fecha.strftime('%d/%m')} "
                f"a las {oferta.hora} contigo."
            ),
        )
    notificar_cita_reasignada_cliente(
        db,
        client.id_cliente,
        client.email,
        f"{client.first_name} {client.last_name}".strip() or "Cliente",
        {
            "servicio": mi_cita.tipo_servicio,
            "fecha": oferta.fecha.strftime("%d/%m/%Y"),
            "hora": oferta.hora,
            "tecnico": oferta.nombre_tecnico or "tu técnico",
        },
    )

    return {
        "id_cita": mi_cita.id_cita,
        "fecha_nueva": mi_cita.fecha.isoformat(),
        "hora_nueva": mi_cita.hora,
        "msg": "Tu cita fue adelantada al horario disponible",
    }


# ============================================================
# Productos asociados a una cita
# ============================================================

class CitaProductoCreate(BaseModel):
    id_producto: int
    id_variante: Optional[int] = None
    cantidad: int = 1
    notas: Optional[str] = None


class CitaProductoResponse(BaseModel):
    id_cita_producto: int
    id_producto: int
    id_variante: Optional[int] = None
    cantidad: int
    notas: Optional[str] = None
    producto_nombre: Optional[str] = None
    producto_marca: Optional[str] = None
    variante_nombre: Optional[str] = None
    variante_hex: Optional[str] = None
    variante_tamano: Optional[str] = None


def _cita_es_del_cliente(db: Session, cita_id: int, id_cliente: int) -> bool:
    return (
        db.query(Cita)
        .filter(Cita.id_cita == cita_id, Cita.id_cliente == id_cliente)
        .first()
        is not None
    )


def _serializar_producto_cita(db: Session, cp: CitaProducto) -> CitaProductoResponse:
    producto = db.query(Producto).filter(Producto.id_producto == cp.id_producto).first()
    variante = None
    if cp.id_variante:
        variante = db.query(ProductoVariante).filter(ProductoVariante.id == cp.id_variante).first()
    return CitaProductoResponse(
        id_cita_producto=cp.id_cita_producto,
        id_producto=cp.id_producto,
        id_variante=cp.id_variante,
        cantidad=cp.cantidad,
        notas=cp.notas,
        producto_nombre=producto.nombre_producto if producto else None,
        producto_marca=producto.marca if producto else None,
        variante_nombre=variante.nombre if variante else None,
        variante_hex=variante.hex if variante else None,
        variante_tamano=variante.tamaño if variante else None,
    )


@router.get("/{cita_id}/productos", response_model=List[CitaProductoResponse])
def listar_productos_cita(
    cita_id: int,
    current_user: User = Depends(get_current_employee),
    db: Session = Depends(get_db),
):
    """Productos asociados a una cita (admin o técnico asignado)."""
    cita = db.query(Cita).filter(Cita.id_cita == cita_id).first()
    if not cita:
        raise HTTPException(status_code=404, detail="Cita no encontrada")
    role = db.execute(
        select(RolesUsuario.nombre_rol).where(RolesUsuario.id_rol == current_user.id_rol_u)
    ).scalar_one_or_none()
    if role not in ("admin", "administrador"):
        tecnico = db.query(Tecnico).filter(Tecnico.id_usuario_t == current_user.id_usuario).first()
        if not tecnico or (
            cita.id_tecnico != tecnico.id_tecnico
            and cita.id_tecnico_2 != tecnico.id_tecnico
        ):
            raise HTTPException(status_code=403, detail="No tienes acceso a esta cita")
    filas = (
        db.query(CitaProducto)
        .filter(CitaProducto.id_cita == cita_id)
        .all()
    )
    return [_serializar_producto_cita(db, cp) for cp in filas]


@router.post("/{cita_id}/productos", response_model=CitaProductoResponse)
def agregar_producto_cita(
    cita_id: int,
    data: CitaProductoCreate,
    current_user: User = Depends(get_current_employee),
    db: Session = Depends(get_db),
):
    """Asocia un producto a una cita (admin o técnico asignado)."""
    cita = db.query(Cita).filter(Cita.id_cita == cita_id).first()
    if not cita:
        raise HTTPException(status_code=404, detail="Cita no encontrada")
    role = db.execute(
        select(RolesUsuario.nombre_rol).where(RolesUsuario.id_rol == current_user.id_rol_u)
    ).scalar_one_or_none()
    if role not in ("admin", "administrador"):
        tecnico = db.query(Tecnico).filter(Tecnico.id_usuario_t == current_user.id_usuario).first()
        if not tecnico or (
            cita.id_tecnico != tecnico.id_tecnico
            and cita.id_tecnico_2 != tecnico.id_tecnico
        ):
            raise HTTPException(status_code=403, detail="No tienes acceso a esta cita")
    producto = db.query(Producto).filter(Producto.id_producto == data.id_producto).first()
    if not producto:
        raise HTTPException(status_code=404, detail="Producto no encontrado")
    if data.id_variante is not None:
        variante = db.query(ProductoVariante).filter(ProductoVariante.id == data.id_variante).first()
        if not variante or variante.id_producto != data.id_producto:
            raise HTTPException(status_code=400, detail="La variante no pertenece al producto indicado")
    if data.cantidad < 1:
        raise HTTPException(status_code=400, detail="La cantidad debe ser al menos 1")
    cp = CitaProducto(
        id_cita=cita_id,
        id_producto=data.id_producto,
        id_variante=data.id_variante,
        cantidad=data.cantidad,
        notas=(data.notas or "").strip()[:255] or None,
    )
    db.add(cp)
    db.commit()
    db.refresh(cp)
    return _serializar_producto_cita(db, cp)


@router.delete("/{cita_id}/productos/{cita_producto_id}", response_model=dict)
def eliminar_producto_cita(
    cita_id: int,
    cita_producto_id: int,
    current_user: User = Depends(get_current_employee),
    db: Session = Depends(get_db),
):
    """Elimina un producto asociado a una cita (admin o técnico asignado)."""
    cita = db.query(Cita).filter(Cita.id_cita == cita_id).first()
    if not cita:
        raise HTTPException(status_code=404, detail="Cita no encontrada")
    role = db.execute(
        select(RolesUsuario.nombre_rol).where(RolesUsuario.id_rol == current_user.id_rol_u)
    ).scalar_one_or_none()
    if role not in ("admin", "administrador"):
        tecnico = db.query(Tecnico).filter(Tecnico.id_usuario_t == current_user.id_usuario).first()
        if not tecnico or (
            cita.id_tecnico != tecnico.id_tecnico
            and cita.id_tecnico_2 != tecnico.id_tecnico
        ):
            raise HTTPException(status_code=403, detail="No tienes acceso a esta cita")
    cp = (
        db.query(CitaProducto)
        .filter(
            CitaProducto.id_cita_producto == cita_producto_id,
            CitaProducto.id_cita == cita_id,
        )
        .first()
    )
    if not cp:
        raise HTTPException(status_code=404, detail="Producto no encontrado en esta cita")
    db.delete(cp)
    db.commit()
    return {"msg": "Producto eliminado de la cita"}
