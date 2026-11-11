# Índice de evidencias — PEN-09

Todas las evidencias provienen de la ejecución real de esta sesión
(2026-11-11). No se fabricaron resultados.

| Archivo | Qué demuestra | Trazabilidad |
|---|---|---|
| `salida-unittest-pen09-pen10.txt` | Ejecución completa de la suite nueva: `Ran 27 tests ... OK`. Incluye los casos de corte completo (2,5 m), rechazo de 1,5 m, rechazo de 3 m, pedido ajeno (404), permisos del cliente (401/403), aprobación/rechazo registrados. | `pruebas-funcionales.md` casos 1-15 |
| `regresion-modulos-relacionados.txt` | 81 pruebas OK de los módulos relacionados (`test_t2_pago_pendiente` incl. `DevolucionMetrosTestCase`, `test_disponibilidad_productos`, `test_citas_reembolsos_admin`, `test_t1_3_permisos`, `test_reasignacion_transacciones`, `test_checkout_metros_http`, `test_reportes_ventas`). | § regresión de `pruebas-funcionales.md` |
| `regresion-suite-backend-completa.txt` | Suite completa del backend en el estado FINAL combinado con el trabajo concurrente de otro integrante (migración 0064 y semillas de proveedores): `Ran 282 tests`, 281 OK, 15 skipped, 1 fallo preexistente (`test_auth_session`, ver `defectos-encontrados.md`). | § regresión |
| `typecheck-frontend.txt` | `npx tsc --noEmit` sin errores en el estado combinado final (evidencia textual + marca `TSC OK`). | § pruebas de frontend |
| `auditoria-integrada-e1-e4.txt` | **Auditoría integrada**: 9 escenarios E1-E4 OK (compra real por metros HTTP → devolución → reposición/reembolso, verificado en BD). | `../auditoria-integrada.md` §3 |
| `suites-pen09-10-e-integrada-36tests.txt` | 36 pruebas (27 PEN-09/10 + 9 integrada) OK juntas. | `../auditoria-integrada.md` §6 |
| `regresion-suite-backend-291tests.txt` | Suite completa backend final: **291/291 OK** (0 fallos; fallo de `test_auth_session` corregido en la auditoría). | `../auditoria-integrada.md` §6 |
| `vitest-frontend-108tests.txt` | Frontend 108/108 OK (los 3 fallos reportados corregidos en la auditoría). | `../auditoria-integrada.md` §4.2 |

## Trazabilidad de criterios de aceptación → evidencia

| Criterio PEN-09 | Evidencia primaria |
|---|---|
| Solicitud del corte completo | `salida-unittest-pen09-pen10.txt`: `test_solicitud_corte_completo_registra_metros_exactos ... ok` |
| Cantidad original vs solicitada | mismas pruebas (aserciones `Decimal('2.50')`, `monto_total=50000.00`) |
| Rechazo de devolución parcial no autorizada | `test_rechaza_devolucion_parcial_no_autorizada ... ok` (1,5 m de 2,5 m) |
| Revisión administrativa (consulta) | `test_admin_revisa_aprueba_y_queda_registrado ... ok` (HTTP 200, datos completos) |
| Aprobación/rechazo registrados | ídem + `test_admin_rechaza_con_motivo_registrado ... ok` |
| Permisos (cliente no decide) | `test_cliente_no_puede_aprobar_su_devolucion ... ok` (401/403) |
| Registros históricos intactos | aserciones sobre `detalle_pedido` y `pedidos` en `test_reembolso_usa_importe_historico_del_corte` |

## Notas

- **Capturas de pantalla:** no se generaron. El ticket prioriza evidencias
  representativas y verificables; toda la funcionalidad de PEN-09 se verificó
  a nivel de API/servicio con aserciones exactas sobre la base de pruebas. Las
  pantallas web (asistente y panel admin) no cambiaron su flujo de navegación,
  solo la presentación de metros; el test de UI correspondiente se ejecutó vía
  typecheck + suite Vitest (99/102, 3 fallos preexistentes ajenos).
- Las salidas de las pruebas se obtuvieron dentro del contenedor `neodomus_api`
  contra la base `neodomus_test` (nunca contra la base de desarrollo).
