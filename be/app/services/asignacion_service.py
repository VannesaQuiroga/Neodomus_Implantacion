"""
Servicio: asignación y reasignación de técnicos con validación de
especializaciones.

Orquesta:
  - Desactivación de un técnico: reasigna automáticamente sus citas futuras
    a técnicos con la especialización requerida; si no hay candidato,
    cancela la cita y genera el reembolso. También reasigna entregas.
  - Reasignación manual (admin) con validación estricta de especialidad.
  - Historial de trazabilidad por cita (tabla historial_citas).
"""
from __future__ import annotations

from datetime import date
import logging

from fastapi import HTTPException
from sqlalchemy import or_
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session

from app.models.cita import Cita
from app.models.especializacion import HistorialCita
from app.models.pedido import Pedido
from app.services import reembolso_service
from app.services.especialidades import (
    ESTADOS_ENTREGA_OCUPAN,
    ESTADOS_OCUPAN,
    mejor_tecnico_para,
    tecnico_ocupado,
)
from app.services.estados_entrega import (
    ESTADOS_CUSTODIA_TECNICO,
    ESTADOS_ENTREGA_ACTIVOS,
    asignacion_reasignable,
)


def _nombre_tecnico_de(t) -> str | None:
    if t is None or not t.usuario:
        return None
    return f"{t.usuario.first_name} {t.usuario.last_name}".strip()


def _nombre_tecnico_de_cita(cita: Cita, segundo: bool = False) -> str | None:
    if segundo:
        return cita.nombre_tecnico_2
    return cita.nombre_tecnico


def registrar_historial(
    db: Session,
    id_cita: int,
    accion: str,
    tecnico_anterior_id: int | None = None,
    tecnico_anterior_nombre: str | None = None,
    tecnico_nuevo_id: int | None = None,
    tecnico_nuevo_nombre: str | None = None,
    administrador_id: int | None = None,
    motivo: str | None = None,
    detalle: str | None = None,
    commit: bool = True,
) -> HistorialCita:
    """Registra un evento de trazabilidad para una cita.

    Con ``commit=False`` solo hace ``add`` + ``flush`` y deja el commit al
    llamador (para incluir el historial en la misma transacción que el cambio
    de la cita)."""
    entrada = HistorialCita(
        id_cita=id_cita,
        accion=accion,
        tecnico_anterior_id=tecnico_anterior_id,
        tecnico_anterior_nombre=tecnico_anterior_nombre,
        tecnico_nuevo_id=tecnico_nuevo_id,
        tecnico_nuevo_nombre=tecnico_nuevo_nombre,
        administrador_id=administrador_id,
        motivo=(motivo or "")[:255] or None,
        detalle=detalle,
    )
    db.add(entrada)
    if commit:
        db.commit()
        db.refresh(entrada)
    else:
        db.flush()
    return entrada


def especializacion_requerida_cita(db: Session, cita: Cita):
    """Especialización exigida por una cita: la guardada en la cita o, en su
    defecto, la derivada de los productos asociados."""
    if cita.id_especializacion:
        from app.models.especializacion import Especializacion

        esp = (
            db.query(Especializacion)
            .filter(Especializacion.id_especializacion == cita.id_especializacion)
            .first()
        )
        if esp:
            return esp
    productos = [
        cp.producto for cp in (cita.productos_asociados or []) if cp.producto is not None
    ]
    if not productos:
        return None
    from app.services.especialidades import especializaciones_de_productos
    from app.models.especializacion import Especializacion

    ids = especializaciones_de_productos(productos)
    if len(ids) != 1:
        return None
    return (
        db.query(Especializacion)
        .filter(Especializacion.id_especializacion == ids[0])
        .first()
    )


def citas_futuras_de_tecnico(db: Session, id_tecnico: int) -> list[Cita]:
    """Citas activas (Pendiente/Confirmada) de hoy en adelante donde el
    técnico es el principal."""
    hoy = date.today()
    return (
        db.query(Cita)
        .filter(
            Cita.id_tecnico == id_tecnico,
            Cita.fecha >= hoy,
            Cita.estado.in_(ESTADOS_OCUPAN),
        )
        .order_by(Cita.fecha, Cita.hora)
        .all()
    )


def entregas_pendientes_de_tecnico(db: Session, id_tecnico: int) -> list[Pedido]:
    """Entregas aún reasignables (Asignada) de hoy en adelante del técnico.

    Solo se reasignan entregas en estado «Asignada»: las ya recogidas o en
    camino están en custodia del técnico y no deben retrocederse ni transferirse
    por un flujo automático de desactivación."""
    hoy = date.today()
    return (
        db.query(Pedido)
        .filter(
            Pedido.id_tecnico_entrega == id_tecnico,
            Pedido.fecha_entrega >= hoy,
            Pedido.estado_entrega == "Asignada",
        )
        .order_by(Pedido.fecha_entrega)
        .all()
    )


def entregas_en_custodia_de_tecnico(db: Session, id_tecnico: int) -> list[Pedido]:
    """Entregas del técnico que ya están en custodia (Recogido/En camino),
    independientemente de su fecha. Bloquean la desactivación del técnico."""
    return (
        db.query(Pedido)
        .filter(
            Pedido.id_tecnico_entrega == id_tecnico,
            Pedido.estado_entrega.in_(ESTADOS_CUSTODIA_TECNICO),
        )
        .order_by(Pedido.id_pedido)
        .all()
    )


