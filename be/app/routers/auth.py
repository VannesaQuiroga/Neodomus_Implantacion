# Rutas de auth. Las dependencias declaradas en cada endpoint determinan sus permisos de acceso.
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, Response
from sqlalchemy import select
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional

from app.database import get_db
from app.models.roles_usuario import RolesUsuario
from app.models.user import User
from app.services.auth_service import (
    register_client,
    verify_client_email,
    resend_verification_code,
    login,
    refresh_access_token,
    change_password,
    update_password,
    request_password_reset,
    verify_password_reset_code,
    reset_password,
    solicitar_habilitacion,
    google_login,
    request_email_change,
    verify_email_change,
)
from app.schemas.auth import (
    ClientCreate,
    UserLogin,
    TokenResponse,
    ChangePasswordRequest,
    UpdatePasswordRequest,
    ResetPasswordRequest,
    VerifyCodeRequest,
    GoogleLoginRequest,
    RequestEmailChangeRequest,
    VerifyEmailChangeRequest,
)
from app.utils.security import (
    get_current_user,
    set_auth_cookies,
    clear_auth_cookies,
    REFRESH_COOKIE_NAME,
)
from app.middleware.rate_limit import limiter

router = APIRouter(prefix="/auth", tags=["Authentication"])

# Agrupa los campos de ForgotPasswordRequest: email.
class ForgotPasswordRequest(BaseModel):
    email: str

# Agrupa los campos de ResetPasswordCodeRequest: token, new_password.
class ResetPasswordCodeRequest(BaseModel):
    token: str
    new_password: str

# Agrupa los campos de ResendVerificationRequest: email.
class ResendVerificationRequest(BaseModel):
    email: str

# Agrupa los campos de RefreshTokenRequest: refresh_token.
class RefreshTokenRequest(BaseModel):
    refresh_token: str

