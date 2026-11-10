# Evidencia PEN-07 — Intentos de login contra la API real (POST /api/v1/auth/login)

Sesión: 2026-11-10 · Transcripción de las salidas reales obtenidas con PowerShell
(Invoke-RestMethod contra http://localhost:8000). Comandos y respuestas ejecutados
durante la sesión; se transcriben íntegros.

## 1) Patrón documentado con errata (`123345678…`, DEF-001)

```text
CLIENTE prueba.cliente@neodomus.com: FALLO HTTP 401 - {"detail":"Credenciales inválidas"}
TECNICO tecnico@neodomus.com: FALLO HTTP 401
ADMIN admin@neodomus.com: FALLO HTTP 401
CLIENTE demo Carolina: FALLO HTTP 401
CLIENTE demo011 sintetico: FALLO HTTP 401
```

## 2) Rate limit activo (segunda tanda en < 60 s)

```text
CLIENTE prueba.cliente: FALLO HTTP 429
CLIENTE Carolina Mendez: FALLO HTTP 429
TECNICO: FALLO HTTP 429
ADMIN: FALLO HTTP 429
```

## 3) Patrón real del código (`12345678…`)

```text
CLIENTE prueba.cliente: OK - user_type=client rol=cliente
CLIENTE cliente.demo: OK - user_type=client rol=cliente
TECNICO tecnico: OK - user_type=employee rol=tecnico
ADMIN admin: OK - user_type=employee rol=administrador
```

## 4) Credenciales inválidas deliberadas (control negativo)

```text
POST /api/v1/auth/login {"email":"prueba.cliente@neodomus.com","password":"ContrasenaInvalida999"}
→ HTTP 401 {"detail":"Credenciales inválidas"}
```

## 5) Auditoría de seguridad observada en `docker logs neodomus_api`

```text
WARNING:security.audit:{"timestamp": "2026-11-10T19:32:06.630886+00:00", "event": "LOGIN_FAILED",
  "email": "pr********@neodomus.com", "reason": "invalid_credentials", "ip": null, "user_type": "client"}
[AUDIT] {"timestamp": "2026-11-10T19:35:47.981031+00:00", "event": "LOGIN_SUCCESS",
  "email": "pr************@neodomus.com", "user_type": "client", "ip": null}
INFO:     172.20.0.1:41808 - "POST /api/v1/auth/login HTTP/1.1" 401 Unauthorized
INFO:     172.20.0.1:38110 - "POST /api/v1/auth/login HTTP/1.1" 200 OK
```

Conclusión: el backend respeta rate limits (5/min), devuelve 401 genérico sin
exponer si falló el usuario o la contraseña, y enmascara el email en la
auditoría (no registra texto plano).