def validar_desactivacion_sin_custodia(db: Session, id_tecnico: int) -> None:
    """Rechaza la desactivación de un técnico con entregas en custodia.

    Bloquea (FOR UPDATE) las entregas no terminales del técnico en orden
    estable y, bajo ese bloqueo, valida que ninguna esté en custodia. De este
    modo la comprobación se coordina con una recogida concurrente: si la
    recogida ganó la carrera, aquí se observa el estado Recogido/En camino y
    se rechaza con 409; si esta validación gana, la recogida posterior verá al
    técnico inactivo y no podrá avanzar."""
    activas = (
        db.query(Pedido)
        .filter(
            Pedido.id_tecnico_entrega == id_tecnico,
            Pedido.estado_entrega.in_(ESTADOS_ENTREGA_ACTIVOS),
        )
        .order_by(Pedido.id_pedido)
        .with_for_update()
        .populate_existing()
        .all()
    )
    en_custodia = [p for p in activas if p.estado_entrega in ESTADOS_CUSTODIA_TECNICO]
    if en_custodia:
        ids = ", ".join(str(p.id_pedido) for p in en_custodia)
        raise HTTPException(
            status_code=409,
            detail=(
                "No se puede desactivar al técnico: tiene entregas en curso "
                f"(pedidos {ids}) en estado Recogido/En camino. Espera a que "
                "complete esas entregas antes de desactivarlo."
            ),
        )


# delega los avisos en notificar_cita_reasignada_cliente.
def _notificar_cliente_reasignacion(db: Session, cita: Cita, nuevo_nombre: str) -> None:
    from app.config import settings
    from app.services.notificaciones import notificar_cita_reasignada_cliente

    # El cliente no se avisa de cambios originados por modificaciones al
    # técnico (desactivación/edición/reasignación automática).
    if not settings.NOTIFICAR_CLIENTE_CAMBIOS_TECNICO:
        return

    cliente = cita.cliente
    if cliente is None:
        return
    notificar_cita_reasignada_cliente(
        db,
        cliente.id_cliente,
        cliente.email,
        f"{cliente.first_name} {cliente.last_name}".strip() or "Cliente",
        {
            "servicio": cita.tipo_servicio,
            "fecha": cita.fecha.strftime("%d/%m/%Y"),
            "hora": cita.hora,
            "tecnico": nuevo_nombre or "un técnico",
        },
    )


# delega los avisos en notificar_cita_asignada_tecnico.
def _notificar_tecnico_asignacion(db: Session, cita: Cita, tecnico) -> None:
    from app.services.notificaciones import notificar_cita_asignada_tecnico

    if tecnico is None or not tecnico.usuario or not tecnico.usuario.email:
        return
    cliente = cita.cliente
    notificar_cita_asignada_tecnico(
        db,
        tecnico.usuario.id_usuario,
        tecnico.usuario.email,
        _nombre_tecnico_de(tecnico) or "técnico",
        {
            "cliente": f"{cliente.first_name} {cliente.last_name}".strip()
            if cliente
            else "Cliente",
            "servicio": cita.tipo_servicio,
            "fecha": cita.fecha.strftime("%d/%m/%Y"),
            "hora": cita.hora,
            "direccion": cita.direccion,
            "telefono": cliente.telefono_cliente if cliente else None,
            "descripcion": cita.descripcion,
        },
    )


def cancelar_cita_con_reembolso(
    db: Session,
    cita: Cita,
    motivo: str,
    administrador_id: int | None = None,
) -> dict | None:
    """Cancela una cita pagada y genera el reembolso correspondiente.

    Devuelve el resumen del reembolso o None si no había pago aprobado."""
    estado_anterior = cita.estado
    nombre_anterior = cita.nombre_tecnico
    cita.estado = "Cancelada"
    db.commit()

    registrar_historial(
        db,
        cita.id_cita,
        accion="cancelacion",
        tecnico_anterior_id=cita.id_tecnico,
        tecnico_anterior_nombre=nombre_anterior,
        administrador_id=administrador_id,
        motivo=motivo,
        detalle=f"Estado anterior: {estado_anterior}",
    )

    # Notificar al cliente con el motivo.
    from app.services.notificaciones import notificar_cita_estado_cliente

    cliente = cita.cliente
    if cliente is not None:
        motivo_cliente = (
            f"{motivo} El monto pagado será reembolsado a tu medio de pago."
            if (cita.estado_pago == "aprobado")
            else motivo
        )
        notificar_cita_estado_cliente(
            db,
            cliente.id_cliente,
            cliente.email,
            f"{cliente.first_name} {cliente.last_name}".strip() or "Cliente",
            {
                "servicio": cita.tipo_servicio,
                "fecha": cita.fecha.strftime("%d/%m/%Y"),
                "tecnico": nombre_anterior or "-",
            },
            "Cancelada",
            motivo=motivo_cliente,
        )

    # Reembolso si la cita estaba pagada — queda PENDIENTE para confirmación del admin.
    reembolso_resumen = None
    if (cita.estado_pago == "aprobado") and cita.costo_cita:
        from app.models.especializacion import Reembolso as ReembolsoModel

        reembolso = ReembolsoModel(
            id_cita=cita.id_cita,
            monto=round(float(cita.costo_cita), 2),
            estado="Pendiente",
            motivo=motivo,
            numero_transaccion_original=cita.numero_transaccion,
        )
        db.add(reembolso)
        db.flush()
        reembolso_resumen = {
            "id_reembolso": reembolso.id_reembolso,
            "monto": reembolso.monto,
            "estado": reembolso.estado,
        }
    return reembolso_resumen


