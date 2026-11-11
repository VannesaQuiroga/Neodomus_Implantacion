# PEN-10 — Análisis e implementación: reposición y reembolso por metros

**Fecha:** 2026-11-11 · **Rama:** `main` (sin commits ni push, restricción del ticket)
**Relación:** PEN-10 opera sobre las solicitudes y decisiones generadas por
PEN-09 (`analisis-implementacion.md` de PEN-09 describe la auditoría completa
y los cambios compartidos; este documento cubre lo específico de reposición,
reembolso, idempotencia y trazabilidad).

---

## 1. Estado inicial

### 1.1 Flujo existente respetado (no se reemplazó)

- **La reposición requería (y sigue requiriendo) dos condiciones**: aprobación
  administrativa (`estado='Aprobada'`) y **recogida física confirmada por el
  técnico con evidencia fotográfica** (`recogida_estado='Recogida'` + foto en
  MinIO). Es decir, NeoDomus ya exigía verificación física antes de tocar el
  inventario: «el producto NO vuelve al inventario aquí; entra cuando el
  técnico confirma la recogida física con evidencia»
  (`routers/devoluciones.py`, nota en el resolver legado). Se respetó.
- **El reembolso** se registraba al aprobar (resolución `Reembolso`) con
  estados `Pendiente → Procesando → Reembolsado | Rechazado` y se procesaba con
  el simulador académico; el admin además confirma el cierre del pipeline con
  «Confirmar reembolso» (`Recibida → Reembolso procesado`).
- **Una sola resolución por devolución** (`Reembolso | Cambio`, mutuamente
  excluyentes) ya existía; se mantuvo.

### 1.2 Defectos de PEN-10 detectados

1. **Reposición con cantidad errónea** para cortes por metros: `stock += cantidad`
   (1 m) en lugar de la longitud del corte (2,5 m).
2. **Variante no repuesta**: el checkout descuenta producto + variante; la
   reposición solo devolvía el stock del producto → deriva de inventario.
3. **Reembolso con monto incorrecto** para cortes (precio/m × 1).
4. **Idempotencia débil**: dedup de reembolsos solo por consulta (sin índice
   único en BD); la confirmación de recogida no bloqueaba la fila → doble
   reintegro posible con dos técnicos o doble envío.
5. **Decisión no atómica**: el estado de la solicitud se confirmaba en un
   commit y el reembolso en otro (ventana de estado a medias ante un fallo).

## 2. Cambios implementados

### 2.1 Reposición (inventario)

- `be/app/services/inventario_service.py` — nuevo `reintegrar_stock()`:
  espejo exacto de `descontar_stock` (mismo bloqueo `SELECT ... FOR UPDATE`
  y `populate_existing`, aritmética `Decimal`), acepta cantidad entera (unidades)
  o `Decimal` (metros) y repone también la variante cuando es identificable.
- `be/app/routers/devoluciones.py` — `subir_evidencia_recogida`:
  - bloquea la fila de la `Devolucion` y revalida `estado='Aprobada'` y
    `recogida_estado != 'Recogida'` **dentro** de la transacción;
  - cantidad a reponer = `devolucion.cantidad_metros` (metros) o `cantidad`
    (unidades) — la MISMA que se descontó al comprar;
  - variante deducida de la descripción congelada del pedido
    (`_variante_por_descripcion`);
  - evidencia + estado de recogida + reintegro en **un solo commit**;
  - respuesta expone `cantidad_reintegrada` (2,5 → 2.5).
- **No se incrementa el inventario en la aprobación**: la política existente
  exige primero la verificación física (recogida con evidencia) y se conserva.

### 2.2 Reembolso (importes históricos)

- El monto se calcula en `crear_solicitud()` con `Decimal` a partir de los
  valores HISTÓRICOS del pedido (`detalle_pedido.precio_unitario_detalle` ×
  metros), nunca del precio actual del catálogo (probado explícitamente).
- `reembolso_service.crear_reembolso(..., solicitud_origen_id=None)` registra
  el vínculo con la solicitud origen (trazabilidad).
