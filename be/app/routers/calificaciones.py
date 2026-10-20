"""Calificaciones de técnicos por parte de los clientes.

Reglas:
  - Solo se califica una cita Finalizada (voluntario: el scheduler envía
    recordatorios periódicos a los clientes con calificaciones pendientes).
  - Una cita solo se califica una vez por cliente.
  - El técnico puede ver sus calificaciones (promedio y detalle).
"""
from datetime import datetime
from typing import Optional

from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, File, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.calificacion import Calificacion
from app.models.cita import Cita
from app.models.cliente import Cliente
from app.models.pedido import Pedido
from app.models.tecnico import Tecnico
from app.models.user import User
from app.utils.security import get_current_client, get_current_employee

router = APIRouter(prefix="/calificaciones", tags=["Calificaciones"])


# Agrupa los campos de CalificacionCreate: id_cita, calificacion, comentario.
class CalificacionCreate(BaseModel):
    id_cita: int
    calificacion: int = Field(ge=1, le=5)
    comentario: Optional[str] = None


@router.post("")
def crear_calificacion(
    data: CalificacionCreate,
    client: Cliente = Depends(get_current_client),
    db: Session = Depends(get_db),
):
    """El cliente califica (1-5) al técnico de una cita finalizada."""
    cita = (
        db.query(Cita)
        .filter(Cita.id_cita == data.id_cita, Cita.id_cliente == client.id_cliente)
        .first()
    )
    if not cita:
        raise HTTPException(status_code=404, detail="Cita no encontrada")
    if cita.estado != "Finalizada":
        raise HTTPException(
            status_code=400,
            detail="Solo puedes calificar al técnico después de que la cita haya sido completada",
        )
    if cita.id_tecnico is None:
        raise HTTPException(
            status_code=400,
            detail="Esta cita no tiene técnico asignado para calificar",
        )
    ya_calificada = (
        db.query(Calificacion)
        .filter(
            Calificacion.id_cita_c == cita.id_cita,
            Calificacion.id_cliente_c == client.id_cliente,
        )
        .first()
    )
    if ya_calificada:
        raise HTTPException(status_code=400, detail="Ya calificaste esta cita")

    calificacion = Calificacion(
        id_cliente_c=client.id_cliente,
        id_tecnico_c=cita.id_tecnico,
        id_cita_c=cita.id_cita,
        calificacion=data.calificacion,
        comentario=(data.comentario or "").strip() or None,
    )
    db.add(calificacion)
    db.commit()
    db.refresh(calificacion)

    # Notificar al técnico que recibió una calificación
    try:
        from app.models.tecnico import Tecnico as TecnicoModel
        from app.models.user import User as UserModel
        from app.services.notificaciones import crear_notificacion

        tecnico = db.query(TecnicoModel).filter(TecnicoModel.id_tecnico == cita.id_tecnico).first()
        if tecnico and tecnico.usuario:
            nombre_cliente = f"{client.first_name} {client.last_name}".strip() or "Un cliente"
            crear_notificacion(
                db,
                id_usuario=tecnico.usuario.id_usuario,
                tipo="calificacion_recibida",
                titulo=f"¡Nueva calificación de {nombre_cliente}!",
                mensaje=f"{nombre_cliente} te calificó con {data.calificacion} estrella{'s' if data.calificacion != 1 else ''} en la cita #{cita.id_cita}.",
            )
            db.commit()
    except Exception:
        # No interrumpir el flujo si falla la notificación
        pass

    return {
        "id_calificacion": calificacion.id_calificacion,
        "calificacion": calificacion.calificacion,
        "comentario": calificacion.comentario,
    }


