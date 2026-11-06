# Testing de NeoDomus — Guía central

Carpeta **central** de documentación y ejecución de pruebas. Los tests reales
**no viven aquí**: permanecen donde ya están (`be/app/tests/`, `fe/src/`,
`fe/e2e/`) y estos scripts solo los **orquestan** de forma uniforme para las
cuatro personas del equipo.

> Última actualización: 2026-11-06 (Bloques 3-4 — punto de entrada
> `tests\run_all_tests.ps1` con `-Setup`/`-IncludeE2E`, narrativa E2E en modo
> host aislado y workflow de CI `.github/workflows/tests.yml`). Basada en la
> auditoría completa (ver `INVENTARIO.md` y `docs/T0_linea_base_testing.md`,
> `docs/T1_identidad_permisos.md`, `docs/T2_consistencia_pago_pendiente.md`).

---

## 1. Arquitectura de testing

```
                    ┌──────────────────────────────────────────────────┐
                    │  tests/  (esta carpeta)                          │
                    │  ├── README.md / INVENTARIO.md                   │
                    │  └── run_*.ps1  → orquestadores para PowerShell  │
                    └───────────────┬──────────────────────────────────┘
                                    │
       ┌────────────────────────────┼─────────────────────────────┐
       ▼                            ▼                             ▼
BE (unittest)                FE (Vitest)                    E2E (Playwright)
be/app/tests/                fe/src/**/*.test.{ts,tsx}      fe/e2e/*.e2e.spec.ts
  │                            │                              │
  │ TEST_DATABASE_URL          │ mocks (vi.mock), jsdom       orquestadores Python
  │ ────────────► MySQL        │ NO tocan red real            │ scripts/e2e_*.py
  │      neodomus_test         │                              │ levantan API + Vite efímeros
  │ (+ TEST_MINIO_* opcional)  │                              │ → misma base de pruebas
  ▼                            ▼                              ▼
Correo/scheduler/pagos: neutralizados (testdb.py, DISABLE_SCHEDULER=1, simulador)
```

Principios de la infraestructura (heredados del proyecto, NO cambiarlos sin
autorización del equipo):

1. **Base de datos exclusiva de pruebas**: toda suite backend/E2E exige
   `TEST_DATABASE_URL` apuntando a `neodomus_test` y **rechaza** la base de
   desarrollo (`neodomus`). El guard vive en `be/app/tests/testdb.py`.
2. **Cero efectos externos**: correos (SMTP/Resend/Gmail API), scheduler
   (APScheduler) y pagos (simulador local) quedan neutralizados durante las
   pruebas. MinIO solo se usa si configuras buckets **de pruebas**.
3. **Idempotencia**: cada prueba crea sus propias fixtures y las limpia
   (`tearDown`/`tearDownClass`); los conteos de la BD de pruebas son estables
   entre ejecuciones (verificado en T0/T0.1).

## 2. Tipos de pruebas

| Tipo | Qué valida | Ejemplos reales |
|---|---|---|
| **Unitarias** | Funciones/módulos aislados, sin BD ni red | `be/app/tests/test_precio_service.py`, `test_factura_pdf_logo.py`, `fe/src/utils/metros.test.ts` |
| **Integración** | Servicios/routers reales sobre BD de pruebas (HTTP via cliente ASGI) | `be/app/tests/test_t1_identidad.py`, `test_checkout_metros_http.py` |
| **Integración de UI (componentes/páginas)** | Hooks/contexts/componentes React con red mockeada | `fe/src/contexts/CartContext.test.tsx`, `fe/src/pages/public/CarritoPage.test.tsx` |
| **E2E** | Recorridos completos usuario (navegador real Chromium) contra API+FE reales | `fe/e2e/cart-checkout.e2e.spec.ts` (+ orquestador `scripts/e2e_cart_checkout.py`) |

## 3. Herramientas utilizadas

| Capa | Tecnología | Runner/config |
|---|---|---|
| Backend | `unittest` (Python) + `httpx` (cliente ASGI) + `coverage` + `pymupdf` | `python -m unittest discover -s app/tests -p "test_*.py"` · `.coveragerc` |
| Frontend unit | Vitest 2 + Testing Library + jsdom | `fe/vitest.config.ts` · `pnpm test` |
| E2E | Playwright 1.48 (Chromium, headless) | `fe/playwright.config.ts` |
| E2E orquestación | Scripts Python | `scripts/e2e_*.py` |
| Infraestructura | Docker Compose (MySQL 8.0, MinIO, API, web) | `docker-compose.yml` |
| Infra de PRUEBAS | MinIO/MySQL dedicados (Bloques 1-2) | `docker-compose.test.yml` · `tests\setup_test_db.ps1` · `tests\setup_minio_test.ps1` |
| Gestor backend | `uv` (contenedor) / `pip` host | `be/pyproject.toml` |

## 4. Ubicación de los tests