def reasignar_cita_automatica(
    db: Session,
    cita: Cita,
    excluir_ids: set[int] | None = None,
    administrador_id: int | None = None,
    motivo: str = "Reasignación automática",
) -> dict:
    """Reasigna automáticamente una cita (por desactivación de un técnico).

    Límite exacto del reintento: solo se reintenta la FASE TRANSACCIONAL
    (leer → elegir candidato → validar → actualizar cita + historial → commit).
    Una vez confirmado, ningún fallo posterior (lectura/notificación) reinicia
    la reasignación: los avisos se envían fuera del reintento y se tratan por
    separado.

    Agotar reintentos (1213/1205) devuelve un resultado controlado ``sin_cambio``
    SIN cancelar ni reembolsar: la cancelación solo ocurre cuando la búsqueda
    comprueba que no hay capacidad (condición de negocio), nunca por un error
    técnico. El llamador debe haber confirmado sus cambios: este servicio es
    dueño de la transacción y rechaza cambios ORM pendientes."""
    cita_id = cita.id_cita
    if db.new or db.deleted or any(db.is_modified(o, include_collections=True) for o in db.dirty):
        raise ValueError("La reasignación requiere una sesión sin cambios pendientes")
    # Esta operación es dueña de su transacción. Descarta solo lecturas previas.
    db.rollback()
    decision = None
    for intento in range(3):
        try:
            decision = _intentar_reasignar(
                db, cita_id, excluir_ids, administrador_id, motivo
            )
            if decision.get("estado") == "sin_capacidad":
                decision = _cancelar_cita(db, cita_id, administrador_id, decision["_huella"])
            if decision.get("estado") in ("reasignada", "reprogramada", "cancelada"):
                # Los helpers devuelven únicamente escalares antes de este commit.
                # No debe haber lecturas ORM posteriores dentro del reintento.
                db.commit()
            else:
                db.rollback()
            break
        except OperationalError as exc:
            db.rollback()
            codigo = _codigo_error(exc)
            if codigo in (1213, 1205) and intento < 2:
                continue
            if codigo not in (1213, 1205):
                raise
            return {"estado": "sin_cambio", "id_cita": cita_id, "conflicto": "reintentos_agotados"}
        except Exception:
            db.rollback()
            raise
    else:
        return {"estado": "sin_cambio", "id_cita": cita_id, "conflicto": "reintentos_agotados"}

    if decision is None:
        return {"estado": "sin_cambio", "id_cita": cita_id}
    if not decision.get("_avisos"):
        return decision

    # Post-commit: notificaciones. No reintentables; un fallo aquí no afecta el
    # resultado ya confirmado.
    try:
        _enviar_avisos(db, decision)
    except Exception:
        db.rollback()
        logging.getLogger(__name__).exception("Fallo post-commit de avisos de cita %s", cita_id)
        decision["avisos_pendientes"] = True
    decision.pop("_avisos", None)
    return decision


def _codigo_error(exc: OperationalError) -> int | None:
    try:
        if exc.orig is not None and exc.orig.args:
            return exc.orig.args[0]
    except Exception:
        pass
    return None


def _huella_cita(cita: Cita) -> tuple:
    """Huella de los campos relevantes para la decisión de reasignación. Si
    cambia, la decisión tomada es obsoleta y no debe aplicarse."""
    productos = tuple(
        sorted(
            (cp.id_producto, cp.id_variante or 0, cp.cantidad or 0,
             cp.producto.dificultad_instalacion if cp.producto else None,
             cp.producto.tecnicos_requeridos if cp.producto else None,
             tuple(sorted(e.id_especializacion for e in cp.producto.especializaciones_requeridas)) if cp.producto else ())
            for cp in (cita.productos_asociados or [])
            if cp.id_producto is not None
        )
    )
    return (
        cita.estado,
        cita.fecha,
        cita.hora,
        cita.tipo_servicio,
        cita.id_especializacion,
        (cita.id_tecnico, cita.id_tecnico_2, cita.id_tecnico_3),
        productos,
        cita.estado_pago, cita.costo_cita, cita.numero_transaccion,
    )


def _leer_cita_bloqueada(db: Session, cita_id: int):
    """Relee también los datos relacionados usados por duración y aptitud.

    Refrescar solo Cita no convierte las lecturas lazy de productos en current
    reads bajo REPEATABLE READ. Estos datos forman parte de la huella.
    """
    from sqlalchemy.orm.attributes import set_committed_value
    from app.models.cita_producto import CitaProducto
    from app.models.producto import Producto
    from app.models.especializacion import Especializacion

    cita = (db.query(Cita).filter(Cita.id_cita == cita_id)
            .with_for_update().populate_existing().first())
    if cita is None:
        return None
    items = (db.query(CitaProducto).filter(CitaProducto.id_cita == cita_id)
             .order_by(CitaProducto.id_cita_producto).with_for_update().populate_existing().all())
    for item in sorted(items, key=lambda i: i.id_producto):
        producto = (db.query(Producto).filter(Producto.id_producto == item.id_producto)
                    .with_for_update().populate_existing().first())
        if producto is not None:
            especializaciones = (db.query(Especializacion)
                                 .join(Producto.especializaciones_requeridas)
                                 .filter(Producto.id_producto == item.id_producto)
                                 .with_for_update().populate_existing().all())
            set_committed_value(producto, "especializaciones_requeridas", especializaciones)
        set_committed_value(item, "producto", producto)
    set_committed_value(cita, "productos_asociados", items)
    return cita