@router.get("/tecnico/{id_tecnico}")
def calificaciones_tecnico(
    id_tecnico: int,
    db: Session = Depends(get_db),
):
    """Promedio y detalle de las calificaciones de un técnico (público)."""
    tecnico = db.query(Tecnico).filter(Tecnico.id_tecnico == id_tecnico).first()
    if not tecnico:
        raise HTTPException(status_code=404, detail="Técnico no encontrado")
    filas = (
        db.query(Calificacion)
        .filter(Calificacion.id_tecnico_c == id_tecnico)
        .order_by(Calificacion.created_at.desc())
        .all()
    )
    clientes = {c.id_cliente: c for c in db.query(Cliente).all()}
    promedio = (
        db.query(func.avg(Calificacion.calificacion))
        .filter(Calificacion.id_tecnico_c == id_tecnico)
        .scalar()
    )
    return {
        "id_tecnico": id_tecnico,
        "promedio": round(float(promedio), 2) if promedio is not None else None,
        "total": len(filas),
        "calificaciones": [
            {
                "id_calificacion": f.id_calificacion,
                "calificacion": f.calificacion,
                "comentario": f.comentario,
                "cliente": (
                    f"{clientes[f.id_cliente_c].first_name} {clientes[f.id_cliente_c].last_name}".strip()
                    if f.id_cliente_c in clientes
                    else "Cliente"
                ),
                "created_at": f.created_at.isoformat() if f.created_at else None,
            }
            for f in filas
        ],
    }


@router.get("/mis-dadas")
def mis_calificaciones_cliente(
    client: Cliente = Depends(get_current_client),
    db: Session = Depends(get_db),
):
    """Reseñas (calificaciones) que el cliente autenticado ha dejado a los técnicos."""
    filas = (
        db.query(Calificacion)
        .filter(Calificacion.id_cliente_c == client.id_cliente)
        .order_by(Calificacion.created_at.desc())
        .all()
    )
    ids_citas = [f.id_cita_c for f in filas]
    ids_tecnicos = [f.id_tecnico_c for f in filas]
    citas = (
        {c.id_cita: c for c in db.query(Cita).filter(Cita.id_cita.in_(ids_citas)).all()}
        if ids_citas
        else {}
    )
    tecnicos = (
        {t.id_tecnico: t for t in db.query(Tecnico).filter(Tecnico.id_tecnico.in_(ids_tecnicos)).all()}
        if ids_tecnicos
        else {}
    )
    resultado = []
    for f in filas:
        tecnico = tecnicos.get(f.id_tecnico_c)
        cita = citas.get(f.id_cita_c)
        nombre_tecnico = None
        foto_tecnico = None
        if tecnico and tecnico.usuario:
            nombre_tecnico = (
                f"{tecnico.usuario.first_name} {tecnico.usuario.last_name}".strip() or "Técnico"
            )
            foto_tecnico = tecnico.usuario.foto_url
        resultado.append(
            {
                "id_calificacion": f.id_calificacion,
                "calificacion": f.calificacion,
                "comentario": f.comentario,
                "created_at": f.created_at.isoformat() if f.created_at else None,
                "id_cita": f.id_cita_c,
                "id_tecnico": f.id_tecnico_c,
                "nombre_tecnico": nombre_tecnico,
                "foto_tecnico": foto_tecnico,
                "tipo_servicio": cita.tipo_servicio if cita else None,
                "fecha_cita": cita.fecha.isoformat() if cita and cita.fecha else None,
                "hora_cita": cita.hora if cita else None,
            }
        )
    return resultado


@router.get("/mis")
def mis_calificaciones_tecnico(
    current_user: User = Depends(get_current_employee),
    db: Session = Depends(get_db),
):
    """Calificaciones recibidas por el técnico autenticado."""
    tecnico = (
        db.query(Tecnico).filter(Tecnico.id_usuario_t == current_user.id_usuario).first()
    )
    if not tecnico:
        raise HTTPException(status_code=404, detail="No hay ficha de técnico asociada a tu cuenta")
    return calificaciones_tecnico(tecnico.id_tecnico, db)


