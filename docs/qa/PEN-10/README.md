# PEN-10 — Reposición y reembolso por metros

**Estado final: COMPLETADA** (con limitaciones documentadas: pasarela simulada)
**Fecha:** 2026-11-11 · **Sin commits ni push** (restricción del ticket)

## Resumen

La reposición y el reembolso de una devolución por metros ahora se ejecutan
**solo tras la decisión administrativa** (y, para el inventario, tras la
recogida física con evidencia), con cantidades e importes **exactos** sobre los
valores históricos del pedido y **sin operaciones duplicadas** ante dobles
clics, reintentos, repeticiones HTTP o dos administradores concurrentes.

## Resultado

| Criterio de aceptación | Estado |
|---|---|
| La reposición requiere la decisión administrativa correspondiente | ✅ exige `Aprobada` + recogida física con evidencia (política existente respetada) |
| La cantidad repuesta es exacta | ✅ 2,5 m → +2,5 m (producto y variante), `Decimal` |
| El reembolso utiliza importes históricos correctos | ✅ precio congelado del checkout × metros (50.000,00 para 2,5 m × 20.000) |
| No se ejecutan ambas alternativas indebidamente | ✅ resolución única `Reembolso|Cambio`; `Cambio` → 0 reembolsos (probado) |
| No existen duplicados por repetición | ✅ índice único en BD + bloqueos + validación de estados (pruebas de reintento y concurrencia) |
| Se controlan las operaciones concurrentes | ✅ `SELECT ... FOR UPDATE` en solicitud y devolución (2 hilos: 1 éxito, 1 rechazado) |
| Se conserva la trazabilidad | ✅ `resolucion/resuelta_por/resuelta_at/motivo_rechazo` + `reembolsos.id_solicitud_origen` + evidencia MinIO |
| Operaciones financieras y de inventario seguras | ✅ `Decimal` + cuantización monetaria; pedidos históricos intocables (probado) |

## Documentación

- `analisis-implementacion.md` — estado inicial, diseño e idempotencia.
- `pruebas-funcionales.md` — matrices de reposición/reembolso con resultados reales.
- `defectos-encontrados.md` — defectos corregidos, preexistentes y saneamiento.
- `evidencias/` + `evidencias/INDEX.md` — salidas reales de esta sesión.
- **Auditoría integrada PEN-08/09/10:** `../auditoria-integrada.md` (escenarios
  E1-E4, incluido el fallo y reintento de la pasarela, verificados en BD).

## Archivos modificados (específicos de PEN-10)

- `be/app/services/inventario_service.py` — `reintegrar_stock()` (espejo exacto de `descontar_stock`).
- `be/app/services/reembolso_service.py` — vínculo `solicitud_origen_id`.
- `be/app/services/devoluciones_service.py` — commit único estado+reembolso, dedup por origen, bloqueo de fila.
- `be/app/routers/devoluciones.py` — reposición exacta con bloqueo y `cantidad_reintegrada` en la respuesta.
- `be/app/models/especializacion.py` + migración `0063` — `reembolsos.id_solicitud_origen` UNIQUE.
- Pruebas: `be/app/tests/test_pen09_pen10_devoluciones_metros.py` (compartida con PEN-09).

## Estado final

**COMPLETADA**, con la limitación ya conocida del proyecto: la pasarela es el
simulador académico (`PAYMENT_PROVIDER=simulator`), por lo que el «envío a la
pasarela» es simulado; los estados del reembolso y el punto único de
integración quedan documentados en `analisis-implementacion.md` §2.2. No se
fabricó ningún éxito externo: no existen operaciones reales de dinero en esta
sesión (todo sobre la base de pruebas).
