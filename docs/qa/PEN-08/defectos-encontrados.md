# PEN-08 · Defectos detectados, correcciones y pendientes

Estados: **Corregido** (por esta tarea) · **Resuelto** (entorno) · Contorneado · **Pendiente** · Bloqueado.

## Defectos del estado inicial (encontrados en el análisis, antes de modificar)

| Código | Título | Gravedad | Estado | Detalle |
|---|---|---|---|---|
| PEN08-DEF-001 | Selector móvil con opciones fijas de 10 en 10 m (`METROS_OPCIONES = [10..50]`) sin relación con los cortes de 0,5 m del negocio | Alta | **Corregido** | Reemplazado por generación dinámica en pasos de 0,5 m limitados por disponibilidad (`opcionesMetraje`) en tarjeta, detalle y carrito |
| PEN08-DEF-002 | La tarjeta móvil sumaba los stocks de las variantes para la disponibilidad (sobreestima); el backend limita a `min(stock_producto, mejor variante)` | Alta | **Corregido** | `stockTotal` ahora replica la regla del backend/web (`test_variantes_no_se_suman…` 7/7 OK confirma la regla) |
| PEN08-DEF-003 | El detalle móvil usaba `varianteActiva.stock` sin acotar por `stock_producto` (puede sobrestimar cuando la variante tiene más stock) | Media | **Corregido** | `stockDisponible = min(producto, variante)` igual que web/backend |
| PEN08-DEF-004 | El detalle aceptaba metrajes > disponibilidad o no múltiplos de 0,5 m sin avisar (solo validaba `> 0`) y el carrito no limitaba los metros | Alta | **Corregido** | `confirmarMetros()` valida parse + múltiplo de 0,5 + tope; `updateMetros` valida contra `stock_maximo`; steppers con límites |
| PEN08-DEF-005 | Sin aviso de "sin metraje disponible" cuando `stock < 0,5 m` | Media | **Corregido** | Aviso explícito en tarjeta y detalle (evidencia ev07) |
| PEN08-DEF-006 | El ítem de carrito móvil no guardaba la disponibilidad (`stock_maximo`), a diferencia de la web | Media | **Corregido** | `ItemCarrito.stock_maximo` + validación en `updateMetros` (contrato web) |
| PEN08-DEF-007 | El backend y la BD ya soportaban decimales exactos (DECIMAL/Decimal) — sin defecto; verificado y documentado | Info | No aplica | `test_checkout_metros_http` 15/15; migración 0060 |

## Incidencias de entorno (sin cambios de repo)

| Código | Título | Estado |
|---|---|---|
| PEN08-ENV-001 | Docker Desktop detenido al iniciar la sesión → backend caído | **Resuelto** (`docker compose up -d`; los contenedores ya estaban provisionados y arrancaron al abrir el daemon) |
| PEN08-ENV-002 | Base de pruebas `neodomus_test` inexistente | **Resuelto** (bootstrap oficial `tests\setup_test_db.ps1`, idempotente y no destructivo; nunca tocó la base `neodomus`) |
| PEN08-ENV-003 | `uiautomator` no logra estado idle en pantallas con animaciones continuas (chatbot/checkout) → automatización UI bloqueada ahí | Bloqueado (entorno; mismo síntoma que PEN-07 ANR). El resto de pantallas (catálogo/carrito) sí se verificaron por dump de UI |
| PEN08-ENV-004 | Puerto 8081 ocupado por otro proceso en el host | Contorneado (Metro en 18082 + `adb reverse`, convención PEN-07) |
| PEN08-ENV-005 | Primer deep link antes de que Metro estuviera listo → pantalla de error de Expo Go | Contorneado (recarga con deep link tras arrancar Metro; captura `ev00`) |

## Limitaciones / pendientes (no corregidos en esta tarea, con justificación)

1. **Compra desde la UI de checkout: BLOQUEADA por entorno** (PEN08-ENV-003). El flujo
   completo de compra quedó demostrado por HTTP con payloads idénticos a los del checkout
   móvil (pedidos 14/15/16/17 reales en BD). Reejecutar en dispositivo físico cuando el
   entorno lo permita.
2. **Disponibilidad en caché en catálogo/carrito**: la UI muestra la disponibilidad del
   último fetch; si el inventario cambia mientras la vista está abierta, la confirmación
   queda respaldada por la validación del backend (409, H04/H05). La web refresca el stock
   del carrito al montar; un refresco equivalente en el móvil (al enfocar la pantalla)
   sería una mejora futura — **fuera de alcance** para no ampliar la intervención.
3. **Lint móvil con deuda preexistente** (29 errores/59 warnings de `react-hooks`, etc.):
   heredada de antes de PEN-08 (PEN-07 DEF-005). Verificado que los archivos modificados
   **no añaden problemas nuevos**. No se refactoriza por alcance.
4. La pantalla de checkout del móvil puede seguir mostrando el metraje con la convención
   de punto decimal ("1.5 m"); la convención visual es la de la web (formatMetros). La
   entrada manual acepta coma o punto.

## Correcciones aplicadas (archivos)

| Archivo | Cambio |
|---|---|
| `movil/utils/metros.ts` | + `PASO_METROS`, `pasosMetraje`, `opcionesMetraje`, `maxMetrajePermitido`, `esMetrajeValido` (fuente única de reglas) |
| `movil/components/public/ProductCard.tsx` | opciones dinámicas 0,5 m limitadas por stock; `stockTotal` = min(producto, mejor variante); metraje efectivo derivado; aviso sin metraje; `stock_maximo` al agregar |
| `movil/app/(tabs)/producto/[id].tsx` | chips dinámicos 0,5 m; disponibilidad min(producto, variante); `confirmarMetros()` (parse + múltiplo + tope, sin redondeos); validación al agregar; aviso sin metraje |
| `movil/contexts/CartContext.tsx` | `ItemCarrito.stock_maximo`; `updateMetros` valida y devuelve error (contrato web) |
| `movil/app/(tabs)/carrito.tsx` | stepper ±0,5 m con límites por stock (botones deshabilitados); clamp de unidades; aviso de stock insuficiente |
| `movil/contexts/translations/publicTranslations.ts` | + 4 claves ES/EN para los mensajes nuevos |

**No se modificaron**: backend (`be/`), web (`fe/`), esquemas/BD/migraciones, contratos de
API, `package.json`/lockfiles, ni los cambios preexistentes de otros integrantes.