@router.get("/pendiente")
def calificacion_pendiente(
    client: Cliente = Depends(get_current_client),
    db: Session = Depends(get_db),
):
    """Primera cita finalizada sin calificar del cliente (para encuestas/recordatorios)."""
    cita = (
        db.query(Cita)
        .outerjoin(
            Calificacion,
            (Calificacion.id_cita_c == Cita.id_cita)
            & (Calificacion.id_cliente_c == Cita.id_cliente),
        )
        .filter(
            Cita.id_cliente == client.id_cliente,
            Cita.estado == "Finalizada",
            Calificacion.id_calificacion.is_(None),
        )
        .order_by(Cita.fecha.desc(), Cita.hora.desc())
        .first()
    )
    if not cita:
        return {"pendiente": False}

    tecnico = db.query(Tecnico).filter(Tecnico.id_tecnico == cita.id_tecnico).first()
    nombre_tecnico = None
    if tecnico and tecnico.usuario:
        nombre_tecnico = f"{tecnico.usuario.first_name} {tecnico.usuario.last_name}".strip()

    return {
        "pendiente": True,
        "id_cita": cita.id_cita,
        "tipo_servicio": cita.tipo_servicio,
        "fecha": cita.fecha.isoformat() if cita.fecha else None,
        "hora": cita.hora,
        "tecnico_nombre": nombre_tecnico,
        "id_tecnico": cita.id_tecnico,
    }


@router.get("/cita/{id_cita}")
def estado_calificacion_cita(
    id_cita: int,
    client: Cliente = Depends(get_current_client),
    db: Session = Depends(get_db),
):
    """Estado de calificación de una cita propia (para la UI del cliente)."""
    cita = (
        db.query(Cita)
        .filter(Cita.id_cita == id_cita, Cita.id_cliente == client.id_cliente)
        .first()
    )
    if not cita:
        raise HTTPException(status_code=404, detail="Cita no encontrada")
    cal = (
        db.query(Calificacion)
        .filter(
            Calificacion.id_cita_c == cita.id_cita,
            Calificacion.id_cliente_c == client.id_cliente,
        )
        .first()
    )
    return {
        "calificada": cal is not None,
        "calificacion": cal.calificacion if cal else None,
        "comentario": cal.comentario if cal else None,
    }


# ──────────────────────────────────────────────────────────────────
# ⭐ Calificaciones de productos de un pedido entregado
# ──────────────────────────────────────────────────────────────────


# Consulta Pedido.
def _pedido_entregado_propio(db: Session, id_pedido: int, id_cliente: int) -> Pedido:
    from app.models.pedido import Pedido
    from app.services.pedidos_service import pedido_completado

    pedido = (
        db.query(Pedido)
        .filter(Pedido.id_pedido == id_pedido, Pedido.id_cliente_pe == id_cliente)
        .first()
    )
    if not pedido:
        raise HTTPException(status_code=404, detail="Pedido no encontrado")
    # Entregado por el técnico O con la cita de instalación finalizada.
    if not pedido_completado(db, pedido):
        raise HTTPException(
            status_code=400,
            detail="Solo puedes calificar productos de pedidos ya entregados",
        )
    return pedido


# Agrupa los campos de CalificacionProductoCreate: id_pedido, id_producto, calificacion, comentario.
class CalificacionProductoCreate(BaseModel):
    id_pedido: int
    id_producto: int
    calificacion: int = Field(ge=1, le=5)
    comentario: Optional[str] = None


@router.post("/producto")
def calificar_producto(
    data: CalificacionProductoCreate,
    client: Cliente = Depends(get_current_client),
    db: Session = Depends(get_db),
):
    """El cliente califica (1-5 estrellas) un producto de un pedido entregado.
    Cada producto se califica una sola vez por pedido."""
    from app.models.calificacion_producto import CalificacionProducto
    from app.models.pedido import DetallePedido
    from app.models.producto import Producto

    pedido = _pedido_entregado_propio(db, data.id_pedido, client.id_cliente)

    en_pedido = (
        db.query(DetallePedido)
        .filter(
            DetallePedido.id_pedido_d == pedido.id_pedido,
            DetallePedido.id_producto_d == data.id_producto,
        )
        .first()
    )
    if not en_pedido:
        raise HTTPException(
            status_code=400, detail="Ese producto no pertenece a este pedido"
        )

    ya_calificada = (
        db.query(CalificacionProducto)
        .filter(
            CalificacionProducto.id_pedido_cp == pedido.id_pedido,
            CalificacionProducto.id_producto_cp == data.id_producto,
            CalificacionProducto.id_cliente_cp == client.id_cliente,
        )
        .first()
    )
    if ya_calificada:
        raise HTTPException(status_code=400, detail="Ya calificaste este producto")

    calificacion = CalificacionProducto(
        id_cliente_cp=client.id_cliente,
        id_pedido_cp=pedido.id_pedido,
        id_producto_cp=data.id_producto,
        calificacion=data.calificacion,
        comentario=(data.comentario or "").strip() or None,
    )
    db.add(calificacion)
    db.commit()
    db.refresh(calificacion)

    producto = (
        db.query(Producto).filter(Producto.id_producto == data.id_producto).first()
    )
    return {
        "id_calificacion_producto": calificacion.id_calificacion_producto,
        "id_pedido": pedido.id_pedido,
        "id_producto": data.id_producto,
        "nombre_producto": producto.nombre_producto if producto else None,
        "calificacion": calificacion.calificacion,
        "comentario": calificacion.comentario,
        "created_at": calificacion.created_at.isoformat() if calificacion.created_at else None,
    }


