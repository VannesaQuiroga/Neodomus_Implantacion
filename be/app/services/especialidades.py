"""
Servicio: disponibilidad de técnicos para citas.

Centraliza las reglas:
  1) Cualquier técnico puede atender cualquier servicio (sin filtro de
     especialidad): todos los técnicos hacen de todo.
  2) Ocupación del técnico por día (una cita o entrega activa bloquea TODO
     el día, para que el técnico no atienda a otros clientes ese día).
  3) Exclusividad de franja horaria: una fecha + hora solo puede ser
     reservada por un cliente a la vez.
"""
from datetime import date
from typing import Iterable, Optional

from fastapi import HTTPException
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.models.cita import Cita

# Estados que bloquean la agenda del técnico
ESTADOS_OCUPAN = ("Pendiente", "Confirmada")

# Estados de entrega que bloquean el día del técnico
ESTADOS_ENTREGA_OCUPAN = ("Asignada", "Recogido", "En camino")

# Franja laboral: citas cada 3 horas (08, 11, 14, 17), lunes a sábado.
# Domingo (weekday=6) queda bloqueado para agendar.
HORA_INICIO = 8
HORA_FIN = 18
DIAS_LABORALES = (0, 1, 2, 3, 4, 5)  # Monday..Saturday

# Duración estimada de un servicio en la agenda (horas).
# Depende de la dificultad de instalación de los productos de la compra;
# un servicio dura entre 1 y 2.5 h sin importar el volumen (el volumen
# lo reparten varios técnicos o varios días).
HORAS_POR_DIFICULTAD = {"baja": 1.0, "media": 2.0, "alta": 4.0}
HORAS_DIFICULTAD_DEFAULT = 1.5
DURACION_MIN = 1.0
DURACION_MAX = 2.5


def _clamp_duracion(horas: float) -> float:
    return max(DURACION_MIN, min(DURACION_MAX, horas))


def horas_producto(producto) -> float:
    """Horas estimadas según la dificultad de instalación del producto."""
    dificultad = (getattr(producto, "dificultad_instalacion", None) or "").strip().lower()
    return HORAS_POR_DIFICULTAD.get(dificultad, HORAS_DIFICULTAD_DEFAULT)


def duracion_base_tipo(tipo_servicio: Optional[str]) -> float:
    """Duración por defecto cuando la cita no tiene productos asociados."""
    return 1.5 if (tipo_servicio or "").strip().lower() == "instalacion" else 1.0


def cantidad_tecnicos_requerida(tipo_servicio: Optional[str], productos: Iterable) -> int:
    """Nº de técnicos que exige una instalación según los productos y el tipo
    de servicio (misma regla que el checkout): solo «instalacion» escala con
    ``tecnicos_requeridos``; el resto usa 1 técnico."""
    import unicodedata

    tipo_norm = "".join(
        c for c in unicodedata.normalize("NFD", str(tipo_servicio or "").lower())
        if unicodedata.category(c) != "Mn"
    )
    if tipo_norm != "instalacion":
        return 1
    requeridos = [
        int(p.tecnicos_requeridos or 1)
        for p in (productos or [])
        if p is not None and getattr(p, "tecnicos_requeridos", None)
    ]
    return max(requeridos) if requeridos else 1


def duracion_desde_items(db: Session, items: Optional[Iterable[dict]]) -> Optional[float]:
    """Duración estimada (1–2.5 h) a partir de ítems de compra
    [{id_producto, cantidad}] antes de crear la cita."""
    from app.models.producto import Producto

    total = 0.0
    for item in items or []:
        try:
            id_producto = int(item.get("id_producto"))
            cantidad = max(1, int(item.get("cantidad") or 1))
        except (TypeError, ValueError):
            continue
        producto = db.query(Producto).filter(Producto.id_producto == id_producto).first()
        if producto is not None:
            total += horas_producto(producto) * cantidad
    if total <= 0:
        return None
    return _clamp_duracion(total)


