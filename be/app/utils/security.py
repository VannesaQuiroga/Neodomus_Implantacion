import os
from datetime import datetime, timedelta
from typing import Optional, Dict, Any, Union

from jose import JWTError, jwt
from passlib.context import CryptContext
from fastapi import Depends, HTTPException, Request, Response, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.models.cliente import Cliente
from app.models.roles_usuario import RolesUsuario
from app.config import settings

# Cookies HttpOnly de autenticación (web). El móvil sigue usando el header
# Authorization con los tokens que recibe en el cuerpo de la respuesta.
ACCESS_COOKIE_NAME = "access_token"
REFRESH_COOKIE_NAME = "refresh_token"

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def hash_password(password: str) -> str:
    return pwd_context.hash(password)

def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        return pwd_context.verify(plain_password, hashed_password)
    except ValueError:
        # Hash no válido/legacy que bcrypt no puede verificar: rechazar.
        return False

SECRET_KEY = settings.SECRET_KEY
ALGORITHM = settings.ALGORITHM
ACCESS_TOKEN_EXPIRE_MINUTES = settings.ACCESS_TOKEN_EXPIRE_MINUTES
REFRESH_TOKEN_EXPIRE_DAYS = settings.REFRESH_TOKEN_EXPIRE_DAYS

def create_access_token(
    data: Dict[str, Any],
    user_type: str = None,
    rol: str = None,
    user_id: int = None,
) -> str:
    to_encode = data.copy()
    if user_type:
        to_encode["user_type"] = user_type
    if rol:
        to_encode["rol"] = rol
    if user_id is not None:
        to_encode["uid"] = str(user_id)
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire, "type": "access"})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

def create_refresh_token(
    data: Dict[str, Any],
    user_type: str = None,
    rol: str = None,
    user_id: int = None,
) -> str:
    to_encode = data.copy()
    if user_type:
        to_encode["user_type"] = user_type
    if rol:
        to_encode["rol"] = rol
    if user_id is not None:
        to_encode["uid"] = str(user_id)
    expire = datetime.utcnow() + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
    to_encode.update({"exp": expire, "type": "refresh"})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

def decode_token(token: str) -> Optional[Dict[str, Any]]:
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        return None

def verify_token(token: str, token_type: str = "access") -> Dict[str, Any]:
    payload = decode_token(token)
    if not payload or payload.get("type") != token_type:
        raise HTTPException(status_code=401, detail="Token inválido o expirado")
    return payload

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login", auto_error=False)


def _cookie_secure() -> bool:
    """Cookies 'Secure' solo en producción; en desarrollo se sirve por http."""
    return settings.ENVIRONMENT == "production"


def set_auth_cookies(response: Response, access_token: str, refresh_token: str) -> None:
    """Escribe las cookies HttpOnly de sesión (inaccesibles desde JavaScript)."""
    response.set_cookie(
        key=ACCESS_COOKIE_NAME,
        value=access_token,
        max_age=ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        httponly=True,
        samesite="lax",
        secure=_cookie_secure(),
        path="/",
    )
    response.set_cookie(
        key=REFRESH_COOKIE_NAME,
        value=refresh_token,
        max_age=REFRESH_TOKEN_EXPIRE_DAYS * 86400,
        httponly=True,
        samesite="lax",
        secure=_cookie_secure(),
        path="/",
    )


def clear_auth_cookies(response: Response) -> None:
    response.delete_cookie(ACCESS_COOKIE_NAME, path="/")
    response.delete_cookie(REFRESH_COOKIE_NAME, path="/")


def _token_desde_request(request: Optional[Request], token: Optional[str]) -> Optional[str]:
    """Prioriza el header Authorization (multi-pestaña: cada pestaña envía su
    propio token via localStorage). Si no hay header, cae a la cookie HttpOnly
    (compatibilidad con versiones anteriores o apps móviles)."""
    if token:
        return token
    if request is not None:
        cookie_token = request.cookies.get(ACCESS_COOKIE_NAME)
        if cookie_token:
            return cookie_token
    return None


# Consulta User, Cliente.
async def get_current_user(
    request: Request = None,
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> Union[User, Cliente]:
    token = _token_desde_request(request, token)
    if not token:
        raise HTTPException(status_code=401, detail="No autenticado")
    payload = decode_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail="Token inválido")
    if payload.get("type") != "access":
        # Un token de refresco no sirve como token de acceso (y viceversa):
        # cada tipo se usa únicamente para su propósito.
        raise HTTPException(status_code=401, detail="Token inválido")
    user_type = payload.get("user_type")
    if user_type not in ("employee", "client"):
        raise HTTPException(status_code=401, detail="Payload inválido")
    # Prioridad 1: el token referencia al usuario por id (uid) → inmune al cambio de email.
    # Prioridad 2: tokens emitidos antes de esa mejora usaban el email como sub.
    uid = payload.get("uid")
    if user_type == "employee":
        user = None
        if uid:
            try:
                user = db.query(User).filter(User.id_usuario == int(uid)).first()
            except (TypeError, ValueError):
                user = None
        if user is None:
            email = payload.get("sub")
            if not email:
                raise HTTPException(status_code=401, detail="Payload inválido")
            user = db.query(User).filter(User.email == email).first()
        if not user or not user.is_active:
            raise HTTPException(status_code=401, detail="Usuario no encontrado o inactivo")
        return user
    else:
        client = None
        if uid:
            try:
                client = db.query(Cliente).filter(Cliente.id_cliente == int(uid)).first()
            except (TypeError, ValueError):
                client = None
        if client is None:
            email = payload.get("sub")
            if not email:
                raise HTTPException(status_code=401, detail="Payload inválido")
            client = db.query(Cliente).filter(Cliente.email == email).first()
        if not client or not client.is_active:
            raise HTTPException(status_code=401, detail="Cliente no encontrado o inactivo")
        return client

# Valida las condiciones de esta operación y devuelve un error HTTP si no se cumplen.
async def get_current_employee(
    request: Request = None,
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> User:
    user = await get_current_user(request, token=token, db=db)
    if not isinstance(user, User):
        # 401 (y no 403): la cookie pertenece a otra TIPO de cuenta; así el
        # frontend cierra sesión automáticamente en vez de mostrar errores.
        raise HTTPException(
            status_code=401,
            detail="Esta sesión corresponde a una cuenta de cliente. Inicia sesión con tu cuenta de empleado.",
        )
    return user

# Valida las condiciones de esta operación y devuelve un error HTTP si no se cumplen.
async def get_current_client(
    request: Request = None,
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> Cliente:
    user = await get_current_user(request, token=token, db=db)
    if not isinstance(user, Cliente):
        raise HTTPException(
            status_code=401,
            detail="Esta sesión corresponde a una cuenta de empleado. Inicia sesión con tu cuenta de cliente.",
        )
    return user

# Valida las condiciones de esta operación y devuelve un error HTTP si no se cumplen.
def require_roles(*allowed_roles: str):
    def decorator(func):
        async def wrapper(*args, current_user: User = Depends(get_current_employee), db: Session = Depends(get_db), **kwargs):
            role = db.execute(select(RolesUsuario.nombre_rol).where(RolesUsuario.id_rol == current_user.id_rol_u)).scalar_one_or_none()
            if not role or role not in allowed_roles:
                raise HTTPException(status_code=403, detail="Permisos insuficientes")
            return await func(*args, current_user=current_user, db=db, **kwargs)
        return wrapper
    return decorator

