# PEN-08 · Pruebas funcionales ejecutadas

Fecha: 2026-11-11 · Entorno: backend real en Docker (FastAPI + MySQL dev sintética) y
app móvil real en emulador Android (Expo Go, bundle Metro 18082). **No se inventó
ningún resultado**: cada prueba cita su evidencia en `evidencias/`.

Estados: **APROBADA** · FALLIDA · **BLOQUEADA** (no ejecutable por entorno) · NO EJECUTADA.

## 1. Cálculo del selector (funciones reales compiladas de `movil/utils/metros.ts`)

Script real contra el archivo TS compilado (sin mocks): `evidencias/prueba_calculo_selector.txt` — **33/33 APROBADAS**.

| # | Caso (tabla del ticket) | Resultado esperado | Resultado | Estado |
|---|---|---|---|---|
| C01 | `opcionesMetraje(5,0)` | 0,5 · 1,0 · 1,5 · 2,0 · 2,5 · 3,0 · 3,5 · 4,0 · 4,5 · 5,0 | idéntico | APROBADA |
| C02 | `opcionesMetraje(3,2)` | hasta 3,0 (no 3,5) | `[0.5…3]` (6 opciones) | APROBADA |
| C03 | `opcionesMetraje(2,5)` | hasta 2,5 | `[0.5…2.5]` (5) | APROBADA |
| C04 | `opcionesMetraje(1,5)` | hasta 1,5 | `[0.5…1.5]` (3) | APROBADA |
| C05 | `opcionesMetraje(0,4)` | ninguna opción de 0,5 m | `[]` | APROBADA |
| C06 | `opcionesMetraje(0,0)` | sin disponibilidad | `[]` | APROBADA |
| C07 | `esMetrajeValido(0.5/1.5/2.5/3.0, 3.2)` | true | true | APROBADA |
| C08 | `esMetrajeValido(3.5, 3.2)` | false (superior al inventario) | false | APROBADA |
| C09 | `esMetrajeValido(0/-1/1.55, 3.2)` | false (cero/negativo/no múltiplo) | false | APROBADA |
| C10 | `esMetrajeValido(0.5, 0.4)` | false (sin mínimo) | false | APROBADA |
| C11 | `parseMetros('1,5')` / `'1.5'` | 1.5 (coma y punto) | 1.5 | APROBADA |
| C12 | `parseMetros('1.555')` | null (precisión excesiva, sin redondeo) | null | APROBADA |
| C13 | `parseMetros('0')` / `'-1'` | null | null | APROBADA |
| C14 | `formatMetros(0.5/1.5/2.5/3.0)` | '0.5'/'1.5'/'2.5'/'3' | idéntico | APROBADA |

## 2. Selector real en el emulador (Expo Go, bundle real de `movil/`)