def _intentar_reasignar(
    db: Session,
    cita_id: int,
    excluir_ids: set[int] | None,
    administrador_id: int | None,
    motivo: str,
) -> dict:
    """Un intento transaccional: relee la cita, elige candidato en el mismo
    horario, reasigna o reprograma. Devuelve la decisión con ``_avisos`` (para
    reasignada/reprogramada), o ``sin_capacidad`` (sin hueco) o ``sin_cambio``
    (cita no reasignable o modificada concurrentemente)."""
    from app.services.especialidades import duracion_estimada_cita as _dur_cita

    cita = db.query(Cita).filter(Cita.id_cita == cita_id).first()
    if cita is None:
        return {"estado": "sin_cambio", "id_cita": cita_id}
    if cita.estado not in ("Pendiente", "Confirmada"):
        return {"estado": "sin_cambio", "id_cita": cita_id, "estado_actual": cita.estado}

    excluir = set(excluir_ids or set())
    if cita.id_tecnico is not None:
        excluir.add(cita.id_tecnico)
    excluir.update(t for t in (cita.id_tecnico_2, cita.id_tecnico_3) if t is not None)
    esp = especializacion_requerida_cita(db, cita)
    ids_req = [esp.id_especializacion] if esp else []
    duracion = _dur_cita(db, cita)
    fecha = cita.fecha
    hora = cita.hora
    nombre_anterior = cita.nombre_tecnico
    id_anterior = cita.id_tecnico
    huella = _huella_cita(cita)

    candidato = _elegir_candidato(db, fecha, hora, ids_req, excluir, cita_id, duracion)

    if candidato is None:
        return _reprogramar_proximo(
            db, cita_id, ids_req, excluir, nombre_anterior, id_anterior,
            administrador_id, motivo, huella, duracion,
        )

    # Releer la cita con bloqueo y revalidar que no cambió (estado, equipo,
    # fecha/hora y requisitos) mientras se elegía el candidato.
    cita = _leer_cita_bloqueada(db, cita_id)
    if cita is None or _huella_cita(cita) != huella:
        return {"estado": "sin_cambio", "id_cita": cita_id}

    cita.id_tecnico = candidato.id_tecnico
    cita.nombre_tecnico = _nombre_tecnico_de(candidato)
    registrar_historial(
        db, cita.id_cita, accion="reasignacion",
        tecnico_anterior_id=id_anterior, tecnico_anterior_nombre=nombre_anterior,
        tecnico_nuevo_id=candidato.id_tecnico, tecnico_nuevo_nombre=cita.nombre_tecnico,
        administrador_id=administrador_id, motivo=motivo,
        detalle=(f"Especialización requerida: {esp.nombre}" if esp else None),
        commit=False,
    )
    return {
        "estado": "reasignada",
        "id_cita": cita.id_cita,
        "tecnico_anterior": nombre_anterior,
        "tecnico_nuevo": cita.nombre_tecnico,
        "_avisos": {
            "accion": "reasignada",
            "cita_id": cita.id_cita,
            "tecnico_nuevo_id": candidato.id_tecnico,
            "tecnico_nuevo_nombre": cita.nombre_tecnico,
        },
    }


def _elegir_candidato(
    db: Session,
    fecha,
    hora: str,
    ids_req: list[int],
    excluir: set[int],
    excluir_cita_id: int,
    duracion: float,
):
    """Elige un candidato apto y libre en el MISMO horario, probando con
    respaldo: cada candidato se bloquea y revalida vigentemente; si uno falla,
    se libera (rollback) y se prueba el siguiente. Devuelve el Tecnico elegido
    (con su bloqueo retenido) o None.

    El rollback solo descarta los bloqueos y lecturas de ESTE intento: el
    llamador no debe tener cambios pendientes (la cita se relee después)."""
    from app.services.especialidades import (
        bloquear_tecnicos,
        candidatos_para_especializaciones,
        validar_equipo_tecnicos,
    )

    for cand in candidatos_para_especializaciones(
        db, ids_req, fecha=fecha, hora=hora, excluir_ids=excluir, duracion_horas=duracion
    ):
        tid = cand.id_tecnico
        bloquear_tecnicos(db, [tid])
        try:
            validados = validar_equipo_tecnicos(
                db, [tid], fecha, hora,
                ids_especializacion=ids_req, excluir_cita_id=excluir_cita_id,
                duracion_horas=duracion,
            )
            return validados[0]
        except HTTPException:
            db.rollback()
            continue
    return None