def duracion_estimada_cita(db: Session, cita: Cita) -> float:
    """Horas que la cita ocupa en la agenda del técnico (entre 1 y 2.5)."""
    total = 0.0
    for cp in (cita.productos_asociados or []):
        producto = cp.producto
        if producto is not None:
            total += horas_producto(producto) * max(1, cp.cantidad or 1)
    if total > 0:
        return _clamp_duracion(total)
    return duracion_base_tipo(cita.tipo_servicio)


def _hora_a_minutos(hora: str | None) -> Optional[int]:
    try:
        partes = (hora or "").split(":")
        return int(partes[0]) * 60 + int(partes[1])
    except (TypeError, ValueError, IndexError):
        return None


def _se_solapan(ini_a: int, fin_a: int, ini_b: int, fin_b: int) -> bool:
    return ini_a < fin_b and ini_b < fin_a


def compatible_especialidad(tipo_servicio: Optional[str], certificacion: Optional[str]) -> bool:
    """Cualquier técnico puede atender cualquier servicio."""
    return True


# ────────────────────────────────────────────────────────────────
# Especializaciones (M2M técnico/producto)
# ────────────────────────────────────────────────────────────────


def especializaciones_de_tecnico(tecnico) -> list[int]:
    """Ids de especialización de un técnico (objeto Tecnico)."""
    return [e.id_especializacion for e in (tecnico.especializaciones or [])]


def tecnico_cubre(
    tecnico,
    ids_especializacion: Iterable[int],
) -> bool:
    """True si el técnico tiene TODAS las especializaciones indicadas.
    Si no se exige ninguna, todo técnico activo sirve."""
    requeridas = set(ids_especializacion or [])
    if not requeridas:
        return True
    propias = set(especializaciones_de_tecnico(tecnico))
    return requeridas.issubset(propias)


# Consulta Tecnico.
def _tecnicos_activos(db: Session) -> list:
    from app.models.tecnico import Tecnico
    from app.models.user import User

    return (
        db.query(Tecnico)
        .join(User, User.id_usuario == Tecnico.id_usuario_t)
        .filter(User.is_active == True, User.id_rol_u == 2)  # noqa: E712
        .all()
    )


def candidatos_para_especializaciones(
    db: Session,
    ids_especializacion: Iterable[int],
    fecha: Optional[date] = None,
    hora: str | None = None,
    excluir_ids: Optional[Iterable[int]] = None,
    duracion_horas: float = DURACION_MIN,
) -> list:
    """Técnicos activos que cubren todas las especializaciones pedidas y están
    libres durante toda la duración del servicio (si se indica fecha/hora).
    Ordenados por nombre. Delega en ``tecnicos_disponibles`` (fuente común)."""
    if fecha is None:
        return sorted(
            [t for t in _tecnicos_activos(db) if tecnico_cubre(t, ids_especializacion)],
            key=lambda t: ((t.usuario.first_name + " " + t.usuario.last_name) if t.usuario else ""),
        )
    return tecnicos_disponibles(
        db, fecha, hora, ids_especializacion, excluir_ids, None, duracion_horas
    )


def mejor_tecnico_para(
    db: Session,
    ids_especializacion: Iterable[int],
    fecha: Optional[date] = None,
    hora: str | None = None,
    excluir_ids: Optional[Iterable[int]] = None,
):
    """Mejor candidato disponible para unas especializaciones: prioriza al
    que cubre TODO; si ninguno cubre todo pero hay fecha/hora, devuelve None
    (no se asigna a alguien sin la especialidad)."""
    return next(iter(candidatos_para_especializaciones(db, ids_especializacion, fecha, hora, excluir_ids)), None)


