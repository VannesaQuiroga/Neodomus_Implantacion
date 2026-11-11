# PEN-08 · Informe final — Completar selector móvil de metraje (incrementos de 0,5 m)

Proyecto NeoDomus · Rama `main` · Fecha: **2026-11-11** · **Sin commits ni push**
(restricción del ticket; cambios listos para revisión).

## 1. Estado inicial del selector

Analizado antes de modificar nada (`analisis-implementacion.md`). En móvil:

- **Tarjeta (`ProductCard.tsx`)**: opciones fijas `[10, 20, 30, 40, 50]` (pasos de 10 m),
  sin límite por disponibilidad; disponibilidad calculada como **suma** de variantes
  (sobreestima frente al backend); valor inicial 10 sin ajuste al stock.
- **Detalle (`producto/[id].tsx`)**: chips fijos 10–50 m + entrada manual con `parseMetros`
  (hasta 2 decimales — correcta), pero sin exigir múltiplos de 0,5 m ni tope de stock al
  confirmar; disponibilidad sin acotar por `stock_producto`.
- **Carrito**: stepper de metros **±10** acotado arbitrariamente a 10–50, sin límite de
  disponibilidad; el ítem no guardaba `stock_maximo` (la web sí).
- **Checkout**: enviaba `metros` como número JSON — decimales ya se conservaban.
- **Backend/BD**: **ya correctos** — `DECIMAL(10,2)/(12,2)`, validación `_decimal_metros`,
  409 por stock, bloqueo pesimista `with_for_update()`, suite HTTP de checkout (15 tests).
  **No se modificó ninguna pieza de backend, BD ni contrato de API.**

## 2. Problemas encontrados

Detalle completo con códigos en `defectos-encontrados.md` (PEN08-DEF-001…006 + entorno).
Resumen: selector sin cortes de 0,5 m, sin límites por disponibilidad en las 3 pantallas,
disponibilidad sobreestimada (suma de variantes), sin aviso de "sin metraje disponible",
sin validación de stock al confirmar (frontend) ni `stock_maximo` en el carrito móvil.

## 3. Archivos modificados y justificación

| Archivo | Cambio | Justificación |
|---|---|---|
| `movil/utils/metros.ts` | + `PASO_METROS`, `pasosMetraje`, `opcionesMetraje`, `maxMetrajePermitido`, `esMetrajeValido` | Fuente única (DRY) de las reglas de corte; trabaja en unidades enteras de 0,5 m (`floor(max×2)`) para evitar aritmética fraccionaria |
| `movil/components/public/ProductCard.tsx` | Opciones dinámicas limitadas por stock; `stockTotal` = `min(producto, mejor variante)` (regla backend/web); metraje efectivo **derivado en render**; aviso "sin metraje disponible"; lista con scroll; envía `stock_maximo` | Núcleo de PEN-08; paridad con la web y el backend (`stock_disponible_producto`) |
| `movil/app/(tabs)/producto/[id].tsx` | Chips dinámicos de 0,5 m; disponibilidad `min(producto, variante)`; `confirmarMetros()` (parse + múltiplo de 0,5 + tope, sin redondeos silenciosos) reutilizada en onBlur y al agregar; aviso sin metraje | Selector del detalle + validación al confirmar |
| `movil/contexts/CartContext.tsx` | `ItemCarrito.stock_maximo`; `updateMetros` valida y devuelve error `string\|null` (contrato idéntico a la web) | Límite por disponibilidad en el carrito |
| `movil/app/(tabs)/carrito.tsx` | Stepper ±0,5 m con límites (botones deshabilitados en los topes); unidades acotadas por stock; aviso de stock insuficiente (toast) | Selector del carrito |
| `movil/contexts/translations/publicTranslations.ts` | + 4 claves ES/EN | i18n del proyecto |

**No se modificaron**: backend, web, BD/migraciones, contratos API, `package.json`,
lockfiles, ni los cambios preexistentes de otros integrantes (ver §11).

## 4. Funcionamiento implementado

- **Tarjeta**: selector desplegable con `0,5 · 1,0 · 1,5 …` hasta el máximo comprable
  (`min(stock, mejor variante) / unidades`); el valor se acota automáticamente si la
  disponibilidad cambia (derivado, sin efectos); sin medio metro → aviso **"Sin metraje
  disponible"** y sin opciones; al agregar revalida y guarda `stock_maximo`.
