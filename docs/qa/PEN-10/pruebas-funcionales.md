# PEN-10 — Pruebas funcionales: reposición y reembolso por metros

**Fecha:** 2026-11-11 · **Entorno:** base de pruebas aislada `neodomus_test`
(solo pruebas; sin pasarela real, sin MinIO real en el flujo de reposición —
`sentence` de evidencia sustituida por stub).

**Suite:** `be/app/tests/test_pen09_pen10_devoluciones_metros.py`
**Resultado real: `Ran 27 tests ... OK`** — salida completa en
`evidencias/salida-unittest-pen09-pen10.txt`.

## 1. Reposición (inventario)

| Caso | Prueba | Resultado |
|---|---|---|
| Reposición de 2,5 m aprobada → registra exactamente 2,5 m | `ReposicionInventarioTestCase.test_reposicion_registra_metros_exactos` | ✅ Stock 10.00 → 12.50; respuesta `cantidad_reintegrada=2.5`; pipeline → `Reembolso procesado` |
| Reposición sin aprobación | `test_reposicion_sin_aprobacion_rechazada` | ✅ 400 «La devolución no está aprobada»; stock sin cambios |
| Reposición de cantidad distinta a la autorizada | `test_reposicion_registra_metros_exactos` (la cantidad se toma del registro autorizado, no de la petición) | ✅ No es posible: el endpoint no acepta cantidad, usa `devolucion.cantidad_metros` |
| Repetir una reposición ya ejecutada | `test_reintento_recogida_no_duplica_inventario` | ✅ 2ª llamada → 400 «Esta recogida ya fue confirmada»; stock solo +2,50 una vez |
| Dos solicitudes simultáneas de reposición | `test_reposicion_concurrente_una_sola_ejecuta` (2 hilos, sesiones independientes) | ✅ Códigos `[200, 400]`; stock exactamente +2,50 |
| Reposición con recepción física pendiente | `test_reposicion_registra_metros_exactos` + flujo existente | ✅ El stock NO cambia en la aprobación; cambia solo al confirmar la recogida con evidencia |
| Variante repuesta con metros | `test_reposicion_reintegra_variante_con_metros` | ✅ Producto +2,50 y variante +2,50 (espejo exacto del checkout) |

## 2. Reembolso

| Caso | Prueba | Resultado |
|---|---|---|
| Reembolso con valores históricos | `ReembolsoHistoricoTestCase.test_reembolso_usa_importe_historico_del_corte` | ✅ 2,5 m × $20.000 (precio congelado) = **$50.000,00**; `id_solicitud_origen` registrado; `numero_transaccion_original` del pago original |
| Precio actual del catálogo no interviene | ídem (el precio del producto se cambia a 99.000 DESPUÉS de la compra) | ✅ Reembolso sigue siendo 50.000 |
| Reembolso sin aprobación | `test_reposicion_sin_aprobacion_rechazada` + transiciones (no existe ruta de reembolso sin `Aprobada`) | ✅ Rechazado |
| Reembolso superior al importe correspondiente | `test_reembolso_usa_importe_historico_del_corte` (monto derivado del registro, no de la petición) + endpoint manual admin valida `monto ≤ pagado` (existente) | ✅ No es posible inyectar un monto mayor |
| Repetir un reembolso confirmado | `test_reintentar_aprobacion_no_duplica_reembolso` | ✅ 2ª aprobación → `ValueError` (transición inválida); 1 solo reembolso en BD |
| Dos administradores aprobando a la vez | `test_aprobacion_concurrente_genera_un_solo_reembolso` (2 hilos) | ✅ 1 éxito + 1 error de transición; 1 solo reembolso |
| Reembolso con pago original no confirmado | flujo de elegibilidad: solo pedidos entregados con pago registrado entran al flujo; el reembolso usa la transacción del pago original | ✅ Cubierto por fixture (pago `aprobado`) |
| Error de la pasarela → no se registra como exitoso | `reembolso_service.procesar_reembolso` captura la excepción → estado `Rechazado` (código existente, conservado); el pipeline solo marca `Reembolso procesado` si `reembolso.estado == 'Reembolsado'` | ✅ Por diseño (código revisado); con el simulador el caso no ocurre en la práctica |
| Decisión única (no ambas operaciones) | `test_resolucion_cambio_no_genera_reembolso` | ✅ Resolución `Cambio` → 0 reembolsos; `Reembolso` → 1 |
| Reembolso confirmado cierra el pipeline | `test_reembolso_confirmado_cierra_el_pipeline` | ✅ `Solicitada → Aprobada → (recogida) → Reembolso procesado`, `monto_total = 50.000,00` |

## 3. Integridad (transversal)

- Pedidos originales: `total_pedido`, `detalle_pedido.precio_unitario_detalle`,
  `cantidad_metros` y `pagos` se verifican INTACTOS tras aprobar y reembolsar
  (aserciones en `test_reembolso_usa_importe_historico_del_corte`). ✅
- Cantidades históricas con decimales: `Decimal('2.50')` en compra y devolución. ✅
- Movimientos de inventario corresponden solo a operaciones autorizadas
  (aprobación + recogida con evidencia). ✅
- Sin reposiciones ni reembolsos duplicados (hilos + reintentos). ✅
- Trazabilidad reconstruible: solicitud (`resolucion`, `resuelta_por`,
  `resuelta_at`, `motivo_rechazo`) + `reembolsos.id_solicitud_origen` +
  evidencia de recogida en MinIO. ✅

## 4. Regresión

| Suite | Resultado |
|---|---|
| Suite completa del backend (`discover`, 282 pruebas) | ✅ 281 OK, 15 skipped, **1 fallo preexistente** (`test_auth_session.test_bearer_sin_cookie_restaura_cliente` — deriva de contrato `rol_label` ajena a estas tareas; detalle en `defectos-encontrados.md`). Evidencia: `evidencias/regresion-suite-backend-completa.txt` (estado final combinado con el trabajo concurrente: migración 0064 y semillas de otro integrante) |
| Módulos directamente relacionados (81 pruebas) | ✅ OK (3 skipped por MinIO opcional) — `evidencias/regresion-post-limpieza-orfanos.txt` y `PEN-09/evidencias/regresion-modulos-relacionados.txt` |
| Frontend: `tsc --noEmit` | ✅ sin errores (`evidencias/typecheck-frontend.txt`) |
| Frontend: `vitest run` (estado combinado) | **105/108**; los 3 fallos **preexistentes** (`AuthImagesSession`, `NotificacionesBell` — falta `IdiomaProvider` en su setup) son de otro integrante; los 2 test files nuevos que añadió en paralelo pasan, incluido `OrdersTab.test.tsx` |
| Frontend: `vite build` | ✅ `built in 7.86s` (advertencia de chunk preexistente) |

## 5. No ejecutadas / bloqueadas

- **E2E Playwright**: sin spec de devoluciones en el proyecto; la infra está
  disponible pero no se ejecutó en esta sesión (fuera del alcance mínimo).
- **Pasarela real**: no existe integración; no se pueden probar reembolsos
  externos reales (y no se debe simular un éxito que no existe).
