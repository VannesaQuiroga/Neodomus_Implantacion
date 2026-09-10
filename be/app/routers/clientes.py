from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy import select, func
from sqlalchemy.orm import Session
from typing import List
from app.database import get_db
from app.models.cliente import Cliente
from app.models.roles_usuario import RolesUsuario
from app.models.solicitud_cuenta import SolicitudCuenta
from app.models.user import User
from app.schemas.cliente import ClientResponse, ClientUpdate
from app.schemas.solicitud import SolicitudCreate, SolicitudResponse
from app.utils.security import get_current_client, get_current_employee
from app.models.cita import Cita
from app.models.pedido import Pedido

router = APIRouter(prefix="/clients", tags=["Clients"])


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


@router.get("", response_model=List[dict])
def listar_clientes(
    current_admin: User = Depends(_admin),
    db: Session = Depends(get_db),
):
    """Lista todos los clientes registrados con conteos de pedidos y citas (solo admin)"""
    clientes = db.query(Cliente).order_by(Cliente.id_cliente.desc()).all()
    pedidos = (
        db.query(Pedido.id_cliente_pe, func.count(Pedido.id_pedido))
        .group_by(Pedido.id_cliente_pe)
        .all()
    )
    citas = (
        db.query(Cita.id_cliente, func.count(Cita.id_cita))
        .group_by(Cita.id_cliente)
        .all()
    )
    pedidos_por_cliente = dict(pedidos)
    citas_por_cliente = dict(citas)
    return [
        {
            **ClientResponse(
                id_cliente=c.id_cliente,
                first_name=c.first_name,
                last_name=c.last_name,
                id_tipo_documento_c=c.id_tipo_documento_c,
                documento_cliente=c.documento_cliente,
                telefono_cliente=c.telefono_cliente,
                email=c.email,
                address=c.address,
                is_active=c.is_active,
            ).model_dump(),
            "created_at": c.created_at.isoformat() if c.created_at else None,
            "pedidos_count": pedidos_por_cliente.get(c.id_cliente, 0),
            "citas_count": citas_por_cliente.get(c.id_cliente, 0),
        }
        for c in clientes
    ]


@router.get("/me", response_model=ClientResponse)
def get_my_profile(current_client: Cliente = Depends(get_current_client)):
    return current_client

@router.get("/me/cuenta-solicitud", response_model=SolicitudResponse)
def get_mi_solicitud(
    current_client: Cliente = Depends(get_current_client),
    db: Session = Depends(get_db),
):
    """Devuelve la solicitud más reciente del cliente (inhabilitar/habilitar)"""
    solicitud = (
        db.query(SolicitudCuenta)
        .filter(SolicitudCuenta.id_cliente == current_client.id_cliente)
        .order_by(SolicitudCuenta.created_at.desc())
        .first()
    )
    if not solicitud:
        raise HTTPException(status_code=404, detail="No hay solicitudes")
    return solicitud

@router.post("/me/cuenta-solicitud", response_model=SolicitudResponse)
async def crear_solicitud(
    data: SolicitudCreate,
    current_client: Cliente = Depends(get_current_client),
    db: Session = Depends(get_db),
):
    """Crea una solicitud de inhabilitación de cuenta para que el administrador la apruebe.
    La cuenta no se deshabilita automáticamente."""
    if data.tipo == "habilitar" and current_client.is_active:
        raise HTTPException(status_code=400, detail="Tu cuenta ya está activa")
    pendiente = (
        db.query(SolicitudCuenta)
        .filter(
            SolicitudCuenta.id_cliente == current_client.id_cliente,
            SolicitudCuenta.estado == "pendiente",
        )
        .first()
    )
    if pendiente:
        raise HTTPException(status_code=400, detail="Ya tienes una solicitud pendiente de revisión")
    solicitud = SolicitudCuenta(
        id_cliente=current_client.id_cliente,
        tipo=data.tipo,
        motivo=data.motivo,
        estado="pendiente",
    )
    db.add(solicitud)
    db.commit()
    db.refresh(solicitud)

    from app.routers.solicitudes import _alertar_admin_nueva_solicitud

    _alertar_admin_nueva_solicitud(db, current_client, data.tipo, data.motivo)
    return solicitud