- **Detalle**: chips de 0,5 m hasta el máximo de la combinación (color/medida); entrada
  manual con coma o punto (≤2 decimales); al confirmar (onBlur **o** botón Agregar) valida
  parse + múltiplo de 0,5 + tope y avisa sin redondear; al agregar envía `stock_maximo`
  de la combinación.
- **Carrito**: metros en pasos de ±0,5 dentro de `[0,5 · stock_maximo/cantidad]`; unidades
  limitadas a `floor(stock_maximo / metros)`; `updateMetros` rechaza cambios que exceden el
  stock guardado y muestra "Stock insuficiente: solo hay X m disponibles".
- **Cadena de validación**: frontend (limpia y orienta) → **backend como autoridad final**
  (400 por precisión, 409 por stock, con bloqueo pesimista al confirmar el pago).

## 5. Cómo se garantiza la precisión decimal

- Incrementos de 0,5 m = múltiplos exactos de 2⁻¹: exactos en IEEE-754 y en JSON; el
  cálculo interno usa **unidades enteras de medio metro** (`floor(max × 2)`), como sugiere
  el ticket. El estado guarda `number` (nunca se convierte a entero).
- `parseMetros` acepta coma/punto con ≤2 decimales y **no redondea silenciosamente**;
  valores inválidos se rechazan con aviso (paridad con la web y su suite).
- HTTP: `metros: 1.5 / 2.5 / 0.5` se serializan exactos y llegan íntegros al backend
  (`_decimal_metros` → `Decimal`).
- BD: columnas `DECIMAL` (migración 0060 preexistente). Almacenamiento real verificado:
  `1.50 / 2.50 / 0.50` y lectura posterior idéntica vía API.

## 6. Cómo se protegieron los registros históricos

- **Cero cambios** de esquema, migraciones, modelos o servicios del backend.
- Comparación fila a fila de las 15 filas históricas de `detalle_pedido` **antes y después**
  de todas las pruebas: **IDÉNTICAS** (`evidencias/historicos_comparativo.txt`).
- Las 4 compras de prueba solo **añadieron** filas nuevas (16–19) con `cantidad_metros`
  exacto; no se recalculó ni sobrescribió ningún metraje antiguo.
- Los ajustes temporales de stock (3,2 / 0,4) usados para los escenarios límite son datos
  de **disponibilidad actual**, documentados y **restaurados** a 10,00 (§5 de
  `registros-historicos.md`); no tocan filas históricas.

## 7. Pruebas ejecutadas y resultados reales

Resumen (detalle y evidencias en `pruebas-funcionales.md` y `evidencias/INDEX.md`):

| Grupo | Resultado |
|---|---|
| Cálculo del selector (archivo real compilado) | **33/33 APROBADAS** |
| UI real en emulador (selector, selección 1,5 m, carrito, steppers, límites, sin metraje) | **10 APROBADAS** (M01–M09 + M11), con dump de UI verificado |
| Integración HTTP completa (payloads exactos del app) | **9 APROBADAS** (H01–H09, incl. 409 por excedente y por mínimo, 400 por precisión, lectura posterior) |
| Regresión backend | `test_checkout_metros_http` **15/15** · `test_disponibilidad_productos` **7/7** (exit 0) |
| Regresión web (sin tocar `fe/`) | MetrosSelect 3/3 · metros utils 6/6 · CartContext 8/8 |
| Móvil | typecheck **exit 0**; lint sin **problemas nuevos** (deuda preexistente documentada); bundle real ejecutado (1875 módulos) |

## 8. Aprobadas / fallidas / bloqueadas / no ejecutadas

- **Aprobadas: 41** (14 cálculo + 10 UI + 9 HTTP + 8 suites de regresión contadas por archivo)
- **Fallidas: 0**
- **Bloqueadas: 1** — M10 compra desde la **UI de checkout**: el runtime Expo Go no llega
  a estado idle en pantallas con animaciones continuas (mismo síntoma ambiental de PEN-07).
  La compra completa quedó demostrada por HTTP con pedidos reales en BD.
- **No ejecutadas: 0**

## 9. Resultado de las pruebas de regresión

- Backend y web: **todas las suites relacionadas verdes** (38 tests).
- Producto por unidades intacto en UI (Sensor e2e: control de cantidad normal, M11).
- Typecheck móvil sin errores; lint: **0 hallazgos nuevos** en los archivos tocados.
- Bundle móvil compilado y navegado (catálogo → detalle implícito en tarjeta → carrito).

