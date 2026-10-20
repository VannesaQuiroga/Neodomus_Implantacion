# Rutas de tecnicos. Las dependencias declaradas en cada endpoint determinan sus permisos de acceso.
from typing import List, Optional
from datetime import date, datetime, timedelta
from pathlib import Path
import uuid

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.tecnico import Tecnico
from app.models.cliente import Cliente
from app.models.roles_usuario import RolesUsuario
from app.models.user import User
from app.models.cita import Cita
from app.models.cita_producto import CitaProducto
from app.models.producto import Producto
from app.models.producto_variante import ProductoVariante
from app.models.otros import Comision
from app.models.calificacion import Calificacion
from app.models.evidencia import Evidencia
from app.models.especializacion import Especializacion
from app.models.pedido import Pedido, DetallePedido
from app.services.especialidades import (
    _dia_es_laboral,
    horas_laborales,
    tecnico_ocupado,
    bloquear_tecnicos,
    requisitos_cita,
    ids_equipo_cita,
    validar_equipo_tecnicos,
    tecnico_disponible,
)
from app.services.estados_entrega import validar_transicion_tecnico
from app.services.notificaciones import notificar_cita_reasignada_cliente
from app.routers.citas import _validar_franja_cita
from app.models.ubicacion_tecnico import UbicacionTecnico
from app.services import minio_service
from app.utils.security import get_current_employee

ESTADOS_CITA = ("Pendiente", "Confirmada", "Finalizada", "Cancelada")

ESTADOS_ID = {1: "Pendiente", 2: "Confirmada", 3: "Finalizada", 4: "Cancelada"}

EVIDENCIAS_DIR = Path(__file__).resolve().parent.parent / "static" / "evidencias"

EXTENSIONES_EVIDENCIA = {".jpg", ".jpeg", ".png", ".webp", ".gif"}


def _url_evidencia(url_archivo: str, tipo: str, evidencia_id: int) -> str:
    """URL autorizada (no pública) de una evidencia.

    Las evidencias son archivos privados del negocio: se sirven mediante una
    ruta autenticada que comprueba asignación/rol. Nunca se devuelven enlaces
    públicos del almacenamiento. ``url_archivo`` se conserva en el backend para
    resolver el objeto al descargarlo.
    """
    return f"/api/v1/tecnicos/evidencias/{tipo}/{evidencia_id}/archivo"


def _leer_archivo_evidencia(url_archivo: str) -> tuple[bytes, str]:
    """Lee el contenido de una evidencia desde su almacenamiento (MinIO privado
    o disco legado) sin exponer el enlace directo. Devuelve (bytes, media_type)."""
    if "/" in (url_archivo or ""):
        try:
            return minio_service.leer_archivo(url_archivo)
        except FileNotFoundError:
            raise HTTPException(status_code=404, detail="Archivo no encontrado")
    ruta = EVIDENCIAS_DIR / url_archivo
    if not ruta.is_file():
        raise HTTPException(status_code=404, detail="Archivo no encontrado")
    return ruta.read_bytes(), "image/jpeg"

router = APIRouter(prefix="/tecnicos", tags=["Técnicos"])


def _servir_evidencia(db: Session, tipo: str, evidencia_id: int, current_user: User):
    """Sirve una evidencia privada previa comprobación de asignación/rol.

    Administrador: cualquier evidencia. Técnico: solo las suyas (asignadas).
    """
    from app.models.evidencia import EvidenciaEntrega

    rol = (
        db.query(RolesUsuario)
        .filter(RolesUsuario.id_rol == current_user.id_rol_u)
        .first()
    )
    es_admin = rol is not None and rol.nombre_rol in ("admin", "administrador")

    if tipo not in ("entrega", "cita"):
        raise HTTPException(status_code=400, detail="Tipo de evidencia no válido")
    if tipo == "entrega":
        ev = db.query(EvidenciaEntrega).filter(EvidenciaEntrega.id == evidencia_id).first()
    else:
        ev = db.query(Evidencia).filter(Evidencia.id_evidencia == evidencia_id).first()
    if not ev:
        raise HTTPException(status_code=404, detail="Evidencia no encontrada")
    if not es_admin:
        tecnico = _ficha_tecnico_actual(db, current_user)
        if ev.id_tecnico != tecnico.id_tecnico:
            raise HTTPException(status_code=403, detail="No tienes permiso para ver esta evidencia")
    contenido, media = _leer_archivo_evidencia(ev.url_archivo)
    return Response(content=contenido, media_type=media)


@router.get("/evidencias/entrega/{evidencia_id}/archivo")
def descargar_evidencia_entrega(
    evidencia_id: int,
    current_user: User = Depends(get_current_employee),
    db: Session = Depends(get_db),
):
    return _servir_evidencia(db, "entrega", evidencia_id, current_user)


@router.get("/evidencias/cita/{evidencia_id}/archivo")
def descargar_evidencia_cita(
    evidencia_id: int,
    current_user: User = Depends(get_current_employee),
    db: Session = Depends(get_db),
):
    return _servir_evidencia(db, "cita", evidencia_id, current_user)


# Agrupa los campos de TecnicoAdminResponse: id_tecnico, id_usuario, first_name, last_name, email y los demás declarados abajo.
class TecnicoAdminResponse(BaseModel):
    id_tecnico: int
    id_usuario: int
    first_name: str
    last_name: str
    email: str
    telefono_usuario: int | None = None
    documento_usuario: int | None = None
    certificacion_t: str | None = None
    is_active: bool
    desactivado_hasta: datetime | None = None
    created_at: datetime | None = None
    password_reset_required: bool = False
    servicios: list[str] = []
    calificacion: float | None = None
    total_calificaciones: int = 0


# Agrupa los campos de TecnicoUpdate: certificacion.
class TecnicoUpdate(BaseModel):
    certificacion: str | None = None


# Agrupa los campos de EstadoCitaUpdate: estado, estado_id.
class EstadoCitaUpdate(BaseModel):
    estado: str | None = None
    estado_id: int | None = None


# Agrupa los campos de TecnicoCitaResponse: id_cita, fecha, hora, estado, tipo_servicio y los demás declarados abajo.
class TecnicoCitaResponse(BaseModel):
    id_cita: int
    fecha: date
    hora: str
    estado: str
    tipo_servicio: str
    cliente: str
    telefono: int | None = None
    email: str | None = None
    documento_tipo: str | None = None
    documento_numero: int | None = None
    direccion: str
    descripcion: str | None = None
    id_tecnico: int | None = None
    nombre_tecnico: str | None = None
    id_tecnico_2: int | None = None
    nombre_tecnico_2: str | None = None
    id_tecnico_3: int | None = None
    nombre_tecnico_3: str | None = None
    mi_rol: str | None = None
    companeros: list[str] = []
    costo_cita: float | None = None
    id_comision_c: int | None = None
    comision_porcentaje: float | None = None
    comision_valor: float | None = None
    evidencias: list[dict] = []
    calificacion: dict | None = None
    cliente_info: dict | None = None
    productos: list[dict] = []


# Agrupa los campos de TecnicoClienteResponse: id_cliente, nombre, email, telefono, direccion y los demás declarados abajo.
class TecnicoClienteResponse(BaseModel):
    id_cliente: int
    nombre: str
    email: str | None = None
    telefono: int | None = None
    direccion: str | None = None
    citas_count: int


# Agrupa los campos de ComisionTecnicoResponse: id_cita, fecha, hora, tipo_servicio, cliente_nombre y los demás declarados abajo.
class ComisionTecnicoResponse(BaseModel):
    id_cita: int
    fecha: date
    hora: str
    tipo_servicio: str
    cliente_nombre: str
    costo_cita: float | None = None
    estado_pago: str | None = None
    metodo_pago: str | None = None
    id_comision: int | None = None
    porcentaje_comision: float | None = None
    valor_comision: float | None = None


