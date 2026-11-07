"""
Script: scripts/check_smtp.py

Verificación CONTRA la configuración REAL del backend (app.config.settings):
conecta al SMTP configurado, negocia TLS y prueba el LOGIN. **No envía ningún
correo**. Dice PASS/FAIL y la causa exacta, sin exponer contraseñas.

Solo aplica cuando EMAIL_PROVIDER="smtp" (el proveedor actual del proyecto).

Uso (contenedor del backend):
    docker exec neodomus_api sh -c "cd /app && uv run python scripts/check_smtp.py"
"""


def main() -> int:
    import smtplib

    from app.config import settings

    if settings.EMAIL_PROVIDER != "smtp":
        print(f"EMAIL_PROVIDER={settings.EMAIL_PROVIDER}: esta verificación aplica al proveedor SMTP.")
        return 2

    usuario = settings.SMTP_USERNAME
    password = settings.SMTP_PASSWORD
    configurados = {
        "SMTP_HOST": settings.SMTP_HOST,
        "SMTP_PORT": settings.SMTP_PORT,
        "SMTP_USERNAME": ("presente" if usuario and usuario.strip() else "VACÍO"),
        "SMTP_PASSWORD": ("presente" if password and password.strip() else "VACÍO"),
    }
    print("Configuración leída por la app (sin secretos):")
    for clave, valor in configurados.items():
        print(f"  {clave} = {valor}")

    if not usuario or not password:
        print("FAIL — faltan credenciales: Gmail cierra la conexión al autenticar.")
        print("  1) Genera una Contraseña de aplicación (Cuenta Google → Seguridad →")
        print("     Verificación en dos pasos → Contraseñas de aplicación).")
        print("  2) Ponla en SMTP_PASSWORD de tu .env (sin espacios).")
        print("  3) Recrea el servicio: docker compose up -d api")
        return 1

    try:
        servidor = smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=15)
        servidor.ehlo()
        servidor.starttls()
        print(f"PASS conexión+TLS con {settings.SMTP_HOST}:{settings.SMTP_PORT}")
        try:
            servidor.login(usuario, password)
            print("PASS login: la contraseña de aplicación funciona; la app ya puede enviar correos.")
            servidor.quit()
            return 0
        except smtplib.SMTPAuthenticationError as auth_err:
            print(f"FAIL login (código {auth_err.smtp_code}): credenciales rechazadas.")
            print("  La contraseña debe ser una CONTRASEÑA DE APLICACIÓN de Gmail;")
            print("  copíala completa (16 caracteres) y sin espacios extra.")
            servidor.quit()
            return 1
    except Exception as e:
        print(f"FAIL conexión a {settings.SMTP_HOST}:{settings.SMTP_PORT}: {type(e).__name__} — {e}")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