| Suite | Carpeta | Nota |
|---|---|---|
| Backend | `be/app/tests/test_*.py` (23 módulos + `testdb.py` = infra de aislamiento, no un test) | unittest ya los descubre por patrón `test_*.py` |
| Frontend unit | `fe/src/**/*.{test,spec}.{ts,tsx}` | colocados junto al código que prueban (convención Vitest) |
| E2E | `fe/e2e/*.e2e.spec.ts` | `testDir` de `playwright.config.ts` |
| Orquestadores E2E | `scripts/e2e_*.py` | exigen `TEST_DATABASE_URL`, levantan servidores efímeros y validan la BD |
| Actas/documentación | `docs/T0_*`, `docs/T1_*`, `docs/T2_*` | registro de lo certificado por bloque |

## 5. Requisitos previos

> Esta lista es lo que necesita un compañero que acabe de clonar el
> repositorio. Los scripts VALIDAN cada requisito y abortan (código 2)
> explicando qué falta; **nunca instalan** nada por su cuenta.

### 5.1 Requisitos del punto de entrada principal (`tests\run_all_tests.ps1`)

| # | Requisito | Cómo se consigue | ¿Quién lo comprueba? |
|---|---|---|---|
| 1 | Docker Desktop arrancado | Abrir Docker Desktop (manual) | run_all_tests ([1]) |
| 2 | `TEST_DATABASE_URL` de la base de **pruebas** | Definir por sesión (§7; con la infra dedicada: host `neodomus_mysql_test`) | run_all_tests ([2]) |
| 3 | Imagen de pruebas `neodomus_tests_tmp` (una vez por máquina) | `docker build -t neodomus_tests_tmp be` (Dockerfile del backend; ~1-7 min) | run_all_tests ([4]) |
| 4 | Red `neodomus_tests_net` + MySQL/MinIO de **pruebas** | `tests\run_all_tests.ps1 -Setup` (idempotente), o los setups individuales §7/§8 | run_all_tests ([3]/[4]) |
| 5 | Credenciales del MinIO de pruebas (SOLO para `-Setup`) | `$env:MINIO_TEST_ROOT_USER` / `$env:MINIO_TEST_ROOT_PASSWORD` via env; **sin valores por defecto**, nunca en archivos | `setup_minio_test.ps1` |
| 6 | `TEST_MINIO_*` (las 6, §8) | Con `-Setup` se **derivan solas**; si no, fijarlas a mano con lo que imprime `setup_minio_test.ps1` | run_all_tests ([4]) |
| 7 | Node.js + pnpm + `fe/node_modules` | Node 22+ (+ `corepack enable`); `cd fe; pnpm install` | `run_frontend_tests.ps1` |

### 5.2 Backend — modo contenedor efímero (por defecto en `run_all_tests.ps1`)

- El backend NO corre con el Python del host: `run_all_tests.ps1` lanza la
  suite dentro de un contenedor **efímero** construido con la imagen de
  pruebas `neodomus_tests_tmp` (la app + dependencias que produce
  `be/Dockerfile`), conectado a `neodomus_tests_net` junto al MySQL/MinIO de
  pruebas, con el código del repo montado en **solo-lectura**.
- Por cada corrida el contenedor efímero añade al venv `httpx==0.28.1` y
  `pymupdf==1.28.2` con `uv` (la imagen no los trae y el contenedor se
  autodestruye con `--rm`, por lo que **cada corrida necesita acceso a PyPI**;
  el venv del contenedor es efímero también).
- **Cobertura no soportada en este modo**: `-Coverage/-Html/-Xml` exigen el
  modo heredado `-InDocker` (se aborta en el preflight con código 2 y
  explicación, antes de correr nada).
- Alternativa (modo heredado `-InDocker`): corre dentro del contenedor `api`
  del stack de desarrollo vía `uv`; solo aplica si tu stack dev comparte red
  con el MySQL de pruebas. Con la infra dedicada de pruebas NO es aplicable.

### 5.3 E2E (opcional, `-IncludeE2E`)

La suite E2E delega en `tests\run_e2e_tests.ps1 -All` (orquestadores
`scripts/e2e_*.py`), que valida SUS requisitos ANTES de ejecutar. En un
equipo concreto solo funcionará si:

- El **Python del host** tiene las dependencias del proyecto (`fastapi`,
  `sqlalchemy`, `pymysql`, `minio`, `apscheduler`, `tzdata`, `pymupdf`,
  `httpx`, … lista completa impresa por el script; no se instalan solas).
- El **MySQL de pruebas es alcanzable por TCP desde el host** (los
  orquestadores corren en el host). Con la configuración actual de la
  infraestructura de pruebas, `neodomus_mysql_test` está **solo en la red
  interna** (sin puertos publicados), por lo que en este equipo la suite E2E
  queda **bloqueada** y lo reporta con su causa (código 2). Para usarla,
  la base de pruebas de esa máquina ha de estar publicada al host (p. ej.
  `localhost:3307` estilo modo host) SIN tocar el compose de desarrollo.