# Registro y verificación — email en background para respuesta inmediata
@router.post("/register/client", response_model=dict)
@limiter.limit("3/minute")
async def register_client_endpoint(request: Request, client_data: ClientCreate, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    # La creación del pendiente es síncrona (rápida); el envío de correo va en background
    # para que el formulario no quede congelado esperando SMTP.
    return await register_client(db, client_data, background_tasks)

@router.post("/verify-email")
def verify_email_endpoint(code: str, db: Session = Depends(get_db)):
    verify_client_email(db, code)
    return {"msg": "Email verificado correctamente. Ya puedes iniciar sesión."}

@router.post("/resend-verification")
@limiter.limit("3/minute")
async def resend_verification_endpoint(request: Request, req: ResendVerificationRequest, db: Session = Depends(get_db)):
    return await resend_verification_code(db, req.email)

# Login y autenticación
@router.post("/login", response_model=TokenResponse)
@limiter.limit("5/minute")
def login_endpoint(request: Request, response: Response, login_data: UserLogin, db: Session = Depends(get_db)):
    result = login(db, login_data)
    # Cookies HttpOnly para la web; los tokens también van en el cuerpo para el móvil.
    set_auth_cookies(response, result.access_token, result.refresh_token)
    return result

@router.post("/google", response_model=TokenResponse)
def google_login_endpoint(response: Response, req: GoogleLoginRequest, db: Session = Depends(get_db)):
    result = google_login(db, req.credential)
    set_auth_cookies(response, result.access_token, result.refresh_token)
    return result

@router.post("/solicitar-habilitacion")
@limiter.limit("5/minute")
async def solicitar_habilitacion_endpoint(request: Request, req: UserLogin, db: Session = Depends(get_db)):
    """Crea una solicitud de habilitación para un cliente con la cuenta inhabilitada.
    Requiere email y contraseña para comprobar la identidad. No habilita la cuenta."""
    return solicitar_habilitacion(db, req.email, req.password)

@router.post("/refresh", response_model=TokenResponse)
def refresh_token(
    request: Request,
    response: Response,
    req: Optional[RefreshTokenRequest] = None,
    refresh_token: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """Renueva el access token. Acepta el token por cuerpo (móvil) o por la
    cookie HttpOnly (web). Nunca viaja en la URL."""
    token = (
        (req.refresh_token if req else None)
        or refresh_token
        or request.cookies.get(REFRESH_COOKIE_NAME)
    )
    if not token:
        raise HTTPException(status_code=400, detail="refresh_token es requerido")
    result = refresh_access_token(db, token)
    set_auth_cookies(response, result.access_token, result.refresh_token)
    return result


@router.post("/logout")
def logout(response: Response):
    """Cierra la sesión web eliminando las cookies HttpOnly."""
    clear_auth_cookies(response)
    return {"msg": "Sesión cerrada"}


@router.get("/session")
def session_actual(current_user = Depends(get_current_user), db: Session = Depends(get_db)):
    """Tipo y rol de la cuenta de la sesión actual.
    Prioriza el header Authorization (cada pestaña envía su propio token
    desde localStorage). Si no hay header, cae a la cookie HttpOnly
    (compatibilidad con versiones anteriores).
    401 si no hay sesión válida; lo usa el frontend al cargar para validar
    que la sesión corresponda con la vista que quiere mostrar.
    El rol se lee de la BD (no del claim del JWT): si el rol cambió después
    de emitirse el token, el frontend lo sabe antes de llamar a endpoints
    que exigen permisos y evita errores 403 con una vista equivocada."""
    # Comparte autenticación con las rutas protegidas: access válido y cuenta
    # activa, con prioridad de Authorization sobre la cookie de compatibilidad.
    if isinstance(current_user, User):
        user_type = "employee"
        uid = current_user.id_usuario
        rol = db.execute(
            select(RolesUsuario.nombre_rol).where(RolesUsuario.id_rol == current_user.id_rol_u)
        ).scalar_one_or_none()
    else:
        user_type = "client"
        uid = current_user.id_cliente
        rol = "cliente"

    return {
        "user_type": user_type,
        "rol": rol,
        "uid": str(uid),
    }

@router.post("/change-password")
def change_password_endpoint(
    req: ChangePasswordRequest,
    current_user = Depends(get_current_user),
    db: Session = Depends(get_db),
    request: Request = None
):
    ip = request.client.host if request else None
    change_password(db, current_user, req, ip)
    return {"msg": "Contraseña actualizada correctamente"}

@router.post("/update-password")
def update_password_endpoint(
    req: UpdatePasswordRequest,
    current_user = Depends(get_current_user),
    db: Session = Depends(get_db),
    request: Request = None
):
    """Actualiza la contraseña del empleado autenticado sin pedir la actual
    (ventana emergente del panel técnico)."""
    ip = request.client.host if request else None
    update_password(db, current_user, req.new_password, ip)
    return {"msg": "Contraseña actualizada correctamente"}

# Recuperación de contraseña — respuesta inmediata + email en background
@router.post("/forgot-password")
@limiter.limit("3/minute")
async def forgot_password(
    request: Request,
    req: ForgotPasswordRequest,
    background_tasks: BackgroundTasks,
):
    # Normalización y validación rápida antes de encolar (evita trabajos basura)
    raw = (req.email or "").strip().lower()
    if not raw or "@" not in raw:
        raise HTTPException(status_code=400, detail="Correo electrónico inválido")
    # Actualiza el modelo con el valor normalizado para consistencia
    req.email = raw

    def _task(email: str, ip: str):
        from app.database import SessionLocal
        db = SessionLocal()
        try:
            import asyncio
            # request_password_reset es async y maneja cliente/técnico/admin por igual
            asyncio.run(request_password_reset(db, email, ip))
        except Exception as e:
            print(f"[forgot-password] background error para {email}: {e}")
        finally:
            try:
                db.close()
            except:
                pass

    background_tasks.add_task(_task, raw, request.client.host if request.client else None)
    return {"msg": "Si el email está registrado, recibirás un código de recuperación"}

@router.post("/verify-code")
@limiter.limit("5/minute")
def verify_code(request: Request, req: VerifyCodeRequest, db: Session = Depends(get_db)):
    verify_password_reset_code(db, req.email, req.code)
    return {"valid": True, "message": "Código válido. Ahora puedes restablecer tu contraseña."}

@router.post("/reset-password")
@limiter.limit("5/minute")
def reset_password_endpoint(
    request: Request,
    req: ResetPasswordCodeRequest,
    db: Session = Depends(get_db)
):
    reset_req = ResetPasswordRequest(token=req.token, new_password=req.new_password)
    reset_password(db, reset_req)
    return {"msg": "Contraseña actualizada correctamente"}

# Cambio de correo electrónico (verificación con código)
@router.post("/request-email-change")
async def request_email_change_endpoint(
    req: RequestEmailChangeRequest,
    request: Request,
    current_user = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Solicita el cambio de correo: envía un código de 6 dígitos al correo actual."""
    ip = request.client.host if request else None
    return await request_email_change(db, current_user, req.nuevo_email, ip)

@router.post("/verify-email-change")
def verify_email_change_endpoint(
    req: VerifyEmailChangeRequest,
    current_user = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Valida el código recibido por correo y aplica el cambio de correo."""
    return verify_email_change(db, current_user, req.code, req.nuevo_email)
