# T2.0 — Consistencia de `confirmar_pago_pendiente`

Corrección del límite transaccional de `pedidos_service.confirmar_pago_pendiente`
frente a fallos, repeticiones y concurrencia. No se cambió la simulación de pagos
ni se reescribió el checkout. Sin commit/push/despliegue.

## 1. Causa reproducida

El flujo anterior, en `confirmar_pago_pendiente`:

1. Marcaba `pago.estado = "aprobado"` y `pedido.estado_pedido = "Pagado"` y hacía
   `db.commit()` **antes** de descontar stock y crear factura/entregas.
2. Retornaba anticipadamente si `pago.estado == "aprobado"` (con la factura que
   hubiera), de modo que un reintento tras una interrupción devolvía "éxito" sin
   haber descontado stock ni creado la factura.

Además, los helpers usados tenían commits internos (`_crear_factura_y_enviar`,
`_asignar_entrega`, `_crear_orden_instalacion`) y `descontar_stock` disparaba
`_verificar_stock_bajo` → `crear_notificacion`, que confirma su propia transacción.
Un `rollback` exterior no revertía esos commits internos.

Pruebas que fallaban antes de la corrección (evidencia): `test_fallo_en_articulo_posterior_no_deja_parciales`
(el pedido quedaba `Pagado` con stock sin descontar y sin factura),
`test_fallo_antes_commit_rollback_y_reintento` (el estado `Pagado` sobrevivía a un
fallo previo al commit) y `test_pago_aprobado_sin_factura_devuelve_409` (retornaba
200 con `factura=None`).

## 2. Límite transaccional definido

- **Atómico (un solo `commit`)**: aprobar el pago, marcar el pedido `Pagado`,
  descontar existencias y crear factura + entrega/órdenes de instalación.
- **Post-commit (aislado, best-effort)**: envío de la factura por correo,
  notificación al cliente, avisos a técnicos/cliente por entrega/cita y alertas de
  stock. Un fallo aquí **no deshace ni repite** la confirmación.

Orden de bloqueos (coherente con los flujos existentes): `Pedido` → `Pago` (ambos
`FOR UPDATE`) y, dentro del descuento, productos en orden determinista de
`id_detalle` (ya con `FOR UPDATE` en `descontar_stock`).

## 3. Mecanismo contra duplicados

La finalización se identifica con datos persistidos: `pago.estado == "aprobado"`
**y** `factura` existente. En el nuevo flujo ambos se confirman en la misma
transacción, por lo que:

- Pago aprobado **con** factura → operación ya completa → devolución idempotente
  (sin descontar ni crear de nuevo).
- Pago aprobado **sin** factura → estado heredado incompleto → `409` controlado
  (requiere conciliación), sin éxito engañoso.

La consulta de la factura en el camino idempotente usa `FOR UPDATE` (lectura
vigente) para no leer una instantánea obsoleta de `REPEATABLE READ`.

## 4. Cambios de código

| Archivo | Cambio |
|---|---|
| `app/services/pedidos_service.py` | Reescrito `confirmar_pago_pendiente` (fase transaccional + fase post-commit + idempotencia). Extraídos `_crear_factura` (sin commit/correo) y `_enviar_factura` (post-commit); `_crear_factura_y_enviar` queda como wrapper para el checkout. `_asignar_entrega`, `_crear_orden_instalacion`, `_crear_ordenes_instalacion_pedido`, `_crear_ordenes_instalacion_desde_detalles` aceptan `commit` y `avisos` (difieren notificaciones). Extraídos `_variante_por_descripcion` y `_cantidad_a_descontar`. |
| `app/services/inventario_service.py` | `descontar_stock` acepta `notificar_stock_bajo` (default `True`) para diferir el aviso que confirma su propia transacción. |

Consumidores: el checkout (`crear_pedido`) usa los helpers con los valores por
defecto (`commit=True`, `avisos=None`, `notificar_stock_bajo=True`), por lo que su
comportamiento no cambia. Sin cambios de permisos ni de contrato web/móvil.