- `fe/node_modules` y navegadores: `cd fe; npx playwright install chromium`
  (descarga de navegador; requiere autorización previa del equipo).

### 5.4 Modo host del runner individual de backend (histórico)

`tests\run_backend_tests.ps1` sin `-InDocker` usa el Python local: solo
funciona en manos de quien tenga instaladas las dependencias de `be/` y un
MySQL de pruebas publicado al host (`localhost:3307`). Si faltan paquetes el
script lo lista con `pip list` (solo lectura) y sale con código 2.

## 6. Comandos de ejecución

> Forma completa (siempre funciona, respeta ExecutionPolicy):
> `powershell -NoProfile -ExecutionPolicy Bypass -File tests\<script>.ps1 [parámetros]`
> Si tu política lo permite, también puedes ejecutarlos directamente con
> `.\tests\<script>.ps1` desde la raíz del repo.

**Backend (unittest):**
```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tests\run_backend_tests.ps1              # suite completa (host)
powershell ... tests\run_backend_tests.ps1 -Module test_auth                                 # un módulo
powershell ... tests\run_backend_tests.ps1 -Module test_bloque_2.CapacidadTestCase           # (unittest acepta módulo o módulo.Clase)
powershell ... tests\run_backend_tests.ps1 -InDocker                                         # dentro del contenedor api (vía uv)
powershell ... tests\run_backend_tests.ps1 -Coverage                                         # + cobertura líneas/ramas
powershell ... tests\run_backend_tests.ps1 -Coverage -Html -Xml                              # + reportes be/htmlcov y be/coverage.xml
```
> Nota: `-v` es el modo detallado de unittest; el script `-Module` ya lo aplica internamente.

**Frontend (Vitest):**
```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tests\run_frontend_tests.ps1             # pnpm test (vitest run)
powershell ... tests\run_frontend_tests.ps1 -File src/utils/metros.test.ts                   # una prueba/archivo
powershell ... tests\run_frontend_tests.ps1 -Coverage                                        # requiere @vitest/coverage-v8 instalado
```

**E2E (Playwright vía orquestadores):**
```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tests\run_e2e_tests.ps1 -List            # ver flujos disponibles
powershell ... -Name cart-checkout                                                           # un flujo
powershell ... -Name register,session                                                        # varios
powershell ... -All                                                                          # los 6 con orquestador
```

**Suite completa — punto de entrada principal (`tests\run_all_tests.ps1`):**
```powershell
powershell ... tests\run_all_tests.ps1                 # backend + frontend (infra ya preparada)
powershell ... tests\run_all_tests.ps1 -Setup          # prepara ANTES MySQL y MinIO de pruebas (idempotente)
powershell ... tests\run_all_tests.ps1 -IncludeE2E     # añade la suite E2E (valida sus requisitos antes de correrla)
powershell ... tests\run_all_tests.ps1 -Setup -IncludeE2E -Continue
```

| Parámetro | Efecto |
|---|---|
| (ninguno) | Solo corre suites; **no crea/modifica/levanta infraestructura** (comprobaciones de solo lectura; aborta con código 2 si la config está incompleta) |
| `-Setup` | Prepara infra de PRUEBAS antes de correr: [S1] bootstrap MySQL (`setup_test_db.ps1`) → [S2] MinIO de pruebas (`setup_minio_test.ps1`, exige `MINIO_TEST_ROOT_USER/PASSWORD` por env) → [S3] comprueba ambas → si algo falla **detiene y no corre suites**; al terminar deriva `TEST_MINIO_*` si faltaban (secretos solo desde env) |
| `-IncludeE2E` | Añade la suite E2E delegada en `run_e2e_tests.ps1 -All`; sus requisitos se validan antes de ejecutar y un bloqueo se reporta con su causa |
| `-Continue` | No se detiene en el primer fallo; muestra el resumen de todas las suites |
| `-Coverage`/`-Html`/`-Xml` | Cobertura del backend: solo aplican en modo `-InDocker` (en el modo efímero abortan con código 2 y explicación) |
| `-InDocker` | Modo HEREDADO: backend dentro del contenedor `api` del stack dev (requiere que ese stack alcance al MySQL de pruebas) |
| `-DatabaseName` | Base de pruebas esperada (por defecto `neodomus_test`) |

Salida del `run_all_tests.ps1`: cabecera de configuración (sin secretos),
prevalidaciones numeradas, salida COMPLETA de cada suite (nada se oculta), y
una **tabla resumen** por suite con duración, totales, aprobadas, fallidas y
omitidas cuando se pueden extraer de forma fiable (unittest y vitest; en E2E
el detalle por flujo lo imprime su runner propio). Código de salida global:
`0` = todo OK · primer código ≠ 0 de una suite (normalmente `1` = pruebas
fallidas) · `2` = requisitos/configuración insuficientes. Los logs del
backend efímero quedan en `%TEMP%\neodomus_tests_logs\run_*\be_err.log` y
`be_out.log` (nunca dentro del repo).