def buscar_proximo_horario(
    db: Session,
    ids_especializacion: Iterable[int],
    desde_fecha: date,
    desde_hora: str | None,
    excluir_ids: Optional[Iterable[int]] = None,
    duracion_horas: float = DURACION_MIN,
    max_dias: int = 10,
    excluir_slots: Optional[Iterable[tuple]] = None,
    excluir_propuestas: Optional[Iterable[tuple]] = None,
):
    """Busca el primer hueco disponible (día laborable, franja 08-18) a partir
    de `desde_fecha` para un técnico que cubra las especializaciones pedidas.
    El mismo día solo se aceptan horas posteriores a `desde_hora`.

    ``excluir_slots``: conjunto de ``(fecha, hora)`` ya rechazadas (p. ej. por
    un secundario ocupado) para no volver a proponerlas en llamadas sucesivas.

    ``excluir_propuestas`` descarta (fecha, hora, técnico) sin eliminar otros
    candidatos de esa misma franja. La confirmación debe revalidar bajo bloqueo.

    Devuelve (fecha, hora, tecnico) o None si no hay hueco en max_días."""
    from datetime import timedelta

    excluir = set(excluir_ids or [])
    slots_excluidos = set(excluir_slots or [])
    propuestas_excluidas = set(excluir_propuestas or [])
    horas = horas_laborales(desde_fecha, duracion_horas)
    try:
        idx = horas.index((desde_hora or "08:00")[:5]) if (desde_hora or "")[:5] in horas else 0
    except ValueError:
        idx = 0

    for delta in range(max_dias + 1):
        f = desde_fecha + timedelta(days=delta)
        if not _dia_es_laboral(f):
            continue
        franjas = horas if delta > 0 else horas[idx:]
        for h in franjas:
            if (f, h) in slots_excluidos:
                continue
            candidatos = candidatos_para_especializaciones(
                db, ids_especializacion, fecha=f, hora=h,
                excluir_ids=excluir, duracion_horas=duracion_horas,
            )
            for candidato in candidatos:
                if ((f, h, candidato.id_tecnico) not in propuestas_excluidas
                        and not tecnico_ocupado(db, candidato.id_tecnico, f, h,
                                               duracion_horas=duracion_horas)):
                    return f, h, candidato
        horas = horas_laborales(f, duracion_horas)
    return None


def especializaciones_de_productos(productos: Iterable) -> list[int]:
    """Unión de ids de especialización requerida por una lista de productos."""
    ids: set[int] = set()
    for p in productos:
        for e in (p.especializaciones_requeridas or []):
            ids.add(e.id_especializacion)
    return sorted(ids)


def _dia_es_laboral(fecha: date) -> bool:
    """True solo de lunes a sábado (el domingo queda bloqueado)."""
    return fecha.weekday() in DIAS_LABORALES


def horas_laborales(fecha: date, duracion_horas: float = DURACION_MIN) -> list[str]:
    """Inicios de franja válidos: 08:00, 11:00, 14:00 y 17:00, conservando la
    cuadrícula actual. Solo se ofrecen los inicios cuyo servicio completo cabe
    dentro de la jornada ([inicio, inicio+duracion) ≤ HORA_FIN)."""
    paso = 3
    fin_jornada = HORA_FIN * 60
    inicios = [f"{h:02d}:00" for h in range(HORA_INICIO, HORA_FIN, paso)]
    return [
        h
        for h in inicios
        if _hora_a_minutos(h) + round(duracion_horas * 60) <= fin_jornada
    ]


def tecnico_disponible(
    db: Session,
    id_tecnico: Optional[int],
    fecha: date,
    hora: str,
    ids_especializacion: Optional[Iterable[int]] = None,
    excluir_cita_id: Optional[int] = None,
    duracion_horas: float = DURACION_MIN,
) -> bool:
    """Fuente común de disponibilidad por técnico: True si existe, está activo,
    cubre las especializaciones requeridas (si las hay) y está libre durante
    todo el intervalo [hora, hora+duracion). No restringe por especialidad si no
    se pide ninguna."""
    if id_tecnico is None:
        return False
    from app.models.tecnico import Tecnico

    tecnico = db.query(Tecnico).filter(Tecnico.id_tecnico == id_tecnico).first()
    if (
        not tecnico
        or not tecnico.usuario
        or not tecnico.usuario.is_active
        or tecnico.usuario.id_rol_u != 2
    ):
        return False
    if ids_especializacion and not tecnico_cubre(tecnico, ids_especializacion):
        return False
    return not tecnico_ocupado(
        db, id_tecnico, fecha, hora, excluir_cita_id, duracion_horas=duracion_horas
    )