@router.put("/{id_cliente}/habilitar", response_model=ClientResponse)
async def habilitar_cliente(
    id_cliente: int,
    current_admin: User = Depends(_admin),
    db: Session = Depends(get_db),
):
    """Habilita la cuenta de un cliente de inmediato (solo admin)"""
    cliente = db.query(Cliente).get(id_cliente)
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")
    if cliente.is_active:
        raise HTTPException(status_code=400, detail="La cuenta del cliente ya está activa")

    cliente.is_active = True
    db.commit()
    db.refresh(cliente)

    from app.routers.solicitudes import _notificar_cliente

    await _notificar_cliente(cliente, aprobada=True, tipo="habilitar")
    return cliente


@router.put("/{id_cliente}/inhabilitar", response_model=ClientResponse)
async def inhabilitar_cliente(
    id_cliente: int,
    current_admin: User = Depends(_admin),
    db: Session = Depends(get_db),
):
    """Inhabilita la cuenta de un cliente de inmediato (solo admin).
    El cliente no podrá iniciar sesión hasta que se le habilite."""
    cliente = db.query(Cliente).get(id_cliente)
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")
    if not cliente.is_active:
        raise HTTPException(status_code=400, detail="La cuenta del cliente ya está inhabilitada")

    cliente.is_active = False
    db.commit()
    db.refresh(cliente)

    from app.routers.solicitudes import _notificar_cliente

    await _notificar_cliente(cliente, aprobada=True, tipo="inhabilitar")
    return cliente


@router.get("/{id_cliente}/pedidos")
def pedidos_cliente(
    id_cliente: int,
    current_admin: User = Depends(_admin),
    db: Session = Depends(get_db),
):
    """Historial completo de pedidos de un cliente específico (solo admin).
    Incluye detalles, pagos y facturas."""
    from app.models.factura import Factura
    from app.models.pago import Pago
    from app.routers.pedidos import _serializar_pedido, _serializar_pago

    cliente = db.query(Cliente).get(id_cliente)
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")

    pedidos = (
        db.query(Pedido)
        .filter(Pedido.id_cliente_pe == id_cliente)
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
                "pdf_url": f"/api/v1/pedidos/{p.id_pedido}/factura" if factura else None,
            }
            if factura
            else None
        )
        resultado.append(data)
    return resultado


@router.get("/{id_cliente}/servicios")
def servicios_cliente(
    id_cliente: int,
    current_admin: User = Depends(_admin),
    db: Session = Depends(get_db),
):
    """Historial de servicios/citas de un cliente específico (solo admin)."""
    from app.models.cita import Cita
    from app.models.tecnico import Tecnico

    cliente = db.query(Cliente).get(id_cliente)
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")

    citas = (
        db.query(Cita)
        .filter(Cita.id_cliente == id_cliente)
        .order_by(Cita.fecha.desc(), Cita.hora.desc())
        .all()
    )
    tecnicos = {t.id_tecnico: t for t in db.query(Tecnico).all()}

    resultado = []
    for c in citas:
        tecnico = tecnicos.get(c.id_tecnico)
        resultado.append({
            "id_cita": c.id_cita,
            "tipo_servicio": c.tipo_servicio,
            "fecha": c.fecha.isoformat() if c.fecha else None,
            "hora": c.hora,
            "direccion": c.direccion,
            "descripcion": c.descripcion,
            "estado": c.estado,
            "costo_cita": c.costo_cita,
            "metodo_pago": c.metodo_pago,
            "estado_pago": c.estado_pago,
            "numero_transaccion": c.numero_transaccion,
            "created_at": c.created_at.isoformat() if c.created_at else None,
            "nombre_tecnico": c.nombre_tecnico or (
                f"{tecnico.usuario.first_name} {tecnico.usuario.last_name}".strip()
                if tecnico and tecnico.usuario else None
            ),
        })
    return resultado