**Una sola prueba en cualquier capa (`tests\run_one.ps1`):**
```powershell
powershell ... tests\run_one.ps1 -Backend test_auth    # una prueba de backend (modulo, modulo.Clase o modulo.Clase.Metodo)
powershell ... tests\run_one.ps1 -Frontend src/utils/metros.test.ts
powershell ... tests\run_one.ps1 -E2E cart-checkout
```

**Códigos de salida:** `0` = OK · `1` = pruebas fallidas · `2` = requisitos no
cumplidos/uso incorrecto (mensaje explica qué falta).

## 7. Configuración de la base de pruebas

Variables por sesión (los scripts **no** persisten nada ni tocan `.env`):

```powershell
$env:TEST_DATABASE_URL = "mysql+pymysql://neodomus:<password>@localhost:3307/neodomus_test?charset=utf8mb4"   # modo HOST (Docker publica MySQL en 3307)
# o, dentro del contenedor (host 'db' y puerto interno 3306):
$env:TEST_DATABASE_URL = "mysql+pymysql://neodomus:<password>@db:3306/neodomus_test?charset=utf8mb4"          # modo -InDocker
```

> Con la infraestructura de pruebas dedicada (Bloques 1-2) el MySQL de pruebas
> `neodomus_mysql_test` vive en la red `neodomus_tests_net` **sin puertos
> publicados al host**: para `run_all_tests.ps1` (backend efímero) y para
> `-Setup` la URL correcta usa el **nombre del contenedor** como host:
> `mysql+pymysql://neodomus:<password>@neodomus_mysql_test:3306/neodomus_test?charset=utf8mb4`.
> Las variantes `localhost:3307` / `db:3306` de arriba SOLO aplican si tu
> máquina expone una MySQL de pruebas al host (runner `-InDocker` heredado o
> E2E) o si corresponden al contenedor del stack dev que actúa de MySQL de
> pruebas. Nunca apuntes a la base de desarrollo `neodomus` (guarda dura).

Reglas implementadas y garantizadas:
- La URL es **obligatoria**; sin ella el script aborta (código 2).
- El nombre de base debe ser exactamente `neodomus_test` (o el que pases con
  `-DatabaseName`); apuntar a `neodomus` (desarrollo) **está prohibido** y aborta.
- El script verifica conectividad TCP al host:puerto (modo host).
- Bootstrap automatizado (recomendado): `tests/setup_test_db.ps1` ejecuta lo
  anterior de forma **idempotente** (CREATE DATABASE/USER `IF NOT EXISTS` +
  GRANT solo sobre la base de la URL + Alembic hasta head + verificación
  `alembic_version`). Nunca emite DROP, no opera sobre `neodomus`, no toca
  `.env`, no instala dependencias y solo usa contenedores ya existentes o
  efímeros (`--rm`):
  ```powershell
  powershell -NoProfile -ExecutionPolicy Bypass -File tests\setup_test_db.ps1
  # Autodetección: SOLO elige contenedores inequívocamente de PRUEBAS (nombre
  # tipo 'neodomus*mysql*_test*' o MYSQL_DATABASE=neodomus_test*). Ante duda,
  # varios candidatos o ninguno: aborta y exige -MysqlContainer. NUNCA usa un
  # MySQL de desarrollo por autodetección, aunque sea el único disponible.
  # Opciones: -MysqlContainer <nombre>, -Network <red>, -MysqlRootPassword <pw>,
  #           -Image <imagen-con-app> (contenedor efímero con be/ montado del repo).
  ```
  Requiere `$env:TEST_DATABASE_URL` fijada. Códigos de salida: 0 = base lista
  en head, 1 = fallo durante la ejecución, 2 = requisitos no cumplidos.
- Alternativa manual consciente (mecanismo documentado en T0):
  ```powershell
  docker exec -i neodomus_mysql mysql -uroot -p"<MYSQL_ROOT_PASSWORD>" -e "CREATE DATABASE IF NOT EXISTS neodomus_test CHARACTER SET utf8mb4; GRANT ALL PRIVILEGES ON neodomus_test.* TO 'neodomus'@'%'; FLUSH PRIVILEGES;"
  docker compose exec -T -e DATABASE_URL="mysql+pymysql://neodomus:<password>@db:3306/neodomus_test?charset=utf8mb4" api uv run alembic upgrade head
  ```
- Verificación visual de la base correcta (read-only):
  ```powershell
  docker exec neodomus_mysql mysql -uneodomus -p"<password>" -e "SHOW DATABASES;"
  docker exec neodomus_mysql mysql -uneodomus -p"<password>" -e "SELECT SUM(1) FROM neodomus_test.citas;"
  ```
- `testdb.py` mantiene su doble guarda: error si falta `TEST_DATABASE_URL` o si
  coincide con la base de la aplicación (`DATABASE_URL`).

## 8. MySQL y MinIO