def tecnicos_disponibles(
    db: Session,
    fecha: date,
    hora: str,
    ids_especializacion: Optional[Iterable[int]] = None,
    excluir_ids: Optional[Iterable[int]] = None,
    excluir_cita_id: Optional[int] = None,
    duracion_horas: float = DURACION_MIN,
) -> list:
    """Técnicos activos y aptos (cubren las especializaciones pedidas) que
    están libres durante todo el intervalo, ordenados por nombre."""
    excluir = set(excluir_ids or [])
    resultado = []
    for t in _tecnicos_activos(db):
        if t.id_tecnico in excluir:
            continue
        if ids_especializacion and not tecnico_cubre(t, ids_especializacion):
            continue
        if tecnico_ocupado(
            db, t.id_tecnico, fecha, hora, excluir_cita_id, duracion_horas=duracion_horas
        ):
            continue
        resultado.append(t)
    return sorted(
        resultado,
        key=lambda t: ((t.usuario.first_name + " " + t.usuario.last_name) if t.usuario else ""),
    )


def hay_disponibilidad(
    db: Session,
    fecha: date,
    hora: str,
    ids_especializacion: Optional[Iterable[int]] = None,
    excluir_ids: Optional[Iterable[int]] = None,
    excluir_cita_id: Optional[int] = None,
    duracion_horas: float = DURACION_MIN,
    cantidad: int = 1,
) -> bool:
    """True si existen al menos `cantidad` técnicos activos, aptos y libres
    durante el intervalo (para reservar una cita que requiere ese equipo)."""
    return (
        len(
            tecnicos_disponibles(
                db, fecha, hora, ids_especializacion, excluir_ids,
                excluir_cita_id, duracion_horas,
            )
        )
        >= cantidad
    )


def bloquear_tecnicos(db: Session, ids_tecnicos: Iterable[int]) -> list:
    """Bloquea (FOR UPDATE) las filas de los técnicos del equipo en orden
    ascendente de id. Serializa reservas sobre la misma capacidad incluso
    cuando aún no existe ninguna cita/entrega en ese horario. Debe invocarse
    antes de validar y confirmar; el bloqueo se libera al commit/rollback."""
    from app.models.tecnico import Tecnico

    ids = sorted({int(i) for i in (ids_tecnicos or []) if i is not None})
    if not ids:
        return []
    return (
        db.query(Tecnico)
        .filter(Tecnico.id_tecnico.in_(ids))
        .order_by(Tecnico.id_tecnico)
        .with_for_update()
        .populate_existing()
        .all()
    )


def ids_equipo_cita(cita) -> list[int]:
    """Ids únicos de los técnicos del equipo de una cita (principal, segundo y
    tercero), sin duplicados y sin None."""
    return list(dict.fromkeys(
        t for t in (getattr(cita, "id_tecnico", None), getattr(cita, "id_tecnico_2", None), getattr(cita, "id_tecnico_3", None)) if t is not None
    ))


def especializaciones_requeridas_cita(db: Session, cita) -> list[int]:
    """Ids de especialización exigidos por una cita: la guardada en la cita o,
    en su defecto, la derivada de sus productos asociados (unión)."""
    if getattr(cita, "id_especializacion", None):
        return [cita.id_especializacion]
    productos = [cp.producto for cp in (getattr(cita, "productos_asociados", None) or []) if cp.producto is not None]
    if not productos:
        return []
    return especializaciones_de_productos(productos)


def requisitos_cita(db: Session, cita) -> tuple[float, list[int]]:
    """(duración_horas, ids_especializacion) de una cita: duración real según
    productos/tipo de servicio y especializaciones exigidas. Fuente común para
    consultar y confirmar con las mismas reglas."""
    return duracion_estimada_cita(db, cita), especializaciones_requeridas_cita(db, cita)


