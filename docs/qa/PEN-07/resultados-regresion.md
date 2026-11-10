# PEN-07 · Resultados de regresión y pruebas automatizadas existentes

## 1. Suites automatizadas del repositorio (inventario real)

Fuente: `tests/README.md`, `tests/INVENTARIO.md`. El proyecto móvil **no tiene** suite unitaria/E2E propia (inventario: "móvil 0"); sus únicas verificaciones automatizadas son `typecheck` y `lint`.

| Suite | Herramienta | Estado de ejecución en esta sesión |
|---|---|---|
| Backend (`be/app/tests/`, 249 casos) | unittest + httpx sobre BD de pruebas `neodomus_test` (requiere infra dedicada `tests\run_all_tests.ps1 -Setup`) | NO EJECUTADA — requiere construir imagen `neodomus_tests_tmp` + MySQL/MinIO de pruebas dedicados (min 4GiB, descargas grandes). En el entorno de esta sesión la infra dedicada no estaba provisionada y `TEST_DATABASE_URL` apunta a BD de desarrollo (guard de `testdb.py` abortaría). Se ejecutan en su lugar pruebas de integración reales contra la API (ver §3) |
| Frontend web (`fe/src/**`, ~86 casos) | Vitest + Testing Library | NO EJECUTADA — fuera del alcance móvil de PEN-07 y la capa web no fue modificada; sin cambio → sin regresión esperada |
| E2E web (`fe/e2e/`, 26 casos) | Playwright | NO EJECUTADA (misma razón) |
| Móvil | `pnpm typecheck`, `pnpm lint` | EJECUTADAS (ver §2) |

## 2. Regresión móvil tras las correcciones de entorno

- `npx tsc --noEmit` → **exit 0** (sin errores de tipos) — tras la reinstalación limpia de dependencias. Salida en `evidencias/typecheck_movil_out.txt`.
- Lint móvil: corrida original con `pnpm lint` → **70 problemas (27 errores / 43 warnings)**; en la auditoría final, ejecutando el binario ESLint directamente (`eslint .`, misma configuración flat), → **76 problemas (29 errores / 47 warnings)**. Ambas salidas son reales; la diferencia se debe a la resolución de configuración del wrapper de Expo frente al binario directo. Salida en `evidencias/lint_movil_out.txt`. **No se corrigieron** por restricción de alcance ("no refactorizaciones generales"); quedan documentados como deuda (PEN07-DEF-005).
- Nota de entorno (auditoría final): el wrapper `expo lint` dispara un chequeo de dependencias de pnpm que solicita purgar `node_modules` (abortado por no-TTY, sin cambios). La verificación de lint se hizo con el binario directo para no alterar el estado instalado.
- La app ejecutó el recorrido completo del cliente sin errores de compilación ni módulos (bundle 1948 módulos servido y consumido).
- El bundle se sirvió correctamente tras cada corrección (`Android Bundled 3109ms/3375ms … (1948 modules)`).

## 3. Pruebas funcionales y de integración ejecutadas (API real, backend dev)

| Grupo | Casos | Resultado |
|---|---|---|
| Autenticación | login válido (4 cuentas), login inválido (401), rate limit 429 observado y respetado | OK |
| Autorización/permisos | técnico↔admin↔cliente cruzados (401/403), endpoints propios 200 | OK |
| Catálogo/pedidos/pagos | catálogo paginado, checkout móvil con pago `aprobado` $753.000, factura `FAC-20261110-000011`, descuento de stock 120→119 y 25→22 | OK |
| Auditoría de seguridad backend | eventos `LOGIN_FAILED`/`LOGIN_SUCCESS` con email enmascarado | OK |

## 4. Regresión del backend y la web (no tocadas)

- El código de `be/` y `fe/` **no fue modificado** en esta sesión (ver `git status` final: solo docs + móvil/.env + config pnpm del móvil + carpeta `shared/`).
- El backend continúa operativo tras la sesión (`GET /docs` 200, catálogo 200).
- La web (`neodomus_frontend` en Docker, puerto 5173) sigue levantada; su suite está intacta. Sin regresión esperada ni detectada (no se modificó su código ni dependencias).

## 5. Incidencias ambientales (registradas, no son defectos del código)

- Docker Desktop se detuvo dos veces durante la sesión (contenedores `Exited(137)`); se restauró con `docker compose up -d` (migraciones + seed idempotentes). La app móvil demostró el manejo correcto del backend caído (pantalla "Algo salió mal" + Reintentar).
- Metro/Expo dev server perdió el binding IPv4 dos veces tras crasheos; solución estable documentada: `adb reverse` (canal determinista) — ver `entorno-pruebas.md` §5.