| Suite | MySQL | MinIO |
|---|---|---|
| Vitest (FE) | No | No |
| unittest general | **Sí** (`neodomus_test` migrada) | No (se neutraliza) |
| `test_t1_2_minio`, `test_foto_perfil_tecnico`, `test_t1_3_permisos` (parcial) | Sí | **Condicional**: exige MinIO de pruebas + 6 variables `TEST_MINIO_*`; sin ellas esas pruebas se omiten honestamente |
| E2E orquestados | Sí | No (salvo evidencias reales) |

MinIO de pruebas (Bloque 2, automatizado): infraestructura dedicada e
independiente del desarrollo. Levántala con `docker compose -f
docker-compose.test.yml up -d minio-test` o (recomendado) con
`tests\setup_minio_test.ps1` (comprueba Docker/puertos/nombres, espera el
healthcheck, crea los buckets e imprime las `TEST_MINIO_*`; idempotente).

- Contenedor **`neodomus_minio_test`** (imagen fija `coollabsio/minio:RELEASE.2025-10-15T17-29-55Z`,
  la misma release del proyecto; **sin `latest`**), puertos publicados **SOLO en
  127.0.0.1** (`127.0.0.1:9100:9000` y `127.0.0.1:9101:9001`; el desarrollo
  conserva 9000/9001), volumen **`neodomus_minio_test_data`** y red
  **`neodomus_tests_net`** (jamás `neodomus_net` ni datos de desarrollo).
- Credenciales EXCLUSIVAS de pruebas: **obligatorias via env del host y SIN
  valores por defecto** (ni en el compose ni en el script; si faltan,
  `setup_minio_test.ps1` aborta con exit 2 ANTES de crear/modificar nada y el
  compose directo falla con `${VAR:?}`): `MINIO_TEST_ROOT_USER` /
  `MINIO_TEST_ROOT_PASSWORD`. Nunca se imprimen (la salida las enmascara), no
  se reutilizan las de desarrollo (comparación en memoria contra el env de
  dev) y no hay secretos versionados.
- Conectividad por modo (los contenedores de la red de pruebas SIEMPRE usan el
  alias interno y el puerto interno, nunca el publicado):
  - Modo HOST: `TEST_MINIO_ENDPOINT=localhost:9100`,
    `TEST_MINIO_PUBLIC_ENDPOINT=http://localhost:9100`.
  - Modo CONTENEDOR (correr pruebas dentro de docker en `neodomus_tests_net`):
    `TEST_MINIO_ENDPOINT=neodomus-minio-test:9000` y
    `TEST_MINIO_PUBLIC_ENDPOINT=http://neodomus-minio-test:9000` (no usar
    `host.docker.internal`: al ser la publicación solo-localhost, la
    comunicación entre contenedores debe ir por la red interna).
  - `TEST_MINIO_ACCESS_KEY`/`TEST_MINIO_SECRET_KEY` = las mismas
    credenciales de `MINIO_TEST_ROOT_USER`/`MINIO_TEST_ROOT_PASSWORD`, tomadas
    de env; jamás en archivos versionados.
- Buckets creados y verificados por el script: **`neodomus-test-media`**
  (catálogo público de pruebas) y **`neodomus-test-private`** (evidencias
  privadas de pruebas). El script NUNCA borra buckets/datos; la política de
  lectura pública del bucket público la aplica `minio_service` en su primer
  uso, igual que en producción.
- Variables que esperan los tests (definidas por `testdb.py`):
  `TEST_MINIO_ENDPOINT`, `TEST_MINIO_ACCESS_KEY`, `TEST_MINIO_SECRET_KEY`,
  `TEST_MINIO_BUCKET`, `TEST_MINIO_PRIVATE_BUCKET`, `TEST_MINIO_PUBLIC_ENDPOINT`.
  Regla dura: los dos buckets deben contener la palabra `test` (una
  configuración apuntando a buckets reales se RECHAZA) y credenciales
  inválidas elevan error en lugar de omitir la prueba.
- `tests\run_all_tests.ps1 -Setup` **deriva automáticamente** las 6 variables
  `TEST_MINIO_*` que falten: endpoint y URL pública con el alias interno del
  contenedor MinIO de pruebas (`http://<alias>:9000`, leído del propio
  contenedor en la red de pruebas) y credenciales SIEMPRE desde
  `MINIO_TEST_ROOT_USER`/`MINIO_TEST_ROOT_PASSWORD` del env (nunca impresas,
  nunca con valores por defecto). Si ya tenías `TEST_MINIO_*`, se respetan y
  se avisa si no coinciden con las credenciales del setup.

## 9. Reportes y cómo interpretar resultados