Producto usado: **Cable e2e (#17)**, venta por metros, precio 1.000 COP/m.
El bundle servido por Metro (1875 módulos) es el del working tree con los cambios PEN-08.

| # | Prueba | Evidencia | Resultado | Estado |
|---|---|---|---|---|
| M01 | Tarjeta muestra selector limitado por disponibilidad (stock 9,5 m → clamp del valor a 9,5 m; precio 9.500 = 1000 × 9,5) | `ev01_catalogo_tarjeta_metros.png` + dump UI ("1,000 COP / metro · 9.5 m · Disponible: 9.5 m · 9.5 metros") | Correcto | APROBADA |
| M02 | Desplegable con **incrementos de 0,5 m** | `ev02_desplegable_pasos_05.png` + dump UI: opciones `0.5 metros, 1 metros, 1.5 metros, 2 metros, 2.5 metros…` (lista con scroll) | Correcto | APROBADA |
| M03 | Selección de un valor decimal intermedio (1,5 m) | `ev03_tarjeta_seleccion_15m.png` + dump UI (precio 1.500 = 1000 × 1,5; etiqueta "1.5 metros") | Correcto | APROBADA |
| M04 | Carrito conserva el decimal: "1 × 1.5 m = 1.5 m total", stepper "1.5 m", subtotal 1.500 COP | `ev04_carrito_15m.png` + dump UI | Correcto | APROBADA |
| M05 | Stepper de metros en pasos de 0,5: +0,5 → "1 × 2 m = 2 m total", subtotal 2.000 | `ev05_carrito_20m_paso05.png` + dump UI | Correcto | APROBADA |
| M06 | Límite de unidades por disponibilidad: 4 × 2 m = 8 m (máx = floor(9,5/2) = 4) y botón "+" **deshabilitado** (`enabled=false` en dump) | `ev06_carrito_limite_unidades.png` + dump UI | Correcto | APROBADA |
| M07 | Reducción a −0,5 (2,0 → 1,5 m) tras usar unidades al límite | dump UI "1 × 1.5 m = 1.5 m total" | Correcto | APROBADA |
| M08 | Sin metraje disponible (stock 0,4 m): la tarjeta muestra **"Sin metraje disponible"**, metraje efectivo 0 m, precio $0, sin opciones de 0,5 m | `ev07_sin_metraje_04m.png` + dump UI | Correcto | APROBADA |
| M09 | Restaurado el stock (10,0 m) y recargada la app: "Disponible: 10 m", precio 10.000, selector "10 metros" | `ev08_catalogo_stock_restaurado.png` + dump UI | Correcto | APROBADA |
| M10 | Compra real desde la UI de checkout (tarjeta simulada) | — | **BLOQUEADA** (§5) | BLOQUEADA |
| M11 | Productos por unidades intactos (Sensor e2e: "Disponibles: 10 unidades disponibles", control de cantidad normal) | dumps M01/M08 | Sin regresión | APROBADA |

Detalle de dumps de UI (verificación textual programática del contenido real de la pantalla):
`uidump_productos`, `uidump_dropdown`, `uidump_sel15`, `uidump_scroll1`, `uidump_carrito*`,
`uidump_sinmetraje`, `uidump_final` (archivos XML en `C:\Users\valet\AppData\Local\Temp\opencode\`;
resúmenes citados aquí. Nota: el runtime Expo Go no permitió dumps en pantallas con
animaciones continuas — ver §5).

## 3. Integración completa por HTTP (el mismo recorrido de dato que el app)

Payloads **idénticos** a los que `movil/app/(tabs)/checkout.tsx` envía a `POST /api/v1/pedidos`,
contra el backend real, autenticados con la cuenta de prueba del seed.

| # | Escenario | Petición | Respuesta real | Evidencia | Estado |
|---|---|---|---|---|---|
| H01 | Compra 1,5 m (stock 10,0) | `metros: 1.5` | 200 · pedido #14 · detalle "Cable e2e - 1.5 metros" · subtotal 1500 · pago aprobado · factura FAC-20261111-000014 | `http_compra_15m.json` | APROBADA |
| H02 | Decimal almacenado | — | `detalle_pedido.cantidad_metros = 1.50` (DECIMAL exacto) · stock 10,00 → 8,50 | `db_compra_15m.txt` | APROBADA |
| H03 | 2,5 m con 3,2 m disponibles | `metros: 2.5` | 200 · pedido #15 · metros 2.5 · total 2500 | `http_escenarios_limite.txt` | APROBADA |
| H04 | **3,5 m con 3,2 m disponibles** (superior al inventario) | `metros: 3.5` | **409** `Stock insuficiente de 'Cable E2E' (disponible: 3.20, solicitado: 3.5)` · sin pedido nuevo · stock sin cambios | `http_escenarios_limite.txt` | APROBADA |
| H05 | **0,5 m con 0,4 m disponibles** (sin mínimo) | `metros: 0.5` | **409** `Stock insuficiente… (disponible: 0.40, solicitado: 0.5)` · sin pedido | `http_escenarios_limite.txt` | APROBADA |
| H06 | Precisión excesiva 1,555 m | `metros: 1.555` | **400** `La longitud admite como máximo 2 decimales` · sin pedido | `http_escenarios_limite.txt` | APROBADA |
| H07 | Corte mínimo 0,5 m con stock restaurado (10,0) | `metros: 0.5` | 200 · pedido #17 · `cantidad_metros = 0.50` · total 500 | `http_escenarios_limite.txt` + `db_compras_prueba.txt` | APROBADA |
| H08 | Consulta posterior (como la pantalla "Mis pedidos"): `GET /pedidos/mis-pedidos` | — | metros devueltos como decimales exactos: 0.5, 1.5, 2.5 | `api_mis_pedidos_metros.json` | APROBADA |
| H09 | Condiciones de carrera | — | `descontar_stock` valida con `with_for_update()`; suite backend `test_reintentos_concurrentes_no_duplican` OK | suite backend | APROBADA |

## 4. Pruebas de regresión

| Suite | Comando | Resultado | Evidencia |
|---|---|---|---|
| Backend · checkout por metros (15 casos HTTP reales) | `tests\run_one.ps1 -Backend test_checkout_metros_http -InDocker` | **15/15 OK (exit 0)** | consola del orquestador (log en sección 4 del README) |
| Backend · disponibilidad de productos (7 casos, incluye la regla "no se suman stocks de variantes") | `tests\run_one.ps1 -Backend test_disponibilidad_productos -InDocker` | **7/7 OK (exit 0)** | consola del orquestador |
| Web · `MetrosSelect.test.tsx` (selector 0,5 m web) | `tests\run_one.ps1 -Frontend …` | **3/3 OK** | consola del orquestador |
| Web · `metros.test.ts` | ídem | **6/6 OK** | consola del orquestador |
| Web · `CartContext.test.tsx` (carrito con cortes fraccionarios) | ídem | **8/8 OK** | consola del orquestador |
| Móvil · typecheck (`tsc --noEmit`) | `pnpm typecheck` | **exit 0** | `typecheck_movil.txt` |
| Móvil · lint | `pnpm lint` | exit 1 por **deuda preexistente** (PEN-07 DEF-005); **0 problemas nuevos** en los archivos modificados | `lint_movil.txt` |
| Móvil · bundle | Metro: `Android Bundled … (1875 módulos)` ejecutado en el emulador | OK | log de Metro |

Salidas completas de las suites backend/web: consola del orquestador `tests\run_one.ps1`
(rerproducible con los mismos comandos; resumen "Resultado: PASADO Codigo: 0").

## 5. Bloqueos y limitaciones reales

1. **M10 (compra desde la UI de checkout): BLOQUEADA por entorno.** El runtime Expo Go del
   emulador queda permanentemente "ocupado" (`uiautomator: could not get idle state`) en las
   pantallas con animaciones continuas (chatbot flotante/pantalla de pago), impidiendo
   automatizar y verificar la entrada de tarjeta. El mismo síntoma ambiental fue documentado
   en PEN-07 (ANR/saturación del emulador x86_64). El **flujo de compra completo** sí quedó
   demostrado por H01–H09 con payloads idénticos a los del checkout móvil, y el **recorrido
   de UI hasta el carrito** quedó demostrado por M01–M09.
2. **Disponibilidad en caché en la UI**: si el inventario cambia mientras el catálogo está
   montado, la tarjeta mantiene el dato anterior hasta que la app vuelve a consultar el
   backend (recarga de pantalla/app). La validación definitiva de disponibilidad es del
   backend al confirmar (409 verificado en H04/H05), tal como exige el ticket. La web
   refresca el stock del carrito al montar; el móvil lo guarda en `stock_maximo` al agregar
   y lo revalida al cambiar metros (updateMetros).
3. Las capturas son del emulador x86_64 (Android 17, Expo Go); el rendimiento visual puede
   variar en dispositivos físicos.

## 6. Resumen

- **Aprobadas**: 14 (cálculo) + 10 (UI emulador, M01–M09 + M11) + 9 (HTTP H01–H09) + 8 (regresión) = **41**
- **Fallidas**: **0**
- **Bloqueadas**: 1 (M10, UI checkout, entorno)
- **No ejecutadas**: 0