# Agrupa los campos de ReagendarCitaRequest: fecha, hora, metodo_pago, id_comision, porcentaje_comision y los demás declarados abajo.
class ReagendarCitaRequest(BaseModel):
    fecha: date
    hora: str
    metodo_pago: str | None = None
    id_comision: int
    porcentaje_comision: float | None = None
    valor_comision: float | None = None


# Agrupa los campos de TecnicoPublicoResponse: id_tecnico, first_name, last_name, certificacion_t, is_active y los demás declarados abajo.
class TecnicoPublicoResponse(BaseModel):
    id_tecnico: int
    first_name: str
    last_name: str
    certificacion_t: str | None = None
    is_active: bool
    disponible: bool = True
    telefono: int | None = None
    foto_url: str | None = None
    calificacion: float | None = None
    total_calificaciones: int = 0


def _serializar_publico(db: Session, t: Tecnico) -> TecnicoPublicoResponse:
    u = t.usuario
    promedio = (
        db.query(func.avg(Calificacion.calificacion))
        .filter(Calificacion.id_tecnico_c == t.id_tecnico)
        .scalar()
    )
    total = (
        db.query(func.count(Calificacion.id_calificacion))
        .filter(Calificacion.id_tecnico_c == t.id_tecnico)
        .scalar()
    )
    return TecnicoPublicoResponse(
        id_tecnico=t.id_tecnico,
        first_name=u.first_name if u else "",
        last_name=u.last_name if u else "",
        certificacion_t=t.certificacion_t,
        is_active=u.is_active if u else False,
        disponible=bool(u and u.is_active),
        telefono=u.telefono_usuario if u else None,
        foto_url=u.foto_url if u else None,
        calificacion=round(float(promedio), 2) if promedio is not None else None,
        total_calificaciones=int(total or 0),
    )


# Valida las condiciones de esta operación y devuelve un error HTTP si no se cumplen.
def _admin(
    current_user: User = Depends(get_current_employee),
    db: Session = Depends(get_db),
) -> User:
    role = db.execute(select(RolesUsuario.nombre_rol).where(RolesUsuario.id_rol == current_user.id_rol_u)).scalar_one_or_none()
    if role not in ("admin", "administrador"):
        raise HTTPException(status_code=403, detail="Permisos insuficientes")
    return current_user


def _serializar(
    t: Tecnico,
    calificacion: float | None = None,
    total_calificaciones: int = 0,
) -> TecnicoAdminResponse:
    u = t.usuario
    return TecnicoAdminResponse(
        id_tecnico=t.id_tecnico,
        id_usuario=u.id_usuario if u else 0,
        first_name=u.first_name if u else "",
        last_name=u.last_name if u else "",
        email=u.email if u else "",
        telefono_usuario=u.telefono_usuario if u else None,
        documento_usuario=u.documento_usuario if u else None,
        certificacion_t=t.certificacion_t,
        is_active=u.is_active if u else False,
        desactivado_hasta=u.desactivado_hasta if u else None,
        created_at=u.created_at if u else None,
        password_reset_required=bool(u.password_reset_required) if u else False,
        servicios=[],
        calificacion=calificacion,
        total_calificaciones=total_calificaciones,
    )


@router.get("/publicos", response_model=List[TecnicoPublicoResponse])
def listar_tecnicos_publicos(
    db: Session = Depends(get_db),
    tipo_servicio: Optional[str] = None,
    fecha: Optional[date] = None,
    hora: Optional[str] = None,
):
    """Lista los técnicos reales del sistema (acceso público, solo datos básicos).

    Usado por las páginas de cliente para agendar citas con técnicos reales.
    No se filtra por especialidad: cualquier técnico atiende cualquier servicio.

    Filtros opcionales:
    - fecha + hora: marca `disponible=False` a los técnicos ocupados con una
      cita activa en ese horario.
    """
    tecnicos = (
        db.query(Tecnico)
        .join(User, User.id_usuario == Tecnico.id_usuario_t)
        .filter(User.id_rol_u == 2)
        .order_by(Tecnico.id_tecnico.asc())
        .all()
    )
    resultado: list[TecnicoPublicoResponse] = []
    for t in tecnicos:
        item = _serializar_publico(db, t)
        if fecha is not None and hora is not None:
            ocupado = tecnico_ocupado(db, t.id_tecnico, fecha, hora)
            item.disponible = item.is_active and not ocupado
        resultado.append(item)
    return resultado


@router.get("", response_model=List[TecnicoAdminResponse])
def listar_tecnicos(
    _admin_user: User = Depends(_admin),
    db: Session = Depends(get_db),
):
    """Lista los técnicos reales registrados en el sistema (solo admin)"""
    tecnicos = (
        db.query(Tecnico)
        .join(User, User.id_usuario == Tecnico.id_usuario_t)
        .filter(User.id_rol_u == 2)
        .order_by(Tecnico.id_tecnico.asc())
        .all()
    )
    promedios = {
        row[0]: (row[1], row[2])
        for row in db.query(
            Calificacion.id_tecnico_c,
            func.avg(Calificacion.calificacion),
            func.count(Calificacion.id_calificacion),
        )
        .group_by(Calificacion.id_tecnico_c)
        .all()
    }
    resultado: list[TecnicoAdminResponse] = []
    for t in tecnicos:
        avg, total = promedios.get(t.id_tecnico, (None, 0))
        resultado.append(
            _serializar(
                t,
                round(float(avg), 2) if avg is not None else None,
                int(total or 0),
            )
        )
    return resultado


@router.get("/unassigned", response_model=List[int])
def listar_usuarios_tecnicos_sin_ficha_admin(
    _admin_user: User = Depends(_admin),
    db: Session = Depends(get_db),
):
    """Ids de usuarios con rol técnico que aún no tienen ficha en la tabla tecnicos"""
    ficha_ids = [t.id_usuario_t for t in db.query(Tecnico).all()]
    usuarios_tecnicos = (
        db.query(User.id_usuario)
        .filter(User.id_rol_u == 2, User.is_active == True)  # noqa: E712
        .all()
    )
    return [u[0] for u in usuarios_tecnicos if u[0] not in ficha_ids]


@router.put("/{tecnico_id}", response_model=TecnicoAdminResponse)
def actualizar_tecnico(
    tecnico_id: int,
    data: TecnicoUpdate,
    _admin_user: User = Depends(_admin),
    db: Session = Depends(get_db),
):
    """Actualiza la ficha técnica (especialidad) de un técnico (solo admin)"""
    tecnico = db.query(Tecnico).filter(Tecnico.id_tecnico == tecnico_id).first()
    if not tecnico:
        raise HTTPException(status_code=404, detail="Técnico no encontrado")
    if data.certificacion is not None:
        tecnico.certificacion_t = data.certificacion
    db.commit()
    db.refresh(tecnico)
    return _serializar(tecnico)


@router.delete("/{tecnico_id}", response_model=dict)
def eliminar_tecnico(
    tecnico_id: int,
    _admin_user: User = Depends(_admin),
    db: Session = Depends(get_db),
):
    """Elimina la ficha técnica de un usuario (solo admin)"""
    tecnico = db.query(Tecnico).filter(Tecnico.id_tecnico == tecnico_id).first()
    if not tecnico:
        raise HTTPException(status_code=404, detail="Técnico no encontrado")
    db.delete(tecnico)
    db.commit()
    return {"msg": "Ficha de técnico eliminada", "id": tecnico_id}