def _reprogramar_proximo(
    db: Session,
    cita_id: int,
    ids_req: list[int],
    excluir: set[int],
    nombre_anterior: str | None,
    id_anterior: int | None,
    administrador_id: int | None,
    motivo: str,
    huella: tuple,
    duracion: float,
) -> dict:
    """Busca un próximo horario donde quepa el equipo completo (principal nuevo
    + secundarios actuales), avanzando con ``excluir_propuestas`` para no
    repetir propuestas rechazadas. Revalida bajo bloqueo. Devuelve
    ``reprogramada``, ``sin_capacidad`` (búsqueda sin propuestas) o ``sin_cambio``
    cuando hubo conflictos o se alcanzó el límite de intentos."""
    from datetime import timedelta as _td

    from app.services.especialidades import (
        bloquear_tecnicos,
        buscar_proximo_horario,
        validar_equipo_tecnicos,
    )

    cita = db.query(Cita).filter(Cita.id_cita == cita_id).first()
    if cita is None or cita.estado not in ("Pendiente", "Confirmada"):
        return {"estado": "sin_cambio", "id_cita": cita_id}

    propuestas_excluidas: set = set()
    hubo_conflictos = False
    desde_fecha = cita.fecha + _td(days=1)
    for _intento in range(10):
        proximo = buscar_proximo_horario(
            db, ids_req, desde_fecha, None,
            excluir_ids=excluir, duracion_horas=duracion, excluir_propuestas=propuestas_excluidas,
        )
        if proximo is None:
            # Un conflicto concurrente no demuestra falta definitiva de capacidad.
            if hubo_conflictos:
                return {"estado": "sin_cambio", "id_cita": cita_id, "conflicto": "capacidad_cambio"}
            return {"estado": "sin_capacidad", "id_cita": cita_id, "_huella": huella}
        nueva_fecha, nueva_hora, tecnico_nuevo = proximo
        tecnico_nuevo_id = tecnico_nuevo.id_tecnico

        # Equipo completo en el nuevo intervalo (principal nuevo + secundarios).
        secundarios = [t for t in (cita.id_tecnico_2, cita.id_tecnico_3) if t is not None]
        equipo = [tecnico_nuevo.id_tecnico] + secundarios
        bloquear_tecnicos(db, equipo)
        try:
            validar_equipo_tecnicos(
                db, equipo, nueva_fecha, nueva_hora,
                ids_especializacion=ids_req, excluir_cita_id=cita_id,
                duracion_horas=duracion,
            )
        except HTTPException:
            db.rollback()
            hubo_conflictos = True
            propuestas_excluidas.add((nueva_fecha, nueva_hora, tecnico_nuevo_id))
            continue

        # Releer la cita con bloqueo y revalidar que no cambió.
        cita = _leer_cita_bloqueada(db, cita_id)
        if cita is None or _huella_cita(cita) != huella:
            return {"estado": "sin_cambio", "id_cita": cita_id}

        fecha_anterior = cita.fecha
        hora_anterior = cita.hora
        cita.id_tecnico = tecnico_nuevo.id_tecnico
        cita.nombre_tecnico = _nombre_tecnico_de(tecnico_nuevo)
        cita.fecha = nueva_fecha
        cita.hora = nueva_hora
        registrar_historial(
            db, cita.id_cita, accion="reprogramacion",
            tecnico_anterior_id=id_anterior, tecnico_anterior_nombre=nombre_anterior,
            tecnico_nuevo_id=cita.id_tecnico, tecnico_nuevo_nombre=cita.nombre_tecnico,
            administrador_id=administrador_id, motivo=motivo,
            detalle=(
                f"Reprogramación automática: {fecha_anterior} {hora_anterior} → "
                f"{nueva_fecha} {nueva_hora}"
            ),
            commit=False,
        )
        return {
            "estado": "reprogramada",
            "id_cita": cita.id_cita,
            "fecha_anterior": str(fecha_anterior),
            "hora_anterior": hora_anterior,
            "fecha_nueva": str(nueva_fecha),
            "hora_nueva": nueva_hora,
            "tecnico_nuevo": cita.nombre_tecnico,
            "_avisos": {
                "accion": "reprogramada",
                "cita_id": cita.id_cita,
                "tecnico_nuevo_id": tecnico_nuevo.id_tecnico,
                "tecnico_nuevo_nombre": cita.nombre_tecnico,
                "fecha_anterior": str(fecha_anterior),
                "hora_anterior": hora_anterior,
                "nueva_fecha": str(nueva_fecha),
                "nueva_hora": nueva_hora,
            },
        }

    return {"estado": "sin_cambio", "id_cita": cita_id, "conflicto": "busqueda_limitada"}


def _cancelar_cita(db: Session, cita_id: int, administrador_id: int | None, huella: tuple) -> dict:
    """Cancela una cita + reembolsa (condición de negocio: sin capacidad).
    Relee y revalida la cita vigente antes de cancelar."""
    cita = _leer_cita_bloqueada(db, cita_id)
    if cita is None or _huella_cita(cita) != huella or cita.estado not in ("Pendiente", "Confirmada"):
        return {"estado": "sin_cambio", "id_cita": cita_id}

    esp = especializacion_requerida_cita(db, cita)
    motivo_cancelacion = (
        f"No hay técnicos disponibles con la especialización "
        f"'{esp.nombre}' para tu cita."
        if esp
        else "No hay técnicos disponibles para tu cita en este momento."
    )
    estado_anterior = cita.estado
    cita.estado = "Cancelada"
    registrar_historial(
        db, cita_id, accion="cancelacion", tecnico_anterior_id=cita.id_tecnico,
        tecnico_anterior_nombre=cita.nombre_tecnico, administrador_id=administrador_id,
        motivo=motivo_cancelacion, detalle=f"Estado anterior: {estado_anterior}", commit=False,
    )
    reembolso = None
    if cita.estado_pago == "aprobado" and cita.costo_cita:
        from app.models.especializacion import Reembolso
        registro = Reembolso(id_cita=cita_id, monto=round(float(cita.costo_cita), 2),
                             estado="Pendiente", motivo=motivo_cancelacion,
                             numero_transaccion_original=cita.numero_transaccion)
        db.add(registro)
        db.flush()
        reembolso = {"id_reembolso": registro.id_reembolso, "monto": registro.monto, "estado": registro.estado}

    return {
        "estado": "cancelada",
        "id_cita": cita.id_cita,
        "motivo": motivo_cancelacion,
        "reembolso": reembolso,
        "_avisos": {"accion": "cancelada", "cita_id": cita_id,
                    "motivo": motivo_cancelacion, "especializacion": esp.nombre if esp else None},
    }