def validar_equipo_tecnicos(
    db: Session,
    ids_tecnicos: Iterable[int],
    fecha: date,
    hora: str,
    ids_especializacion: Optional[Iterable[int]] = None,
    excluir_cita_id: Optional[int] = None,
    duracion_horas: float = DURACION_MIN,
) -> list:
    """Valida un equipo completo: todos distintos, existentes, activos, aptos
    (cubren las especializaciones requeridas) y libres durante el intervalo.
    Devuelve los objetos Tecnico validados.

    Estados: 400 para entradas inválidas (ids duplicados o inexistentes);
    409 para conflictos de capacidad/disponibilidad (ocupado, inactivo, sin la
    especialización requerida). No valida si la lista está vacía (sin equipo).

    Orden de recursos para TODO el equipo y TODA la transacción (sin intercalar
    User entre integrantes): Tecnico (ya bloqueado) → Cita/Pedido de todos →
    User de todos. La cuenta se relee con bloqueo porque bloquear ``Tecnico`` no
    actualiza ``usuarios``."""
    from app.models.tecnico import Tecnico
    from app.models.user import User

    ids = [int(i) for i in (ids_tecnicos or []) if i is not None]
    if len(set(ids)) != len(ids):
        raise HTTPException(status_code=400, detail="Los técnicos asignados deben ser distintos")
    ids = sorted(ids)

    # Pasada 1: existencia + aptitud + ocupación (bloquea Cita/Pedido de todos).
    tecnicos = []
    for tid in ids:
        tecnico = db.query(Tecnico).filter(Tecnico.id_tecnico == tid).first()
        if not tecnico:
            raise HTTPException(status_code=400, detail="Uno de los técnicos no existe")
        if ids_especializacion and not tecnico_cubre(tecnico, ids_especializacion):
            raise HTTPException(status_code=409, detail="Un técnico no tiene la especialización requerida para este servicio")
        if tecnico_ocupado(db, tid, fecha, hora, excluir_cita_id, duracion_horas=duracion_horas, for_update=True):
            raise HTTPException(status_code=409, detail="Un técnico no está disponible en esa fecha y hora")
        tecnicos.append(tecnico)

    # Pasada 2: cuenta activa vigente de todos (después de Cita/Pedido, para
    # conservar el orden global Tecnico → Cita/Pedido → User).
    for tecnico in tecnicos:
        usuario = (
            db.query(User)
            .filter(User.id_usuario == tecnico.id_usuario_t)
            .with_for_update()
            .populate_existing()
            .first()
        )
        if not usuario or not usuario.is_active or usuario.id_rol_u != 2:
            raise HTTPException(status_code=409, detail="Uno de los técnicos ya no está disponible")
    return tecnicos


def tecnico_ocupado(
    db: Session,
    id_tecnico: Optional[int],
    fecha: date,
    hora: str | None = None,
    excluir_cita_id: Optional[int] = None,
    duracion_horas: float = DURACION_MIN,
    for_update: bool = False,
) -> bool:
    """True si el técnico ya tiene una cita activa (Pendiente/Confirmada)
    que se cruce con el intervalo [hora, hora+duracion) en la fecha indicada
    (o cualquier cita ese día si no se pasa `hora`). También considera las
    entregas activas —por solapamiento de su rango horario— y las citas donde
    es el segundo asignado.

    ``for_update=True`` convierte las lecturas de citas y entregas en lecturas
    con bloqueo (current read), de modo que, tras adquirir el bloqueo del
    técnico, se vean los cambios confirmados por otra sesión mientras se
    esperaba; evita validar contra una instantánea antigua (REPEATABLE READ)."""
    if id_tecnico is None:
        return False
    q_citas = db.query(Cita).filter(
        or_(
            Cita.id_tecnico == id_tecnico,
            Cita.id_tecnico_2 == id_tecnico,
            Cita.id_tecnico_3 == id_tecnico,
        ),
        Cita.fecha == fecha,
        Cita.estado.in_(ESTADOS_OCUPAN),
    )
    if excluir_cita_id is not None:
        q_citas = q_citas.filter(Cita.id_cita != excluir_cita_id)
    if for_update:
        q_citas = q_citas.with_for_update().populate_existing()
    nueva_ini = _hora_a_minutos(hora) if hora is not None else None
    for cita in q_citas.all():
        if nueva_ini is None:
            return True
        ini = _hora_a_minutos(cita.hora)
        if ini is None:
            continue
        fin = ini + round(duracion_estimada_cita(db, cita) * 60)
        if _se_solapan(nueva_ini, nueva_ini + round(duracion_horas * 60), ini, fin):
            return True

    from app.models.pedido import Pedido

    q_entregas = db.query(Pedido).filter(
        Pedido.id_tecnico_entrega == id_tecnico,
        Pedido.fecha_entrega == fecha,
        Pedido.estado_entrega.in_(ESTADOS_ENTREGA_OCUPAN),
    )
    if for_update:
        q_entregas = q_entregas.with_for_update().populate_existing()
    if nueva_ini is None:
        return q_entregas.first() is not None
    nueva_fin = nueva_ini + round(duracion_horas * 60)
    for pedido in q_entregas.all():
        ini_e, fin_e = ventana_entrega(pedido)
        if _se_solapan(nueva_ini, nueva_fin, ini_e, fin_e):
            return True
    return False


