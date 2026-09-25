from fastapi import APIRouter, Depends, Query, HTTPException, File, UploadFile, Request
from sqlalchemy import select, and_, or_, exists
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from typing import Optional, List
from datetime import datetime, date
from pathlib import Path
import uuid
from pydantic import BaseModel

from app.database import get_db
from app.models.producto import Producto
from app.models.producto_variante import ProductoVariante
from app.models.categoria import Categoria
from app.models.proveedor import Proveedor
from app.models.roles_usuario import RolesUsuario
from app.models.user import User
from app.utils.security import (
    get_current_employee,
    get_current_user,
    oauth2_scheme,
    ACCESS_COOKIE_NAME,
)
from app.services import minio_service

# Umbral de stock bajo (configurable). Productos con stock >= STOCK_MINIMO
# se consideran "disponible"; entre 1 y STOCK_MINIMO-1 "bajo"; 0 => "agotado".
STOCK_MINIMO = 5

# Directorio donde se guardan las imágenes de productos (sirve /uploads).
PRODUCTOS_IMG_DIR = Path(__file__).resolve().parent.parent / "static" / "productos"
PRODUCTOS_IMG_DIR.mkdir(parents=True, exist_ok=True)

EXTENSIONES_IMAGEN = {".jpg", ".jpeg", ".png", ".webp", ".gif"}


def _estado_stock(stock: int) -> str:
    if stock <= 0:
        return "agotado"
    if stock < STOCK_MINIMO:
        return "bajo"
    return "disponible"


def normalizar_nombre_producto(nombre: str | None) -> str:
    """Normaliza la presentación del nombre: primera letra en MAYÚSCULA y el
    resto en minúsculas. Ej: 'cable thhn' -> 'Cable thhn'."""
    if not nombre:
        return ""
    texto = str(nombre).strip()
    return texto[:1].upper() + texto[1:].lower() if texto else ""


# ── Esquemas ─────────────────────────────────────────────
class VarianteResponse(BaseModel):
    id: int
    nombre: str
    hex: Optional[str] = None
    tamaño: Optional[str] = None
    ancho_cm: Optional[int] = None
    alto_cm: Optional[int] = None
    etiqueta_medida: Optional[str] = None
    precio: Optional[float] = None
    imagen_url: Optional[str] = None
    stock: int = 0


class ProductoResponse(BaseModel):
    id_producto: int
    nombre_producto: str
    marca: Optional[str] = None
    venta_por_metros: bool = False
    referencia_producto: Optional[str] = None
    precio_compra_producto: Optional[float] = None
    precio_venta_producto: float
    fecha_registro_producto: Optional[datetime] = None
    imagen_url: Optional[str] = None
    id_cate_pr: Optional[int] = None
    nombre_categoria: Optional[str] = None
    id_proveedor_pr: Optional[int] = None
    nombre_proveedor: Optional[str] = None
    descripcion_producto: Optional[str] = None
    caracteristicas_producto: Optional[str] = None
    colores_producto: Optional[str] = None
    color_hex: Optional[str] = None
    tamaño: Optional[str] = None
    estado_producto: str = "activo"
    stock_producto: int = 0
    stock_estado: str = "disponible"
    stock_minimo: int = STOCK_MINIMO
    descuento_activo: Optional[float] = None
    precio_final: Optional[float] = None
    promocion_hasta: Optional[str] = None
    es_nuevo: bool = False
    tecnicos_requeridos: int = 1
    dificultad_instalacion: Optional[str] = None
    tiempo_estimado_horas: Optional[float] = None
    tiene_medidas: bool = False
    visible_cliente: bool = True
    especializaciones_requeridas: List[dict] = []
    variantes: List[VarianteResponse] = []


class ProductoCreate(BaseModel):
    nombre_producto: str
    marca: Optional[str] = None
    venta_por_metros: bool = False
    referencia_producto: Optional[str] = None
    id_proveedor_pr: Optional[int] = None
    precio_compra_producto: Optional[float] = None
    precio_venta_producto: float
    imagen_url: Optional[str] = None
    id_cate_pr: Optional[int] = None
    descripcion_producto: Optional[str] = None
    caracteristicas_producto: Optional[str] = None
    colores_producto: Optional[str] = None
    color_hex: Optional[str] = None
    tamaño: Optional[str] = None
    estado_producto: Optional[str] = "activo"
    stock_producto: int = 0
    descuento_activo: Optional[float] = None
    promocion_hasta: Optional[str] = None
    es_nuevo_producto: Optional[bool] = True
    tecnicos_requeridos: int = 1
    dificultad_instalacion: Optional[str] = None
    tiempo_estimado_horas: Optional[float] = None
    tiene_medidas: bool = False
    especializaciones_ids: Optional[List[int]] = None


class CategoriaResponse(BaseModel):
    id_categoria: int
    nombre_categoria: str
    descripcion: Optional[str] = None


class VarianteCreate(BaseModel):
    nombre: str
    hex: Optional[str] = None
    tamaño: Optional[str] = None
    ancho_cm: Optional[int] = None
    alto_cm: Optional[int] = None
    precio: Optional[float] = None
    imagen_url: Optional[str] = None
    stock: int = 0


