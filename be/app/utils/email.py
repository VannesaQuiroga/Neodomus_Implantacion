"""
Módulo: utils/email.py
Funciones para envío de correos electrónicos (verificación de registro, recuperación
de contraseña, facturas y notificaciones) mediante SMTP o la Gmail API.
"""

import smtplib
import asyncio
from pathlib import Path

from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

from app.config import settings
from fastapi import HTTPException


def _from_email() -> str:
    return settings.SMTP_USERNAME


def _avisar_smtp_sin_credenciales() -> None:
    """Diagnóstico visible sin exponer secretos: con EMAIL_PROVIDER=smtp y
    credenciales vacías el envío fallará siempre; el orden queda registrado
    (factura creada) pero el correo nunca sale."""
    if not settings.SMTP_USERNAME or not settings.SMTP_PASSWORD:
        print(
            "[email] SMTP sin credenciales: define SMTP_USERNAME y "
            "SMTP_PASSWORD en el .env del backend; el correo no puede enviarse."
        )


def _causa_fallo_smtp(error: Exception) -> str:
    """Traduce el error SMTP a una causa accionable, sin exponer credenciales.
    Gmail corta la conexión justo al autenticar cuando falta la contraseña
    (SMTPServerDisconnected), por eso hay que distinguirlo de credenciales
    inválidas (SMTPAuthenticationError) y de fallos de red."""
    if isinstance(error, smtplib.SMTPAuthenticationError):
        return (
            "credenciales rechazadas por el servidor: SMTP_PASSWORD debe ser una "
            "CONTRASEÑA DE APLICACIÓN de Gmail (no la de la cuenta) y la "
            "verificación en dos pasos debe estar activada"
        )
    if isinstance(error, smtplib.SMTPServerDisconnected):
        mensaje = str(error)
        if "closed" in mensaje.lower():
            return (
                "el servidor cerró la conexión (Connection unexpectedly closed): "
                "revisa que SMTP_PASSWORD esté en el .env que recibe el "
                "contenedor y recrea el servicio (docker compose up -d api)"
            )
        return f"el servidor cerró la conexión: {mensaje}"
    if isinstance(error, TimeoutError):
        return "tiempo de espera agotado con el servidor SMTP"
    return f"{type(error).__name__}: {error}"


