# PEN-07 · Entorno de pruebas móviles

Registro real del entorno durante la ejecución de PEN-07.

## 1. Datos del equipo de ejecución

| Ítem | Valor |
|---|---|
| Sistema operativo host | Windows (usuario `valet`), Docker Desktop 29.5.3 (daemon Linux) |
| Node.js | v24.13.0 |
| pnpm | 11.4.0 |
| Gestor backend | `uv` (contenedor neodomus_api) |
| Fecha de ejecución | 2026-11-10 |
| Repositorio | `C:\Users\valet\neodomus_main`, rama `main`, árbol limpio al inicio (`git status` sin cambios) |

## 2. Tecnología y versiones de la app móvil

Fuente: `movil/package.json` (proyecto real, sin modificar).

| Ítem | Versión |
|---|---|
| Expo | 57.0.22 |
| Expo Router | 57.0.21 (punto de entrada `expo-router/entry`) |
| React Native | 0.86.3 |
| React | 19.2.3 |
| react-native-screens | 4.26.2 |
| react-native-reanimated | 4.5.1 |
| TypeScript | ~6.0.3 (`pnpm typecheck` disponible) |
| Lint | eslint 9.25.0 + eslint-config-expo 57.0.2 (`pnpm lint`) |

**Framework de pruebas móvil: ninguno.** El paquete móvil no incluye Jest, RNTL,
Detox ni Maestro: sus únicas verificaciones automatizadas son `typecheck` y
`lint` (ver `docs/qa/PEN-07/resultados-regresion.md`). El inventario del repo
(`tests/INVENTARIO.md`) confirma: "`móvil 0`" casos automatizados.

Nota: `movil/AGENTS.md` referencia documentación de Expo v54 aunque el proyecto
declara Expo 57 (SDK 57). Se usó el código real como fuente de verdad; el
desarrollo se restringió a verificación, no escritura de código Expo.

## 3. Dispositivo/emulador real usado

| Ítem | Valor |
|---|---|
| AVD | `Pixel_6` (creado previamente en el equipo) |
| ADB serial | `emulator-5554` (estado `device`) |
| Model device | `sdk_gphone16k_x86_64` |
| Versión de Android | 17 |
| Ruta del SDK Android | `C:\Users\valet\AppData\Local\Android\Sdk` |
| Runtime app | **Expo Go** (`host.exp.exponent`, ya instalado en el emulador) |
| Modo de carga | Dev client (Metro Bundler vía `npx expo start`, deep link `exp://10.0.2.2:8081`) |

No se pudo usar dispositivo físico (ninguno conectado; `adb devices` solo
muestra el emulador). El AVD `Pixel_6` es compatible con Android 17 + RN 0.86.

## 4. Configuración de conexión al backend

Fuente: `movil/constants/api.ts` + `movil/.env` (creado por este QA siguiendo
`movil/.env.example`; archivo nuevo, no modificaba cargas previas).

| Ítem | Valor |
|---|---|
| `EXPO_PUBLIC_API_URL` | `http://10.0.2.2:8000` (10.0.2.2 = localhost del host desde el emulador) |
| Prefijo agregado por la app | `/api/v1` (`API_BASE_URL`) |
| Transporte | `fetch` con `Authorization: Bearer`, timeout 15 s, refresh de token en 401 (ver `movil/services/api.ts`) |

## 5. Servicios del backend (Docker Compose)

| Contenedor | Puerto | Estado durante pruebas |
|---|---|---|
| `neodomus_api` | 8000 | UP (FastAPI). `GET /docs` devuelve 200 |
| `neodomus_mysql` | 3307 (host) | UP (healthy). BD `neodomus` |
| `neodomus_minio` | 9000/9001 | UP |
| `neodomus_frontend` | 5173 | UP (Vite). Usada para comparación web |
| `neodomus_caddy` | 80/443 | UP |

Migraciones aplicadas en el arranque de esta sesión: `alembic` hasta la
revisión `0062`. Seed艰苦 exitoso en arranque: `Usuarios creados: 4`.