## 5. Resultados de pruebas (`test_t2_pago_pendiente.py`, 10 pruebas)

| Escenario | Resultado |
|---|---|
| A. Confirmación normal | OK: pago aprobado, pedido Pagado, descuento exacto, 1 factura, entrega asignada |
| B. Fallo en artículo posterior | OK: 409, sin descuentos parciales ni factura (rollback total) |
| C. Confirmación repetida | OK: misma factura, sin descuentos adicionales (1 factura) |
| D. Confirmación concurrente (mismo pedido) | OK: una sola modificación efectiva, 1 factura, stock correcto |
| E. Dos pedidos por últimas existencias | OK: uno confirma, el otro 409; stock sin negativos |
| F. Fallo antes del commit | OK: rollback completo; un reintento posterior completa una sola vez |
| G. Fallo de aviso post-commit | OK: pedido confirmado, contadores de avisos por separado, sin repetir stock/factura/asignaciones |
| H. Cantidades y variantes | OK: metros fraccionarios truncados a entero (contrato vigente, documentado); variante descuenta su propio stock |
| I. Estado heredado incompleto | OK: `409` de conciliación, sin re-descuento ni éxito engañoso |

Garantías de la simulación actual (separadas de una futura pasarela): la aprobación
es local (`pagos_service.confirmar_pago_pendiente` solo marca estado). La atomicidad
que aquí se garantiza es de MySQL sobre los datos propios; no se atribuye atomicidad
a operaciones de un proveedor externo.

## 6. Validación

- Suite completa sobre base dedicada recién migrada: **161 pruebas OK**
  (151 previas + 10 T2.0), 0 fallidas, 0 errores, 0 omitidas.
- Limpieza: huellas de referencia idénticas y sin residuos (clientes/usuarios/
  técnicos/pedidos `>10` = 0, productos de prueba y detalle_pedido = 0).
- Cobertura (mismo denominador T0): **líneas 43.55 %** (4265/9794),
  **ramas 17.97 %** (511/2844). `services/inventario_service.py` 86.0 %,
  `services/pedidos_service.py` 23.7 %.

## 7. Pendientes

- Procedimiento de conciliación para estados heredados incompletos (pago aprobado
  sin factura): se documenta la condición; la reparación automática segura no es
  posible con los datos actuales y se deja fuera de T2.0.
- La atomicidad garantizada es local; una pasarela de pago real requerirá su propia
  idempotencia/reconciliación (no cubierta aquí).

## 8. T2.1 — Orden global de inventario, finalización verificable y metros

### 8.1 Orden de bloqueo de recursos compartidos

`descontar_stock` bloquea `Producto` (FOR UPDATE) y, si aplica, `ProductoVariante`.
Antes, el orden dependía de `id_detalle`, que no es común entre pedidos distintos
(dos pedidos con los mismos productos en orden inverso podían interbloquearse).

Ahora `confirmar_pago_pendiente` **agrupa** las líneas por recurso
`(id_producto, id_variante)` sumando cantidades y las **ordena** por esa identidad,
de modo que todos los pedidos bloquean los recursos en el mismo orden determinista.
Además, `descontar_stock` usa `populate_existing()` en la relectura FOR UPDATE para
ver el stock vigente (no una instantánea obsoleta) en concurrencia.

Pruebas: `test_dos_pedidos_orden_inverso_mismos_productos` (2 pedidos con A/B en
orden inverso, sesiones independientes, sin interbloqueo y stock correcto) y
`test_articulos_repetidos_agrupan_misma_existencia` (líneas repetidas descuentan la
suma una sola vez). No hay reintentos por errores de bloqueo; el único commit es el
de negocio (los avisos van después).

### 8.2 Finalización verificable (marcador explícito)

La regla "pago aprobado + factura" era insuficiente: el flujo antiguo podía haber
creado una factura sin entrega/órdenes. Se añadió el marcador persistido
**`pedidos.confirmacion_completa`** (Boolean nullable; migración `0059`), que se
confirma en la MISMA transacción que pago + stock + factura + entrega/órdenes.