def _ficha_tecnico_actual(db: Session, current_user: User) -> Tecnico:
    """Ficha del técnico autenticado (o error 404 si no tiene ficha)"""
    tecnico = (
        db.query(Tecnico)
        .filter(Tecnico.id_usuario_t == current_user.id_usuario)
        .first()
    )
    if not tecnico:
        raise HTTPException(
            status_code=404,
            detail="No hay ficha de técnico asociada a tu cuenta",
        )
    return tecnico


@router.post("/mis-especializaciones/{id_especializacion}")
def agregar_mi_especializacion(
    id_especializacion: int,
    current_user: User = Depends(get_current_employee),
    db: Session = Depends(get_db),
):
    """El técnico se agrega una especialización del catálogo a su ficha."""
    tecnico = _ficha_tecnico_actual(db, current_user)
    esp = (
        db.query(Especializacion)
        .filter(
            Especializacion.id_especializacion == id_especializacion,
            Especializacion.activa == True,  # noqa: E712
        )
        .first()
    )
    if not esp:
        raise HTTPException(
            status_code=404,
            detail="Especialización no encontrada o inactiva",
        )
    ya = any(
        e.id_especializacion == id_especializacion
        for e in tecnico.especializaciones
    )
    if ya:
        raise HTTPException(status_code=400, detail="Ya tienes esta especialización")
    tecnico.especializaciones.append(esp)
    db.commit()
    db.refresh(tecnico)
    return {
        "mensaje": f"Especialización '{esp.nombre}' agregada a tu ficha",
        "especializaciones": [
            {
                "id_especializacion": e.id_especializacion,
                "nombre": e.nombre,
                "descripcion": e.descripcion,
            }
            for e in tecnico.especializaciones
        ],
    }


@router.delete("/mis-especializaciones/{id_especializacion}")
def quitar_mi_especializacion(
    id_especializacion: int,
    current_user: User = Depends(get_current_employee),
    db: Session = Depends(get_db),
):
    """El técnico quita una especialización de su ficha."""
    tecnico = _ficha_tecnico_actual(db, current_user)
    esp = next(
        (
            e
            for e in tecnico.especializaciones
            if e.id_especializacion == id_especializacion
        ),
        None,
    )
    if not esp:
        raise HTTPException(
            status_code=404,
            detail="No tienes esa especialización en tu ficha",
        )
    tecnico.especializaciones.remove(esp)
    db.commit()
    return {
        "mensaje": f"Especialización '{esp.nombre}' eliminada de tu ficha",
        "especializaciones": [
            {
                "id_especializacion": e.id_especializacion,
                "nombre": e.nombre,
                "descripcion": e.descripcion,
            }
            for e in tecnico.especializaciones
        ],
    }


def _serializar_cita_tecnico(
    db: Session, cita: Cita, id_tecnico_actual: int | None = None
) -> TecnicoCitaResponse:
    """Serializa una cita con los datos completos del cliente asociado
    y los productos vinculados a la cita. Cuando se pasa `id_tecnico_actual`
    indica el rol del técnico (principal/segundo/tercero) y sus compañeros."""
    cliente = (
        db.query(Cliente).filter(Cliente.id_cliente == cita.id_cliente).first()
    )
    documento_tipo = None
    if cliente and cliente.id_tipo_documento_c:
        from app.models.otros import TipoDocumento

        td = (
            db.query(TipoDocumento)
            .filter(TipoDocumento.id_tipo_documento == cliente.id_tipo_documento_c)
            .first()
        )
        documento_tipo = td.nombre_tipo if td else None
    id_comision = None
    com_porcentaje = None
    com_valor = None
    if cita.id_comision_c is not None:
        com = (
            db.query(Comision)
            .filter(Comision.id_comision == cita.id_comision_c)
            .first()
        )
        if com:
            id_comision = com.id_comision
            com_porcentaje = (
                float(com.porcentaje_comision)
                if com.porcentaje_comision is not None
                else None
            )
            com_valor = (
                float(com.valor_comision) if com.valor_comision is not None else None
            )

    cliente_info = None
    if cliente:
        cliente_info = {
            "id_cliente": cliente.id_cliente,
            "nombre": f"{cliente.first_name} {cliente.last_name}".strip(),
            "email": cliente.email,
            "telefono": cliente.telefono_cliente,
            "direccion": cliente.address,
            "documento_tipo": documento_tipo,
            "documento_numero": cliente.documento_cliente,
        }

    productos = _productos_cita(db, cita.id_cita)

    mi_rol = None
    if id_tecnico_actual is not None:
        if cita.id_tecnico == id_tecnico_actual:
            mi_rol = "principal"
        elif cita.id_tecnico_2 == id_tecnico_actual:
            mi_rol = "segundo"
        elif cita.id_tecnico_3 == id_tecnico_actual:
            mi_rol = "tercero"

    def _nombre_de(id_tecnico: int | None, nombre: str | None) -> str | None:
        if id_tecnico is None or id_tecnico == id_tecnico_actual:
            return None
        return nombre

    companeros = [
        n
        for n in (
            _nombre_de(cita.id_tecnico, cita.nombre_tecnico),
            _nombre_de(cita.id_tecnico_2, cita.nombre_tecnico_2),
            _nombre_de(cita.id_tecnico_3, cita.nombre_tecnico_3),
        )
        if n
    ]

    return TecnicoCitaResponse(
        id_cita=cita.id_cita,
        fecha=cita.fecha,
        hora=cita.hora,
        estado=cita.estado,
        tipo_servicio=cita.tipo_servicio,
        cliente=f"{cliente.first_name} {cliente.last_name}".strip() if cliente else "Cliente",
        telefono=cliente.telefono_cliente if cliente else None,
        email=cliente.email if cliente else None,
        documento_tipo=documento_tipo,
        documento_numero=cliente.documento_cliente if cliente else None,
        direccion=cita.direccion,
        descripcion=cita.descripcion,
        id_tecnico=cita.id_tecnico,
        nombre_tecnico=cita.nombre_tecnico,
        id_tecnico_2=cita.id_tecnico_2,
        nombre_tecnico_2=cita.nombre_tecnico_2,
        id_tecnico_3=cita.id_tecnico_3,
        nombre_tecnico_3=cita.nombre_tecnico_3,
        mi_rol=mi_rol,
        companeros=companeros,
        costo_cita=float(cita.costo_cita) if cita.costo_cita is not None else None,
        id_comision_c=id_comision,
        comision_porcentaje=com_porcentaje,
        comision_valor=com_valor,
        evidencias=_serializar_evidencias(db, cita.id_cita),
        calificacion=_calificacion_cita(db, cita),
        cliente_info=cliente_info,
        productos=productos,
    )


def _serializar_evidencias(db: Session, id_cita: int) -> list[dict]:
    """Evidencias subidas para la cita, más recientes primero."""
    filas = (
        db.query(Evidencia)
        .filter(Evidencia.id_cita == id_cita)
        .order_by(Evidencia.id_evidencia.desc())
        .all()
    )
    return [
        {
            "id_evidencia": e.id_evidencia,
            "url": _url_evidencia(e.url_archivo, "cita", e.id_evidencia),
            "descripcion": e.descripcion,
            "fecha_subida": e.fecha_subida.isoformat() if e.fecha_subida else None,
        }
        for e in filas
    ]


def _calificacion_cita(db: Session, cita: Cita) -> dict | None:
    """Calificación recibida por el técnico para esta cita (si existe)."""
    cal = (
        db.query(Calificacion)
        .filter(Calificacion.id_cita_c == cita.id_cita)
        .first()
    )
    if not cal:
        return None
    return {
        "calificacion": cal.calificacion,
        "comentario": cal.comentario,
        "fecha": cal.created_at.isoformat() if cal.created_at else None,
    }


