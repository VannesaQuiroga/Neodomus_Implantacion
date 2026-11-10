# PEN-07 · Registro de defectos

Formato por defecto: código, título, rol/plataforma afectada, prioridad, pasos,
esperado/obtenido, evidencia, archivo, causa raíz y estado.

## Clasificación por estado (resumen de la auditoría final)

| Estado | Defectos | Significado |
|---|---|---|
| **Corregido** | DEF-001, DEF-002, DEF-008 | La corrección se aplicó y se verificó en la sesión |
| **Resuelto (entorno)** | DEF-007 | Incidente ambiental resuelto en la sesión (sin cambio de repo) |
| **Contorneado** | DEF-003, DEF-004, DEF-006 | Solución aplicada y funcional durante la sesión; pendiente de validación en corrida limpia o de corrección permanente por el equipo |
| **Pendiente** | DEF-005, DEF-009, DEF-010, DEF-011 | Documentado con propuesta; sin corrección (fuera del alcance de PEN-07) |

Total: 11 defectos · 4 corregidos/resueltos · 3 contorneados · 4 pendientes.

---

## PEN07-DEF-001 — Documentación con patrón de contraseña de cuentas de prueba erróneo

| Campo | Valor |
|---|---|
| Tipo | Configuración / documentación |
| Rol afectado | Todos (cliente, técnico, administrador) |
| Plataforma | Web y móvil (cualquier plataforma que use cuentas de prueba) |
| Prioridad | MEDIA |
| Estado | **Corregido (errata puntual, revisada)** |
| Verificado | 2026-11-10 |

- **Descripción**: `scripts/README.md` documenta el patrón de contraseñas del
  seed como `123345678 + iniciales + .` (9 dígitos). El código real
  (`scripts/seed_test_users.py`, líneas 78-89) y el comportamiento del backend
  usan `12345678 + iniciales + .` (8 dígitos). Con el patrón documentado el
  login devuelve 401 en todas las cuentas.
- **Pasos**: `POST /api/v1/auth/login` con `{"email":"prueba.cliente@neodomus.com","password":"123345678Pc."}` → 401. Con `12345678Pc.` → 200.
- **Esperado**: login OK con el patrón documentado.
- **Obtenido**: 401 con el patrón documentado.
- **Evidencia**: salida de terminal en `evidencias/api_login_prueba_cuentas.md`.
- **Archivo**: `scripts/README.md` (tabla "Usuarios de prueba").
- **Causa raíz**: errata en la documentación al escribir el prefijo del patrón.
- **Solución aplicada**: corrección mínima de la errata en `scripts/README.md`
  (única palabra afectada; revisada por el equipo en la sección 1 del ticket).
- **Prueba posterior**: login de las 4 cuentas con la nueva documentación = OK.

---

## PEN07-DEF-002 — Metro no arranca: carpeta `shared` referenciada no existe

| Campo | Valor |
|---|---|
| Tipo | Configuración (bloqueante para ejecutar la app móvil) |
| Rol afectado | Desarrollo/QA en todas las plataformas móviles |
| Plataforma | Móvil (Expo dev server) |
| Prioridad | ALTA |
| Estado | **Corregido (solución no destructiva)** |
| Verificado | 2026-11-10 |

- **Descripción**: `movil/metro.config.js` añade como `watchFolders` la ruta
  `../shared`, que no existe en el repositorio (nunca existió: `git log --all
  -- shared` vacío, y ningún archivo la importa). Metro aborta el arranque con
  `Error: ENOENT ... stat 'C:\Users\valet\neodomus_main\shared'`, impidiendo
  ejecutar la app en desarrollo.
- **Pasos**: 1) `cd movil && npx expo start`; 2) Metro muestra el ENOENT y
  termina.
- **Esperado**: Metro arranca y sirve el bundle.
- **Obtenido**: fallo del transformer por ruta inexistente.
- **Evidencia**: `evidencias/metro_error_shared.txt`.
- **Archivo**: `movil/metro.config.js` (línea 5), directorio faltante
  `shared/`.