> Registro de incidente ambiental: el 2026-11-10 Docker Desktop se detuvo
> durante la sesión y el volumen de datos del stack actual no estaba
> (`neodomus_main_mysql_data` no aparecía). El stack fue reconstituido con
> `docker compose up -d` (migraciones + seed incluidos). No hay datos de
> producción: la BD es de desarrollo con contenido sintético (ver
> `scripts/init_db.sql` y migraciones 0001/0003).

## 6. Estado de Git en comienzo/cierre de sesión

```
git status: nothing to commit, working tree clean
git branch: main
HEAD: 359890a fix(security & scripts): solucionado PEN-06, portabilidad de crear_admin.py y runbook de seguridad
```

Archivos generados por este QA (todos nuevos, ninguno de terceros modificado):
- `movil/.env` (copia configurada de `movil/.env.example`; no se versiona porque está en `.gitignore`)
- `docs/qa/PEN-07/**` (documentación y evidencias de esta validación)

## 7. Cuentas de prueba usadas (creadas por el seed del propio repo)

Origen: `scripts/seed_test_users.py` ejecutado por el arranque del contenedor.
Patrón real de contraseña: `12345678` + Inicial del nombre en Mayúscula +
Inicial del apellido en minúscula + `.` (verificado en código, líneas 78-89;
la documentación `scripts/README.md` tenía una errata con un dígito de más,
corregida en esta sesión: PEN07-DEF-001).

| Correo | Nombre | Rol efectivo en login |
|---|---|---|
| `prueba.cliente@neodomus.com` | Prueba Cliente | client / cliente |
| `cliente.demo@neodomus.com` | Carolina Mendez | client / cliente |
| `tecnico@neodomus.com` | Tecnico Prueba | employee / tecnico |
| `admin@neodomus.com` | Admin Neodomus | employee / administrador |

`POST /api/v1/auth/login` respondió para las 4 cuentas con `user_type` y `rol`
correctos (ver evidencias).

## 8. Incidencias y decisiones del entorno (cronología real)

| # | Incidente | Causa | Resolución aplicada | Referencia |
|---|---|---|---|---|
| 1 | Metro no arranca (`ENOENT …/shared`) | carpeta planeada ausente | `shared/.gitkeep` creado | DEF-002 |
| 2 | Expo Go del AVD incompatible ("Project is incompatible") | Expo Go 54.0.8 vs SDK 57 | Expo Go 57.0.9 instalada (URL oficial `expo.dev/go`) | DEF-003 |
| 3 | `UnableToResolveError expo-modules-core` | pnpm no publicaba transitivos de Expo en la raíz | config `publicHoistPattern: ["*expo*"]` en `movil/pnpm-workspace.yaml` + `public-hoist-pattern[]=*expo*` en `.npmrc` | DEF-004 |
| 4 | `pnpm install --force` sobrescribió `package.json`/`pnpm-lock.yaml` (SDK 58 involuntario) | interacción del modo forzado con config nueva | restauración desde git y reinstalación con lockfile correcto | (registrado; restaurado) |
| 5 | Store pnpm corrupto ("Packages in the store have been mutated") | mutaciones previas del store | store v11 eliminado + instalación limpia (814 paquetes) | DEF-008 |
| 6 | Docker Engine detenido (contenedores Exited 137, volumen ausente) | caída del daemon en sesión | `docker compose up -d` (migraciones + seed) ×2 | DEF-007 |
| 7 | Dev server solo escuchaba en `::1` tras crashs | binding Metro inestable | canal estable: `adb reverse tcp:18082 tcp:18082` + deep link `exp://localhost:18082` | (config. probada en la sesión) |
| 8 | ANR repetido de Expo Go en la fase final | saturación del emulador x86_64 (bundle + Metro + Docker) | rol técnico UI marcado BLOQUEADO; verificado por API | `pruebas-tecnico.md` |

Estado final de ejecución para reproducir (recomendado por este QA):

```sh
# 1) backend
docker compose up -d
# 2) móvil
cd movil && pnpm install --frozen-lockfile
npx expo start --port 18082
# 3) emulador (en otra consola)
adb reverse tcp:18082 tcp:18082
adb shell am start -a android.intent.action.VIEW -d "exp://localhost:18082"
```