def _productos_cita(db: Session, id_cita: int) -> list[dict]:
    """Productos asociados a la cita con información detallada."""
    filas = (
        db.query(CitaProducto)
        .filter(CitaProducto.id_cita == id_cita)
        .all()
    )
    if not filas:
        return []
    resultado = []
    for cp in filas:
        producto = db.query(Producto).filter(Producto.id_producto == cp.id_producto).first()
        if not producto:
            continue
        variante = None
        if cp.id_variante:
            v = db.query(ProductoVariante).filter(ProductoVariante.id == cp.id_variante).first()
            if v:
                variante = {
                    "nombre": v.nombre,
                    "hex": v.hex,
                    "tamaño": v.tamaño,
                    "imagen_url": v.imagen_url,
                }
        resultado.append({
            "id_producto": producto.id_producto,
            "nombre": producto.nombre_producto,
            "marca": producto.marca,
            "referencia": producto.referencia_producto,
            "precio_venta": float(producto.precio_venta_producto) if producto.precio_venta_producto else None,
            "imagen_url": producto.imagen_url,
            "variante": variante,
            "cantidad": cp.cantidad,
            "notas": cp.notas,
        })
    return resultado


@router.get("/mis-clientes", response_model=List[TecnicoClienteResponse])
def mis_clientes_tecnico(
    current_user: User = Depends(get_current_employee),
    db: Session = Depends(get_db),
    q: Optional[str] = None,
    skip: int = 0,
    limit: int = 50,
):
    """Clientes con los que el técnico autenticado tiene (o tuvo) citas,
    ordenados alfabéticamente, con el número de citas por cliente.

    Filtros opcionales:
    - q: busca por nombre, apellido o email (case-insensitive).
    - skip / limit: paginación.
    """
    tecnico = _ficha_tecnico_actual(db, current_user)
    filas = (
        db.query(Cita.id_cliente, func.count(Cita.id_cita))
        .filter(Cita.id_tecnico == tecnico.id_tecnico)
        .group_by(Cita.id_cliente)
        .all()
    )
    if not filas:
        return []
    ids = [fila[0] for fila in filas]
    clientes_query = db.query(Cliente).filter(Cliente.id_cliente.in_(ids))
    if q:
        patron = f"%{q}%"
        clientes_query = clientes_query.filter(
            (Cliente.first_name.ilike(patron))
            | (Cliente.last_name.ilike(patron))
            | (Cliente.email.ilike(patron))
        )
    clientes = {c.id_cliente: c for c in clientes_query.all()}
    citas_por_cliente = dict(filas)
    resultado: list[TecnicoClienteResponse] = []
    for id_cliente, cantidad in filas:
        c = clientes.get(id_cliente)
        if not c:
            continue
        resultado.append(
            TecnicoClienteResponse(
                id_cliente=c.id_cliente,
                nombre=f"{c.first_name} {c.last_name}".strip() or "Cliente",
                email=c.email,
                telefono=c.telefono_cliente,
                direccion=c.address,
                citas_count=citas_por_cliente.get(id_cliente, cantidad),
            )
        )
    resultado.sort(key=lambda r: r.nombre.lower())
    return resultado[skip : skip + limit]


@router.get("/clientes/{cliente_id}/citas", response_model=List[TecnicoCitaResponse])
def citas_cliente_tecnico(
    cliente_id: int,
    current_user: User = Depends(get_current_employee),
    db: Session = Depends(get_db),
):
    """Citas de un cliente específico asignadas al técnico autenticado,
    ordenadas por fecha y hora descendente (más recientes primero).
    Incluye las evidencias de cada cita."""
    tecnico = _ficha_tecnico_actual(db, current_user)
    cliente = db.query(Cliente).filter(Cliente.id_cliente == cliente_id).first()
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")
    citas = (
        db.query(Cita)
        .filter(
            or_(
                Cita.id_tecnico == tecnico.id_tecnico,
                Cita.id_tecnico_2 == tecnico.id_tecnico,
                Cita.id_tecnico_3 == tecnico.id_tecnico,
            ),
            Cita.id_cliente == cliente_id,
        )
        .order_by(Cita.fecha.desc(), Cita.hora.desc())
        .all()
    )
    return [_serializar_cita_tecnico(db, cita) for cita in citas]


@router.get("/comisiones", response_model=List[ComisionTecnicoResponse])
def comisiones_tecnico(
    current_user: User = Depends(get_current_employee),
    db: Session = Depends(get_db),
):
    """Comisiones ganadas por el técnico autenticado.

    Devuelve todas las citas asignadas al técnico que tengan una comisión
    asociada, ordenadas por fecha descendente. Incluye el estado de pago
    de la cita para que el técnico pueda verificar si el cliente ya pagó.
    """
    tecnico = _ficha_tecnico_actual(db, current_user)
    citas = (
        db.query(Cita)
        .filter(
            Cita.id_tecnico == tecnico.id_tecnico,
            Cita.id_comision_c.isnot(None),
        )
        .order_by(Cita.fecha.desc(), Cita.hora.desc())
        .all()
    )
    resultado: list[ComisionTecnicoResponse] = []
    for cita in citas:
        com = db.query(Comision).filter(Comision.id_comision == cita.id_comision_c).first()
        if not com:
            continue
        cliente = db.query(Cliente).filter(Cliente.id_cliente == cita.id_cliente).first()
        cliente_nombre = (
            f"{cliente.first_name} {cliente.last_name}".strip() if cliente else "Cliente"
        )
        resultado.append(
            ComisionTecnicoResponse(
                id_cita=cita.id_cita,
                fecha=cita.fecha,
                hora=cita.hora,
                tipo_servicio=cita.tipo_servicio,
                cliente_nombre=cliente_nombre,
                costo_cita=float(cita.costo_cita) if cita.costo_cita is not None else None,
                estado_pago=cita.estado_pago,
                metodo_pago=cita.metodo_pago,
                id_comision=com.id_comision,
                porcentaje_comision=float(com.porcentaje_comision) if com.porcentaje_comision is not None else None,
                valor_comision=float(com.valor_comision) if com.valor_comision is not None else None,
            )
        )
    return resultado


@router.get("/mis-citas", response_model=List[TecnicoCitaResponse])
def mis_citas_tecnico(
    current_user: User = Depends(get_current_employee),
    db: Session = Depends(get_db),
):
    """Citas asignadas al técnico autenticado (principal, segundo o tercer
    técnico), ordenadas por fecha y hora"""
    tecnico = _ficha_tecnico_actual(db, current_user)
    citas = (
        db.query(Cita)
        .filter(
            or_(
                Cita.id_tecnico == tecnico.id_tecnico,
                Cita.id_tecnico_2 == tecnico.id_tecnico,
                Cita.id_tecnico_3 == tecnico.id_tecnico,
            )
        )
        .order_by(Cita.fecha.asc(), Cita.hora.asc())
        .all()
    )
    return [_serializar_cita_tecnico(db, cita, tecnico.id_tecnico) for cita in citas]


