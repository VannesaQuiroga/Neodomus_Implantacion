# PEN-07 · Recorridos del rol técnico (móvil)

Cuenta usada: `tecnico@neodomus.com` / `12345678Tp.` (seed del repositorio, ficha técnica creada en BD de desarrollo durante esta sesión, ver `defectos-encontrados.md` PEN07-DEF-006).

## Estado del rol técnico en UI móvil: BLOQUEADO (entorno) — PENDIENTE DE REEJECUCIÓN

**Esta prueba NO se aprobó y NO debe marcarse como aprobada hasta ejecutarse.** El
inicio de sesión técnico **en la app móvil** no llegó a completarse en el emulador
durante esta sesión: al momento de escribir credenciales y enviar el formulario, el
runtime de Expo Go incurrió repetidamente en "Expo Go isn't responding" (ANR) en el
AVD Pixel_6 (Android 17), con cuatro diálogos ANR consecutivos en la fase final de
la sesión. Los intentos y su rastro:

1. Modal de login técnico → campos escritos → ANR durante el submit (ev43).
2. Retry con borrado/reescritura de campos → ANR (ev43a/b).
3. Reinicio de app + nueva pasada de login → ANR (ev45).
4. Confirmación posterior del mismo ANR (ev46).

El ANR es del **runtime de Expo Go** (proceso nativo), no un crash de la app
Neodomus: la app cliente renderizaba correctamente en las mismas condiciones
minutos antes (ev12, ev16, ev23…). Interpretación razonable y registrada:
saturación de recursos del emulador x86_64. Dato objetivo medido en la
auditoría final: el AVD Pixel_6 está configurado con **`hw.ramSize=2048`
(2 GB de RAM)** y 4 núcleos (`config.ini` del AVD) — insuficiente para Expo Go
SDK 57 + bundle de 1948 módulos + Metro + la pila Docker completa en la misma
máquina.

**Impacto en PEN-07**: los recorridos de UI del técnico quedan sin capturas de
dashboard técnico en esta ejecución. El estado se registra como **BLOQUEADO**,
con la verificación funcional equivalente ejecutada **por API real** (ver §2).

## 1. Verificaciones funcionales del rol técnico por API (real, backend Docker)

Todas contra `http://localhost:8000/api/v1` con token Bearer real obtenido por `POST /auth/login` (cuenta técnica).

| # | Identificador | Verificación | Resultado | Estado |
|---|---|---|---|---|
| 1 | PEN07-TEC-001 | `POST /auth/login` con credenciales válidas de técnico | `200 OK`, `user_type=employee`, `rol=tecnico` | APROBADA |
| 2 | PEN07-TEC-002 | `POST /auth/login` credenciales inválidas | `401 {"detail":"Credenciales inválidas"}` | APROBADA |
| 3 | PEN07-TEC-003 | `GET /users/me` con token técnico | `200 OK` (datos del empleado) | APROBADA |
| 4 | PEN07-TEC-004 | `GET /tecnicos/mis-citas` con token técnico (su propio endpoint) | `200 OK` (lista vacía: BD de desarrollo sin citas asignadas) | APROBADA |
| 5 | PEN07-TEC-005 | `GET /tecnicos/mis-entregas` con token técnico | `200 OK` | APROBADA |
| 6 | PEN07-TEC-006 | `GET /calificaciones/mis` con token técnico | `200 OK` | APROBADA |
| 7 | PEN07-TEC-007 | Cliente consultando `GET /tecnicos/mis-citas` (rol cruzado) | `401` (sin autorización) | APROBADA |
| 8 | PEN07-TEC-008 | Cliente consultando `GET /users/me` (endpoint de empleados) | `401` | APROBADA |
| 9 | PEN07-TEC-009 | Técnico consultando `GET /users/` (listado de empleados, admin) | `403` (prohibido) | APROBADA |
| 10 | PEN07-TEC-010 | Técnico creando empleado `POST /users` (admin) | `403` (prohibido) | APROBADA |
| 11 | PEN07-TEC-011 | Admin consultando `GET /users/` (contraste) | `200 OK`, 22 empleados | APROBADA |
| 12 | PEN07-TEC-012 | Sin token en `GET /pedidos/mis-pedidos` | `401` | APROBADA |

Estos resultados validan los controles del backend que la app móvil consume (los mismos endpoints que usa `movil/app/(tecnico)/index.tsx`: `/tecnicos/mis-citas`, `/tecnicos/mis-entregas`, `/calificaciones/mis`).

## 2. Pantallas del rol técnico existentes en la app (inspección de código, no ejecutadas en UI)