- `pago aprobado` + `confirmacion_completa = True` → completa → devolución idempotente.
- `pago aprobado` + `confirmacion_completa` ausente/NULL → heredado ambiguo → `409`
  (conciliación), sin re-descuento ni éxito engañoso.
- El marcador no depende del estado posterior de la entrega/instalación: avanzar la
  entrega no invalida la confirmación (`test_repeticion_despues_de_avance_de_estado`).

La migración NO rellena históricos (los 10 pedidos sembrados quedan NULL, a conciliar).
Verificado instalación desde cero y actualización desde 0058 con datos.

Pruebas: `test_pago_aprobado_sin_factura_devuelve_409`,
`test_pago_aprobado_con_factura_sin_marcador_devuelve_409`,
`test_repeticion_despues_de_avance_de_estado`.

### 8.3 Cantidades fraccionarias exactas (DECIMAL)

**Decisión comercial confirmada**: Neodomus vende cortes exactos por metros. Una
compra de 1,5 m entrega, cobra y descuenta exactamente 1,5 m. No se usa ceil, `int`
ni un mínimo de una unidad para productos por metros. Los productos por unidad
mantienen cantidades enteras.

- **Representación**: `Decimal` en backend y columnas SQL `DECIMAL`
  (`productos.stock_producto`/`producto_variantes.stock` → `Numeric(12,2)`,
  `detalle_pedido.cantidad_metros` → `Numeric(10,2)`). Migración `0060`.
- **Precisión de longitud**: 2 decimales (1 cm). `_decimal_metros` rechaza entradas
  con más de 2 decimales (sin redondeo silencioso) y valores no finitos/no numéricos.
- **Precisión monetaria** (separada): 2 decimales (`_dinero`, `ROUND_HALF_UP`); el
  redondeo del dinero no cambia la cantidad física.
- **Descuento**: `descontar_stock` resta exactamente el `Decimal` (sin ceil/int),
  manteniendo lecturas vigentes (`populate_existing`) y ausencia de stock negativo.

Pruebas (escenarios A–N): 1.5 m descuenta 1.5; 0.5 m descuenta 0.5; dos líneas de
0.5 m suman 1 m (conservando las líneas); fracciones distintas suman exacto; variantes
distintas afectan solo su existencia; stock exacto deja 0; stock insuficiente → 409 sin
parciales; precisión >2 decimales rechazada; confirmación repetida no duplica.

### 8.4 Consumidores de helpers compartidos (checkout)

`descontar_stock` y los helpers de entrega/factura mantienen sus valores por defecto
(`commit=True`, `avisos=None`, `notificar_stock_bajo=True`). El cambio a `Decimal` y a
la validación exacta es coherente entre checkout y confirmación pendiente (ambos usan
`descontar_stock`/`_decimal_metros`). Las regresiones de checkout (`test_bloque_21`,
`test_entregas_comportamiento`) siguen en verde.

### 8.4-bis Entrada fraccionaria en web y móvil

- **Web** (`fe`): util `src/utils/metros.ts` (`parseMetros`/`formatMetros`) que acepta
  coma/punto, rechaza >2 decimales y valores no finitos/negativos sin redondear.
  `CartContext.updateMetros` usa `parseMetros` (sin `Math.round`). Selectores de metros
  sustituidos por entradas de texto en `ProductoDetalle.tsx`, `ProductoCard.tsx` y
  `CarritoPage.tsx` (con estados temporales vacío/"1," y validación al confirmar/blur).
- **Móvil** (`movil`): util `utils/metros.ts` homóloga; `contexts/CartContext.tsx` usa
  `parseMetros`; `app/(tabs)/producto/[id].tsx` añade `TextInput` decimal (además de los
  chips enteros como accesos rápidos).
- Typecheck web y móvil aprobados (`tsc --noEmit`).

### 8.4-ter Pruebas de consumidores reales (web)