@router.put("/citas/{cita_id}/estado", response_model=TecnicoCitaResponse)
def actualizar_estado_cita_tecnico(
    cita_id: int,
    data: EstadoCitaUpdate,
    current_user: User = Depends(get_current_employee),
    db: Session = Depends(get_db),
):
    """El técnico actualiza el estado de una cita que le fue asignada.
    Las citas se crean ya Confirmadas y SOLO el técnico encargado (principal)
    puede marcarlas como Finalizada; los técnicos de apoyo (2 y 3) ven la cita
    pero no pueden finalizarla."""
    tecnico = _ficha_tecnico_actual(db, current_user)
    cita = db.query(Cita).filter(Cita.id_cita == cita_id).first()
    if (
        not cita
        or tecnico.id_tecnico
        not in (cita.id_tecnico, cita.id_tecnico_2, cita.id_tecnico_3)
    ):
        raise HTTPException(status_code=404, detail="Cita no encontrada")
    if cita.id_tecnico != tecnico.id_tecnico:
        raise HTTPException(
            status_code=403,
            detail=(
                "Solo el técnico encargado de la cita puede finalizarla. "
                "Tu rol en esta cita es de apoyo."
            ),
        )
    if data.estado is not None:
        nuevo_estado = data.estado
    elif data.estado_id is not None:
        nuevo_estado = ESTADOS_ID.get(data.estado_id)
        if nuevo_estado is None:
            raise HTTPException(status_code=400, detail="estado_id no válido")
    else:
        raise HTTPException(status_code=400, detail="Indica un estado válido")
    if nuevo_estado != "Finalizada":
        raise HTTPException(
            status_code=400,
            detail="El técnico solo puede marcar una cita como Finalizada. Los demás cambios los realiza el administrador o el cliente.",
        )
    if cita.estado == "Finalizada":
        raise HTTPException(status_code=400, detail="La cita ya está finalizada")
    # El técnico debe dejar evidencia del trabajo realizado para finalizar.
    tiene_evidencia = (
        db.query(Evidencia)
        .filter(Evidencia.id_cita == cita.id_cita)
        .first()
        is not None
    )
    if not tiene_evidencia:
        raise HTTPException(
            status_code=400,
            detail="Debes subir al menos una evidencia del trabajo realizado antes de finalizar la cita",
        )
    cita.estado = nuevo_estado
    db.commit()
    db.refresh(cita)

    # ── Notificar al cliente por correo Y notificación de plataforma ──
    from app.models.cliente import Cliente
    from app.services.notificaciones import notificar_cita_estado_cliente

    cliente = (
        db.query(Cliente).filter(Cliente.id_cliente == cita.id_cliente).first()
    )
    if cliente and cliente.email:
        nombre_cliente = f"{cliente.first_name} {cliente.last_name}".strip() or "Cliente"
        datos = {
            "servicio": cita.tipo_servicio,
            "fecha": cita.fecha.strftime("%d/%m/%Y"),
            "tecnico": cita.nombre_tecnico or "técnico",
            "descripcion": cita.descripcion,
        }
        notificar_cita_estado_cliente(
            db,
            cliente_id=cliente.id_cliente,
            correo=cliente.email,
            cliente_nombre=nombre_cliente,
            datos=datos,
            nuevo_estado=nuevo_estado,
        )

    return _serializar_cita_tecnico(db, cita)


@router.get("/citas/{cita_id}/proxima-fecha", response_model=dict)
def proxima_fecha_tecnico(
    cita_id: int,
    current_user: User = Depends(get_current_employee),
    db: Session = Depends(get_db),
):
    """Sugiere la próxima fecha laboral disponible desde mañana en la que TODO
    el equipo de la cita esté libre a la hora de la cita (excluyendo la actual)."""
    tecnico = _ficha_tecnico_actual(db, current_user)
    cita = _cita_asignada_a_mi(db, tecnico, cita_id)
    if cita.estado not in ("Pendiente", "Confirmada"):
        raise HTTPException(status_code=400, detail="Solo puedes aplazar una cita pendiente o confirmada")
    duracion, ids_esp = requisitos_cita(db, cita)
    equipo = ids_equipo_cita(cita)
    dia = max(cita.fecha + timedelta(days=1), date.today())
    for _ in range(45):
        if _dia_es_laboral(dia):
            libre = all(
                tecnico_disponible(
                    db, tid, dia, cita.hora,
                    ids_especializacion=ids_esp,
                    excluir_cita_id=cita.id_cita,
                    duracion_horas=duracion,
                )
                for tid in equipo
            )
            if libre:
                return {
                    "fecha": dia,
                    "hora": cita.hora,
                    "id_tecnico": tecnico.id_tecnico,
                    "nombre_tecnico": f"{tecnico.usuario.first_name} {tecnico.usuario.last_name}".strip()
                        if tecnico and tecnico.usuario else None,
                }
        dia += timedelta(days=1)
    raise HTTPException(
        status_code=404,
        detail="No se encontró una fecha próxima con el equipo disponible",
    )


@router.get("/citas/{cita_id}/horas-disponibles", response_model=list)
def horas_disponibles_tecnico(
    cita_id: int,
    fecha: date,
    current_user: User = Depends(get_current_employee),
    db: Session = Depends(get_db),
):
    """Franjas horarias libres para el EQUIPO COMPLETO de la cita en la fecha
    indicada, excluyendo la cita actual. Se usa para sugerir horas al técnico
    al reagendar."""
    tecnico = _ficha_tecnico_actual(db, current_user)
    cita = _cita_asignada_a_mi(db, tecnico, cita_id)
    duracion, ids_esp = requisitos_cita(db, cita)
    equipo = ids_equipo_cita(cita)
    return [
        h
        for h in horas_laborales(fecha, duracion)
        if all(
            tecnico_disponible(
                db, tid, fecha, h,
                ids_especializacion=ids_esp,
                excluir_cita_id=cita.id_cita,
                duracion_horas=duracion,
            )
            for tid in equipo
        )
    ]


@router.put("/citas/{cita_id}/reagendar", response_model=TecnicoCitaResponse)
def reagendar_cita_tecnico(
    cita_id: int,
    data: ReagendarCitaRequest,
    current_user: User = Depends(get_current_employee),
    db: Session = Depends(get_db),
):
    """Permite al técnico reagendar una cita (cambiar fecha y hora).
    Se valida la franja laboral y la disponibilidad del EQUIPO COMPLETO
    (principal, segundo y tercero) con la duración y especializaciones reales,
    excluyendo la cita actual."""
    tecnico = _ficha_tecnico_actual(db, current_user)
    cita = _cita_asignada_a_mi(db, tecnico, cita_id)
    if cita.estado not in ("Pendiente", "Confirmada"):
        raise HTTPException(status_code=400, detail="Solo puedes aplazar una cita pendiente o confirmada")
    if data.fecha < date.today():
        raise HTTPException(status_code=400, detail="La fecha no puede ser en el pasado")
    duracion, ids_esp = requisitos_cita(db, cita)
    _validar_franja_cita(data.fecha, data.hora, duracion_horas=duracion)
    # Bloquear y validar el EQUIPO COMPLETO (sin duplicados), no solo al
    # solicitante y al segundo técnico. Se serializa frente a reservas
    # concurrentes sobre la misma capacidad.
    equipo = ids_equipo_cita(cita)
    bloquear_tecnicos(db, equipo)
    validar_equipo_tecnicos(
        db,
        equipo,
        data.fecha,
        data.hora,
        ids_especializacion=ids_esp,
        excluir_cita_id=cita.id_cita,
        duracion_horas=duracion,
    )
    cita.fecha = data.fecha
    cita.hora = data.hora
    db.commit()
    db.refresh(cita)

    # Notificar al cliente
    cliente = db.query(Cliente).filter(Cliente.id_cliente == cita.id_cliente).first()
    if cliente and cliente.email:
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

    return _serializar_cita_tecnico(db, cita)


# Consulta Cita.
def _cita_asignada_a_mi(db: Session, tecnico: Tecnico, cita_id: int) -> Cita:
    cita = (
        db.query(Cita)
        .filter(
            Cita.id_cita == cita_id,
            or_(
                Cita.id_tecnico == tecnico.id_tecnico,
                Cita.id_tecnico_2 == tecnico.id_tecnico,
                Cita.id_tecnico_3 == tecnico.id_tecnico,
            ),
        )
        .first()
    )
    if not cita:
        raise HTTPException(status_code=404, detail="Cita no encontrada")
    return cita