class ProveedorResponse(BaseModel):
    id_proveedor: int
    nombre_proveedor: str
    contacto_proveedor: Optional[str] = None
    telefono_proveedor: Optional[str] = None
    correo_proveedor: Optional[str] = None
    direccion_proveedor: Optional[str] = None


class ProveedorCreate(BaseModel):
    nombre_proveedor: str
    contacto_proveedor: Optional[str] = None
    telefono_proveedor: Optional[str] = None
    correo_proveedor: Optional[str] = None
    direccion_proveedor: Optional[str] = None


class SolicitudReabastecimientoItem(BaseModel):
    id_producto: int
    cantidad: float = 1
    id_variante: Optional[int] = None
    marca: Optional[str] = None


def _admin(
    current_user: User = Depends(get_current_employee),
    db: Session = Depends(get_db),
) -> User:
    role = db.execute(select(RolesUsuario.nombre_rol).where(RolesUsuario.id_rol == current_user.id_rol_u)).scalar_one_or_none()
    if role not in ("admin", "administrador"):
        raise HTTPException(status_code=403, detail="Permisos insuficientes")
    return current_user


def _etiqueta_medida(v: ProductoVariante) -> Optional[str]:
    """Etiqueta legible de la medida: '150 cm por 100 cm'."""
    if v.ancho_cm and v.alto_cm:
        return f"{v.ancho_cm} cm por {v.alto_cm} cm"
    if v.ancho_cm:
        return f"{v.ancho_cm} cm"
    return (v.tamaño or "").strip() or None


def _serializar_variante(v: ProductoVariante) -> VarianteResponse:
    return VarianteResponse(
        id=v.id,
        nombre=v.nombre,
        hex=v.hex,
        tamaño=v.tamaño,
        ancho_cm=v.ancho_cm,
        alto_cm=v.alto_cm,
        etiqueta_medida=_etiqueta_medida(v),
        precio=float(v.precio) if v.precio is not None else None,
        imagen_url=v.imagen_url,
        stock=v.stock or 0,
    )