@router.post("/producto/{id_pedido}/{id_producto}/foto")
async def subir_foto_calificacion_producto(
    id_pedido: int,
    id_producto: int,
    file: UploadFile = File(...),
    client: Cliente = Depends(get_current_client),
    db: Session = Depends(get_db),
):
    """El cliente sube una foto opcional junto con su calificación de un
    producto entregado. Se guarda en MinIO bajo 'calificaciones_productos'."""
    from fastapi import File, UploadFile

    from app.models.calificacion_producto import CalificacionProducto
    from app.services import minio_service

    pedido = _pedido_entregado_propio(db, id_pedido, client.id_cliente)
    ya = (
        db.query(CalificacionProducto)
        .filter(
            CalificacionProducto.id_pedido_cp == id_pedido,
            CalificacionProducto.id_producto_cp == id_producto,
            CalificacionProducto.id_cliente_cp == client.id_cliente,
        )
        .first()
    )
    if not ya:
        raise HTTPException(status_code=404, detail="Califica primero el producto para poder adjuntar foto")

    ext = Path(file.filename or "").suffix.lower()
    if ext not in (".jpg", ".jpeg", ".png", ".webp"):
        raise HTTPException(status_code=400, detail="Formato no permitido (JPG, PNG, WEBP)")
    contenido = await file.read()
    if not contenido:
        raise HTTPException(status_code=400, detail="El archivo está vacío")
    if len(contenido) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="La imagen supera los 5 MB")

    import uuid as _uuid
    nombre = f"{_uuid.uuid4().hex}{ext}"
    url = minio_service.subir_imagen("calificaciones_productos", nombre, contenido)

    ya.foto_url = url
    db.commit()

    return {"msg": "Foto guardada", "foto_url": url}


@router.get("/producto/pedido/{id_pedido}")
def calificaciones_de_mi_pedido(
    id_pedido: int,
    client: Cliente = Depends(get_current_client),
    db: Session = Depends(get_db),
):
    """Calificaciones de productos que el cliente ya dejó en uno de sus pedidos."""
    from app.models.calificacion_producto import CalificacionProducto
    from app.models.pedido import Pedido

    pedido = (
        db.query(Pedido)
        .filter(Pedido.id_pedido == id_pedido, Pedido.id_cliente_pe == client.id_cliente)
        .first()
    )
    if not pedido:
        raise HTTPException(status_code=404, detail="Pedido no encontrado")
    filas = (
        db.query(CalificacionProducto)
        .filter(
            CalificacionProducto.id_pedido_cp == id_pedido,
            CalificacionProducto.id_cliente_cp == client.id_cliente,
        )
        .all()
    )
    return {
        "id_pedido": id_pedido,
        "estado_entrega": pedido.estado_entrega,
        "calificaciones": [
            {
                "id_calificacion_producto": f.id_calificacion_producto,
                "id_producto": f.id_producto_cp,
                "calificacion": f.calificacion,
                "comentario": f.comentario,
                "created_at": f.created_at.isoformat() if f.created_at else None,
            }
            for f in filas
        ],
    }