# Consulta Pedido.
def _entrega_asignada_a_mi(db: Session, tecnico: Tecnico, pedido_id: int) -> Pedido:
    pedido = (
        db.query(Pedido)
        .filter(
            Pedido.id_pedido == pedido_id,
            Pedido.id_tecnico_entrega == tecnico.id_tecnico,
        )
        .first()
    )
    if not pedido:
        raise HTTPException(status_code=404, detail="Entrega no encontrada")
    return pedido


@router.post("/entregas/{pedido_id}/evidencias")
async def subir_evidencias_entrega(
    pedido_id: int,
    files: List[UploadFile] = File(...),
    current_user: User = Depends(get_current_employee),
    db: Session = Depends(get_db),
):
    """El técnico encargado sube UNA O VARIAS fotos de evidencia del pedido
    entregado. Solo se permiten cuando el estado es 'Entregado'."""
    from app.models.evidencia import EvidenciaEntrega

    tecnico = _ficha_tecnico_actual(db, current_user)
    pedido = _entrega_asignada_a_mi(db, tecnico, pedido_id)
    # Las evidencias se suben ANTES de marcar Entregado (son obligatorias);
    # también se pueden añadir más fotos después.
    if not files:
        raise HTTPException(status_code=400, detail="Selecciona al menos una imagen")

    filas: list = []
    for file in files:
        if not file or not file.filename:
            continue
        ext = Path(file.filename or "").suffix.lower()
        if ext not in EXTENSIONES_EVIDENCIA:
            raise HTTPException(status_code=400, detail="Formato no permitido (usa JPG, PNG, WEBP o GIF)")
        contenido = await file.read()
        if not contenido:
            continue
        if len(contenido) > 5 * 1024 * 1024:
            raise HTTPException(status_code=400, detail="Una imagen supera los 5 MB")
        try:
            import io

            from PIL import Image

            Image.open(io.BytesIO(contenido)).verify()
        except Exception:
            raise HTTPException(status_code=400, detail="Un archivo no es una imagen válida")
        nombre = f"{uuid.uuid4().hex}{ext}"
        clave = minio_service.subir_imagen_privada("evidencias_entrega", nombre, contenido)
        ev = EvidenciaEntrega(
            id_pedido=pedido.id_pedido,
            id_tecnico=tecnico.id_tecnico,
            url_archivo=clave,
        )
        db.add(ev)
        filas.append(ev)

    if not filas:
        raise HTTPException(status_code=400, detail="No se recibieron imágenes válidas")
    pedido.entrega_actualizada_en = datetime.now()
    db.flush()
    urls = [_url_evidencia(ev.url_archivo, "entrega", ev.id) for ev in filas]
    db.commit()
    return {
        "msg": f"{len(urls)} evidencia(s) guardada(s)",
        "urls": urls,
    }


@router.get("/entregas/{pedido_id}/evidencias", response_model=List[str])
def listar_evidencias_entrega(
    pedido_id: int,
    current_user: User = Depends(get_current_employee),
    db: Session = Depends(get_db),
):
    """URLs de las fotos de evidencia de la entrega indicada."""
    from app.models.evidencia import EvidenciaEntrega
    from datetime import date as _date

    tecnico = _ficha_tecnico_actual(db, current_user)
    _entrega_asignada_a_mi(db, tecnico, pedido_id)
    filas = (
        db.query(EvidenciaEntrega)
        .filter(EvidenciaEntrega.id_pedido == pedido_id)
        .order_by(EvidenciaEntrega.id.desc())
        .all()
    )
    return [_url_evidencia(f.url_archivo, "entrega", f.id) for f in filas]


@router.post("/citas/{cita_id}/evidencias")
async def subir_evidencia_cita(
    cita_id: int,
    request: Request,
    file: UploadFile = File(...),
    descripcion: str = Form(""),
    current_user: User = Depends(get_current_employee),
    db: Session = Depends(get_db),
):
    """El técnico sube una evidencia (foto) del trabajo realizado en una
    cita asignada. Devuelve la lista actualizada de evidencias."""
    tecnico = _ficha_tecnico_actual(db, current_user)
    cita = _cita_asignada_a_mi(db, tecnico, cita_id)
    # SOLO el técnico encargado (principal) sube evidencias de la cita.
    if cita.id_tecnico != tecnico.id_tecnico:
        raise HTTPException(
            status_code=403,
            detail="Solo el técnico encargado de la cita puede subir la evidencia",
        )
    if not file or not file.filename:
        raise HTTPException(status_code=400, detail="Selecciona un archivo de imagen")
    ext = Path(file.filename or "").suffix.lower()
    if ext not in EXTENSIONES_EVIDENCIA:
        raise HTTPException(status_code=400, detail="Formato no permitido (usa JPG, PNG, WEBP o GIF)")
    contenido = await file.read()
    if not contenido:
        raise HTTPException(status_code=400, detail="El archivo está vacío")
    if len(contenido) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="La imagen supera los 5 MB")
    try:
        import io

        from PIL import Image

        Image.open(io.BytesIO(contenido)).verify()
    except Exception:
        raise HTTPException(status_code=400, detail="El archivo no es una imagen válida")
    nombre = f"{uuid.uuid4().hex}{ext}"
    clave = minio_service.subir_imagen_privada("evidencias_citas", nombre, contenido)
    db.add(
        Evidencia(
            id_cita=cita.id_cita,
            id_tecnico=tecnico.id_tecnico,
            url_archivo=clave,
            descripcion=(descripcion or "").strip()[:255] or None,
        )
    )
    db.commit()
    return {"msg": "Evidencia subida correctamente", "evidencias": _serializar_evidencias(db, cita.id_cita)}


@router.delete("/citas/{cita_id}/evidencias/{evidencia_id}")
def eliminar_evidencia_cita(
    cita_id: int,
    evidencia_id: int,
    current_user: User = Depends(get_current_employee),
    db: Session = Depends(get_db),
):
    """El técnico elimina una evidencia propia de la cita."""
    tecnico = _ficha_tecnico_actual(db, current_user)
    _cita_asignada_a_mi(db, tecnico, cita_id)
    evidencia = (
        db.query(Evidencia)
        .filter(
            Evidencia.id_evidencia == evidencia_id,
            Evidencia.id_cita == cita_id,
            Evidencia.id_tecnico == tecnico.id_tecnico,
        )
        .first()
    )
    if not evidencia:
        raise HTTPException(status_code=404, detail="Evidencia no encontrada")
    if "/" in (evidencia.url_archivo or ""):
        minio_service.eliminar_objeto_privado(evidencia.url_archivo)
    else:
        try:
            (EVIDENCIAS_DIR / evidencia.url_archivo).unlink(missing_ok=True)
        except OSError:
            pass
    db.delete(evidencia)
    db.commit()
    return {"msg": "Evidencia eliminada", "evidencias": _serializar_evidencias(db, cita_id)}


# Agrupa los campos de EntregaTecnicoResponse: id_pedido, cliente, telefono, email, direccion y los demás declarados abajo.
class EntregaTecnicoResponse(BaseModel):
    id_pedido: int
    cliente: str
    telefono: int | None = None
    email: str | None = None
    direccion: str | None = None
    fecha_entrega: date | None = None
    hora_entrega: str | None = None
    hora_entrega_fin: str | None = None
    estado_entrega: str | None = None
    evidencias_entrega: list[str] = []
    productos: list[dict] = []