@router.get("/{id_cliente}/devoluciones")
def devoluciones_cliente(
    id_cliente: int,
    current_admin: User = Depends(_admin),
    db: Session = Depends(get_db),
):
    """Historial de devoluciones de un cliente específico (solo admin)."""
    from app.models.devolucion import Devolucion

    cliente = db.query(Cliente).get(id_cliente)
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")

    devoluciones = (
        db.query(Devolucion)
        .filter(Devolucion.id_cliente_d == id_cliente)
        .order_by(Devolucion.created_at.desc())
        .all()
    )

    resultado = []
    for d in devoluciones:
        pedido = None
        if d.id_pedido_d:
            from app.models.pedido import Pedido as PedidoModel
            ped = db.query(PedidoModel).filter(PedidoModel.id_pedido == d.id_pedido_d).first()
            if ped:
                pedido = {"id_pedido": ped.id_pedido, "total": ped.total_pedido}

        producto = None
        if d.id_producto_d:
            from app.models.producto import Producto as ProductoModel
            prod = db.query(ProductoModel).filter(ProductoModel.id_producto == d.id_producto_d).first()
            if prod:
                producto = {"id_producto": prod.id_producto, "nombre": prod.nombre_producto}

        resultado.append({
            "id_devolucion": d.id_devolucion,
            "motivo": d.motivo,
            "descripcion": d.descripcion,
            "estado": d.estado,
            "cantidad": d.cantidad,
            "created_at": d.created_at.isoformat() if d.created_at else None,
            "resuelta_at": d.resuelta_at.isoformat() if d.resuelta_at else None,
            "pedido": pedido,
            "producto": producto,
        })
    return resultado


@router.put("/me", response_model=ClientResponse)
def update_my_profile(
    data: ClientUpdate,
    current_client: Cliente = Depends(get_current_client),
    db: Session = Depends(get_db),
):
    """Actualiza el perfil del cliente autenticado. El cambio de correo no
    invalida la sesión (los tokens referencian al id_cliente)."""
    update_data = data.model_dump(exclude_unset=True)
    if "email" in update_data:
        email = update_data["email"].lower().strip()
        if email != current_client.email:
            raise HTTPException(
                status_code=400,
                detail="Para cambiar tu correo debes verificar el código enviado a tu correo actual",
            )
        update_data["email"] = email
    for field, value in update_data.items():
        setattr(current_client, field, value)
    db.commit()
    db.refresh(current_client)
    return current_client


@router.post("/me/foto", response_model=ClientResponse)
async def subir_foto_perfil(
    archivo: UploadFile = File(...),
    current_client: Cliente = Depends(get_current_client),
    db: Session = Depends(get_db),
):
    """Sube una foto de perfil del cliente a MinIO y la asocia a su cuenta."""
    if not archivo.content_type or not archivo.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="El archivo debe ser una imagen")
    contenido = await archivo.read()
    if len(contenido) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="La imagen no puede superar 5 MB")
    ext = archivo.filename.rsplit(".", 1)[-1] if archivo.filename and "." in archivo.filename else "jpg"
    nombre = f"perfil_cliente_{current_client.id_cliente}.{ext}"
    from app.services.minio_service import subir_imagen, eliminar_objeto
    if current_client.foto_url:
        prefijo = f"{current_client.foto_url.split('/minio/')[-1]}" if "/minio/" in current_client.foto_url else None
        if prefijo:
            eliminar_objeto(prefijo)
    url = subir_imagen("perfiles", nombre, contenido)
    current_client.foto_url = url
    db.commit()
    db.refresh(current_client)
    return current_client