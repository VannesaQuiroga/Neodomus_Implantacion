# PEN-08 · Conservación de los registros históricos de metraje

Fecha: 2026-11-11 · Base de datos de **desarrollo** (`neodomus`, Docker, contenido
sintético). Ninguna operación destructiva; solo compras de prueba nuevas y lectura.

## 1. Estado inicial del almacenamiento

Antes de los cambios ya existía la precisión exacta (verificada en código y migraciones):

| Tabla.columna | Tipo | Contenido |
|---|---|---|
| `productos.stock_producto` | `DECIMAL(12,2)` (migración 0060: "stock y cantidades por metros a DECIMAL exacto") | metros disponibles |
| `detalle_pedido.cantidad_metros` | `DECIMAL(10,2)` | metraje comprado por línea |
| `detalle_pedido.cantidad_detalle` | INT | unidades (productos por unidad) |

**No se ejecutó ninguna migración ni cambio de esquema** en PEN-08: la precisión ya estaba
garantizada por el diseño (DECIMAL, no FLOAT) y el backend con `Decimal(str(valor))` + cuantización solo en dinero.

## 2. Línea base de registros históricos (ANTES de las pruebas)

`evidencias/historicos_antes_compra.txt` — 15 filas en `detalle_pedido` (pedidos 1–13).
**Ninguna** contenía metraje (`cantidad_metros = NULL` en todas; el primer registro con
metraje del sistema es uno de los creados por esta validación).

## 3. Compras de prueba (DESPUÉS)

`evidencias/db_compras_prueba.txt` — 4 pedidos nuevos, todos "Pagado":

| Pedido | Detalle | `cantidad_metros` almacenado | Subtotal | Comprobación |
|---|---|---|---|---|
| 14 | Cable e2e | **1.50** | 1.500,00 | 1,5 × 1.000 ✓ |
| 15 | Cable e2e | **2.50** | 2.500,00 | 2,5 × 1.000 ✓ |
| 16 | Cable e2e | **0.50** | 500,00 | 0,5 × 1.000 ✓ |
| 17 | Cable e2e | **0.50** | 500,00 | 0,5 × 1.000 ✓ |

Los valores se almacenan **sin pérdida de precisión** y se leen idénticos por la API
`GET /pedidos/mis-pedidos` (la que usa la pantalla "Mis pedidos" del móvil):
`metros: 0.5 / 1.5 / 2.5` — `evidencias/api_mis_pedidos_metros.json`.

## 4. Verificación de que los históricos NO cambiaron

Comparación fila a fila de las 15 filas históricas (ids 1–15) antes y después de **todas**
las compras y ajustes de stock de la validación:

- `evidencias/historicos_antes_compra.txt` (antes)
- `evidencias/historicos_despues_compra.txt` (después)
- `evidencias/historicos_comparativo.txt` → **"Filas históricas 1-15 IDÉNTICAS: True"**

Resultado: las filas históricas **no cambiaron** (mismos valores de `cantidad_detalle`,
`cantidad_metros` y `subtotal_detalle`). Las nuevas compras solo **añadieron** filas nuevas
(16–19). Ningún recálculo, ninguna sobrescritura con la disponibilidad actual.

## 5. Ajustes de stock usados para los escenarios límite (documentados)

Para reproducir la tabla de disponibilidad del ticket sobre la BD dev sintética se ajustó
temporalmente el stock del producto de prueba #17 (Cable e2e) con UPDATEs idempotentes,
restaurándolo al valor original al final:

| Momento | `stock_producto` | Propósito |
|---|---|---|
| Original | 10,00 | estado natural |
| Ajuste | 3,20 | escenario "3,2 m → no se ofrece 3,5 m" (H03/H04, ev01–ev06) |
| Ajuste | 0,40 | escenario "0,4 m → ninguna opción de 0,5 m" (H05, ev07) |
| **Final** | **10,00** | **restaurado** (`db_compras_prueba.txt`: stock_final_17 = 10.00) |

- El stock es un dato **de disponibilidad actual**, no un registro histórico; su ajuste
  temporal no tocó ninguna fila histórica (verificado en §4).
- Los pedidos de prueba (14–17) quedan en la BD dev como trazabilidad de la validación.

## 6. Precisión decimal extremo a extremo (resumen)

| Capa | Comprobación | Evidencia |
|---|---|---|
| UI móvil | estado `number` con cortes exactos de 0,5; sin conversión a enteros | dumps UI (ev02–ev05) + pruebas C01–C14 |
| JSON/HTTP | `metros: 1.5 / 2.5 / 0.5` enviados y aceptados | `http_compra_15m.json`, `http_escenarios_limite.txt` |
| Backend | `Decimal(str(valor))`, rechazo de >2 decimales, subtotales Decimal exactos | suite `test_checkout_metros_http` (15/15) |
| BD | `cantidad_metros DECIMAL(10,2)` = 1.50 / 2.50 / 0.50 | `db_compra_15m.txt`, `db_compras_prueba.txt` |
| Lectura posterior | API devuelve los mismos decimales | `api_mis_pedidos_metros.json` |

## 7. Históricos existentes con cortes antiguos (comportamiento)

El contrato de la web (que el móvil replica) **conserva** un metraje previo no múltiplo
de 0,5 m (p. ej. 1,55) mostrándolo tal cual y exigiendo elegir una medida disponible,
sin redondearlo silenciosamente (`MetrosSelect.test.tsx` web, 3/3 OK). El mismo principio
se aplicó en móvil: los valores inválidos se rechazan con aviso, nunca se redondean
(`esMetrajeValido` + mensajes de `metrajePasoNoValido`).