- Descuentos/impuestos/promociones: el precio unitario ya venía congelado con
  el descuento aplicado en el checkout (`precio_service.calcular_precio_unitario`),
  por lo que el reembolso respeta las reglas existentes del pedido.
- Estados del reembolso expuestos al admin (`reembolso.estado`,
  `numero_transaccion_reembolso`): diferencia solicitado/aprobado/enviado/
  confirmado según el estado de la pasarela.
- **Limitación honesta**: con `PAYMENT_PROVIDER=simulator` el «envío a la
  pasarela» es el simulador académico (aprobación inmediata). Si una pasarela
  real rechaza, el estado queda `Rechazado` y la solicitud NO se marca
  `Reembolso procesado` (ese paso exige `reembolso.estado == 'Reembolsado'`
  en `avanzar_por_recogida` y el botón del admin).

### 2.3 Idempotencia y concurrencia

| Mecanismo | Dónde |
|---|---|
| Bloqueo de fila de la solicitud + relectura antes de validar transición | `cambiar_estado()` |
| Estado aprobado + reembolso confirmados en la misma transacción | `cambiar_estado()` → `_crear_reembolso_solicitud()` |
| Índice único en BD `reembolsos.id_solicitud_origen` (migración 0063) | última barrera anti-duplicado |
| Dedup por consulta (`id_solicitud_origen` o motivo `DEV-n`) | `_crear_reembolso_solicitud()`, `serializar_solicitud()` |
| Bloqueo de fila de la devolución + revalidación de `recogida_estado` dentro de la transacción | `subir_evidencia_recogida` |
| Validación de estados forward-only (no reejecutar completado) | `TRANSICIONES` (existente, conservado) |

- Reintento tras resultado incierto: si `procesar_reembolso` lanza excepción,
  el reembolso queda `Rechazado` (no exitoso fabricado); un reintento
  administrativo vuelve a pasar por el dedup → un solo registro por solicitud.

### 2.4 Trazabilidad

- `solicitudes_devolucion.resolucion / resuelta_por / resuelta_at /
  motivo_rechazo / observaciones_admin` (existentes) + nueva columna
  `reembolsos.id_solicitud_origen` → toda decisión y operación es reconstruible:
  solicitud → líneas → recogida (evidencia en MinIO) → reembolso (transacción).
- El panel admin muestra «Decidida el» (fecha de decisión) y el estado del
  reembolso con su número de transacción.

## 3. Seguridad y autorización

- Reposición: solo `get_current_employee` (técnico asignado o verificación de
  ficha) y `estado='Aprobada'` — decisión administrativa obligatoria.
- Reembolsos: creación al aprobar (endpoint admin `_admin`); reembolsos
  manuales solo admin (`POST /reembolsos`); el cliente solo consulta
  (`GET /reembolsos/mis`) — verificado en la suite de permisos existente
  (`test_t1_3_permisos`) que sigue pasando.
- Cantidad/importe/decisión no son manipulables por HTTP: el backend recalcula
  el monto y exige la fracción exacta (tests HTTP de manipulación incluidos).

## 4. Base de datos

Migración `0063` (aditiva, reversible, sin borrados):
`devoluciones.cantidad_metros NUMERIC(10,2) NULL` y
`reembolsos.id_solicitud_origen INT NULL UNIQUE + índice`. Aplicada en
`neodomus` y `neodomus_test`. Los valores históricos de pedidos, cortes y pagos
no se alteran en ninguna operación del flujo (probado).

## 5. Limitaciones y pendientes

1. **Pasarela real**: no existe integración externa; el punto único de
   conexión es `reembolso_service.procesar_reembolso`. Con una pasarela real
   habría que añadir clave de idempotencia del proveedor (el estado
   `numero_transaccion_reembolso` ya existe para ello).
2. `test_precarga...` (bloque_11) mostró un deadlock intermitente de MySQL en
   una ejecución saturada de la suite completa (preexistente, no reproducible
   de forma determinista; pasó en la re-ejecución).
3. Las líneas legadas sin solicitud (filas antiguas de `devoluciones` sin
   `id_solicitud_dv`) conservan su flujo antiguo sin metadatos de metros.