def _enviar_avisos(db: Session, decision: dict) -> None:
    """Envía las notificaciones (post-commit). No reintentable."""
    avisos = decision.get("_avisos")
    if not avisos:
        return
    from app.models.tecnico import Tecnico

    cita = db.query(Cita).filter(Cita.id_cita == avisos["cita_id"]).first()
    if cita is None:
        return
    if avisos["accion"] == "cancelada":
        from app.services.notificaciones import notificar_cita_estado_cliente, notificar_admin_reembolso_pendiente_cita
        cliente = cita.cliente
        nombre = f"{cliente.first_name} {cliente.last_name}".strip() if cliente else "Cliente"
        if cliente:
            notificar_cita_estado_cliente(
                db, cliente.id_cliente, cliente.email, nombre,
                {"servicio": cita.tipo_servicio, "fecha": cita.fecha.strftime("%d/%m/%Y"),
                 "tecnico": cita.nombre_tecnico or "-"}, "Cancelada", motivo=avisos["motivo"],
            )
        notificar_admin_reembolso_pendiente_cita(
            db, id_cita=cita.id_cita, cliente_nombre=nombre,
            especializacion=avisos["especializacion"], monto=float(cita.costo_cita or 0), motivo=avisos["motivo"],
        )
        return
    tecnico = (
        db.query(Tecnico).filter(Tecnico.id_tecnico == avisos["tecnico_nuevo_id"]).first()
        if avisos.get("tecnico_nuevo_id")
        else None
    )
    _notificar_cliente_reasignacion(db, cita, avisos.get("tecnico_nuevo_nombre"))
    _notificar_tecnico_asignacion(db, cita, tecnico)

    if avisos["accion"] == "reprogramada":
        from app.models.user import User as _User
        from app.services.notificaciones import crear_notificacion

        for admin in db.query(_User).filter(_User.id_rol_u == 1, _User.is_active == True).all():  # noqa: E712
            crear_notificacion(
                db,
                id_usuario=admin.id_usuario,
                id_cliente=None,
                tipo="cita",
                titulo="Cita reprogramada automáticamente",
                mensaje=(
                    f"La cita #{cita.id_cita} se reprogramó al "
                    f"{avisos['nueva_fecha']} {avisos['nueva_hora']} con "
                    f"{avisos['tecnico_nuevo_nombre']} porque nadie pudo atender en el horario original."
                ),
            )


def especializaciones_requeridas_entrega(db: Session, pedido: Pedido) -> list[int]:
    """Especializaciones exigidas por los PRODUCTOS del pedido."""
    from app.services.especialidades import (
        especializaciones_de_productos as _esp_de_productos,
    )

    productos = [
        d.producto for d in (pedido.detalles or []) if d.producto is not None
    ]
    return _esp_de_productos(productos)


# Señal de resultado de `reasignar_entrega`: la entrega ya no pertenece al
# técnico que se desactiva (un administrador la reasignó en el ínterin). El
# proceso de desactivación debe omitirla sin reasignarla ni dejarla sin técnico.
OMITIR_ENTREGA = object()