def _send_email_resend(to_email: str, subject: str, body: str) -> bool:
    """Envía email usando la API de Resend (REST, sin SMTP)."""
    import json
    import urllib.request

    payload = json.dumps({
        "from": settings.RESEND_FROM_EMAIL,
        "to": [to_email],
        "subject": subject,
        "html": body,
    }).encode("utf-8")

    req = urllib.request.Request(
        "https://api.resend.com/emails",
        data=payload,
        headers={
            "Authorization": f"Bearer {settings.RESEND_API_KEY}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=15) as resp:
        result = json.loads(resp.read().decode("utf-8"))
        print(f"Resend response: {result}")
    return True


def _send_email_sync(to_email: str, subject: str, body: str) -> bool:
    """Parte bloqueante del envío (se ejecuta en un hilo).

    Usa el proveedor configurado en EMAIL_PROVIDER:
      - "resend": Resend API (REST, sin SMTP).
      - "gmail_api": Gmail API con OAuth 2.0 (sin SMTP).
      - cualquier otro: SMTP clásico.
    """
    if settings.EMAIL_PROVIDER == "resend":
        return _send_email_resend(to_email, subject, body)

    if settings.EMAIL_PROVIDER == "gmail_api":
        from app.utils.gmail_api import send_gmail_api

        return send_gmail_api(to_email, subject, body)

    msg = MIMEMultipart()
    msg['From'] = _from_email()
    msg['To'] = to_email
    msg['Subject'] = subject
    msg.attach(MIMEText(body, 'html'))

    _avisar_smtp_sin_credenciales()
    server = None
    try:
        server = smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=10)
        server.starttls()
        server.login(settings.SMTP_USERNAME, settings.SMTP_PASSWORD)
        server.send_message(msg)
        print(f"[email] SMTP enviado correctamente a {to_email} | asunto: {subject}")
        return True
    except Exception as smtp_err:
        print(f"[email] SMTP fallo para {to_email}: {_causa_fallo_smtp(smtp_err)}")
        raise
    finally:
        if server is not None:
            try:
                server.quit()
            except Exception:
                try:
                    server.close()
                except Exception:
                    pass


async def send_email(to_email: str, subject: str, body: str) -> bool:
    """
    Envía un correo electrónico por SMTP.
    Retorna True si se envió correctamente, False en caso de error.

    El trabajo bloqueante (conexión y transmisión SMTP) se ejecuta en un hilo de
    trabajo para no bloquear el event loop (crítico cuando muchos usuarios
    compran a la vez).
    """
    try:
        # Timeout total de 18s para el envío (cubre SMTP 10s + margen)
        return await asyncio.wait_for(
            asyncio.to_thread(_send_email_sync, to_email, subject, body),
            timeout=18.0,
        )
    except asyncio.TimeoutError:
        print(f"[email] Timeout enviando a {to_email} (18s)")
        raise HTTPException(
            status_code=504,
            detail="El servicio de correo tardó demasiado. Inténtalo nuevamente en unos segundos.",
        )
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error enviando email a {to_email}: {e}")
        raise HTTPException(
            status_code=500,
            detail="No se pudo enviar el correo. Revisa la configuración SMTP en el archivo .env.",
        ) from e


async def send_email_with_attachment(
    to_email: str,
    subject: str,
    body: str,
    pdf_source,
) -> bool:
    """
    Envía un correo con un archivo PDF adjunto (facturas) por SMTP.
    pdf_source puede ser un str (ruta de archivo) o un io.BytesIO.
    """
    import io as _io
    from email.mime.application import MIMEApplication

    def _sync():
        from pathlib import Path as _Path

        # Obtener bytes del PDF
        if isinstance(pdf_source, _io.BytesIO):
            pdf_bytes = pdf_source.read()
            pdf_source.seek(0)
            filename = "factura.pdf"
        else:
            with open(pdf_source, 'rb') as f:
                pdf_bytes = f.read()
            filename = f"factura_{_Path(pdf_source).stem}.pdf"

        if settings.EMAIL_PROVIDER == "resend":
            import json
            import base64
            import urllib.request

            pdf_b64 = base64.b64encode(pdf_bytes).decode("utf-8")

            payload = json.dumps({
                "from": settings.RESEND_FROM_EMAIL,
                "to": [to_email],
                "subject": subject,
                "html": body,
                "attachments": [{
                    "filename": filename,
                    "content": pdf_b64,
                }],
            }).encode("utf-8")

            req = urllib.request.Request(
                "https://api.resend.com/emails",
                data=payload,
                headers={
                    "Authorization": f"Bearer {settings.RESEND_API_KEY}",
                    "Content-Type": "application/json",
                },
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=15) as resp:
                result = json.loads(resp.read().decode("utf-8"))
                print(f"Resend response: {result}")
            return True

        if settings.EMAIL_PROVIDER == "gmail_api":
            from app.utils.gmail_api import send_gmail_api

            if isinstance(pdf_source, _io.BytesIO):
                return send_gmail_api(to_email, subject, body, attachment_bytes=pdf_bytes, attachment_filename=filename)
            return send_gmail_api(to_email, subject, body, attachment_path=pdf_source)

        msg = MIMEMultipart()
        msg['From'] = _from_email()
        msg['To'] = to_email
        msg['Subject'] = subject
        msg.attach(MIMEText(body, 'html'))

        adjunto = MIMEApplication(pdf_bytes, _subtype='pdf')
        adjunto.add_header(
            'Content-Disposition',
            'attachment',
            filename=filename,
        )
        msg.attach(adjunto)

        _avisar_smtp_sin_credenciales()
        server = None
        try:
            server = smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=10)
            server.starttls()
            server.login(settings.SMTP_USERNAME, settings.SMTP_PASSWORD)
            server.send_message(msg)
            print(f"[email] SMTP con adjunto enviado a {to_email}")
            return True
        except Exception as smtp_err:
            print(f"[email] SMTP adjunto fallo para {to_email}: {_causa_fallo_smtp(smtp_err)}")
            raise
        finally:
            if server is not None:
                try:
                    server.quit()
                except Exception:
                    try:
                        server.close()
                    except Exception:
                        pass

    try:
        return await asyncio.wait_for(asyncio.to_thread(_sync), timeout=20.0)
    except asyncio.TimeoutError:
        print(f"[email] Timeout adjunto para {to_email} (20s)")
        raise HTTPException(status_code=504, detail="El servicio de correo tardó demasiado.")


