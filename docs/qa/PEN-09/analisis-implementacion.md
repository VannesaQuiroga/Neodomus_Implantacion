# PEN-09 — Análisis e implementación: devolución del corte completo por metros

**Fecha:** 2026-11-11 · **Rama:** `main` (sin commits ni push, restricción del ticket)
**Alcance:** PEN-09 y PEN-10 implementados como un único flujo de negocio coherente.

---

## 1. Estado inicial (auditoría previa a modificar)

La auditoría recorrió las cuatro capas del monorepo (móvil, web, admin, backend/BD)
sin modificar nada durante la fase de análisis.

### 1.1 Lo que YA existía y funcionaba (no se reemplazó)

- **Pipeline de devoluciones completo** en `be/app/services/devoluciones_service.py`:
  `Solicitada → En revisión → Aprobada → Producto en devolución → Recibida →
  Reembolso procesado` (+ `Rechazada` con motivo obligatorio), con mapa de
  transiciones forward-only (`TRANSICIONES`) validado en backend.
- **Cabecera + líneas**: `solicitudes_devolucion` (nº público `DEV-000001`) y
  `devoluciones` (líneas legadas vinculadas por `id_solicitud_dv`).
- **Elegibilidad** restringida a pedidos entregados (`estado_entrega='Entregado'`
  o cita de instalación `Finalizada`), sin reutilizar inventario para reconstruir
  históricos (usa los valores congelados de `detalle_pedido`).
- **Panel administrativo web** `fe/src/pages/admin/AdminDevoluciones.tsx`:
  consulta, aprobar (Reembolso/Cambio), rechazar con motivo, observaciones
  internas, reasignación de técnico y pestaña de reembolsos.
- **Asistente del cliente** en `fe/src/components/profile/OrdersTab.tsx`
  (3 pasos: productos → motivo → resumen).
- **Recepción física real**: el stock NO vuelve al aprobar; vuelve cuando el
  técnico confirma la recogida con evidencia fotográfica en MinIO
  (`POST /devoluciones/{id}/evidencia-recogida`). Este es el flujo de
  recepción/inspección existente de NeoDomus y se respetó íntegramente.
- **Reembolsos** registrados en `reembolsos` con estados
  `Pendiente → Procesando → Reembolsado | Rechazado` e integrados con la
  pasarela simulada (`pagos_service`, `PAYMENT_PROVIDER=simulator`).
- **Idempotencia preexistente en pedidos**: marcador `pedidos.confirmacion_completa`,
  bloqueos pesimistas `with_for_update()` y patrón de commit único (T2).

### 1.2 Defecto que PEN-09 debía corregir (documentado desde T2)

- `elegibilidad_pedido` leía `int(d.cantidad_detalle)`: un corte de 2,5 m
  (guardado como `cantidad_detalle=1`, `cantidad_metros=2.50`) entraba al flujo
  como **1 unidad entera**, perdiendo la fracción (evidencia: `DevolucionMetrosTestCase`
  en `be/app/tests/test_t2_pago_pendiente.py`; §8.6 de `docs/T2_consistencia_pago_pendiente.py`).
- Consecuencias en cadena:
  - `monto_total` de la solicitud = precio por metro × 1 (debía ser × 2,5).
  - Reposición de inventario `stock += cantidad` (sumaba 1 m en vez de 2,5).
  - El frontend no permitía expresar metros en la devolución.
- **Regla comercial ya elegida por el equipo** (`docs/gestion/Errores_equipo_2026-10-21.md`,
  líneas 52-53): «devoluciones de corte completo con revisión administrativa.
  Su implementación sigue pendiente» → es exactamente PEN-09. No se inventaron
  excepciones para devoluciones parciales.

### 1.3 Otros hallazgos de la auditoría

- `POST /devoluciones/solicitudes` y `POST /devoluciones` (legado) no capturaban
  `PermissionError` (pedido ajeno/inexistente) → **500** en vez de un rechazo
  limpio (corregido, ver §2).
- El dedup de reembolsos era solo por consulta (`motivo LIKE '%DEV-n%'`),
  sin barrera en base de datos → susceptible de carrera.