def reasignar_entrega(
    db: Session,
    pedido: Pedido,
    excluir_ids: set[int] | None = None,
    propietario_esperado: int | None = None,
) -> dict | None:
    """Reasigna la entrega de un pedido buscando técnico disponible DENTRO DEL
    RANGO horario de la entrega, con esta prioridad:

      1. Cubre TODAS las especializaciones requeridas por los productos.
      2. Comparte al menos una especialización (relacionada).
      3. Cualquier técnico activo libre en el rango.

    Dentro de cada nivel se elige el de menor carga activa. Devuelve un dict
    con el técnico elegido y si se usó una especialización alternativa, o
    None si no hay candidatos.

    Bloquea la fila (FOR UPDATE) y refresca sus atributos desde la base
    (``populate_existing``) para no validar un objeto precargado/desactualizado
    del mapa de identidad. Bajo el bloqueo:

      - Si ``propietario_esperado`` se indica y la entrega ya no le pertenece
        (la reasignó un administrador), devuelve ``OMITIR_ENTREGA`` y no altera
        datos ni emite avisos.
      - Si el estado ya no es reasignable (recogida/en camino/entregada o
        desconocido), lanza 409; no lo confunde con «no hay candidatos».
    """
    from app.services.especialidades import (
        _tecnicos_activos,
        especializaciones_de_tecnico,
        ventana_entrega,
        tecnico_libre_en_rango,
    )

    # Bloquear la fila y refrescar los atributos vigentes. populate_existing()
    # obliga a SQLAlchemy a sobrescribir la instancia del mapa de identidad con
    # la fila recién leída, de modo que la validación posterior use el estado y
    # responsable actuales, no los valores precargados por el llamador.
    pedido = (
        db.query(Pedido)
        .filter(Pedido.id_pedido == pedido.id_pedido)
        .with_for_update()
        .populate_existing()
        .first()
    )
    if pedido is None:
        return None

    # La entrega dejó de pertenecer al técnico que se desactiva: conservar la
    # asignación vigente (no reasignar de nuevo ni dejarla sin responsable).
    if propietario_esperado is not None and pedido.id_tecnico_entrega != propietario_esperado:
        db.commit()  # libera el bloqueo sin modificar nada
        return OMITIR_ENTREGA

    if not asignacion_reasignable(pedido.estado_entrega):
        raise HTTPException(
            status_code=409,
            detail=(
                f"La entrega del pedido #{pedido.id_pedido} ya no está en estado "
                "asignable (recogida, en camino o entregada); no se puede reasignar."
            ),
        )

    excluir = set(excluir_ids or set())
    if pedido.id_tecnico_entrega:
        excluir.add(pedido.id_tecnico_entrega)

    fecha = pedido.fecha_entrega
    hora_ini = pedido.hora_entrega or "10:00"
    hora_fin = pedido.hora_entrega_fin

    if fecha is not None:
        candidatos = [
            t
            for t in _tecnicos_activos(db)
            if t.id_tecnico not in excluir
            and tecnico_libre_en_rango(
                db, t.id_tecnico, fecha, hora_ini, hora_fin,
                excluir_pedido_id=pedido.id_pedido,
            )
        ]
    else:
        candidatos = [t for t in _tecnicos_activos(db) if t.id_tecnico not in excluir]
    if not candidatos:
        return None

    requeridas = set(especializaciones_requeridas_entrega(db, pedido))

    def _carga(t):
        return (
            db.query(Pedido)
            .filter(
                Pedido.id_tecnico_entrega == t.id_tecnico,
                Pedido.estado_entrega.in_(ESTADOS_ENTREGA_OCUPAN),
            )
            .count()
        )

    exactos = [t for t in candidatos if requeridas.issubset(set(especializaciones_de_tecnico(t)))] if requeridas else list(candidatos)
    if exactos:
        elegido = min(exactos, key=_carga)
        alternativa = False
    else:
        relacionados = [
            t for t in candidatos
            if set(especializaciones_de_tecnico(t)) & requeridas
        ] if requeridas else []
        elegido = min(relacionados or candidatos, key=_carga)
        alternativa = True  # especialización alternativa o generalista

    anterior = pedido.nombre_tecnico_entrega
    pedido.id_tecnico_entrega = elegido.id_tecnico
    pedido.nombre_tecnico_entrega = _nombre_tecnico_de(elegido)
    db.commit()

    # Notificar al nuevo técnico.
    from app.services.notificaciones import notificar_entrega_asignada_tecnico

    cliente = pedido.cliente if hasattr(pedido, "cliente") else None
    ini_e, fin_e = ventana_entrega(pedido)
    rango_txt = (
        f"{pedido.hora_entrega or '10:00'} - {pedido.hora_entrega_fin}"
        if pedido.hora_entrega_fin
        else f"{pedido.hora_entrega or '10:00'}"
    )
    if elegido.usuario and elegido.usuario.email:
        notificar_entrega_asignada_tecnico(
            db,
            elegido.usuario.id_usuario,
            elegido.usuario.email,
            pedido.nombre_tecnico_entrega or "técnico",
            {
                "pedido": pedido.id_pedido,
                "cliente": f"{cliente.first_name} {cliente.last_name}".strip()
                if cliente
                else "Cliente",
                "direccion": (cliente.address if cliente else "") or "Por definir",
                "telefono": cliente.telefono_cliente if cliente else None,
                "fecha": pedido.fecha_entrega.strftime("%d/%m/%Y") if pedido.fecha_entrega else "-",
                "hora": rango_txt,
            },
        )

    # Alertar a administradores si se usó una especialización alternativa.
    if alternativa:
        from app.config import settings
        from app.services.notificaciones import crear_notificacion
        from app.models.user import User as _User

        for admin in db.query(_User).filter(_User.id_rol_u == 1, _User.is_active == True).all():  # noqa: E712
            crear_notificacion(
                db,
                id_usuario=admin.id_usuario,
                id_cliente=None,
                tipo="entrega",
                titulo="Entrega asignada con especialización alternativa",
                mensaje=(
                    f"La entrega del pedido #{pedido.id_pedido} se asignó a "
                    f"{pedido.nombre_tecnico_entrega} sin cubrir la especialización "
                    f"requerida ({', '.join(str(r) for r in sorted(requeridas)) or 'n/a'})."
                ),
            )
        if cliente and settings.NOTIFICAR_CLIENTE_CAMBIOS_TECNICO:
            crear_notificacion(
                db,
                id_usuario=None,
                id_cliente=cliente.id_cliente,
                tipo="entrega",
                titulo="Tu entrega tiene un nuevo técnico",
                mensaje=(
                    f"Tu pedido #{pedido.id_pedido} será entregado por "
                    f"{pedido.nombre_tecnico_entrega} el "
                    f"{pedido.fecha_entrega.strftime('%d/%m/%Y') if pedido.fecha_entrega else ''} "
                    f"entre {rango_txt}."
                ),
            )

    return {
        "tecnico": elegido,
        "nombre": pedido.nombre_tecnico_entrega,
        "especializacion_alternativa": alternativa,
        "anterior": anterior,
    }