# Consulta Cliente, DetallePedido, EvidenciaEntrega.
def _serializar_entrega_tecnico(db: Session, pedido: Pedido) -> EntregaTecnicoResponse:
    from app.models.cliente import Cliente
    from app.models.evidencia import EvidenciaEntrega

    cliente = (
        db.query(Cliente).filter(Cliente.id_cliente == pedido.id_cliente_pe).first()
    )
    detalles = (
        db.query(DetallePedido)
        .filter(
            DetallePedido.id_pedido_d == pedido.id_pedido,
            DetallePedido.id_producto_d.isnot(None),
        )
        .all()
    )
    fotos = (
        db.query(EvidenciaEntrega)
        .filter(EvidenciaEntrega.id_pedido == pedido.id_pedido)
        .order_by(EvidenciaEntrega.id.desc())
        .all()
    )
    return EntregaTecnicoResponse(
        id_pedido=pedido.id_pedido,
        cliente=f"{cliente.first_name} {cliente.last_name}".strip() if cliente else "Cliente",
        telefono=cliente.telefono_cliente if cliente else None,
        email=cliente.email if cliente else None,
        direccion=(cliente.address or "").strip() if cliente else None,
        fecha_entrega=pedido.fecha_entrega,
        hora_entrega=pedido.hora_entrega,
        hora_entrega_fin=pedido.hora_entrega_fin,
        estado_entrega=pedido.estado_entrega,
        evidencias_entrega=[
            _url_evidencia(f.url_archivo, "entrega", f.id) for f in fotos
        ],
        productos=[
            {
                "descripcion": d.descripcion_detalle or f"Producto #{d.id_producto_d}",
                "cantidad": d.cantidad_detalle or 1,
                "subtotal": d.subtotal_detalle or 0,
            }
            for d in detalles
        ],
    )


@router.get("/mis-entregas", response_model=List[EntregaTecnicoResponse])
@router.get("/entregas", response_model=List[EntregaTecnicoResponse])
def mis_entregas_tecnico(
    current_user: User = Depends(get_current_employee),
    db: Session = Depends(get_db),
):
    """Pedidos de entrega asignados al técnico autenticado, con productos y
    datos completos del cliente (dirección, teléfono, correo). Consultar esta
    lista no modifica estados ni genera notificaciones."""
    tecnico = _ficha_tecnico_actual(db, current_user)
    pedidos = (
        db.query(Pedido)
        .filter(Pedido.id_tecnico_entrega == tecnico.id_tecnico)
        .order_by(Pedido.fecha_entrega.asc(), Pedido.hora_entrega.asc())
        .all()
    )
    return [_serializar_entrega_tecnico(db, p) for p in pedidos]


# Agrupa los campos de EstadoEntregaUpdate: estado.
class EstadoEntregaUpdate(BaseModel):
    estado: str


@router.put("/entregas/{pedido_id}/estado", response_model=EntregaTecnicoResponse)
def actualizar_estado_entrega_tecnico(
    pedido_id: int,
    data: EstadoEntregaUpdate,
    current_user: User = Depends(get_current_employee),
    db: Session = Depends(get_db),
):
    """El técnico marcado avanza la entrega un paso a la vez, en orden:
    Recogido → En camino → Entregado. No se permiten saltos, retrocesos ni
    entregas sin evidencia. Repetir el estado actual es idempotente (no repite
    notificaciones ni cambia la fecha de transición)."""
    tecnico = _ficha_tecnico_actual(db, current_user)
    pedido = (
        db.query(Pedido)
        .filter(
            Pedido.id_pedido == pedido_id,
            Pedido.id_tecnico_entrega == tecnico.id_tecnico,
        )
        .with_for_update()
        .populate_existing()
        .first()
    )
    if not pedido:
        raise HTTPException(status_code=404, detail="Entrega no encontrada")

    # Revalidar dentro de la sección crítica que la cuenta sigue activa. Si la
    # desactivación ganó la carrera, el técnico inactivo no puede recoger el
    # pedido mediante una solicitud que estaba en curso. Se usa una lectura con
    # bloqueo (FOR UPDATE) para leer el valor más reciente, no una instantánea
    # anterior a la desactivación.
    sigue_activo = (
        db.query(User)
        .filter(User.id_usuario == current_user.id_usuario, User.is_active == True)  # noqa: E712
        .with_for_update()
        .first()
        is not None
    )
    if not sigue_activo:
        raise HTTPException(status_code=403, detail="Tu cuenta está inhabilitada")

    estado = data.estado.strip()

    # Regla de secuencia centralizada: sin saltos ni retrocesos.
    ok, error = validar_transicion_tecnico(pedido.estado_entrega, estado)
    if not ok:
        raise HTTPException(status_code=409, detail=error)

    # Repetición del estado actual: devuelve el resultado existente sin
    # notificar de nuevo ni actualizar la fecha de transición.
    if pedido.estado_entrega == estado:
        return _serializar_entrega_tecnico(db, pedido)

    # Las evidencias son OBLIGATORIAS para marcar el pedido como Entregado.
    from app.models.evidencia import EvidenciaEntrega

    if estado == "Entregado":
        fotos = (
            db.query(EvidenciaEntrega)
            .filter(EvidenciaEntrega.id_pedido == pedido.id_pedido)
            .count()
        )
        if not fotos:
            raise HTTPException(
                status_code=400,
                detail=(
                    "Debes subir al menos una foto de evidencia antes de "
                    "marcar el pedido como Entregado"
                ),
            )

    pedido.estado_entrega = estado
    pedido.entrega_actualizada_en = datetime.now()
    db.commit()
    db.refresh(pedido)

    if estado == "Recogido":
        from app.models.cliente import Cliente as ClienteModel
        from app.services.notificaciones import notificar_recogido_cliente

        cliente = (
            db.query(ClienteModel).filter(ClienteModel.id_cliente == pedido.id_cliente_pe).first()
        )
        if cliente and cliente.email:
            nombre_cliente = f"{cliente.first_name} {cliente.last_name}".strip() or "Cliente"
            notificar_recogido_cliente(
                db,
                cliente_id=cliente.id_cliente,
                correo=cliente.email,
                cliente_nombre=nombre_cliente,
                datos={
                    "pedido": pedido.id_pedido,
                    "tecnico": pedido.nombre_tecnico_entrega or "técnico",
                },
            )

    if estado == "En camino":
        from app.models.cliente import Cliente as ClienteModel
        from app.services.notificaciones import notificar_en_camino_cliente

        cliente = (
            db.query(ClienteModel).filter(ClienteModel.id_cliente == pedido.id_cliente_pe).first()
        )
        if cliente and cliente.email:
            nombre_cliente = f"{cliente.first_name} {cliente.last_name}".strip() or "Cliente"
            notificar_en_camino_cliente(
                db,
                cliente_id=cliente.id_cliente,
                correo=cliente.email,
                cliente_nombre=nombre_cliente,
                datos={
                    "pedido": pedido.id_pedido,
                    "fecha": pedido.fecha_entrega.strftime("%d/%m/%Y") if pedido.fecha_entrega else "-",
                    "hora": pedido.hora_entrega or "-",
                    "tecnico": pedido.nombre_tecnico_entrega or "técnico",
                    "telefono_tecnico": tecnico.usuario.telefono_usuario if tecnico.usuario else None,
                },
            )

    if estado == "Entregado":
        from app.models.cliente import Cliente
        from app.services.notificaciones import notificar_pedido_entregado_cliente

        cliente = (
            db.query(Cliente).filter(Cliente.id_cliente == pedido.id_cliente_pe).first()
        )
        if cliente and cliente.email:
            notificar_pedido_entregado_cliente(
                db,
                cliente_id=cliente.id_cliente,
                correo=cliente.email,
                cliente_nombre=f"{cliente.first_name} {cliente.last_name}".strip() or "Cliente",
                datos={
                    "pedido": pedido.id_pedido,
                    "fecha": pedido.fecha_entrega.strftime("%d/%m/%Y") if pedido.fecha_entrega else "",
                    "tecnico": pedido.nombre_tecnico_entrega or "Técnico",
                },
            )

    return _serializar_entrega_tecnico(db, pedido)