- La recogida de evidencia no bloqueaba la fila de la devolución → dos
  confirmaciones simultáneas podían reintegrar stock dos veces.
- La reposición no restituía el stock de la **variante** (el checkout sí lo
  descuenta), generando deriva de inventario.

---

## 2. Implementación

### 2.1 Base de datos (migración aditiva 0063, reversible)

`be/alembic/versions/0063_devolucion_metros_y_reembolso_origen.py`:

- `devoluciones.cantidad_metros NUMERIC(10,2) NULL` — longitud del corte devuelto.
  Los registros existentes quedan intactos (NULL = devolución por unidades).
- `reembolsos.id_solicitud_origen INT NULL UNIQUE` — trazabilidad reembolso↔solicitud;
  el índice único impide en la BD un segundo reembolso de la misma devolución.

No se eliminan columnas, relaciones ni registros. `downgrade()` revierte ambos
cambios. Aplicada en `neodomus` (dev) y `neodomus_test` (pruebas).

### 2.2 Backend

| Archivo | Cambio |
|---|---|
| `be/app/models/devolucion.py` | Columna `cantidad_metros` (Numeric(10,2), NULL). |
| `be/app/models/especializacion.py` | `Reembolso.id_solicitud_origen` (unique). |
| `be/app/services/devoluciones_service.py` | Ver §2.2.1. |
| `be/app/services/reembolso_service.py` | `crear_reembolso(..., solicitud_origen_id=None)` (aditivo, retrocompatible). |
| `be/app/services/inventario_service.py` | `reintegrar_stock()`: espejo exacto de `descontar_stock` (bloqueo FOR UPDATE, aritmética `Decimal`, acepta metros decimales y repone también la variante). |
| `be/app/routers/devoluciones.py` | Ver §2.2.2. |

#### 2.2.1 `devoluciones_service.py`

- **`compromiso_por_producto()`**: contabiliza unidades Y metros comprometidos
  por producto en solicitudes no rechazadas. Las filas legadas de un corte
  (sin `cantidad_metros`) comprometen el corte completo de su detalle → los
  históricos antiguos no habilitan una segunda devolución.
- **`elegibilidad_pedido()`**: para líneas por metros expone
  `venta_por_metros`, `metros_comprados`, `metros_disponibles` y `monto_maximo`
  (metros × precio unitario histórico). El corte solo es devoluble completo e
  intacto (`cantidad_disponible` 1/0). Los campos legados
  (`cantidad_comprada`, `cantidad_disponible`) se conservan para compatibilidad.
- **`crear_solicitud()`**: acepta `metros` por ítem y valida en backend:
  - el corte debe coincidir EXACTAMENTE con el comprado (`metros != metros_comprados`
    → rechazo); más de 2 decimales o ≤ 0 → rechazo (mismo criterio que el checkout);
  - rechaza `metros` en productos por unidades;
  - acepta la forma legada `cantidad=1` (corte entero) para no romper consumidores;
  - rechaza un segundo corte con devolución activa;
  - `monto_total` se calcula con `Decimal` (precisión monetaria 2 decimales,
    ROUND_HALF_UP) sobre los valores HISTÓRICOS del pedido.
- **`cambiar_estado()`**: bloquea la fila de la solicitud (`SELECT ... FOR UPDATE`)
  y relee el estado antes de validar la transición → dos administradores
  simultáneos se serializan. El estado aprobado y el reembolso se confirman en
  la misma transacción.
- **`_crear_reembolso_solicitud()`**: dedup por `id_solicitud_origen` + motivo;
  `IntegrityError` (última barrera del índice único) → rollback limpio y error
  sin estado a medias.
- **`serializar_solicitud()`**: los ítems exponen `metros`, `venta_por_metros`
  y `subtotal_linea = precio/m × metros` (Decimal).

#### 2.2.2 `routers/devoluciones.py`

- `ItemDevolucionIn.metros` (str|int|float; la precisión la valida el servicio).
- `POST /devoluciones` y `POST /devoluciones/solicitudes`: capturan
  `PermissionError` → **404** (defecto preexistente que respondía 500).