def desactivar_tecnico_proceso(
    db: Session,
    tecnico,
    motivo: str | None = None,
    administrador_id: int | None = None,
) -> dict:
    """Proceso completo al desactivar/habilitar-off un técnico:

    1. Quita al técnico de las citas donde es SEGUNDO técnico (futuras).
    2. Reasigna automáticamente sus citas futuras como principal a técnicos
       con la especialización requerida; si no hay, cancela + reembolsa.
    3. Reasigna sus entregas pendientes a otros técnicos.
    4. Alerta a los administradores con el resumen.

    Devuelve un resumen con lo ocurrido.
    """
    from app.services.notificaciones import notificar_admin_resultado_desactivacion

    id_tecnico = tecnico.id_tecnico
    nombre_tecnico = _nombre_tecnico_de(tecnico) or f"Técnico #{id_tecnico}"
    motivo_txt = motivo or "Técnico desactivado"

    resumen = {
        "id_tecnico": id_tecnico,
        "tecnico": nombre_tecnico,
        "segundo_tecnico_liberadas": [],
        "citas_reasignadas": [],
        "citas_canceladas": [],
        "entregas_reasignadas": [],
        "entregas_sin_tecnico": [],
    }

    # 1) Segundo/tercer técnico: liberar cupos futuros.
    hoy = date.today()
    como_segundo_o_tercero = (
        db.query(Cita)
        .filter(
            or_(Cita.id_tecnico_2 == id_tecnico, Cita.id_tecnico_3 == id_tecnico),
            Cita.fecha >= hoy,
            Cita.estado.in_(ESTADOS_OCUPAN),
        )
        .all()
    )
    for cita in como_segundo_o_tercero:
        reserva = mejor_tecnico_para(
            db,
            [cita.id_especializacion] if cita.id_especializacion else [],
            fecha=cita.fecha,
            hora=cita.hora,
            excluir_ids={id_tecnico},
        )
        if cita.id_tecnico_3 == id_tecnico:
            cita.id_tecnico_3 = reserva.id_tecnico if reserva else None
            cita.nombre_tecnico_3 = _nombre_tecnico_de(reserva) if reserva else None
        else:
            cita.id_tecnico_2 = reserva.id_tecnico if reserva else None
            cita.nombre_tecnico_2 = _nombre_tecnico_de(reserva) if reserva else None
        resumen["segundo_tecnico_liberadas"].append(cita.id_cita)
    db.commit()

    # 2) Citas futuras como principal.
    for cita in citas_futuras_de_tecnico(db, id_tecnico):
        resultado = reasignar_cita_automatica(
            db,
            cita,
            excluir_ids={id_tecnico},
            administrador_id=administrador_id,
            motivo=f"Desactivación del técnico {nombre_tecnico}",
        )
        if resultado["estado"] == "reasignada":
            resumen["citas_reasignadas"].append(resultado)
        elif resultado["estado"] == "cancelada":
            resumen["citas_canceladas"].append(resultado)

    # 3) Entregas pendientes.
    for pedido in entregas_pendientes_de_tecnico(db, id_tecnico):
        resultado_entrega = reasignar_entrega(
            db, pedido, excluir_ids={id_tecnico}, propietario_esperado=id_tecnico
        )
        if resultado_entrega is OMITIR_ENTREGA:
            # Un administrador ya la reasignó a otro técnico: conservar la
            # asignación vigente y no contarla como reasignada ni desasignarla.
            continue
        if resultado_entrega is not None:
            resumen["entregas_reasignadas"].append(
                {
                    "id_pedido": pedido.id_pedido,
                    "nuevo_tecnico": pedido.nombre_tecnico_entrega,
                }
            )
        else:
            pedido.estado_entrega = "Pendiente"
            pedido.id_tecnico_entrega = None
            pedido.nombre_tecnico_entrega = None
            db.commit()
            resumen["entregas_sin_tecnico"].append(pedido.id_pedido)

            # Notificar al cliente que su entrega quedó sin técnico.
            try:
                from app.models.cliente import Cliente as ClienteModel
                from app.services.notificaciones import notificar_entrega_sin_tecnico_cliente

                cliente = db.query(ClienteModel).filter(ClienteModel.id_cliente == pedido.id_cliente_pe).first()
                if cliente:
                    nombre_cliente = f"{cliente.first_name} {cliente.last_name}".strip() or "Cliente"
                    notificar_entrega_sin_tecnico_cliente(
                        db,
                        cliente_id=cliente.id_cliente,
                        correo=cliente.email if cliente else None,
                        cliente_nombre=nombre_cliente,
                        pedido_id=pedido.id_pedido,
                    )
                    db.commit()
            except Exception:
                pass

    # 4) Alerta a administradores.
    notificar_admin_resultado_desactivacion(
        db,
        nombre_tecnico,
        reasignadas=len(resumen["citas_reasignadas"]),
        canceladas=len(resumen["citas_canceladas"]),
        entregas_reasignadas=len(resumen["entregas_reasignadas"]),
        entregas_sin_tecnico=len(resumen["entregas_sin_tecnico"]),
    )

    return resumen