def ventana_entrega(pedido) -> tuple[int, int]:
    """Rango [inicio_min, fin_min] de una entrega. Si no hay hora de inicio
    se asume 10:00; el fin por defecto es 1 h después del inicio."""
    ini = _hora_a_minutos(getattr(pedido, "hora_entrega", None))
    if ini is None:
        ini = 10 * 60
    fin = _hora_a_minutos(getattr(pedido, "hora_entrega_fin", None))
    if fin is None or fin <= ini:
        fin = ini + 60
    return ini, min(fin, HORA_FIN * 60)


def tecnico_libre_en_rango(
    db: Session,
    id_tecnico: Optional[int],
    fecha: date,
    hora_ini: str,
    hora_fin: str | None = None,
    excluir_pedido_id: Optional[int] = None,
    for_update: bool = False,
) -> bool:
    """True si el técnico puede cubrir la franja [hora_ini, hora_fin] de la
    fecha: ninguna cita activa ni otra entrega activa debe solaparse.

    ``for_update=True`` convierte las lecturas en lecturas con bloqueo (current
    read) para ver los cambios confirmados por otra sesión mientras se esperaba
    el bloqueo del técnico."""
    if id_tecnico is None:
        return False
    ini_n = _hora_a_minutos(hora_ini)
    if ini_n is None:
        return False
    fin_n = _hora_a_minutos(hora_fin)
    if fin_n is None or fin_n <= ini_n:
        fin_n = ini_n + 60

    q_citas = db.query(Cita).filter(
        or_(
            Cita.id_tecnico == id_tecnico,
            Cita.id_tecnico_2 == id_tecnico,
            Cita.id_tecnico_3 == id_tecnico,
        ),
        Cita.fecha == fecha,
        Cita.estado.in_(ESTADOS_OCUPAN),
    )
    if for_update:
        q_citas = q_citas.with_for_update().populate_existing()
    for cita in q_citas.all():
        ini = _hora_a_minutos(cita.hora)
        if ini is None:
            continue
        fin = ini + round(duracion_estimada_cita(db, cita) * 60)
        if _se_solapan(ini_n, fin_n, ini, fin):
            return False

    from app.models.pedido import Pedido

    q_entregas = db.query(Pedido).filter(
        Pedido.id_tecnico_entrega == id_tecnico,
        Pedido.fecha_entrega == fecha,
        Pedido.estado_entrega.in_(ESTADOS_ENTREGA_OCUPAN),
    )
    if excluir_pedido_id is not None:
        q_entregas = q_entregas.filter(Pedido.id_pedido != excluir_pedido_id)
    if for_update:
        q_entregas = q_entregas.with_for_update().populate_existing()
    for pedido in q_entregas.all():
        ini_e, fin_e = ventana_entrega(pedido)
        if _se_solapan(ini_n, fin_n, ini_e, fin_e):
            return False
    return True
