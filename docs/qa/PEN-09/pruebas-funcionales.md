# PEN-09 — Pruebas funcionales: devolución del corte completo por metros

**Fecha:** 2026-11-11 · **Entorno:** base de pruebas aislada `neodomus_test`
(`TEST_DATABASE_URL` obligatoria; correos/scheduler neutralizados por
`be/app/tests/testdb.py`; MinIO de evidencias sustituido por stub — no hay
pagos ni operaciones reales).

**Suite:** `be/app/tests/test_pen09_pen10_devoluciones_metros.py` (nueva)
**Ejecución:** contenedor `neodomus_api` (Python 3.12, igual que CI):

```
docker exec -e TEST_DATABASE_URL="...neodomus_test..." -e DISABLE_SCHEDULER=1 \
  neodomus_api uv run python -m unittest app.tests.test_pen09_pen10_devoluciones_metros -v
```

**Resultado real: `Ran 27 tests ... OK` (27,7 s).** Salida completa:
`evidencias/salida-unittest-pen09-pen10.txt`.

## Matriz de casos (PEN-09)

| # | Caso | Prueba (unittest) | Resultado |
|---|---|---|---|
| 1 | Solicitar devolución de un corte de 2,5 m | `SolicitudCorteCompletoTestCase.test_solicitud_corte_completo_registra_metros_exactos` | ✅ Se registra la solicitud por **2,5 m** (`Devolucion.cantidad_metros = 2.50`, `cantidad = 1`), `monto_total = 50.000,00`, `tipo='total'` |
| 2 | Solicitar devolución de 1,5 m cuando se compraron 2,5 m | `test_rechaza_devolucion_parcial_no_autorizada` | ✅ Rechazada (400, «La devolución del corte debe corresponder al corte completo (2,5 m)»); **no** queda registro |
| 3 | Solicitar devolución superior a la compra | `test_rechaza_metros_superiores_a_la_compra` | ✅ Rechazada |
| 4 | Solicitar devolución de un pedido inexistente | `ElegibilidadMetrosTestCase.test_elegibilidad_pedido_inexistente` + `PermisosYRevisionHTTPTestCase.test_pedido_ajeno_rechazado_http` | ✅ Rechazada (404 vía HTTP) |
| 5 | Solicitar devolución de un pedido de otro cliente | `test_elegibilidad_no_revela_pedidos_ajenos` + `test_pedido_ajeno_rechazado_http` | ✅ Rechazada (404) |
| 6 | Segunda devolución incompatible del mismo corte | `test_segunda_solicitud_del_mismo_corte_rechazada` | ✅ `metros_disponibles = 0`, elegibilidad `False`, creación rechazada |
| 7 | Entrada con más de 2 decimales (2,505) | `test_rechaza_metros_con_mas_decimales` | ✅ Rechazada (sin redondeo silencioso) |
| 8 | `metros` en un producto que NO se vende por metros | `test_rechaza_metros_en_producto_de_unidades` | ✅ Rechazada («no se vendió por metros») |
| 9 | Forma legada `cantidad=1` (endpoint antiguo) | `test_forma_legada_cantidad_1_significa_corte_completo` | ✅ Se interpreta como el corte completo (compatibilidad de contrato) |
| 10 | Administrador consulta una solicitud pendiente | `PermisosYRevisionHTTPTestCase.test_admin_revisa_aprueba_y_queda_registrado` | ✅ `GET /devoluciones/admin/solicitudes` muestra pedido, cliente, email, motivo, metros, estado |
| 11 | Administrador aprueba una solicitud válida | ídem | ✅ `resolucion='Reembolso'`, `resuelta_at` registrada, `id_reembolso` creado |
| 12 | Administrador rechaza una solicitud | `test_admin_rechaza_con_motivo_registrado` | ✅ Estado `Rechazada` + `motivo_rechazo='Fuera de política'` persistidos |
| 13 | Cliente intenta aprobar su propia devolución | `PermisosYRevisionHTTPTestCase.test_cliente_no_puede_aprobar_su_devolucion` | ✅ `401/403`; el estado sigue `Solicitada` |
| 14 | Rechazo administrativo libera el corte | `SolicitudCorteCompletoTestCase.test_rechazo_administrativo_libera_el_corte` | ✅ Tras el rechazo vuelve a ser devoluble (2,5 m) |
| 15 | Precisión decimal conservada | casos 1, 2, 9 (valores `Decimal('2.50')`) | ✅ Sin conversión a entero en ningún punto |

## Cantidades decimales

- Compra: `detalle_pedido.cantidad_metros = 2.50` (histórico, intocable).
- Solicitud: `devoluciones.cantidad_metros = 2.50`.
- Aserciones con `Decimal('2.50')` — no floats de comparación.

## Notas de la revisión administrativa (pantalla existente, completada)

`AdminDevoluciones.tsx` ya cubría consulta/aprobación/rechazo/historial; se
añadió la lectura de metros por ítem («2,5 m × $20.000/m = $50.000») y la
fecha de decisión («Decidida el»). Los datos los sirve
`serializar_solicitud()` (mismo contrato, campos adicionales).

## Pruebas de regresión ejecutadas (backend)

| Suite | Resultado |
|---|---|
| `test_t2_pago_pendiente` (25 pruebas, incluye `DevolucionMetrosTestCase`) | ✅ OK |
| `test_disponibilidad_productos` · `test_citas_reembolsos_admin` · `test_t1_3_permisos` · `test_reasignacion_transacciones` · `test_checkout_metros_http` · `test_reportes_ventas` (81 pruebas) | ✅ OK (3 skipped: requieren MinIO de pruebas) |
| Suite completa backend (discover) | Ver `PEN-10/pruebas-funcionales.md` y `evidencias/` |

## Pruebas de frontend

- `npx tsc --noEmit` ✅ sin errores (estado combinado final con el trabajo
  concurrente de otro integrante).
- `npx vitest run` → **105/108** ✅ en el estado combinado (28 archivos; 2
  nuevos añadidos en paralelo por otro integrante, incluido
  `OrdersTab.test.tsx`, que pasa con los cambios de PEN-09). Los **3 fallos
  preexistentes** están en `AuthImagesSession.test.tsx` y
  `NotificacionesBell.test.tsx` (falta `IdiomaProvider` en su setup; ninguno
  importa archivos de PEN-09/10).
- `npx vite build` ✅ `built in 7.86s` (advertencia de tamaño de chunk preexistente).

## Bloqueadas / no ejecutadas

- **E2E Playwright** (`tests/run_e2e_tests.ps1`): no ejecutado en esta sesión
  (requiere Chromium + orquestadores host; infra disponible pero fuera del
  alcance mínimo del flujo de devoluciones, que no tiene spec E2E propio).
- **Móvil**: sin tests en el proyecto (0 según `tests/INVENTARIO.md`); la app
  móvil no participó en cambios (§ limitaciones del análisis).