- **Reposición exacta** en `subir_evidencia_recogida`: bloquea la fila de la
  devolución, revalida estado/recogida dentro de la transacción, deduce la
  variante de la descripción congelada del pedido y llama a `reintegrar_stock`
  con la cantidad EXACTA (metros del corte o unidades). La respuesta expone
  `cantidad_reintegrada`. El reintegro conserva el flujo existente: solo ocurre
  con evidencia de recogida (recepción física), nunca en la aprobación.
- Notificaciones: «2,5 m de Cable thhn» en lugar de «1×».

### 2.3 Frontend web

| Archivo | Cambio |
|---|---|
| `fe/src/components/profile/OrdersTab.tsx` | El asistente muestra los cortes por metros con su longitud (`formatMetros`), bloquea el stepper (devolución todo-o-nada) y envía `metros` en el payload; resumen y pipeline muestran «2,5 m». |
| `fe/src/pages/admin/AdminDevoluciones.tsx` | Detalle: «2,5 m × $20.000/m = $50.000», fila «Decidida el» (fecha de la decisión administrativa). |
| `fe/src/i18n/profileTabsTranslations.ts` | Claves ES/EN: `corteCompleto`, `corteCompletoHint`, `compradosPrecioMetros`. |
| `fe/src/styles/perfil-cliente.css` | Estilo mínimo `.pf-dev-metros`. |

El backend es la barrera final: aunque se manipule la petición HTTP, una
fracción no autorizada se rechaza con 400 y el mensaje indica el corte completo.

### 2.4 Móvil

Sin cambios. La app móvil no tenía flujo de solicitud de devolución (solo
lectura de reembolsos y recogidas del técnico); se conserva intacto el trabajo
no confirmado de PEN-08 (`movil/utils/metros.ts`, `CartContext.tsx`,
`publicTranslations.ts`). Limitación documentada en §5.

---

## 3. Protección de datos históricos

- Ni la solicitud ni la decisión modifican `pedidos`, `detalle_pedido` ni `pagos`:
  la devolución se registra como operación RELACIONADA (nuevas filas en
  `solicitudes_devolucion` + `devoluciones`).
- El reembolso se calcula desde `detalle_pedido.precio_unitario_detalle` (precio
  congelado en el checkout) × metros comprados; el precio actual del catálogo no
  interviene (hay prueba: el precio cambia DESPUÉS de la compra y el reembolso
  sigue siendo 2,5 × 20.000 = 50.000).
- Cantidades: `Decimal` en toda la lógica; persistencia `NUMERIC(10,2)`; sin
  conversiones a enteros en ningún punto del flujo.

## 4. Idempotencia (resumen; detalle en PEN-10)

- Aprobación: bloqueo de fila + transiciones + índice único en `reembolsos`.
- Reposición: bloqueo de fila de la devolución + revalidación de
  `recogida_estado` dentro de la transacción.
- Prueba de doble clic y de concurrencia en
  `be/app/tests/test_pen09_pen10_devoluciones_metros.py`.

## 5. Limitaciones y pendientes

1. **Móvil**: no existe flujo de solicitud de devolución (preexistente); la
   solicitud se hace desde la web. El técnico sí recoge/evidencia desde móvil.
2. **Pasarela**: `PAYMENT_PROVIDER=simulator` aprueba siempre el reembolso;
   si se conecta una pasarela real, `reembolso_service.procesar_reembolso` es
   el punto único de integración (los estados Pendiente/Procesando/Reembolsado/
   Rechazado ya existen y se exponen al admin).
3. **Dinero en `Float`** en BD (convención del proyecto; el cálculo es Decimal
   exacto y se cuantiza a 2 decimales antes de persistir). Cambiar los tipos
   monetarios queda fuera de este ticket (§5 de restricciones).
4. Dos líneas del mismo producto en un pedido (unidades + corte) colapsan en la
   vista por producto (limitación preexistente de la elegibilidad); el backend
   acepta `cantidad` y `metros` simultáneos para ese caso.
5. El test documental `DevolucionMetrosTestCase` (T2) se conserva sin cambios:
   sigue pasando porque la elegibilidad mantiene los campos legados; la
   semántica por metros vive en los campos nuevos.