| Suite | Salida | ¿Qué mirar? |
|---|---|---|
| unittest | consola `Ran N tests … OK` o `FAILED (failures=X, errors=Y)` + trazas | Última línea de cada traceback; `OK` = verde |
| Cobertura backend | `coverage report` en consola; con `-Html` → `be/htmlcov/index.html`; `-Xml` → `be/coverage.xml` (artefactos gitignored) | Comparar con la línea base T0 (37,29 % líneas / 10,65 % ramas). SOLO disponible en modo `-InDocker` y en los runners individuales; el modo contenedor efímero de `run_all_tests.ps1` NO emite cobertura |
| Vitest | `Test Files  23 passed (23)  ·  Tests  n passed` | Archivo afectado y caso fallido con diff de expectativas |
| Playwright (orquestador) | imprime salida del spec + `Playwright exit: N` + validación en BD (p. ej. pedido `Pagado`, sin duplicados) | `exit: 0` = flujo íntegro; falta = abrir `fe/test-results/` (trace/screenshot only-on-failure, gitignore) |
| Skips honestos | `skipped=N` en unittest (MinIO sin `TEST_MINIO_*`) | No cuenta como verde para esos casos: significa "no se ejecutó" |

## 10. Cómo agregar nuevas pruebas

**Backend** (`be/app/tests/test_<dominio>.py`):
1. Primera línea de imports: `import app.tests.testdb  # noqa: F401` (aislamiento ANTES de importar `app`).
2. `unittest.TestCase` con fixtures propias y limpieza en `tearDown`/`tearDownClass` (sin depender de datos sembrados).
3. Transportes externos SIEMPRE neutralizados (correo/pagos/pdfs mockeados por test).
4. Si tu prueba necesita MinIO: usa `minio_de_pruebas_disponible()` de `testdb` y omite con `skipUnless` (patrón de `test_t1_2_minio.py`).
5. Actualiza `tests/INVENTARIO.md` (línea del módulo) y, si es un bloque grande, escribe acta en `docs/`.

**Frontend** (`fe/src/...` junto al código):
1. Naming: `<modulo>.test.ts(x)` junto al componente/hook/util que prueba.
2. Mock de red con `vi.mock('../services/api', ...)` (patrón de `AuthImagesSession.test.tsx`). **Nunca** llamar al backend real.
3. Si el archivo no es un test (helper), no lo nombres `*.test.*` (Vitest lo tomaría como suite).
4. Actualiza `tests/INVENTARIO.md`.

**E2E**:
1. Spec en `fe/e2e/<nombre>.e2e.spec.ts` siguiendo el patrón de `cart-checkout` (no hardcodear datos: leer `process.env`).
2. Orquestador en `scripts/e2e_<nombre>.py` (copia el patrón de `e2e_register.py`): exige `TEST_DATABASE_URL`, `testdb.ensure_test_schema()`, fixtures únicas con limpieza, API efímera con `DISABLE_SCHEDULER=1` y validación final en BD.
3. Regístralo en la tabla de `run_one`/`run_e2e_tests` al añadirlo (§ de los scripts).

**Reglas generales:** no reutilizar entidades sembradas vía `.first()`; no
encadenar corridas paralelas replicables hasta coordinarlo con el equipo;
documentar cualquier nueva variable de entorno.

## 11. Errores comunes

| Mensaje/síntoma | Causa | Qué hacer |
|---|---|---|
| `TEST_DATABASE_URL no esta definida` / guard de `testdb.py` | Variable no fijada | Fijarla por sesión (§7) |
| `TEST_DATABASE_URL apunta a la misma base que la aplicación` | URL de dev | Usar `neodomus_test` |
| `RuntimeError: La base de pruebas no tiene esquema` | Falta migración | Bootstrap: `tests\setup_test_db.ps1` (§7) |
| `no se alcanza MySQL en ...` | Docker parado | Arrancar Docker Desktop; `docker compose up -d db` (manual) |
| `FALTAN paquetes Python: minio, apscheduler, ...` | Host sin dependencias (aplica a runners E2E/individuales; `run_all_tests.ps1` nunca usa el Python del host) | E2E: instalar (con autorización). Backend: usar `run_all_tests.ps1` (efímero) o `-InDocker` |
| `UnknownTimeZoneError: America/Bogota` | Falta `tzdata` en Windows | Instalar `tzdata` (con autorización) |
| Orquestador: `Falta <E2E_NAME>; ejecutar mediante scripts/e2e_...` | Spec lanzado a mano sin variables | Usar siempre `run_e2e_tests.ps1`/`run_one.ps1 -E2E` |
| Playwright: `Executable doesn't exist` | Navegadores sin instalar | `npx playwright install chromium` (con autorización) |
| Orquestador no encuentra `node_modules/vite/bin/vite.js` | Falta `pnpm install` en `fe/` | Instalar (con autorización) |
| `pnpm` no reconocido | pnpm/corepack | Instalar Node 22+ y `corepack enable` (con autorización) |
| Puerto 5173 ocupado en E2E manual | Stack dev arriba | Los orquestadores usan puertos efímeros; -b libero |
| `La imagen de pruebas 'neodomus_tests_tmp' no existe` | Imagen de pruebas no construida en esta máquina | `docker build -t neodomus_tests_tmp be` (una vez; usa `be/Dockerfile`) |
| `Faltan variables TEST_MINIO_*` | Config incompleta para la suite completa | `run_all_tests.ps1 -Setup` (deriva solas) o fijarlas manualmente (§8) |
| `TEST_MINIO_ENDPOINT='localhost...' usa localhost` | Endpoint de modo HOST con backend en contenedor | Usar el alias interno `neodomus-minio-test:9000` (la publicación host es solo-127.0.0.1 y el contenedor no alcanzaría así al host) |
| E2E bloqueada: `FALTAN paquetes Python: minio | apscheduler | tzdata | pymupdf ...` | Python del host sin dependencias (ver §5.3) | Instalar con autorización del equipo; el resumen reporta esa suite como bloqueada con su causa |
| E2E bloqueada: `no se encontro Chromium de Playwright` | Navegadores Playwright no instalados | `cd fe; npx playwright install chromium` (con autorización) |
| E2E bloqueada: `no se alcanza MySQL en ...` | Base de pruebas sin publicar al host (config. de pruebas actual: solo red interna) | Ejecutar E2E en un equipo donde la base de pruebas esté publicada al host; no tocar el compose de desarrollo |
| `El puerto 9100 esta OCUPADO` en setup MinIO | Terceros usando el puerto (el propio MinIO de pruebas activo NO cuenta como colisión) | Identificar el proceso del puerto y coordinar; nunca detener servicios ajenos |

