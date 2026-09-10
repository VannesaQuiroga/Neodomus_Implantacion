from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy import select
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime, date

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.database import get_db
from app.models.user import User
from app.models.roles_usuario import RolesUsuario
from app.models.tecnico import Tecnico
from app.schemas.user import EmployeeResponse, PerfilEmpleadoResponse, UserUpdate
from app.utils.respaldo_usuarios import respaldar_usuarios
from app.utils.security import get_current_employee, hash_password

router = APIRouter(prefix="/users", tags=["Users"])


class EmployeeCreate(BaseModel):
    first_name: str
    last_name: str
    email: EmailStr
    password: str
    telefono_usuario: Optional[int] = Field(None, ge=1000000000, le=9999999999)
    documento_usuario: Optional[int] = None
    id_rol: int = 2
    certificacion: Optional[str] = None
    especializaciones_ids: Optional[List[int]] = None


class EmployeeUpdate(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    email: Optional[EmailStr] = None
    password: Optional[str] = None
    telefono_usuario: Optional[int] = Field(None, ge=1000000000, le=9999999999)
    documento_usuario: Optional[int] = None
    is_active: Optional[bool] = None
    desactivado_hasta: Optional[datetime] = None
    certificacion: Optional[str] = None
    especializaciones_ids: Optional[List[int]] = None
    motivo: Optional[str] = None


def _plantilla_estado(
    nombre: str, activo: bool, hasta: Optional[datetime], motivo: Optional[str] = None
) -> tuple[str, str]:
    """Asunto y cuerpo HTML para el correo de habilitación/inhabilitación de un empleado."""
    if activo:
        subject = "Tu cuenta Neodomus ha sido habilitada"
        detalle = (
            "Tu cuenta ha sido <strong>habilitada</strong>. Ya puedes iniciar sesión "
            "en el sistema y retomar tus actividades."
        )
    elif hasta:
        fecha = hasta.strftime("%d/%m/%Y %I:%M %p")
        subject = "Tu cuenta Neodomus ha sido inhabilitada"
        detalle = (
            "Tu cuenta ha sido <strong>inhabilitada</strong> hasta el "
            f"<strong>{fecha}</strong>. Podrás volver a acceder a partir de esa fecha."
        )
    else:
        subject = "Tu cuenta Neodomus ha sido inhabilitada"
        detalle = (
            "Tu cuenta ha sido <strong>inhabilitada</strong> por el administrador. "
            "Si crees que es un error, comunícate con el administrador."
        )
    body = (
        "<div style='background:#f6f4ef;padding:24px;font-family:Arial,Helvetica,sans-serif'>"
        "<div style='max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e8e2d6'>"
        "<div style='background:#1f1a12;padding:20px 26px;border-bottom:4px solid #d4a54b'>"
        "<h2 style='margin:0;color:#ffffff;font-size:19px'>Neodomus</h2>"
        "<p style='margin:4px 0 0;color:#d4a54b;font-size:12px;font-weight:600;letter-spacing:1px'>"
        + ("CUENTA HABILITADA" if activo else "CUENTA INHABILITADA")
        + "</p></div>"
        "<div style='padding:26px'>"
        f"<p style='margin:0 0 8px;color:#333;font-size:14px'>Hola <strong>{nombre}</strong>,</p>"
        f"<p style='margin:0 0 16px;color:#555;font-size:14px'>{detalle}</p>"
        + (
            "<p style='margin:0 0 16px;padding:12px 14px;background:#fdf3f3;border:1px solid #f1caca;border-radius:8px;color:#9a3b3b;font-size:13px'>"
            f"<strong>Motivo de la inhabilitación:</strong> {motivo}</p>"
            if motivo
            else ""
        )
        + "<p style='margin:18px 0 0;padding:12px 14px;background:#fdf6e7;border:1px solid #eed7a8;border-radius:8px;color:#7a5a14;font-size:13px'>"
        "Para cualquier inquietud, responde este correo o contacta al administrador.</p>"
        "</div>"
        "<div style='background:#f6f4ef;padding:14px 26px;border-top:1px solid #e8e2d6'>"
        "<p style='margin:0;color:#999;font-size:12px'>Neodomus — Sistema de gestión inteligente.</p>"
        "</div></div></div>"
    )
    return subject, body


async def _notificar_estado_empleado(
    usuario: User,
    activo: bool,
    hasta: Optional[datetime],
    motivo: Optional[str] = None,
) -> None:
    """Envía correo al empleado cuando el admin lo habilita o inhabilita."""
    from app.utils.email import send_email

    try:
        nombre = f"{usuario.first_name} {usuario.last_name}".strip() or "empleado"
        subject, body = _plantilla_estado(nombre, activo, hasta, motivo)
        await send_email(usuario.email, subject, body)
    except HTTPException:
        pass


def _proceso_desactivacion_tecnico(db: Session, usuario: User) -> dict | None:
    """Al desactivar un técnico ejecuta el proceso completo: libera sus cupos
    como segundo técnico, reasigna automáticamente sus citas futuras a
    técnicos con la especialización requerida (cancela + reembolsa si no hay
    candidato), reasigna entregas y alerta a los administradores."""
    from app.services.asignacion_service import desactivar_tecnico_proceso

    ficha = db.query(Tecnico).filter(Tecnico.id_usuario_t == usuario.id_usuario).first()
    if not ficha:
        return None
    return desactivar_tecnico_proceso(db, ficha, motivo="Técnico desactivado por el administrador")


def _aplicar_especializaciones(db: Session, ficha: Tecnico, ids: List[int]) -> None:
    """Reemplaza el set de especializaciones de una ficha técnica."""
    from app.models.especializacion import Especializacion

    if not ids:
        ficha.especializaciones = []
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
    ficha.especializaciones = encontradas


def _admin(
    current_user: User = Depends(get_current_employee),
    db: Session = Depends(get_db),
) -> User:
    role = db.execute(select(RolesUsuario.nombre_rol).where(RolesUsuario.id_rol == current_user.id_rol_u)).scalar_one_or_none()
    if role not in ("admin", "administrador"):
        raise HTTPException(status_code=403, detail="Permisos insuficientes")
    return current_user


def _perfil_empleado(usuario: User, db: Session) -> dict:
    """Serializa al empleado junto con su ficha técnica (si existe)."""
    data = EmployeeResponse.model_validate(usuario).model_dump()
    ficha = db.query(Tecnico).filter(Tecnico.id_usuario_t == usuario.id_usuario).first()
    data["certificacion_t"] = ficha.certificacion_t if ficha else None
    data["especializaciones"] = (
        [
            {"id_especializacion": e.id_especializacion, "nombre": e.nombre, "descripcion": e.descripcion}
            for e in (ficha.especializaciones or [])
        ]
        if ficha
        else []
    )
    return data


@router.get("/me", response_model=PerfilEmpleadoResponse)
def get_me(
    current_user: User = Depends(get_current_employee),
    db: Session = Depends(get_db),
):
    return _perfil_empleado(current_user, db)


@router.put("/me", response_model=PerfilEmpleadoResponse)
def update_me(
    data: UserUpdate,
    current_user: User = Depends(get_current_employee),
    db: Session = Depends(get_db),
):
    """Actualiza el perfil del empleado autenticado. El cambio de correo no
    invalida la sesión (los tokens referencian al id_usuario, no al email).
    El rol nunca se modifica desde aquí."""
    update_data = data.model_dump(exclude_unset=True)
    if "email" in update_data:
        email = update_data["email"].lower().strip()
        if email != current_user.email:
            raise HTTPException(
                status_code=400,
                detail="Para cambiar tu correo debes verificar el código enviado a tu correo actual",
            )
        update_data["email"] = email
    for campo in ("first_name", "last_name"):
        if campo in update_data and not (update_data[campo] or "").strip():
            raise HTTPException(status_code=400, detail="El nombre y los apellidos no pueden estar vacíos")
        if campo in update_data:
            update_data[campo] = update_data[campo].strip()
    certificacion_t = update_data.pop("certificacion_t", None)
    if "documento_usuario" in update_data:
        doc = update_data["documento_usuario"]
        if doc is not None:
            existe_doc = (
                db.query(User)
                .filter(
                    User.documento_usuario == doc,
                    User.id_usuario != current_user.id_usuario,
                )
                .first()
            )
            if existe_doc:
                raise HTTPException(
                    status_code=400, detail="El documento ya está registrado"
                )
    for field, value in update_data.items():
        setattr(current_user, field, value)
    if certificacion_t is not None:
        ficha = db.query(Tecnico).filter(Tecnico.id_usuario_t == current_user.id_usuario).first()
        if not ficha:
            db.add(
                Tecnico(
                    id_usuario_t=current_user.id_usuario,
                    certificacion_t=certificacion_t or "",
                )
            )
        else:
            ficha.certificacion_t = certificacion_t
    db.commit()
    db.refresh(current_user)
    return _perfil_empleado(current_user, db)


@router.get("/roles", response_model=List[dict])
def get_roles(_admin_user: User = Depends(_admin), db: Session = Depends(get_db)):
    roles = db.query(RolesUsuario).order_by(RolesUsuario.id_rol.asc()).all()
    return [{"id": r.id_rol, "nombre": r.nombre_rol} for r in roles]


@router.get("/", response_model=List[EmployeeResponse])
def get_users(
    _admin_user: User = Depends(_admin),
    db: Session = Depends(get_db),
    skip: int = 0,
    limit: int = 100,
):
    return db.query(User).order_by(User.id_usuario.asc()).offset(skip).limit(limit).all()


@router.post("", response_model=dict)
def crear_empleado(
    data: EmployeeCreate,
    _admin_user: User = Depends(_admin),
    db: Session = Depends(get_db),
):
    """Registra un nuevo empleado (solo admin). Si el rol es técnico, crea su ficha técnica."""
    email = data.email.lower().strip()
    if db.query(User).filter(User.email == email).first():
        raise HTTPException(status_code=400, detail="El correo ya está registrado")
    if len(data.password) < 6:
        raise HTTPException(status_code=400, detail="La contraseña debe tener al menos 6 caracteres")
    rol = db.query(RolesUsuario).filter(RolesUsuario.id_rol == data.id_rol).first()
    if not rol:
        raise HTTPException(status_code=400, detail="El rol seleccionado no es válido")
    if data.documento_usuario:
        existente = db.query(User).filter(User.documento_usuario == data.documento_usuario).first()
        if existente:
            raise HTTPException(status_code=400, detail="El documento ya está registrado")
    usuario = User(
        first_name=data.first_name.strip(),
        last_name=data.last_name.strip(),
        email=email,
        password_hash=hash_password(data.password),
        telefono_usuario=data.telefono_usuario,
        documento_usuario=data.documento_usuario,
        id_rol_u=data.id_rol,
        is_active=True,
        password_reset_required=True,
    )
    db.add(usuario)
    db.flush()
    if rol.nombre_rol == "tecnico":
        ficha = Tecnico(
            id_usuario_t=usuario.id_usuario,
            certificacion_t=data.certificacion,
        )
        db.add(ficha)
        db.flush()
        if data.especializaciones_ids:
            _aplicar_especializaciones(db, ficha, data.especializaciones_ids)
    db.commit()
    respaldar_usuarios()
    if rol.nombre_rol == "tecnico":
        from app.services.notificaciones import notificar_bienvenida_tecnico

        nombre = f"{data.first_name.strip()} {data.last_name.strip()}".strip()
        notificar_bienvenida_tecnico(email, nombre, email, data.password)
    return {"msg": "Usuario registrado correctamente", "id": usuario.id_usuario, "email": email}


@router.put("/{user_id}", response_model=dict)
async def editar_empleado(
    user_id: int,
    data: EmployeeUpdate,
    _admin_user: User = Depends(_admin),
    db: Session = Depends(get_db),
):
    usuario = db.query(User).filter(User.id_usuario == user_id).first()
    if not usuario:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    upd = data.model_dump(exclude_unset=True)
    if "email" in upd:
        email = upd["email"].lower().strip()
        existe = db.query(User).filter(User.email == email, User.id_usuario != user_id).first()
        if existe:
            raise HTTPException(status_code=400, detail="El correo ya está registrado")
        upd["email"] = email
    if "documento_usuario" in upd and upd.get("documento_usuario") is not None:
        existe_doc = db.query(User).filter(
            User.documento_usuario == upd["documento_usuario"], User.id_usuario != user_id
        ).first()
        if existe_doc:
            raise HTTPException(status_code=400, detail="El documento ya está registrado")
    certificacion = upd.pop("certificacion", None)
    especializaciones_ids = upd.pop("especializaciones_ids", None)
    motivo = upd.pop("motivo", None)
    nueva_password = upd.pop("password", None)
    if nueva_password:
        if len(nueva_password) < 6:
            raise HTTPException(status_code=400, detail="La contraseña debe tener al menos 6 caracteres")
        usuario.password_hash = hash_password(nueva_password)
        usuario.password_reset_required = True
    cambio_estado = False
    activo = usuario.is_active
    desactivado_hasta = usuario.desactivado_hasta
    if "is_active" in upd and bool(upd["is_active"]) != usuario.is_active:
        cambio_estado = True
        activo = bool(upd["is_active"])
        if "desactivado_hasta" in upd:
            desactivado_hasta = upd["desactivado_hasta"]
        if activo:
            upd["desactivado_hasta"] = None
    for campo, valor in upd.items():
        setattr(usuario, campo, valor)
    if certificacion is not None or especializaciones_ids is not None:
        ficha = db.query(Tecnico).filter(Tecnico.id_usuario_t == user_id).first()
        if not ficha:
            ficha = Tecnico(
                id_usuario_t=user_id,
                certificacion_t=certificacion or "",
            )
            db.add(ficha)
            db.flush()
        else:
            if certificacion is not None:
                ficha.certificacion_t = certificacion
        if especializaciones_ids is not None:
            _aplicar_especializaciones(db, ficha, especializaciones_ids)
    db.commit()
    if cambio_estado:
        await _notificar_estado_empleado(usuario, activo, desactivado_hasta, motivo)
        if not activo:
            _proceso_desactivacion_tecnico(db, usuario)
    return {"msg": "Usuario actualizado correctamente", "id": user_id}


@router.delete("/{user_id}", response_model=dict)
async def desactivar_empleado(
    user_id: int,
    _admin_user: User = Depends(_admin),
    db: Session = Depends(get_db),
):
    usuario = db.query(User).filter(User.id_usuario == user_id).first()
    if not usuario:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    if usuario.id_usuario == _admin_user.id_usuario:
        raise HTTPException(status_code=400, detail="No puedes desactivar tu propia cuenta")
    usuario.is_active = False
    db.commit()
    await _notificar_estado_empleado(usuario, False, usuario.desactivado_hasta)
    _proceso_desactivacion_tecnico(db, usuario)
    return {"msg": "Usuario desactivado", "id": user_id}


@router.post("/me/foto", response_model=PerfilEmpleadoResponse)
async def subir_foto_perfil(
    archivo: UploadFile = File(...),
    current_user: User = Depends(get_current_employee),
    db: Session = Depends(get_db),
):
    """Sube una foto de perfil del empleado a MinIO y la asocia a su cuenta."""
    if not archivo.content_type or not archivo.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="El archivo debe ser una imagen")
    contenido = await archivo.read()
    if len(contenido) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="La imagen no puede superar 5 MB")
    ext = archivo.filename.rsplit(".", 1)[-1] if archivo.filename and "." in archivo.filename else "jpg"
    nombre = f"perfil_usuario_{current_user.id_usuario}.{ext}"
    from app.services.minio_service import subir_imagen, eliminar_objeto
    if current_user.foto_url:
        prefijo = f"{current_user.foto_url.split('/minio/')[-1]}" if "/minio/" in current_user.foto_url else None
        if prefijo:
            eliminar_objeto(prefijo)
    url = subir_imagen("perfiles", nombre, contenido)
    current_user.foto_url = url
    db.commit()
    db.refresh(current_user)
    return _perfil_empleado(current_user, db)