# ── Ubicación GPS en vivo del técnico ──────────────────────────

# Agrupa los campos de UbicacionUpdate: latitud, longitud.
class UbicacionUpdate(BaseModel):
    latitud: float
    longitud: float


@router.post("/ubicacion")
def reportar_ubicacion(
    data: UbicacionUpdate,
    current_user: User = Depends(get_current_employee),
    db: Session = Depends(get_db),
):
    """El técnico reporta su ubicación GPS actual (el cliente la ve mientras
    su entrega está En camino vía GET /pedidos/{id}/seguimiento)."""
    if not (-90 <= data.latitud <= 90) or not (-180 <= data.longitud <= 180):
        raise HTTPException(status_code=400, detail="Coordenadas fuera de rango")

    ficha = db.query(Tecnico).filter(Tecnico.id_usuario_t == current_user.id_usuario).first()
    if not ficha:
        raise HTTPException(status_code=404, detail="Ficha técnica no encontrada")

    registro = (
        db.query(UbicacionTecnico)
        .filter(UbicacionTecnico.id_tecnico_ut == ficha.id_tecnico)
        .first()
    )
    if registro:
        registro.latitud = data.latitud
        registro.longitud = data.longitud
    else:
        registro = UbicacionTecnico(
            id_tecnico_ut=ficha.id_tecnico,
            latitud=data.latitud,
            longitud=data.longitud,
        )
        db.add(registro)
    db.commit()
    return {"ok": True}


# ── Historial completo del técnico (solo admin) ──────────────────────


@router.get("/admin/{tecnico_id}/historial")
def historial_tecnico(
    tecnico_id: int,
    admin_user: User = Depends(_admin),
    db: Session = Depends(get_db),
):
    """Historial completo de un técnico: servicios (citas), entregas de
    productos y devoluciones (recogidas + entregas de cambio) con evidencias."""
    from app.models.evidencia import Evidencia, EvidenciaEntrega
    from app.models.devolucion import Devolucion
    from app.models.pedido import Pedido as PedidoModel, DetallePedido

    ficha = db.query(Tecnico).filter(Tecnico.id_tecnico == tecnico_id).first()
    if not ficha:
        raise HTTPException(status_code=404, detail="Técnico no encontrado")

    uid = ficha.id_usuario_t

    # ── 1. Servicios / Citas ───────────────────────────────────────
    citas = (
        db.query(Cita)
        .filter(
            (Cita.id_tecnico == tecnico_id)
            | (Cita.id_tecnico_2 == tecnico_id)
            | (Cita.id_tecnico_3 == tecnico_id)
        )
        .order_by(Cita.fecha.desc(), Cita.hora.desc())
        .all()
    )

    evidencias_cita = (
        db.query(Evidencia)
        .filter(Evidencia.id_tecnico == tecnico_id)
        .all()
    )
    ev_cita_map: dict[int, list] = {}
    for ev in evidencias_cita:
        ev_cita_map.setdefault(ev.id_cita, []).append(
            {"url": _url_evidencia(ev.url_archivo, "cita", ev.id_evidencia), "descripcion": ev.descripcion}
        )

    servicios = []
    for c in citas:
        cliente = db.query(Cliente).get(c.id_cliente) if c.id_cliente else None
        servicios.append({
            "id_cita": c.id_cita,
            "tipo_servicio": c.tipo_servicio,
            "fecha": c.fecha.isoformat() if c.fecha else None,
            "hora": c.hora,
            "estado": c.estado,
            "costo_cita": c.costo_cita,
            "direccion": c.direccion,
            "cliente": f"{cliente.first_name} {cliente.last_name}".strip() if cliente else None,
            "evidencias": ev_cita_map.get(c.id_cita, []),
        })

    # ── 2. Entregas de productos ────────────────────────────────────
    pedidos = (
        db.query(PedidoModel)
        .filter(PedidoModel.id_tecnico_entrega == tecnico_id)
        .order_by(PedidoModel.fecha_entrega.desc())
        .all()
    )

    ev_entrega_rows = (
        db.query(EvidenciaEntrega)
        .filter(EvidenciaEntrega.id_tecnico == tecnico_id)
        .all()
    )
    ev_entrega_map: dict[int, list] = {}
    for ev in ev_entrega_rows:
        ev_entrega_map.setdefault(ev.id_pedido, []).append(
            _url_evidencia(ev.url_archivo, "entrega", ev.id)
        )

    entregas = []
    for p in pedidos:
        cliente = db.query(Cliente).get(p.id_cliente_pe) if p.id_cliente_pe else None
        detalles = (
            db.query(DetallePedido)
            .filter(DetallePedido.id_pedido_d == p.id_pedido)
            .all()
        )
        producto_nombres = []
        for d in detalles:
            prod = db.query(Producto).get(d.id_producto_d) if d.id_producto_d else None
            if prod:
                producto_nombres.append(prod.nombre_producto)

        entregas.append({
            "id_pedido": p.id_pedido,
            "fecha_entrega": p.fecha_entrega.isoformat() if p.fecha_entrega else None,
            "hora_entrega": p.hora_entrega,
            "estado_entrega": p.estado_entrega,
            "total": p.total_pedido,
            "cliente": f"{cliente.first_name} {cliente.last_name}".strip() if cliente else None,
            "productos": producto_nombres,
            "evidencias": ev_entrega_map.get(p.id_pedido, []),
        })

    # ── 3. Devoluciones (recogidas + entregas de cambio) ────────────
    devoluciones = (
        db.query(Devolucion)
        .filter(Devolucion.id_tecnico_recogida == tecnico_id)
        .order_by(Devolucion.created_at.desc())
        .all()
    )

    devoluciones_list = []
    for d in devoluciones:
        cliente = db.query(Cliente).get(d.id_cliente_d) if d.id_cliente_d else None
        producto = db.query(Producto).get(d.id_producto_d) if d.id_producto_d else None
        pedido = db.query(PedidoModel).get(d.id_pedido_d) if d.id_pedido_d else None

        evidencias = []
        if d.evidencia_recogida:
            evidencias.append({
                "tipo": "Recogida",
                "url": f"/api/v1/devoluciones/{d.id_devolucion}/evidencia-recogida/archivo",
                "fecha": d.fecha_recogida.isoformat() if d.fecha_recogida else None,
            })
        if d.evidencia_cambio:
            evidencias.append({
                "tipo": "Entrega de cambio",
                "url": f"/api/v1/devoluciones/{d.id_devolucion}/evidencia-cambio/archivo",
                "fecha": d.fecha_entrega_cambio.isoformat() if d.fecha_entrega_cambio else None,
            })

        devoluciones_list.append({
            "id_devolucion": d.id_devolucion,
            "motivo": d.motivo,
            "estado": d.estado,
            "recogida_estado": d.recogida_estado,
            "cantidad": d.cantidad,
            "preferencia": d.preferencia,
            "created_at": d.created_at.isoformat() if d.created_at else None,
            "resuelta_at": d.resuelta_at.isoformat() if d.resuelta_at else None,
            "cliente": f"{cliente.first_name} {cliente.last_name}".strip() if cliente else None,
            "producto": producto.nombre_producto if producto else None,
            "pedido_id": d.id_pedido_d,
            "pedido_total": pedido.total_pedido if pedido else None,
            "evidencias": evidencias,
        })

    return {
        "servicios": servicios,
        "entregas": entregas,
        "devoluciones": devoluciones_list,
    }