Fuente: `movil/app/(tecnico)/` con guard `GateTecnico` (acceso solo rol técnico).

| Pantalla | Endpoint backend que consume (código) |
|---|---|
| `(tecnico)/index.tsx` Dashboard | `GET /tecnicos/mis-citas`, `GET /tecnicos/mis-entregas`, `GET /calificaciones/mis`, `GET /devoluciones/mis-recogidas`, `POST /tecnicos/ubicacion`, `POST /tecnicos/citas/{id}/evidencias`, `PUT /tecnicos/entregas/{id}/estado` |
| `(tecnico)/citas.tsx` | `GET /tecnicos/mis-citas`, `PUT /tecnicos/citas/{id}/reagendar` |
| `(tecnico)/entregas.tsx` | `PUT /tecnicos/entregas/{id}/estado`, `POST /tecnicos/entregas/{id}/evidencias`, `POST /devoluciones/{id}/evidencia-recogida` |
| `(tecnico)/clientes.tsx` | `GET /tecnicos/mis-clientes`, `GET /tecnicos/clientes/{id}/citas` |
| `(tecnico)/historial.tsx`, `calificaciones.tsx`, `mensajes.tsx`, `novedades.tsx`, `perfil.tsx`, `cambiar-password.tsx`, `idioma.tsx`, `notificaciones.tsx`, `devoluciones.tsx` | endpoints correspondientes del router técnico |

Los guardias de rol en móvil (`GateTecnico` + redirección por rol en `app/_layout.tsx`) replican la matriz `RoleRoute` de la web.

## 3. Alternativas seguras para ejecutar el recorrido visual del técnico (PENDIENTE, no ejecutado en esta auditoría)

Determinadas en la auditoría final a partir de datos medidos en el equipo
(no se ejecutaron; no se marcan como aprobadas):

| # | Alternativa | Base objetiva verificada | Riesgo |
|---|---|---|---|
| A (recomendada) | **Clonar el AVD con 4 GB de RAM** y arrancar en frío | El AVD actual tiene `hw.ramSize=2048` (2 GB) y 4 cores (`Pixel_6.avd/config.ini`). La imagen `system-images;android-37.0;google_apis_ps16k;x86_64` ya está instalada en el SDK → clonar **no requiere descargas**: `avdmanager create avd -n Pixel_6_pen07 -k "system-images;android-37.0;google_apis_ps16k;x86_64" -d pixel_6` y luego `hw.ramSize=4096` en el `config.ini` del nuevo AVD | Bajo. Reutiliza la imagen exacta del proyecto; solo cambia memoria |
| B | **Dispositivo físico Android (≥ 9) por USB** | `adb reverse tcp:18082 tcp:18082` funciona igual en físico (canal ya probado en emulador); Expo Go 57.0.9 puede instalarse con el mismo APK oficial (`Expo-Go-57.0.9.apk`, 208.9 MB, fuente expo.dev/go). Nota: la versión de Play Store avanzará a SDK 58, que solo soporta ese SDK — usar el APK 57.0.9 | Bajo-medio. Requiere dispositivo disponible y depuración USB |
| C | **Reducir carga del AVD actual** | Arrancar con `emulator -avd Pixel_6 -no-snapshot` (sin snapshot) y detener contenedores no esenciales: `docker compose stop frontend caddy minio` (backend necesita solo `api`, `db`, `minio` para evidencias de imagen — detener `minio` rompe imágenes privadas; detener `frontend` y `caddy` libera RAM sin afectar el móvil) | Bajo. Configuración reversible |
| D | **Descargar una imagen Android menor** (p. ej. API 35) y crear otro AVD | En el SDK solo está instalada la imagen android-37; esta alternativa requiere descarga (~1–2 GB) vía SDK Manager | Medio. Tiempo de descarga; no aporta más que la opción A |

Requisitos comunes a todas: `pnpm install --frozen-lockfile`, `npx expo start --port 18082`,
`adb reverse tcp:18082 tcp:18082`, deep link `exp://localhost:18082` (emulador) o
`exp://<LAN-IP>:18082` (físico con cable). Credenciales: `tecnico@neodomus.com` /
`12345678Tp.`; ficha técnica ya creada (DEF-006).

Criterio de cierre: el recorrido se considera **APROBADO solo cuando existan
capturas reales del dashboard técnico** (`(tecnico)/index.tsx` con mis-citas,
mis-entregas y calificaciones) y de la actualización de estado de una cita.
Mientras eso no ocurra, el estado sigue siendo **BLOQUEADO/PENDIENTE**.