- **Causa raíz**: configuración preparada para code-sharing con una carpeta
  planeada que nunca se creó/agregó al repositorio.
- **Solución aplicada**: creación de `shared/.gitkeep` (archivo nuevo
  comentado). No modifica el código ni la arquitectura.
- **Prueba posterior**: Metro arranca y sirve el bundle completo en el
  emulador (1948 módulos, ver `evidencias/metro_bundled_ok.txt`).

---

## PEN07-DEF-003 — Expo Go del emulador desactualizada para SDK 57

| Campo | Valor |
|---|---|
| Tipo | Configuración (entorno de ejecución) |
| Rol afectado | Todos |
| Plataforma | Móvil (Android Emulator + Expo Go) |
| Prioridad | ALTA |
| Estado | **Contorneado (actualización del runtime aprobada por docs oficiales)** |
| Verificado | 2026-11-10 |

- **Descripción**: la app no abre en Expo Go: muestra "Project is incompatible
  with this version of Expo Go / This project requires a newer version of Expo
  Go". El emulador tenía Expo Go **54.0.8**; el proyecto declara Expo SDK 57.
- **Pasos**: abrir la app con deep link `exp://10.0.2.2:18081` en Expo Go 54 →
  ErrorActivity.
- **Esperado**: la experiencia carga.
- **Obtenido**: pantalla de incompatibilidad.
- **Evidencia**: `evidencias/ev01_error_expo_go.png` y `evidencias/expo_go_mismatch_text.md`.
- **Archivo**: sin cambio en el proyecto (restricción: no actualizar SDK).
- **Causa raíz**: cada build de Expo Go soporta un único SDK (policy de Expo);
  la instalada (54) no coincide con el SDK del proyecto (57).
- **Solución**: instalar Expo Go **57.0.9** (la publicación oficial para SDK
  57, fuente: página `expo.dev/go`) en el emulador. La app del proyecto NO se
  modificó (no subir SDK a 58: fuera del alcance y rompería la base).
- **Prueba posterior**: el bundle compila en Expo Go 57.0.9 (evidencia en
  `evidencias/metro_bundled_ok.txt` y capturas de las pantallas cargadas).

---

## PEN07-DEF-004 — Resolución de `expo-modules-core` falla con node_modules pnpm parcial (bloqueante)

| Campo | Valor |
|---|---|
| Tipo | Configuración/dependencias (bloqueante para ejecutar la app) |
| Rol afectado | Todos (la app no carga pantallas) |
| Plataforma | Móvil |
| Prioridad | ALTA |
| Estado | **En corrección aplicada — verificación pendiente en la ejecución de recorridos** |
| Verificado | 2026-11-10 |

- **Descripción**: con Expo Go 57 la app muestra en la UI el error de Metro:
  `UnableToResolveError: Unable to resolve module expo-modules-core from
  .../expo-asset/build/PlatformUtils.js`. El `node_modules` instalado con
  `pnpm` no exponía `expo-modules-core` en el nivel accesible al resolver de
  Metro (el paquete está en `.pnpm` pero no junction en la raíz).
- **Pasos**: 1) abrir la app en el emulador; 2) el LogBox muestra el error.
- **Esperado**: la app carga pantallas sin errores de módulos.
- **Obtenido**: error de resolución bloqueante; el estado se observó en pantalla (LogBox) y en el log del dev server. Nota honesta: no se capturó PNG de ese estado (la captura de ese momento no se realizó); la prueba documental es el log real.
- **Evidencia**: texto exacto del log en `evidencias/metro_unabletoresolve.txt` (transcripción real de la sesión).
- **Archivo**: `movil/.npmrc` (config de instalación pnpm).
- **Causa raíz**: layout pnpm con `node-linker=hoisted` parcial: pnpm no hoizta
  dependencias transitivas de cliente (como `expo-modules-core`, peer de
  `expo`) al nivel que Metro consulta cuando los módulos se anidaron bajo
  `node_modules/.pnpm/...`.
