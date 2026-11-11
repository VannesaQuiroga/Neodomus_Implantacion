# Índice de evidencias — PEN-10

Evidencias reales de la ejecución de esta sesión (2026-11-11).

| Archivo | Qué demuestra | Trazabilidad |
|---|---|---|
| `salida-unittest-pen09-pen10.txt` | Suite completa nueva: `Ran 27 tests ... OK`. Incluye: reposición exacta de 2,5 m, sin aprobación → 400, reintento → 400 sin duplicar stock, concurrencia (2 hilos → `[200, 400]`), variante repuesta, reembolso histórico 50.000,00 con precio de catálogo cambiado, reintento de reembolso → 1 solo registro, concurrencia de aprobación → 1 reembolso, resolución única Cambio/Reembolso. | matrices de `pruebas-funcionales.md` §1-2 |
| `regresion-suite-backend-completa.txt` | Suite completa del backend: 282 pruebas, 281 OK, 15 skipped, 1 fallo preexistente (`test_auth_session`, contrato `rol_label` ajeno). | §4 regresión |
| `regresion-post-limpieza-orfanos.txt` | Módulos `test_reportes_ventas`, `test_bloque_2/11/21`, `test_auth_session` tras sanear la base de pruebas: los primero pasan; solo persiste el fallo preexistente de auth. | `defectos-encontrados.md` § saneamiento |
| `typecheck-frontend.txt` | `npx tsc --noEmit` sin errores. | §4 regresión |
| `auditoria-integrada-e1-e4.txt` | **Auditoría integrada**: 9 escenarios E1-E4 OK — incluye reposición exacta con variante (E2), reembolso histórico (E3), pasarela fallida + reintento sin duplicar (E4b) e integridad histórica (E4d), verificados en BD. | `../auditoria-integrada.md` §3 |
| `suites-pen09-10-e-integrada-36tests.txt` | 36 pruebas (27 PEN-09/10 + 9 integrada) OK juntas. | `../auditoria-integrada.md` §6 |
| `regresion-suite-backend-291tests.txt` | Suite completa backend final: **291/291 OK** (fallo de `test_auth_session` corregido en la auditoría). | `../auditoria-integrada.md` §6 |
| `vitest-frontend-108tests.txt` | Frontend 108/108 OK. | `../auditoria-integrada.md` §4.2 |

## Trazabilidad de criterios PEN-10 → evidencia

| Criterio | Evidencia primaria (test unittest) |
|---|---|
| Decisión administrativa que autoriza la reposición/reembolso | `test_reposicion_sin_aprobacion_rechazada ... ok` (sin `Aprobada` → 400 y stock intacto) |
| Reposición con cantidad decimal exacta | `test_reposicion_registra_metros_exactos ... ok` (10.00 → 12.50, `cantidad_reintegrada=2.5`) |
| Cálculo correcto del importe de reembolso | `test_reembolso_usa_importe_historico_del_corte ... ok` (`Decimal('50000.00')`) |
| Conservación de los valores históricos | aserciones sobre `detalle_pedido`/`pedidos` en la misma prueba (precio y total intactos tras el cambio de precio del catálogo) |
| Prevención de duplicados (reposición) | `test_reintento_recogida_no_duplica_inventario ... ok`, `test_reposicion_concurrente_una_sola_ejecuta ... ok` |
| Prevención de duplicados (reembolso) | `test_reintentar_aprobacion_no_duplica_reembolso ... ok`, `test_aprobacion_concurrente_genera_un_solo_reembolso ... ok` |
| Resultado de los intentos repetidos | mismos tests: segundo intento rechazado con mensaje explícito, BD sin duplicados |

## Notas

- **Capturas de pantalla:** no se generaron; todas las comprobaciones son
  aserciones verificables sobre la base de pruebas (stock, montos, estados,
  códigos HTTP) — el ticket prioriza evidencias representativas y reales.
- La evidencia de MinIO (evidencia fotográfica de recogida) se sustituyó por
  un stub en las pruebas: el flujo real de MinIO está cubierto por las pruebas
  preexistentes (`test_t1_3_permisos`, marcadas skipped sin MinIO de pruebas).
- Ningún reembolso ni pago real fue ejecutado (restricción 7 del ticket).