## 10. Evidencias generadas y ubicación

`docs/qa/PEN-08/` — `README.md` (este informe) · `analisis-implementacion.md` ·
`pruebas-funcionales.md` · `registros-historicos.md` · `defectos-encontrados.md` ·
`evidencias/` (8 capturas del emulador + 1 incidente inicial + 11 salidas de texto/JSON
reales + `INDEX.md` con trazabilidad).

## 11. Cambios preexistentes de otros integrantes (conservados)

`git status` al inicio mostraba modificaciones no confirmadas de terceros
(`be/Dockerfile`, `fe/src/**` (perfil/admin/estilos), `movil/app/(tecnico)/**`,
`movil/app/(tabs)/carrito.tsx` e `index.tsx`, `movil/components/**`, `movil/package.json`,
`movil/pnpm-lock.yaml`, `movil/pnpm-workspace.yaml`, `movil/.npmrc`, `movil/app.json`,
`scripts/README.md`, `docs/qa/` (PEN-07), `shared/`, `fe/src/components/common/ModalPortal.tsx`).
**Ninguno fue revertido ni sobrescrito**: en los dos archivos que también tocó PEN-08
(`carrito.tsx`, `index.tsx` — este último no llegó a editarse) se trabajó con ediciones
puntuales preservando el trabajo ajeno. Nota: `movil/package.json` (SDK 58) y el
instrumentado `[productos] Escenario B/C/D` en la pantalla de productos son de otros
integrantes y permanecen intactos.

## 12. Pendientes y limitaciones

1. **Compra desde la UI de checkout** (M10): bloqueada por el runtime del emulador;
   reejecutar en dispositivo físico. El flujo está demostrado por HTTP (pedidos 14–17).
2. **Refresco de disponibilidad en la UI abierta**: el catálogo/carrito muestra el último
   fetch; la garantía definitiva es el 409 del backend (verificado). Un refresco al
   enfocar pantalla es mejora futura (fuera de alcance).
3. **Lint móvil**: deuda preexistente sin tocar (PEN-07 DEF-005).
4. Capturas del emulador x86_64 (Android 17); comportamiento visual puede variar en
   dispositivos físicos.

## 13. Estado final de PEN-08

| Criterio de aceptación | Estado |
|---|---|
| Se revisó y documentó la implementación existente | **CUMPLIDO** (`analisis-implementacion.md`) |
| El selector permite incrementos de 0,5 metros | **CUMPLIDO** (tarjeta + detalle + carrito; C01–C14, ev02) |
| Las opciones se limitan según la disponibilidad real | **CUMPLIDO** (M01/M06/M08/M09; regla min(producto, variante)) |
| No permite cantidades superiores al inventario | **CUMPLIDO** (H04 409; M06 botón deshabilitado) |
| Conserva los decimales en la interfaz móvil | **CUMPLIDO** (M03–M05, ev03–ev05) |
| Conserva los decimales en las solicitudes HTTP | **CUMPLIDO** (H01, `api_mis_pedidos_metros.json`) |
| El backend valida correctamente los valores | **CUMPLIDO** (H04/H05/H06 + suites 15/15 y 7/7 — sin cambios: ya era correcto) |
| El almacenamiento conserva la precisión decimal | **CUMPLIDO** (`cantidad_metros` = 1.50/2.50/0.50 en DECIMAL) |
| Los registros históricos no pierden precisión ni cambian | **CUMPLIDO** (comparativo fila a fila: idénticos) |
| Se probaron límites, valores intermedios y falta de disponibilidad | **CUMPLIDO** (tabla completa C01–C14 + H03–H07 + ev07) |
| Se ejecutaron pruebas de regresión pertinentes | **CUMPLIDO** (38 tests backend/web + typecheck + lint + bundle) |
| Se documentaron las evidencias reales | **CUMPLIDO** (9 capturas + 11 salidas reales + INDEX) |
| No se introdujeron regresiones en otras funcionalidades | **CUMPLIDO** (suites verdes; unidades intactas; web sin cambios y verde) |

**Estado final de PEN-08: COMPLETADA** (1 prueba de UI de checkout bloqueada por entorno,
documentada, con el flujo demostrado por HTTP; 0 fallidas). Sin commits ni push: el
working tree queda listo para revisión del equipo.