- **Solución aplicada**: añadir `shamefully-hoist=true` a `movil/.npmrc` y
  reinstalar dependencias (`pnpm install --frozen-lockfile`) — hace hoising
  completo de cada paquete (deps transitivas incluidas) al `node_modules`
  raíz, sin alterar el lockfile.
- **Prueba posterior**: re-ejecución de la app en el emulador; si carga sin el
  LogBox de módulo, se cierra la corrección. Se registra el estado real en
  `resultados-regresion.md`.

---

## PEN07-DEF-005 — Lint móvil: 27 errores y 43 advertencias ESLint (deuda técnica)

| Campo | Valor |
|---|---|
| Tipo | Calidad de código (no bloqueante) |
| Rol afectado | Desarrollo |
| Plataforma | Móvil |
| Prioridad | BAJA (no afecta ejecución de recorridos) |
| Estado | **Documentado — no corregido (fuera del alcance de PEN-07: "no refactorizaciones generales")** |
| Verificado | 2026-11-10 |

- **Descripción**: `pnpm lint` reporta 70 problemas: 27 errores
  (`react-hooks/purity`, `react-hooks/set-state-in-effect`, reglas core) y 43
  warnings (`no-unused-vars` etc.). Ejemplos: `PantallaCitas.tsx:314` (uso de
  `Date.now()` durante render), `Filtros.tsx:178` (setState en effect).
  En la auditoría final, ejecutando ESLint directamente (`eslint .`, misma
  configuración flat, resolución sin wrapper de Expo), el conteo es **76
  problemas: 29 errores y 47 warnings**; ambas corridas son reales y la
  diferencia se debe a la resolución de configuración del wrapper (`expo lint`)
  frente al binario directo.
- **Prioridad**: baja operativa, media técnica (patrones React que el nuevo
  linter marcó).
- **Evidencia**: salidas reales en `evidencias/lint_movil_out.txt`
  (corrida de auditoría con `eslint .`) y `evidencias/typecheck_movil_out.txt`
  (typecheck exit 0, como contraste).
- **Recomendación**: tratar en un ticket dedicado (no requisito de PEN-07).
- **Prueba posterior**: N/A.

---

## PEN07-DEF-006 — Seed de cuentas de prueba no crea ficha de técnico (flujo técnico vacío)

| Campo | Valor |
|---|---|
| Tipo | Funcionalidad faltante (datos seed) |
| Rol afectado | Técnico |
| Plataforma | Todas (móvil y web usan los mismos endpoints) |
| Prioridad | MEDIA |
| Estado | **Contorneado (ficha creada manualmente en BD de desarrollo para poder probar; corrección del seed pendiente de autorización)** |
| Verificado | 2026-11-10 |

- **Descripción**: `scripts/seed_test_users.py` crea la cuenta `tecnico@neodomus.com` (tabla `usuarios`, rol técnico) pero **no** inserta la fila correspondiente en la tabla `tecnicos` (ficha con `id_usuario_t`). Los endpoints del técnico (`/tecnicos/mis-citas`, `/tecnicos/mis-entregas`, …) exigen ficha (`_ficha_tecnico_actual`, `be/app/routers/tecnicos.py:431`): sin ella el rol no puede operar su flujo aunque la autenticación sea correcta.
- **Pasos**: login técnico OK → `GET /tecnicos/mis-citas` → el endpoint devolvía lista vacía porque el técnico no tenía ficha asociada (en BD reconstruida).
- **Esperado**: ficha técnica creada por el seed junto a la cuenta.
- **Obtenido**: ficha ausente; el técnico no aparece en el ecosistema de asignación.
- **Archivo**: `scripts/seed_test_users.py` (crea usuario, no ficha) vs `be/app/routers/tecnicos.py:431-443`.
- **Causa raíz**: el seed original asumía fichas creadas por datos previos (`init_db.sql`/BD del equipo); al reconstruir la BD de desarrollo desde migraciones, las fichas técnicas reales (emails personales del equipo) sí se crearon por migración `0062`, pero la de prueba no.
- **Solución aplicada (contorno)**: `INSERT INTO tecnicos (id_usuario_t, certificacion_t) SELECT 22, 'Instalacion…' WHERE NOT EXISTS (...)` en la BD **de desarrollo** (idempotente, no destructivo). Corrección permanente del seed queda como recomendación (requiere decisión del equipo).
- **Prueba posterior**: tras el contorno, `GET /tecnicos/mis-citas` con token técnico responde 200 (aún sin citas asignadas — la agenda la llena la operación real del admin).