## 12. Qué se conserva (y qué no) tras ejecutar las pruebas

| Recurso | ¿Persiste? | Detalle |
|---|---|---|
| Contenedores MySQL/MinIO de pruebas | **Sí** | `neodomus_mysql_test`, `neodomus_minio_test` y la red `neodomus_tests_net` siguen en marcha y con su estado; ninguna suite ejecuta `down` ni borra contenedores/redes/volúmenes/buckets |
| Base `neodomus_test` | **Sí** | Queda migrada a head; cada suite crea fixtures únicas y las limpia (`tearDown`) → sin residuos entre corridas |
| Volumen y buckets de MinIO de pruebas | **Sí** | `neodomus_minio_test_data` + buckets `neodomus-test-media`/`neodomus-test-private`; la suite backend limpia los objetos que sube (verificado: 0 objetos tras corrida completa) |
| Stack de desarrollo | **Intacto** | Otra red (`neodomus_net`), otros puertos (9000/9001/3307) y la base `neodomus` — jamás tocados |
| Imagen `neodomus_tests_tmp` | **Sí** | Reutilizable en la siguiente corrida; los contenedores efímeros de cada suite se autodestruyen (`--rm`) |
| Logs del backend efímero | Sí, en `%TEMP%` | `%TEMP%\neodomus_tests_logs\run_*\be_out.log`/`be_err.log` (+ `child_*` de los runners delegados); nunca dentro del repo |
| Repo / git | **Sin cambios** | Los scripts no tocan archivos versionados ni `.env`; credenciales solo en el env de la sesión |
| Workflow (`tests.yml`) | — | No creado (fuera del alcance de este bloque; se añadirá más adelante si el equipo lo aprueba) |

## 13. Reglas de seguridad de los scripts (`tests/run_*.ps1`, `setup_*.ps1`)

- **Nunca** usan la base de desarrollo: validan el nombre de la base de la URL.
- Exigen `TEST_DATABASE_URL` en backend/E2E; no la fijan persistente.
- **No** crean/eliminan/migra bases de información, no ejecutan comandos destructivos.
- **Excepción única:** `setup_test_db.ps1` (bootstrap) está autorizado a CREAR la
  base de pruebas (solo `IF NOT EXISTS` + GRANT sobre la base de la URL + Alembic
  head); nunca ejecuta DROP/DELETE y nunca opera sobre `neodomus`.
- **No** instalan dependencias (solo lo verifican e informan qué falta).
- **No** inician ni detienen Docker (solo comprueban estado). Única excepción
  admitida y explícita: al pasar `-Setup`, `run_all_tests.ps1` **orquesta** los
  dos setups individuales (bootstrap MySQL + MinIO de pruebas, ambos
  idempotentes y no destructivos) y luego vuelve a comprobar la infra; sin
  `-Setup` no se crea, modifica ni levanta nada.
- **No** cierran ni reinician contenedores activos ni detienen servicios distintos
  de la infra de pruebas; ante puertos ocupados por terceros abortan con el motivo.
- **No** modifican `.env` ni archivos originales del repo.

## 14. Enlaces

- Actas: `docs/T0_linea_base_testing.md`, `docs/T1_identidad_permisos.md`, `docs/T2_consistencia_pago_pendiente.md`
- Seeds/usuarios de prueba: `scripts/README.md`
- Inventario detallado: `tests/INVENTARIO.md`
- Setup del proyecto: `docs/setup/con-docker.md`, `docs/setup/sin-docker.md`

## 15. E2E en local (host aislado) y GitHub Actions