- **Utilidades**: `src/utils/metros.test.ts` (6 casos de `parseMetros`/`formatMetros`).
- **Componentes/contexto reales**: `src/contexts/CartContext.test.tsx` (5 casos) ejecuta el
  `CartContext` real (solo se simula `useAuth`; `localStorage` real): añadir corte 1,5 m;
  editar "2,5"; rechazar "1.555" sin redondear; persistir/recuperar la fracción; producto
  por unidad con cantidad entera. Vitest web: **16 pruebas** (6 + 5 + 5 useAuthImage).
- **Integración backend (checkout)**: `test_t2_pago_pendiente.py` → `CheckoutMetrosTestCase`
  llama a `crear_pedido` (el payload que envía la web: `items` con `metros`) contra la base
  de pruebas y verifica `cantidad_metros=1.50`, `subtotal=1500.00` y `stock=3.50`.
- **Recorrido web completo (navegador automatizado)**: **no ejecutado** — no hay Playwright/
  navegador configurado en el proyecto; se declara pendiente (el typecheck/vitest no lo
  sustituyen).

### 8.5 Resultados y cobertura

- Suite completa sobre base dedicada recién migrada: **175 pruebas OK**
  (161 previas + 14 T2.1 incl. cantidades/checkout/devolución), 0 fallidas, 0 errores, 0 omitidas.
- Limpieza: huellas de referencia idénticas y sin residuos (clientes/usuarios/
  técnicos/pedidos `>10` = 0; productos de prueba y detalle_pedido = 0).
- Cobertura (mismo denominador T0): **líneas 45.31 %** (4453/9828),
  **ramas 20.20 %** (577/2856). `services/inventario_service.py` 83.6 %,
  `services/pedidos_service.py` 41.6 %, `services/devoluciones_service.py` 28.8 %.

### 8.5-bis Matriz A–N

| Escenario | Prueba (módulo) | Resultado |
|---|---|---|
| A 1.5 m → descuenta 1.5 | `test_metros_exactos_descuentan_fraccion` | OK |
| B 0.5 m → 0.5 | `test_venta_cero_cinco_metros_exacta` | OK |
| C dos líneas 0.5 → 1 m | `test_dos_lineas_medio_metro_suman_un_metro` | OK |
| D fracciones distintas | `test_dos_lineas_fracciones_diferentes_suma_exacta` | OK |
| E variantes distintas | `test_variantes_distintas_cada_una_su_existencia` | OK |
| F stock exacto → 0 | `test_disponibilidad_exacta_deja_cero` | OK |
| G stock insuficiente → 409 | `test_disponibilidad_insuficiente_rechaza_sin_parciales` | OK |
| H entradas inválidas | `test_precision_no_admitida_rechazada` (+ `metros.test.ts`) | OK |
| I decimales sucesivos sin residuo | `test_dos_lineas_medio_metro_suman_un_metro`, `test_dos_lineas_fracciones_diferentes_suma_exacta` | OK |
| J confirmación repetida | `test_confirmacion_repetida_no_duplica` | OK |
| K concurrencia fraccionaria | `test_concurrente_mismo_pedido_una_sola_vez`, `test_dos_pedidos_orden_inverso_mismos_productos` | OK |
| L producto por unidad | `test_confirmacion_normal`, `test_variante_descuenta_stock_propio`, `test_bloque_21` | OK |
| M checkout vs pago pendiente equivalentes | `test_bloque_21` (checkout) + `test_confirmacion_normal` | OK |
| N reposición exacta | `DevolucionMetrosTestCase.test_metros_entran_en_devolucion_como_entero` | Resultado C: entra como entero, pendiente de decisión |

### 8.6 Pendientes

- Conciliación manual de registros históricos ambiguos (`confirmacion_completa` NULL)
  y de existencias que pudieron descontarse mal con el antiguo truncamiento/ceil: no se
  reconstruyen automáticamente (requieren evidencia histórica); no se repara datos reales.