# ============================================================
# 1. Verificación de registro (bienvenida a Neodomus)
# ============================================================
async def send_verification_email(to_email: str, code: str) -> bool:
    """
    Envía el código de 6 dígitos para verificar el registro de un nuevo cliente.
    Incluye un mensaje de bienvenida a Neodomus.
    """
    subject = "Bienvenido a Neodomus - Verifica tu cuenta"

    body = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <title>Verificación de registro</title>
    </head>
    <body style="font-family: Arial, sans-serif; background-color: #f4f4f4; padding: 20px;">
        <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; padding: 30px; box-shadow: 0 2px 5px rgba(0,0,0,0.1);">
            <h1 style="color: #2c3e50; text-align: center;">¡Bienvenido a Neodomus!</h1>
            <p style="font-size: 16px; line-height: 1.5; color: #333;">Gracias por registrarte en <strong>Neodomus</strong>, tu plataforma de domótica inteligente.</p>
            <p style="font-size: 16px; line-height: 1.5; color: #333;">Para activar tu cuenta, utiliza el siguiente código de verificación:</p>
            <div style="background-color: #ecf0f1; padding: 15px; text-align: center; font-size: 32px; font-weight: bold; letter-spacing: 5px; border-radius: 5px; margin: 20px 0;">
                {code}
            </div>
            <p style="font-size: 14px; color: #7f8c8d;">Este código expira en {settings.VERIFICATION_TOKEN_EXPIRE_HOURS} horas.</p>
            <p style="font-size: 14px; color: #7f8c8d;">Si no solicitaste este registro, ignora este mensaje.</p>
            <hr style="margin: 30px 0;">
            <p style="font-size: 12px; color: #95a5a6; text-align: center;">Neodomus - Innovación para tu hogar</p>
        </div>
    </body>
    </html>
    """

    return await send_email(to_email, subject, body)


# ============================================================
# 3. Cambio de correo electrónico (código de verificación)
# ============================================================
async def send_email_change_code(to_email: str, code: str) -> bool:
    """
    Envía el código de 6 dígitos para verificar el cambio de correo.
    Se envía al correo actual de la cuenta para confirmar la identidad.
    """
    subject = "Neodomus - Código para cambiar tu correo electrónico"

    body = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <title>Cambio de correo electrónico</title>
    </head>
    <body style="font-family: Arial, sans-serif; background-color: #f4f4f4; padding: 20px;">
        <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; padding: 30px; box-shadow: 0 2px 5px rgba(0,0,0,0.1);">
            <h1 style="color: #2c3e50; text-align: center;">Cambio de correo electrónico</h1>
            <p style="font-size: 16px; line-height: 1.5; color: #333;">Hemos recibido una solicitud para cambiar el correo electrónico de tu cuenta en <strong>Neodomus</strong>.</p>
            <p style="font-size: 16px; line-height: 1.5; color: #333;">Utiliza el siguiente código de 6 dígitos para confirmar el cambio:</p>
            <div style="background-color: #ecf0f1; padding: 15px; text-align: center; font-size: 32px; font-weight: bold; letter-spacing: 5px; border-radius: 5px; margin: 20px 0;">
                {code}
            </div>
            <p style="font-size: 14px; color: #7f8c8d;">Este código expira en {settings.PASSWORD_RESET_TOKEN_EXPIRE_MINUTES} minutos.</p>
            <p style="font-size: 14px; color: #7f8c8d;">Si no solicitaste este cambio, ignora este mensaje. Tu correo actual seguirá activo.</p>
            <hr style="margin: 30px 0;">
            <p style="font-size: 12px; color: #95a5a6; text-align: center;">Neodomus - Seguridad y confianza</p>
        </div>
    </body>
    </html>
    """

    return await send_email(to_email, subject, body)


# ============================================================
# 2. Recuperación de contraseña (código de restablecimiento)
# ============================================================
async def send_password_reset_code(to_email: str, code: str, user_type: str) -> bool:
    """
    Envía el código de 6 dígitos para restablecer la contraseña.
    """
    subject = "Neodomus - Código para restablecer tu contraseña"

    body = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <title>Recuperación de contraseña</title>
    </head>
    <body style="font-family: Arial, sans-serif; background-color: #f4f4f4; padding: 20px;">
        <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; padding: 30px; box-shadow: 0 2px 5px rgba(0,0,0,0.1);">
            <h1 style="color: #2c3e50; text-align: center;">Restablece tu contraseña</h1>
            <p style="font-size: 16px; line-height: 1.5; color: #333;">Hemos recibido una solicitud para restablecer la contraseña de tu cuenta en <strong>Neodomus</strong>.</p>
            <p style="font-size: 16px; line-height: 1.5; color: #333;">Utiliza el siguiente código de 6 dígitos:</p>
            <div style="background-color: #ecf0f1; padding: 15px; text-align: center; font-size: 32px; font-weight: bold; letter-spacing: 5px; border-radius: 5px; margin: 20px 0;">
                {code}
            </div>
            <p style="font-size: 14px; color: #7f8c8d;">Este código expira en {settings.PASSWORD_RESET_TOKEN_EXPIRE_MINUTES} minutos.</p>
            <p style="font-size: 14px; color: #7f8c8d;">Si no solicitaste este cambio, ignora este mensaje. Tu contraseña actual permanecerá activa.</p>
            <hr style="margin: 30px 0;">
            <p style="font-size: 12px; color: #95a5a6; text-align: center;">Neodomus - Seguridad y confianza</p>
        </div>
    </body>
    </html>
    """

    return await send_email(to_email, subject, body)