---

## PEN07-DEF-007 — Falla transitoria del Docker Engine durante la sesión (registro ambiental)

| Campo | Valor |
|---|---|
| Tipo | Configuración / entorno |
| Rol afectado | Todos |
| Plataforma | Backend |
| Prioridad | MEDIA (ambiental) |
| Estado | **Resuelto durante la sesión (registro por trazabilidad)** |
| Verificado | 2026-11-10 |

- **Descripción**: Docker Desktop detuvo el engine dos veces (contenedores `Exited(137)`/SIGKILL: api, mysql, frontend, caddy, minio). Tras la primera caída además **desaparecieron** contenedores y el volumen del stack actual, dejando el entorno sin BD.
- **Efecto observado en la app móvil**: catálogo muestra pantalla "Algo salió mal" con botón **Reintentar** (comportamiento correcto de la app; evidencia ev05).
- **Solución aplicada**: `docker compose up -d` (volumen nuevo + migraciones 0001→0062 + seed 4 usuarios idempotentes). Segunda caída resuelta igual.
- **Prueba posterior**: backend 200; catálogo 10 productos; el rol cliente completó su recorrido tras la recuperación.

---

## PEN07-DEF-008 — Store de pnpm corrupto impide instalar la app móvil (bloqueante de entorno)

| Campo | Valor |
|---|---|
| Tipo | Configuración / dependencias |
| Rol afectado | Desarrollo/QA móvil |
| Plataforma | Móvil |
| Prioridad | ALTA |
| Estado | **Corregido (limpieza del store + reinstalación)** |
| Verificado | 2026-11-10 |

- **Descripción**: `pnpm install` fallaba de forma determinista con `ENOENT` leyendo `package.json` de un paquete dentro del store virtual. `pnpm store status` reportó **"Packages in the store have been mutated"** (store global corrompido: `C:\Users\valet\AppData\Local\pnpm\store\v11`).
- **Evidencia**: `pnpm store status` (lista de paquetes mutados), errores de instalación.
- **Solución aplicada**: eliminación del store v11 (solo caché re-descargable) + `pnpm install --frozen-lockfile` limpio → instalación completa (814 paquetes, `expo 57.0.22`).
- **Prueba posterior**: `tsc --noEmit` exit 0; bundle compila y corre en el emulador.

---

## PEN07-DEF-009 — Doble llamada al compartir la factura tras el pago (móvil)

| Campo | Valor |
|---|---|
| Tipo | Funcional / integración (menor) |
| Rol afectado | Cliente |
| Plataforma | Móvil |
| Prioridad | BAJA |
| Estado | **Documentado — no corregido (fuera de alcance; corrección propuesta en el código de checkout)** |
| Verificado | 2026-11-10 |

- **Descripción**: tras el pago exitoso, la app descarga la factura PDF (correcto) e invoca el share nativo; el log muestra una **segunda** descarga y el error `ExpoSharing.shareAsync … Another share request is being processed now.`
- **Log (Metro)**:
  `[checkout] Descargando PDF /api/v1/pedidos/11/factura` ×2
  `[factura] download status=200 … Archivo OK size=24959`
  `[checkout] Error descargando PDF [Error: Call to function 'ExpoSharing.shareAsync' has been rejected. → Caused by: Another share request is being processed now.]`