- Garantías de una pasarela externa (idempotencia del proveedor) siguen fuera de alcance.
- **Precisión histórica**: migrar `Float` → `Numeric(10,2)` redondea a 2 decimales cualquier
  `cantidad_metros` histórico con más decimales (p. ej. 1.555 → 1.56). No se reescriben
  migraciones aplicadas. Si existieran esos valores, se requiere una comprobación previa y
  un procedimiento de conciliación antes de desplegar la migración sobre datos reales; se
  valida aquí solo con datos sintéticos (instalación limpia y actualización desde 0059).
- **Devolución/reposición por metros — resultado C (pendiente de decisión)**: un detalle
  vendido por metros SÍ entra al flujo de devolución (`elegibilidad_pedido` usa
  `int(cantidad_detalle)` y `Devolucion.cantidad` es entero), perdiendo la fracción. No hay
  regla para determinar qué longitud se acepta/repone; no se corrige con una conversión
  entera ni se marca como no aplicable. Evidencia: `DevolucionMetrosTestCase.test_metros_entran_en_devolucion_como_entero`
  (elegible, `cantidad_comprada=1` en vez de 1.5). Decisión comercial pendiente.
- **Recorrido web completo (navegador)**: pendiente (sin Playwright configurado); la
  integración checkout→API→DB está cubierta por `CheckoutMetrosTestCase`, pero no sustituye
  un E2E de navegador.
- Comprobación visual/nativa de web y móvil NO ejecutada (pendiente); el typecheck no
  sustituye la ejecución real de la app.

## 9. Revalidación HTTP y aislamiento — 18 de octubre de 2026

Se añadió `be/app/tests/test_checkout_metros_http.py` con tres pruebas contra
la aplicación ASGI real, autenticación, esquemas, router y servicios. Usa
TEST_DATABASE_URL y testdb, exclusivamente neodomus_test_t01.

- POST /pedidos con 1.5 m y punto de pago: conserva 1.50 m, subtotal 1500.00 y
  stock 5.00 mientras está pendiente. Dos POST /confirmar-pago dejan stock
  3.50, una factura, el mismo identificador de factura y confirmacion_completa.
- 1.555 m devuelve 400 sin pedido ni descuento.
- Una compra anónima devuelve 401 sin pedido ni descuento.

Se conserva el simulador real de punto de pago. Se anulan avisos y envío de
factura; no se reemplazan la creación de pedido, la factura persistida, la
asignación, el descuento ni la confirmación. Las verificaciones de datos usan
sesiones independientes. Esto es integración HTTP, no E2E de navegador.
La prueba anterior CheckoutMetrosTestCase invoca directamente crear_pedido:
su evidencia es de servicio y no acredita el contrato HTTP por sí sola.

### Defecto encontrado en el aislamiento de T2

Una ejecución conjunta dio 27 OK pero añadió 66 notificaciones: 48 de stock
bajo y 18 de entrega. El transporte de correo neutralizado no impedía escribir
avisos para admins/técnicos sembrados. BaseT2 ahora anula esos dos emisores con
patches cuyo ciclo de vida abarca cada prueba y sus hilos. No cambia el código
productivo ni sustituye las operaciones de negocio verificadas.

Resultado final: 27 pruebas OK en 18.477 s. Conteos antes/después iguales en
clientes, usuarios, tecnicos, productos, pedidos, detalle_pedido, pagos,
facturas y notificaciones. No se calcularon huellas de contenido ni cobertura
nueva; igualdad de conteos no acredita identidad de todas las filas.

Las notificaciones residuales de ejecuciones anteriores no se borraron en
masa. La ejecución final no añade residuos en las tablas comprobadas; no se
declara que toda la base esté libre de datos históricos de pruebas.

### Pendientes que siguen abiertos

Playwright ya está configurado: el texto anterior que indicaba ausencia de
configuración está desactualizado. La verificación actual de recarga de
sesión en navegador sigue bloqueada por el entorno, según
Correccion_session_actual.md. La devolución/reposición por metros conserva
el defecto documentado: la prueba que lo reproduce pasa, pero NO significa
que el defecto comercial esté resuelto. Continúan pendientes la decisión
sobre devoluciones, la validación nativa y la conciliación de históricos.
No se hicieron commit, push, despliegue ni cambios sobre bases reales.