### 15.1 Cómo ejecutar E2E localmente SIN tocar el entorno global

Los orquestadores (`scripts/e2e_*.py`) corren en el host y exigen: Python con
las dependencias del backend, `fe/node_modules`, Chromium de Playwright y
alcanzar el MySQL de pruebas por TCP. Como el MySQL de pruebas NO publica
puertos (design de Bloques 1-2), la forma reproducible es:

1. **Venv aislado fuera del repo** (no altera el Python del sistema):
   ```powershell
   python -m venv $env:TEMP\venv_e2e
   & "$env:TEMP\venv_e2e\Scripts\python.exe" -m pip install -r be\requirements.txt httpx==0.28.1 pymupdf==1.28.2 minio apscheduler tzdata
   ```
2. **Chromium** (una vez por máquina): `cd fe; npx playwright install chromium`
   (descarga de navegador, %LOCALAPPDATA%\ms-playwright).
3. **Acceso al MySQL de pruebas** con un proxy efímero en loopback (sin tocar
   desarrollo ni infra existente; se borra al terminar):
   ```powershell
   docker run -d --name nd_mysql_host_proxy --network neodomus_tests_net `
     -p 127.0.0.1:3308:3306 alpine/socat `
     tcp-listen:3306,fork,reuseaddr tcp-connect:neodomus_mysql_test:3306
   # TEST_DATABASE_URL apuntando a 127.0.0.1:3308 (host alcanzable por el python del venv)
   ```
4. **MinIO de pruebas por localhost** (ya publicado en 127.0.0.1:9100):
   `TEST_MINIO_ENDPOINT=localhost:9100` y
   `TEST_MINIO_PUBLIC_ENDPOINT=http://localhost:9100` con las `TEST_MINIO_*`
   correspondientes.
5. **Ejecutar** (PATH del venv al frente de `PATH` en esa sesión):
   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File tests\run_e2e_tests.ps1 -List  # ver flujos
   powershell ... tests\run_e2e_tests.ps1 -All                                        # 6 flujos
   ```
6. Al terminar: `docker rm -f nd_mysql_host_proxy` (proxy efímero).

### 15.2 GitHub Actions (`.github/workflows/tests.yml`)

- **Disparadores:** `push` a ramas de trabajo (excluye `main`/`master`/
  `development`), `pull_request` hacia `development`/`master`/`main` y
  `workflow_dispatch` (manual).
- **Jobs:** `frontend` (Vitest) y `backend` (unittest con **MySQL y MinIO
  efímeros del runner**: `mysql:8.0` y MinIO `RELEASE.2025-10-15T17-29-55Z`,
  la misma release pinnada del compose de pruebas) → `e2e` (job **separado**,
  con `needs: [frontend, backend]`, que instala Chromium con
  `npx playwright install --with-deps chromium` y ejecuta **directamente los
  6 orquestadores** `scripts/e2e_*.py`).
- **`concurrency`** por ref con `cancel-in-progress` evita corridas duplicadas
  (no ejecuta E2E dos veces para el mismo commit/ref).
- **Credenciales del CI:** cuentas dummy efímeras definidas en el workflow
  (`neodomus_ci_user`, MinIO `ci_minio_user`); **nunca** las del desarrollo, y
  nada sensible se imprime (los `Wait for MySQL` usan env, no el CLI).
- **Versiones:** Python 3.12 (spec de `be/Dockerfile`), Node 22, pnpm 11.4.0
  (corepack, la misma de local), acciones oficiales con tags mayores
  (`checkout@v4`, `setup-node@v4`, `setup-python@v5`, `cache@v4`,
  `upload-artifact@v4`).
- **E2E en Linux sin tocar el runner:** invoca los orquestadores directamente
  porque `run_e2e_tests.ps1` valida Chromium vía `%LOCALAPPDATA%`
  (Windows-only) y **NO** se modificó para forzar compatibilidad.
- **Resultados y logs:** el job `e2e` sube siempapa un artefacto `e2e-results`
  con `e2e_results.txt` (exit por flujo) y el log completo de cada flujo; en
  `backend`/`frontend` el log se sube solo si el job falla.
- **Estado remoto:** el workflow está implementado y validado localmente
  (sintaxis YAML, referencias y rutas); **aún no ejecutado en GitHub** hasta el
  primer push/PR aprobado.

### 15.3 Cómo consultar errores de CI

1. Pestaña **Actions** del repo → job fallido → step de la suite.
2. En `e2e`, el resumen con el código por flujo queda en el **job summary**
   (`### Resultados E2E` + `== EXIT <flujo>=<código> ==`) y en el artifact
   `e2e-results` (log completo de cada flujo con la salida de Playwright).
3. En `backend`/`frontend`, el log completo está en el artifact correspondiente
   (`ci-backend-log` / `ci-frontend-log`), subido solo en fallo.
4. Los screenshots/trace de Playwright (solo en fallo) quedan en el repositorio
   del job bajo `fe/test-results/` (gitignored).