- **Impacto**: el primer share funciona (evidencia ev16); el segundo falla de forma silenciosa. Riesgo: UX inconsistente y doble consumo del endpoint de factura.
- **Archivo probable**: `movil/app/(tabs)/checkout.tsx` (efecto de compartición disparado dos veces; revisar dependencias del `useEffect`/estado).
- **Solución recomendada**: deduplicar la compartición (flag/ref `compartiendoRef` + dependencias correctas del efecto), o compartición iniciada explícitamente por acción del usuario.
- **Estado**: pendiente de corrección por el equipo (no se toca código de la app en PEN-07).

---

## PEN07-DEF-010 — Warning de `expo-blur` en cada modal (`dimezisBlurView` sin `blurTarget`)

| Campo | Valor |
|---|---|
| Tipo | Visual/calidad |
| Rol afectado | Todos (modales login/registro/citas) |
| Plataforma | Móvil |
| Prioridad | BAJA |
| Estado | **Documentado** |
| Verificado | 2026-11-10 |

- **Descripción**: en cada apertura de modal, la app imprime y muestra (LogBox/toast) el warning: `You have selected the "dimezisBlurView" blur method, but the blurTarget prop has not been configured. The blur view will fallback to "none"…`. La API de `BlurView` cambió en SDK 57 y la app usa la variante antigua.
- **Impacto**: el blur no se aplica (fallback "none"); ruido de QA; la UI funciona.
- **Evidencia**: capturas ev10/ev11 (toast inferior), call stack `expo-blur/build/BlurView.js`.
- **Solución recomendada**: configurar `blurTarget` en los modales o simplificar a `experimentalBlurMethod`/fondo opaco; línea/componente: modales que usan `BlurView` en `app/login.tsx` y similares.
- **Estado**: pendiente (fuera de alcance PEN-07).

---

## PEN07-DEF-011 — Deep link interno de perfil inestable en dev (`--/(tabs)/perfil`)

| Campo | Valor |
|---|---|
| Tipo | Navegación (solo desarrollo/deep link) |
| Rol afectado | QA/desarrollo |
| Plataforma | Móvil |
| Prioridad | BAJA |
| Estado | **Documentado** (el flujo real por UI funciona: el perfil se abrió correctamente en pantalla; ver ev34) |
| Verificado | 2026-11-10 |

- **Descripción**: al navegar con deep link `exp://…/--/(tabs)/perfil`, en un reintento el router mostró "Unmatched Route" (codificación `%28tabs%29`), y en otro contexto abrió una pantalla de detalle de producto en lugar del perfil. La navegación por UI real (menú de usuario → Mi perfil) funcionó correctamente.
- **Solución recomendada**: agregar regla de deep link explícita para `/perfil` (alias sin paréntesis) en la configuración de Expo Router o redirigir en `+not-found.tsx`.
- **Estado**: documentado; no es bloqueante del flujo normal de la app.

---

## Cobertura (auditoría final 2026-11-10)

Defectos registrados: **11** (001–011). Clasificación coherente con el encabezado
de este documento:

| Estado | Defectos |
|---|---|
| Corregido | 001 (errata documental), 002 (carpeta `shared`), 008 (store pnpm) |
| Resuelto (entorno) | 007 (Docker Engine) |
| Contorneado | 003 (Expo Go 57.0.9), 004 (config pnpm — validación final pendiente), 006 (ficha técnica — corrección del seed recomendada) |
| Pendiente | 005 (lint), 009 (doble share), 010 (blur), 011 (deep link) |

Nota de auditoría: la referencia anterior a `evidencias/ev02_app_error_modulo.png`
(foto que nunca fue capturada) fue corregida: la evidencia de DEF-004 es el log
real `evidencias/metro_unabletoresolve.txt`. Todas las evidencias citadas en
este documento existen y están indexadas en `evidencias/INDEX.md`.
