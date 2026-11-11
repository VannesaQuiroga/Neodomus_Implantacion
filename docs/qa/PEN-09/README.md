# PEN-09 — Devolución del corte completo por metros

**Estado final: COMPLETADA** (backend + web, con pruebas reales sobre la base de pruebas `neodomus_test`)
**Fecha:** 2026-11-11 · **Sin commits ni push** (restricción del ticket)

## Resumen

La devolución de un producto vendido por metros ahora corresponde **al corte
completo comprado** (2,5 m → 2,5 m), pasa por revisión administrativa y
conserva las cantidades decimales. El backend valida de forma independiente
que la fracción solicitada sea exactamente la comprada: una devolución parcial
no autorizada se rechaza aunque se manipule la petición HTTP.

## Resultado

| Criterio de aceptación | Estado |
|---|---|
| Se auditó la implementación existente (sin reemplazar lo que funcionaba) | ✅ `analisis-implementacion.md` |
| La solicitud corresponde al corte completo comprado | ✅ (backend valida `metros == metros_comprados`) |
| Se rechazan devoluciones parciales no autorizadas | ✅ 400 en backend; sin excepciones inventadas |
| Se conservan las cantidades decimales | ✅ `NUMERIC(10,2)` + aritmética `Decimal` |
| El administrador puede revisar la solicitud | ✅ pantalla existente completada con metros y fecha de decisión |
| La aprobación y el rechazo quedan registrados | ✅ `resolucion`, `motivo_rechazo`, `resuelta_por`, `resuelta_at` |
| Los permisos están protegidos | ✅ cliente no puede aprobar (401/403 probado por HTTP) |
| No se modifican los registros históricos originales | ✅ pedido/detalles/pagos intocables (probado) |

## Documentación

- `analisis-implementacion.md` — estado inicial, archivos y diseño.
- `pruebas-funcionales.md` — matriz de casos con resultados reales (27/27 OK).
- `defectos-encontrados.md` — defectos corregidos y preexistentes.
- `evidencias/` + `evidencias/INDEX.md` — salidas reales de esta sesión.
- **Auditoría integrada PEN-08/09/10:** `../auditoria-integrada.md` (escenarios
  E1-E4 con compra real por metros, verificación en BD y fallos investigados).

## Archivos modificados

**Backend:** `be/app/models/devolucion.py`, `be/app/models/especializacion.py`,
`be/app/services/devoluciones_service.py`, `be/app/services/reembolso_service.py`,
`be/app/services/inventario_service.py`, `be/app/routers/devoluciones.py`,
nueva migración `be/alembic/versions/0063_devolucion_metros_y_reembolso_origen.py`.

**Frontend web:** `fe/src/components/profile/OrdersTab.tsx`,
`fe/src/pages/admin/AdminDevoluciones.tsx`,
`fe/src/i18n/profileTabsTranslations.ts`, `fe/src/styles/perfil-cliente.css`.

**Pruebas:** `be/app/tests/test_pen09_pen10_devoluciones_metros.py` (nueva, 27 pruebas).

**Móvil:** sin cambios (no existía flujo de solicitud de devolución; se conservó
intacto el trabajo en curso de PEN-08). Limitación documentada.

## Limitaciones

1. La solicitud de devolución solo se puede crear desde la web (preexistente).
2. `PAYMENT_PROVIDER=simulator`: el reembolso se registra y procesa con el
   simulador académico; la integración con pasarela real es un punto único
   pendiente del proyecto (ver PEN-10).
3. Los importes monetarios se persisten como `Float` (convención del proyecto);
   el cálculo usa `Decimal` exacto y cuantización a 2 decimales.