async def _empleado_opcional(
    request: Request = None,
    token: Optional[str] = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> Optional[User]:
    """Devuelve el empleado autenticado (por cookie o header) o None si no hay sesión válida."""
    if not token and request is not None:
        token = request.cookies.get(ACCESS_COOKIE_NAME)
    if not token:
        return None
    try:
        user = await get_current_user(request=request, token=token, db=db)
    except HTTPException:
        return None
    return user if isinstance(user, User) else None


def _serializar(p: Producto) -> ProductoResponse:
    precio_venta = p.precio_venta_producto or 0
    descuento = p.descuento_activo if (p.descuento_activo or 0) > 0 else None
    promo_vigente = descuento and (p.promocion_hasta is None or p.promocion_hasta >= date.today())
    precio_final = round(precio_venta * (1 - descuento / 100), 2) if promo_vigente else None
    es_nuevo = bool(p.es_nuevo_producto)
    return ProductoResponse(
        id_producto=p.id_producto,
        nombre_producto=normalizar_nombre_producto(p.nombre_producto),
        marca=p.marca,
        venta_por_metros=bool(p.venta_por_metros),
        referencia_producto=p.referencia_producto,
        precio_compra_producto=p.precio_compra_producto,
        precio_venta_producto=p.precio_venta_producto,
        fecha_registro_producto=p.fecha_registro_producto,
        imagen_url=p.imagen_url,
        id_cate_pr=p.id_cate_pr,
        nombre_categoria=p.categoria.nombre_categoria if p.categoria else None,
        id_proveedor_pr=p.id_proveedor_pr,
        nombre_proveedor=p.proveedor.nombre_proveedor if p.proveedor else None,
        descripcion_producto=p.descripcion_producto,
        caracteristicas_producto=p.caracteristicas_producto,
        colores_producto=p.colores_producto,
        color_hex=p.color_hex,
        tamaño=p.tamaño,
        estado_producto=p.estado_producto or "activo",
        stock_producto=p.stock_producto or 0,
        stock_estado=_estado_stock(p.stock_producto or 0),
        stock_minimo=STOCK_MINIMO,
        descuento_activo=descuento,
        precio_final=precio_final,
        promocion_hasta=p.promocion_hasta.isoformat() if p.promocion_hasta else None,
        es_nuevo=es_nuevo,
        tecnicos_requeridos=max(0, p.tecnicos_requeridos or 0),
        dificultad_instalacion=p.dificultad_instalacion,
        tiempo_estimado_horas=p.tiempo_estimado_horas,
        tiene_medidas=bool(p.tiene_medidas),
        visible_cliente=bool(p.visible_cliente),
        especializaciones_requeridas=[
            {"id_especializacion": e.id_especializacion, "nombre": e.nombre}
            for e in (p.especializaciones_requeridas or [])
        ],
        variantes=[_serializar_variante(v) for v in p.variantes],
    )


def _parsear_fecha_promo(valor: Optional[str]):
    if not valor:
        return None
    try:
        return datetime.strptime(valor[:10], "%Y-%m-%d").date()
    except (ValueError, TypeError):
        return None


def _aplicar_especializaciones_producto(
    db: Session, producto: Producto, ids: Optional[List[int]]
) -> None:
    """Reemplaza las especializaciones requeridas de un producto."""
    from app.models.especializacion import Especializacion

    if not ids:
        producto.especializaciones_requeridas = []
        return
    encontradas = (
        db.query(Especializacion)
        .filter(Especializacion.id_especializacion.in_(ids))
        .all()
    )
    faltantes = set(ids) - {e.id_especializacion for e in encontradas}
    if faltantes:
        raise HTTPException(
            status_code=400,
            detail=f"Especializaciones no válidas: {sorted(faltantes)}",
        )
    producto.especializaciones_requeridas = encontradas


def _notificar_todos_los_clientes(db: Session, tipo: str, titulo: str, mensaje: str) -> None:
    """Crea una notificación de plataforma para todos los clientes activos."""
    from app.models.cliente import Cliente
    from app.services.notificaciones import crear_notificacion

    clientes = (
        db.query(Cliente.id_cliente)
        .filter(Cliente.is_active == True)  # noqa: E712
        .all()
    )
    for (id_cliente,) in clientes:
        crear_notificacion(
            db,
            id_usuario=None,
            id_cliente=id_cliente,
            tipo=tipo,
            titulo=titulo,
            mensaje=mensaje,
        )


def _avisar_producto_nuevo(db: Session, producto: Producto) -> None:
    if (producto.estado_producto or "") != "activo":
        return
    precio_txt = (
        f"${float(producto.precio_venta_producto):,.0f} COP"
        if producto.precio_venta_producto
        else ""
    )
    _notificar_todos_los_clientes(
        db,
        tipo="producto",
        titulo=f"Novedad: {producto.nombre_producto}",
        mensaje=(
            f"Ya tenemos '{producto.nombre_producto}' disponible en la tienda."
            + (f" Precio: {precio_txt}." if precio_txt else "")
            + " ¡Descúbrelo!"
        ),
    )


def _avisar_producto_en_promocion(db: Session, producto: Producto) -> None:
    if (producto.estado_producto or "") != "activo":
        return
    hasta_txt = ""
    try:
        from datetime import datetime as _dt

        if producto.promocion_hasta:
            hasta_txt = (
                f" hasta el {_dt.fromisoformat(str(producto.promocion_hasta)).strftime('%d/%m/%Y')}"
                if isinstance(producto.promocion_hasta, str)
                else f" hasta el {producto.promocion_hasta.strftime('%d/%m/%Y')}"
            )
    except Exception:
        hasta_txt = ""
    _notificar_todos_los_clientes(
        db,
        tipo="promocion",
        titulo=f"Promoción: {producto.nombre_producto}",
        mensaje=(
            f"'{producto.nombre_producto}' está EN PROMOCIÓN{hasta_txt}. "
            "¡Aprovecha antes que se acabe!"
        ),
    )


def _validar_dificultad(valor: Optional[str]) -> Optional[str]:
    if valor is None:
        return None
    v = valor.strip().lower()
    if not v:
        return None
    if v not in ("baja", "media", "alta"):
        raise HTTPException(
            status_code=400,
            detail="La dificultad de instalación debe ser baja, media o alta",
        )
    return v


# (especialización del catálogo, palabras clave en el nombre del producto)
PALABRAS_ESPECIALIZACION = [
    ("Instalación de cámaras de seguridad", ["camara", "cámara", "cctv", "vigilancia", "dvr", "nvr", "grabador"]),
    ("Sistemas de alarmas", ["alarma", "sirena", "intrus", "antirrobo", "pánico", "panico"]),
    ("Cerraduras inteligentes", ["cerradura", "chapa", "biométric", "biometric", "huella", "candado"]),
    ("Control de acceso", ["acceso", "rfid", "tarjeta", "lector", "tag", "llave"]),
    ("Iluminación inteligente", ["luz", "luces", "iluminaci", "led", "bombilla", "foco", "lámpara", "lampara", "tira", "dimmer", "interruptor"]),
    ("Sensores inteligentes", ["sensor", "movimiento", "humo", "gas", "apertura", "inundaci", "presencia", "detector"]),
    ("Redes y conectividad IoT", ["wifi", "wi-fi", "router", "red ", "zigbee", "z-wave", "zwave", "hub", "gateway", "bluetooth", "mesh", "repetidor"]),
    ("Climatización inteligente", ["termostato", "aire acondicionado", "clima", "temperatura", "ventilador", "calefac"]),
    ("Audio y video inteligente", ["audio", "altavoz", "parlante", "bocina", "soundbar", "video", "portero", "timbre", "multiroom"]),
    ("Automatización de hogares", ["alexa", "google home", "asistente", "automatiza", "escena", "rutina", "central", "domotic", "controlador", "smart"]),
    ("Instalación eléctrica y cableado", ["electric", "eléctric", "cable", "toma", "enchufe", "tablero", "voltaje", "relé", "rele", "fuente ", "transformador", "220", "110v"]),
    ("Energía solar y respaldo eléctrico", ["solar", "panel", "batería", "bateria", "ups", "inversor"]),
    ("Riego y jardinería inteligente", ["riego", "aspersor", "electroválvula", "electrovalvula", "jardín", "jardin", "grifo"]),
    ("Piscinas y spas inteligentes", ["piscina", "spa", "jacuzzi", "cloro", "filtración", "filtracion"]),
    ("Motores, persianas y cortinas", ["persiana", "cortina", "motor", "toldo"]),
    ("Integración de dispositivos domóticos", ["integración", "integracion", "compatib", "kit", "paquete", "combo"]),
    ("Mantenimiento de sistemas domóticos", ["mantenimiento", "reparación", "reparacion", "servicio técnico", "servicio tecnico", "diagnóstico", "diagnostico", "soporte"]),
]


def _vincular_especializaciones_automatico(db: Session, producto: Producto) -> None:
    """Si el producto NO tiene especializaciones asignadas manualmente, las
    deduce de su nombre según palabras clave del catálogo domótico."""
    from app.models.especializacion import Especializacion

    if producto.especializaciones_requeridas:
        return  # elección manual del administrador: no se toca
    nombre = (producto.nombre_producto or "").lower().strip()
    if not nombre:
        return
    ids: list[int] = []
    for esp_nombre, palabras in PALABRAS_ESPECIALIZACION:
        if any(kw in nombre for kw in palabras):
            esp = (
                db.query(Especializacion)
                .filter(Especializacion.nombre == esp_nombre)
                .first()
            )
            if esp and esp.id_especializacion not in ids:
                ids.append(esp.id_especializacion)
    if ids:
        producto.especializaciones_requeridas = (
            db.query(Especializacion)
            .filter(Especializacion.id_especializacion.in_(ids))
            .all()
        )


router = APIRouter(prefix="/productos", tags=["productos"])


@router.get("/", response_model=dict)
def listar_productos(
    db: Session = Depends(get_db),
    search: Optional[str] = Query(None),
    categoria: Optional[int] = Query(None),
    proveedor: Optional[int] = Query(None),
    estado: Optional[str] = Query("activo"),
    page: int = Query(1, ge=1),
    limit: int = Query(12, ge=1, le=100),
    current_user: Optional[User] = Depends(_empleado_opcional),
):
    query = db.query(Producto).outerjoin(Categoria, Producto.id_cate_pr == Categoria.id_categoria)
    if estado == "activo":
        query = query.filter(Producto.estado_producto == "activo")
    elif estado == "inactivo":
        query = query.filter(Producto.estado_producto == "inactivo")
    if current_user is None:
        # El público solo ve productos activos, visibles y con stock suficiente (> STOCK_MINIMO)
        # o con variantes que tengan stock suficiente.
        query = query.filter(
            Producto.visible_cliente == True,  # noqa: E712
            or_(
                Producto.stock_producto > STOCK_MINIMO,
                exists().where(
                    and_(
                        ProductoVariante.id_producto == Producto.id_producto,
                        ProductoVariante.stock > STOCK_MINIMO,
                    )
                ),
            )
        )
    if search:
        query = query.filter(Producto.nombre_producto.ilike(f"%{search}%"))
    if categoria:
        query = query.filter(Producto.id_cate_pr == categoria)
    if proveedor:
        query = query.filter(Producto.id_proveedor_pr == proveedor)
    total = query.count()
    productos = query.order_by(Producto.id_producto.desc()).offset((page - 1) * limit).limit(limit).all()
    data = [_serializar(p).dict() for p in productos]
    return {
        "total": total,
        "page": page,
        "limit": limit,
        "data": data,
        "total_pages": (total + limit - 1) // limit,
    }


@router.get("/categorias", response_model=List[CategoriaResponse])
def listar_categorias(db: Session = Depends(get_db)):
    return db.query(Categoria).order_by(Categoria.id_categoria.asc()).all()


@router.get("/proveedores", response_model=List[ProveedorResponse])
def listar_proveedores(_admin_user: User = Depends(_admin), db: Session = Depends(get_db)):
    return db.query(Proveedor).order_by(Proveedor.nombre_proveedor.asc()).all()


@router.post("/proveedores", response_model=ProveedorResponse, status_code=201)
def crear_proveedor(
    data: ProveedorCreate,
    _admin_user: User = Depends(_admin),
    db: Session = Depends(get_db),
):
    """Crea un proveedor nuevo (solo administrador)"""
    nombre = data.nombre_proveedor.strip()
    if not nombre:
        raise HTTPException(status_code=400, detail="El nombre del proveedor es obligatorio")
    correo = (data.correo_proveedor or "").strip() or None
    if correo:
        existe = db.query(Proveedor).filter(Proveedor.correo_proveedor == correo).first()
        if existe:
            raise HTTPException(status_code=400, detail="Ya existe un proveedor con ese correo")
    proveedor = Proveedor(
        nombre_proveedor=nombre,
        contacto_proveedor=(data.contacto_proveedor or "").strip() or None,
        telefono_proveedor=(data.telefono_proveedor or "").strip() or None,
        correo_proveedor=correo,
        direccion_proveedor=(data.direccion_proveedor or "").strip() or None,
    )
    db.add(proveedor)
    db.commit()
    db.refresh(proveedor)
    return proveedor


@router.put("/proveedores/{proveedor_id}", response_model=ProveedorResponse)
def actualizar_proveedor(
    proveedor_id: int,
    data: ProveedorCreate,
    _admin_user: User = Depends(_admin),
    db: Session = Depends(get_db),
):
    """Actualiza los datos de un proveedor (solo administrador)"""
    proveedor = db.query(Proveedor).filter(Proveedor.id_proveedor == proveedor_id).first()
    if not proveedor:
        raise HTTPException(status_code=404, detail="Proveedor no encontrado")
    nombre = data.nombre_proveedor.strip()
    if not nombre:
        raise HTTPException(status_code=400, detail="El nombre del proveedor es obligatorio")
    correo = (data.correo_proveedor or "").strip() or None
    if correo:
        existe = (
            db.query(Proveedor)
            .filter(Proveedor.correo_proveedor == correo, Proveedor.id_proveedor != proveedor_id)
            .first()
        )
        if existe:
            raise HTTPException(status_code=400, detail="Ya existe un proveedor con ese correo")
    proveedor.nombre_proveedor = nombre
    proveedor.contacto_proveedor = (data.contacto_proveedor or "").strip() or None
    proveedor.telefono_proveedor = (data.telefono_proveedor or "").strip() or None
    proveedor.correo_proveedor = correo
    proveedor.direccion_proveedor = (data.direccion_proveedor or "").strip() or None
    db.commit()
    db.refresh(proveedor)
    return proveedor


@router.post("/proveedores/{proveedor_id}/solicitar-reabastecimiento", response_model=dict)
async def solicitar_reabastecimiento(
    proveedor_id: int,
    items: List[SolicitudReabastecimientoItem],
    _admin_user: User = Depends(_admin),
    db: Session = Depends(get_db),
):
    """Envía un correo al proveedor solicitando más unidades de los productos indicados."""
    from app.utils.email import send_email

    proveedor = db.query(Proveedor).filter(Proveedor.id_proveedor == proveedor_id).first()
    if not proveedor:
        raise HTTPException(status_code=404, detail="Proveedor no encontrado")
    if not proveedor.correo_proveedor:
        raise HTTPException(status_code=400, detail="El proveedor no tiene correo configurado")

    filas = []
    for item in items:
        if not item.cantidad or item.cantidad <= 0:
            continue
        p = db.query(Producto).filter(Producto.id_producto == item.id_producto).first()
        if not (p and p.id_proveedor_pr == proveedor_id):
            continue
        variante = None
        if item.id_variante is not None:
            variante = next(
                (v for v in (p.variantes or []) if v.id == item.id_variante), None
            )
            if variante is None:
                raise HTTPException(
                    status_code=400,
                    detail=f"La variante {item.id_variante} no pertenece al producto '{p.nombre_producto}'",
                )
        filas.append((p, item.cantidad, variante, item.marca))
    if not filas:
        raise HTTPException(status_code=400, detail="Selecciona al menos un producto con cantidad mayor a 0")

    def _celda(texto, ancho=False):
        return (
            f"<td style='padding:10px 12px;border:1px solid #eee;font-size:13px;"
            f"color:#666;text-align:{'left' if ancho else 'center'}'>{texto}</td>"
        )

    filas_html = "".join(
        "<tr style='background:%s'>%s%s%s%s%s</tr>"
        % (
            "#ffffff" if i % 2 == 0 else "#faf7f0",
            _celda(f"<strong>{p.nombre_producto}</strong>", True),
            _celda(item_marca or p.marca or "-"),
            _celda(p.referencia_producto or "-"),
            _celda(
                f"{v.nombre}{(' · ' + _etiqueta_medida(v)) if v else ''}"
                if v
                else "—",
                True,
            ),
            _celda(
                (v.stock if v else (p.stock_producto or 0)),
            ),
            _celda(
                f"<span style='color:#b8860b;font-weight:700;font-size:14px'>"
                f"{item_cantidad:g}{' m' if p.venta_por_metros else ' u.'}</span>",
            ),
        )
        for i, (p, item_cantidad, v, item_marca) in enumerate(filas)
    )
    subject = f"Solicitud de reabastecimiento para {proveedor.nombre_proveedor}"
    body = (
        "<div style='background:#f6f4ef;padding:24px;font-family:Arial,Helvetica,sans-serif'>"
        "<div style='max-width:600px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e8e2d6'>"
        "<div style='background:#1f1a12;padding:22px 26px;border-bottom:4px solid #d4a54b'>"
        "<h2 style='margin:0;color:#ffffff;font-size:20px'>Neodomus</h2>"
        "<p style='margin:4px 0 0;color:#d4a54b;font-size:13px;font-weight:600;letter-spacing:1px'>SOLICITUD DE REABASTECIMIENTO</p>"
        "</div>"
        "<div style='padding:26px'>"
        f"<p style='margin:0 0 6px;color:#333;font-size:14px'>Hola <strong>{proveedor.contacto_proveedor or proveedor.nombre_proveedor}</strong>,</p>"
        "<p style='margin:0 0 18px;color:#666;font-size:14px'>Necesitamos reponer las siguientes unidades. Por favor confírmenos disponibilidad y tiempo de entrega:</p>"
        "<table style='border-collapse:collapse;width:100%;font-family:Arial,Helvetica,sans-serif'>"
        "<thead><tr style='background:#1f1a12'>"
        "<th style='padding:10px 12px;border:1px solid #1f1a12;color:#ffffff;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;text-align:left'>Producto</th>"
        "<th style='padding:10px 12px;border:1px solid #1f1a12;color:#ffffff;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;text-align:left'>Marca</th>"
        "<th style='padding:10px 12px;border:1px solid #1f1a12;color:#ffffff;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;text-align:left'>Referencia</th>"
        "<th style='padding:10px 12px;border:1px solid #1f1a12;color:#ffffff;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;text-align:left'>Color / Medida</th>"
        "<th style='padding:10px 12px;border:1px solid #1f1a12;color:#ffffff;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;text-align:center'>Stock actual</th>"
        "<th style='padding:10px 12px;border:1px solid #1f1a12;color:#ffd98a;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;text-align:center'>Cantidad solicitada</th>"
        "</tr></thead><tbody>"
        f"{filas_html}"
        "</tbody></table>"
        "<p style='margin:18px 0 0;padding:12px 14px;background:#fdf6e7;border:1px solid #eed7a8;border-radius:8px;color:#7a5a14;font-size:13px'>"
        "Responda este correo o llámenos para coordinar el despacho. ¡Gracias por su atención!</p>"
        "<p style='margin:22px 0 0;color:#333;font-size:14px'>Quedamos atentos. <strong>Saludos cordiales.</strong></p>"
        "</div>"
        "<div style='background:#f6f4ef;padding:14px 26px;border-top:1px solid #e8e2d6'>"
        "<p style='margin:0;color:#999;font-size:12px'>Este mensaje fue generado automáticamente desde el panel administrativo de Neodomus.</p>"
        "</div>"
        "</div>"
        "</div>"
    )
    enviado = await send_email(proveedor.correo_proveedor, subject, body)
    if not enviado:
        raise HTTPException(status_code=500, detail="No se pudo enviar el correo de solicitud")
    return {
        "msg": "Solicitud enviada al proveedor",
        "enviado": enviado,
        "productos": len(filas),
        "destinatario": proveedor.correo_proveedor,
    }


@router.get("/{producto_id}", response_model=ProductoResponse)
def obtener_producto(
    producto_id: int,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(_empleado_opcional),
):
    p = db.query(Producto).filter(Producto.id_producto == producto_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Producto no encontrado")
    if current_user is None:
        if p.estado_producto == "inactivo":
            raise HTTPException(status_code=404, detail="Producto no encontrado")
        con_stock = (p.stock_producto or 0) > STOCK_MINIMO or any(v.stock > STOCK_MINIMO for v in p.variantes)
        if not con_stock:
            raise HTTPException(status_code=404, detail="Producto no encontrado")
    return _serializar(p)


@router.get("/{producto_id}/variantes", response_model=List[VarianteResponse])
def listar_variantes(producto_id: int, db: Session = Depends(get_db)):
    """Lista las variantes de color de un producto (público)."""
    p = db.query(Producto).filter(Producto.id_producto == producto_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Producto no encontrado")
    return [_serializar_variante(v) for v in p.variantes]


@router.post("/{producto_id}/variantes", response_model=VarianteResponse)
def crear_variante(
    producto_id: int,
    data: VarianteCreate,
    _admin_user: User = Depends(_admin),
    db: Session = Depends(get_db),
):
    """Agrega una variante de color a un producto (solo administrador)."""
    p = db.query(Producto).filter(Producto.id_producto == producto_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Producto no encontrado")
    nombre = data.nombre.strip()
    if not nombre:
        raise HTTPException(status_code=400, detail="El nombre de la variante es obligatorio")
    variante = ProductoVariante(
        id_producto=producto_id,
        nombre=nombre,
        hex=(data.hex or "").strip() or None,
        tamaño=(data.tamaño or "").strip() or None,
        ancho_cm=data.ancho_cm,
        alto_cm=data.alto_cm,
        precio=data.precio,
        imagen_url=(data.imagen_url or "").strip() or None,
        stock=data.stock or 0,
    )
    db.add(variante)
    db.commit()
    db.refresh(variante)
    return _serializar_variante(variante)


@router.put("/{producto_id}/variantes/{variante_id}", response_model=VarianteResponse)
def editar_variante(
    producto_id: int,
    variante_id: int,
    data: VarianteCreate,
    _admin_user: User = Depends(_admin),
    db: Session = Depends(get_db),
):
    """Actualiza una variante de color (solo administrador)."""
    variante = (
        db.query(ProductoVariante)
        .filter(
            ProductoVariante.id == variante_id,
            ProductoVariante.id_producto == producto_id,
        )
        .first()
    )
    if not variante:
        raise HTTPException(status_code=404, detail="Variante no encontrada")
    variante.nombre = data.nombre.strip()
    variante.hex = (data.hex or "").strip() or None
    variante.tamaño = (data.tamaño or "").strip() or None
    variante.ancho_cm = data.ancho_cm
    variante.alto_cm = data.alto_cm
    variante.precio = data.precio
    variante.imagen_url = (data.imagen_url or "").strip() or None
    variante.stock = data.stock or 0
    db.commit()
    db.refresh(variante)
    return _serializar_variante(variante)


@router.delete("/{producto_id}/variantes/{variante_id}", response_model=dict)
def eliminar_variante(
    producto_id: int,
    variante_id: int,
    _admin_user: User = Depends(_admin),
    db: Session = Depends(get_db),
):
    """Elimina una variante de color (solo administrador)."""
    variante = (
        db.query(ProductoVariante)
        .filter(
            ProductoVariante.id == variante_id,
            ProductoVariante.id_producto == producto_id,
        )
        .first()
    )
    if not variante:
        raise HTTPException(status_code=404, detail="Variante no encontrada")
    db.delete(variante)
    db.commit()
    return {"msg": "Variante eliminada correctamente"}


@router.post("/upload-imagen", response_model=dict)
async def subir_imagen_producto(
    file: UploadFile = File(...),
    _admin_user: User = Depends(_admin),
):
    """Sube una imagen de producto a MinIO y devuelve su URL pública (solo administrador)."""
    if not file or not file.filename:
        raise HTTPException(status_code=400, detail="Selecciona un archivo de imagen")
    ext = Path(file.filename or "").suffix.lower()
    if ext not in EXTENSIONES_IMAGEN:
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
    url = minio_service.subir_imagen("productos", nombre, contenido)
    return {"url": url, "filename": nombre}


@router.post("", response_model=ProductoResponse)
def crear_producto(
    data: ProductoCreate,
    _admin_user: User = Depends(_admin),
    db: Session = Depends(get_db),
):
    """Crea un producto nuevo (solo administrador)"""
    nombre = data.nombre_producto.strip()
    if not nombre:
        raise HTTPException(status_code=400, detail="El nombre del producto es obligatorio")
    referencia = (data.referencia_producto or "").strip() or _generar_referencia(nombre)
    existe_ref = db.query(Producto).filter(Producto.referencia_producto == referencia).first()
    if existe_ref:
        raise HTTPException(status_code=400, detail="La referencia ya está en uso")
    producto = Producto(
        nombre_producto=nombre,
        marca=(data.marca or "").strip() or None,
        venta_por_metros=1 if data.venta_por_metros else 0,
        referencia_producto=referencia,
        id_proveedor_pr=data.id_proveedor_pr,
        precio_compra_producto=data.precio_compra_producto,
        precio_venta_producto=data.precio_venta_producto,
        fecha_registro_producto=datetime.now(),
        imagen_url=data.imagen_url,
        id_cate_pr=data.id_cate_pr,
        descripcion_producto=data.descripcion_producto,
        caracteristicas_producto=data.caracteristicas_producto,
        colores_producto=data.colores_producto,
        color_hex=(data.color_hex or "").strip() or None,
        tamaño=(data.tamaño or "").strip() or None,
        estado_producto=data.estado_producto or "activo",
        stock_producto=data.stock_producto or 0,
        descuento_activo=data.descuento_activo,
        promocion_hasta=_parsear_fecha_promo(data.promocion_hasta),
        es_nuevo_producto=True if data.es_nuevo_producto is None else bool(data.es_nuevo_producto),
        tecnicos_requeridos=max(0, data.tecnicos_requeridos or 0),
        dificultad_instalacion=_validar_dificultad(data.dificultad_instalacion),
        tiempo_estimado_horas=data.tiempo_estimado_horas,
        tiene_medidas=bool(data.tiene_medidas),
    )
    db.add(producto)
    db.flush()
    if data.especializaciones_ids is not None:
        _aplicar_especializaciones_producto(db, producto, data.especializaciones_ids)
    else:
        _vincular_especializaciones_automatico(db, producto)
    db.commit()
    db.refresh(producto)

    # Avisos a clientes: producto nuevo y/o en promoción.
    if data.es_nuevo_producto is None or bool(data.es_nuevo_producto):
        _avisar_producto_nuevo(db, producto)
    if data.descuento_activo:
        _avisar_producto_en_promocion(db, producto)

    return _serializar(producto)


@router.put("/{producto_id}", response_model=ProductoResponse)
def editar_producto(
    producto_id: int,
    data: ProductoCreate,
    _admin_user: User = Depends(_admin),
    db: Session = Depends(get_db),
):
    """Actualiza un producto (solo administrador).

    Los campos que el cliente NO envíe explícitamente conservan su valor
    actual (permite toggles parciales sin destruir configuración).
    """
    producto = db.query(Producto).filter(Producto.id_producto == producto_id).first()
    if not producto:
        raise HTTPException(status_code=404, detail="Producto no encontrado")
    provistos = data.model_fields_set
    campos = {
        "nombre_producto": data.nombre_producto.strip(),
        "marca": (data.marca or "").strip() or None,
        "venta_por_metros": (
            (1 if data.venta_por_metros else 0)
            if "venta_por_metros" in provistos
            else int(bool(producto.venta_por_metros))
        ),
        "id_proveedor_pr": data.id_proveedor_pr,
        "precio_compra_producto": data.precio_compra_producto,
        "precio_venta_producto": data.precio_venta_producto,
        "imagen_url": data.imagen_url,
        "id_cate_pr": data.id_cate_pr,
        "descripcion_producto": data.descripcion_producto,
        "caracteristicas_producto": (
            data.caracteristicas_producto
            if "caracteristicas_producto" in provistos
            else producto.caracteristicas_producto
        ),
        "colores_producto": data.colores_producto,
        "color_hex": (data.color_hex or "").strip() or None,
        "tamaño": (data.tamaño or "").strip() or None,
        "estado_producto": data.estado_producto or "activo",
        "stock_producto": data.stock_producto or 0,
        "descuento_activo": data.descuento_activo,
        "promocion_hasta": _parsear_fecha_promo(data.promocion_hasta),
        "es_nuevo_producto": (
            bool(data.es_nuevo_producto)
            if data.es_nuevo_producto is not None
            else bool(producto.es_nuevo_producto)
        ),
        "tecnicos_requeridos": (
            max(0, data.tecnicos_requeridos)
            if data.tecnicos_requeridos is not None
            else max(0, producto.tecnicos_requeridos or 0)
        ),
        "dificultad_instalacion": (
            _validar_dificultad(data.dificultad_instalacion)
            if "dificultad_instalacion" in provistos
            else producto.dificultad_instalacion
        ),
        "tiempo_estimado_horas": (
            data.tiempo_estimado_horas
            if "tiempo_estimado_horas" in provistos
            else producto.tiempo_estimado_horas
        ),
        "tiene_medidas": (
            bool(data.tiene_medidas)
            if "tiene_medidas" in provistos
            else bool(producto.tiene_medidas)
        ),
    }
    nombre_anterior = producto.nombre_producto
    era_promocion = bool(producto.descuento_activo)
    for campo, valor in campos.items():
        setattr(producto, campo, valor)
    if data.especializaciones_ids is not None:
        _aplicar_especializaciones_producto(db, producto, data.especializaciones_ids)
    elif data.nombre_producto.strip() != (nombre_anterior or ""):
        # Si cambió el nombre y no eligió especializaciones, re-deducirlas.
        producto.especializaciones_requeridas = []
        _vincular_especializaciones_automatico(db, producto)
    else:
        _vincular_especializaciones_automatico(db, producto)
    db.commit()
    db.refresh(producto)

    # Aviso a clientes solo cuando la promoción se ACTIVA (evita spam en cada edición).
    if data.descuento_activo and not era_promocion:
        _avisar_producto_en_promocion(db, producto)

    return _serializar(producto)


@router.put("/{producto_id}/visibilidad")
def toggle_visibilidad_cliente(
    producto_id: int,
    _admin_user: User = Depends(_admin),
    db: Session = Depends(get_db),
):
    """Alterna la visibilidad de un producto para clientes (solo admin).
    Cuando visible_cliente es False, el producto no aparece en el catálogo público."""
    producto = db.query(Producto).filter(Producto.id_producto == producto_id).first()
    if not producto:
        raise HTTPException(status_code=404, detail="Producto no encontrado")

    producto.visible_cliente = not bool(producto.visible_cliente)
    db.commit()
    db.refresh(producto)

    return {
        "id_producto": producto.id_producto,
        "visible_cliente": producto.visible_cliente,
        "mensaje": (
            f"Producto '{producto.nombre_producto}' ahora es visible para clientes"
            if producto.visible_cliente
            else f"Producto '{producto.nombre_producto}' oculto del catálogo público"
        ),
    }


@router.delete("/{producto_id}", response_model=dict)
def eliminar_producto(
    producto_id: int,
    _admin_user: User = Depends(_admin),
    db: Session = Depends(get_db),
):
    """Elimina un producto (solo administrador). Si tiene historial de pedidos, lo desactiva."""
    producto = db.query(Producto).filter(Producto.id_producto == producto_id).first()
    if not producto:
        raise HTTPException(status_code=404, detail="Producto no encontrado")
    try:
        db.delete(producto)
        db.commit()
        return {"msg": "Producto eliminado correctamente", "eliminado": True}
    except IntegrityError:
        db.rollback()
        producto.estado_producto = "inactivo"
        db.commit()
        return {"msg": "Producto desactivado (tiene historial asociado)", "eliminado": False}


def _generar_referencia(nombre: str) -> str:
    import time

    base = "".join(c for c in nombre.lower() if c.isalnum() or c in " -_")[:20].strip().replace(" ", "-")
    return f"ref-{base or 'producto'}-{int(time.time() * 1000) % 100000}"

