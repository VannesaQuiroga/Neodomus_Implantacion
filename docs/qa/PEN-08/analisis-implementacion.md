# PEN-08 · Análisis de la implementación inicial del selector móvil de metraje

Fecha de análisis: 2026-11-11 · Rama `main` · Sin commits ni push (restricción del ticket).

## 1. Alcance y fuentes revisadas

Se rastreó el flujo completo del dato de metraje en las cuatro capas del monorepo,
**sin modificar nada** durante esta fase:

| Capa | Archivos revisados |
|---|---|
| Móvil (Expo) | `movil/utils/metros.ts`, `movil/components/public/ProductCard.tsx`, `movil/app/(tabs)/producto/[id].tsx`, `movil/app/(tabs)/carrito.tsx`, `movil/app/(tabs)/checkout.tsx`, `movil/contexts/CartContext.tsx`, `movil/services/productos.service.ts`, `movil/contexts/translations/publicTranslations.ts` |
| Backend (FastAPI) | `be/app/models/producto.py`, `be/app/models/pedido.py`, `be/app/models/producto_variante.py`, `be/app/services/pedidos_service.py`, `be/app/services/inventario_service.py`, `be/app/services/disponibilidad_service.py`, `be/app/routers/productos.py`, `be/app/tests/test_checkout_metros_http.py` |
| Web (referencia) | `fe/src/components/common/MetrosSelect.tsx`, `fe/src/components/common/MetrosSelect.test.tsx`, `fe/src/components/productos/ProductoCard.tsx`, `fe/src/pages/public/ProductoDetalle.tsx`, `fe/src/pages/public/CarritoPage.tsx`, `fe/src/contexts/CartContext.tsx`, `fe/src/utils/metros.ts`, `fe/src/utils/productoDisponibilidad.ts` |
| Base de datos | Modelos SQLAlchemy (columnas `Numeric`), sin migraciones destructivas necesarias |
| QA previo | `docs/qa/PEN-07/**` (convenciones, entorno de pruebas), `docs/gestion/Errores_equipo_2026-10-21.md`, `tests/README.md` |

## 2. Estado del selector móvil por pantalla

### 2.1 Tarjeta de producto (`movil/components/public/ProductCard.tsx`)

**Ya funciona:**
- El componente distingue `venta_por_metros` y muestra precio por metro (`precioFinal * metros`).
- Al agregar al carrito revalida `totalMetros > stockTotal` antes de `addItem` (bloqueo silencioso).
- Los metros viajan al carrito como número decimal vía contexto (`addItem(producto, { cantidad, metros })`).

**Defectos detectados (lo que falta completar en PEN-08):**
1. `METROS_OPCIONES = [10, 20, 30, 40, 50]` — opciones **fijas** en pasos de **10 m**, sin relación con
   el requisito de incrementos de **0,5 m** y sin límite por disponibilidad real.
2. `stockTotal` calculado como **suma** de los stocks de las variantes; el backend calcula el máximo
   comprable en una sola línea como `min(stock_producto, mejor variante)`
   (`disponibilidad_service.stock_disponible_producto`). La suma sobreestima la disponibilidad
   (ej.: producto 5 m con variantes 3+3 → móvil muestra 6 m, backend rechaza a partir de 5 m con 409).
3. El valor inicial `metros = 10` no se ajusta al máximo disponible cuando el stock es menor.
4. No existe aviso de "sin metraje disponible" cuando `stock < 0,5 m`.

### 2.2 Detalle de producto (`movil/app/(tabs)/producto/[id].tsx`)

**Ya funciona:**
- Entrada manual con `TextInput` + `parseMetros` (`movil/utils/metros.ts`), que admite coma o punto y
  hasta 2 decimales, sin redondeo silencioso; errores visibles bajo el campo.
- Envía `id_variante` (color/medida elegidos) → el backend valida contra la variante y el producto.
- Envía `metros` como número JSON → la parte decimal se conserva en la solicitud.

**Defectos detectados:**
1. Chips `METROS_OPCIONES = [10..50]` fijos, paso 10 m, sin límite de stock.
2. La disponibilidad usada es `varianteActiva?.stock` sin acotar por `stock_producto`
   (la web usa `min(producto, variante)`); puede sobrestimar cuando la variante tiene más stock que el producto.
3. `onBlur` solo valida `valor > 0`; **no** exige múltiplos de 0,5 m ni tope de stock al confirmar.
4. `agregarAlCarrito` valida `metros <= 0` pero no `metros > stockDisponible` (el backend lo rechazaría
   con 409, pero la interfaz no lo previene).

### 2.3 Carrito (`movil/app/(tabs)/carrito.tsx`)

**Ya funciona:**
- El ítem de metraje muestra `cantidad × metros = total` y el subtotal depende del metraje.

**Defectos detectados:**
1. El stepper de metros usa pasos **fijos de ±10 m** acotados arbitrariamente a `10..50`
   (`Math.max(10, ...)` / `Math.min(50, ...)`) — incompatible con cortes de 0,5 m.
2. No hay límite por disponibilidad: no existe `stock_maximo` en `ItemCarrito` móvil
   (la web lo almacena y valida en `updateMetros`/`updateQuantity`).
3. `updateMetros` de `CartContext` móvil parsea el valor (decimales OK) pero **no valida** contra stock.

### 2.4 Checkout (`movil/app/(tabs)/checkout.tsx`)

**Ya funciona (sin cambios necesarios):**
- Envía `items[].metros` tal cual (número JSON: `0.5`, `1.5`, `2.5` se serializan exactos).
- Los errores del backend (p. ej. 409 stock insuficiente) se muestran en pantalla.

## 3. Estado del backend y la base de datos

**Ya implementado y probado — NO se requiere modificación:**

| Aspecto | Evidencia |
|---|---|
| Almacenamiento decimal exacto | `Producto.stock_producto = Numeric(12, 2)`; `DetallePedido.cantidad_metros = Numeric(10, 2)` (`models/producto.py`, `models/pedido.py`) |
| Validación de entrada | `_decimal_metros` rechaza ≤ 0, no finitos y > 2 decimales **sin redondear** (400) |
| Disponibilidad autoritativa | Validación agregada con `Decimal` exacto antes de cobrar: 409 `Stock insuficiente de 'X' (disponible: D, solicitado: S)` |
| Condición de carrera | `descontar_stock` usa `with_for_update()` (bloqueo pesimista) dentro de la transacción del pago |
| Precisión en históricos | `test_checkout_metros_http.py`: metros 1.5 → `DetallePedido.cantidad_metros = Decimal('1.50')`; 1.555 → 400 sin pedido ni descuento |
| Reglas de máximo por línea | `disponibilidad_service.stock_disponible_producto` = `min(stock_producto, mejor variante)`; `producto_disponible` exige al menos una variante con stock |

**Historial/regresión protegida:** los cambios previstos solo afectan presentación móvil y
validaciones de carrito en la app; ninguna columna, migración, endpoint ni contrato de API cambia.
No hay recálculo de metrajes históricos.

## 4. Modelo de referencia (web) que el móvil debe igualar

- **Incrementos:** pasos de 0,5 m desde 0,5 hasta `pasos = floor(max × 2)`; opción `(i+1)/2`.
- **Sin disponibilidad:** si `max < 0,5` el selector se deshabilita con aviso "sin medidas disponibles".
- **Corte antiguo:** un valor previo no múltiplo de 0,5 (p. ej. 1,55 de datos históricos) se muestra
  tal cual, sin redondeo silencioso, y se exige elegir una medida disponible.
- **Máximo por línea:** `stockDisponible / max(1, unidades)`; al cambiar metros se reajustan las
  unidades (`floor(stock / metros)`); al confirmar se revalida contra el stock actual.
- **Carrito:** el ítem guarda `stock_maximo`; `updateMetros` rechaza y devuelve error
  `Stock insuficiente: solo hay X m disponibles`; los steppers se deshabilitan en los límites.

## 5. Precisión decimal en el flujo

- Los incrementos de 0,5 m son exactos en IEEE-754 (múltiplos de 2⁻¹) y en JSON
  (`JSON.stringify(1.5) === "1.5"`), por lo que el estado del componente puede mantener el número
  decimal sin pérdida. La generación se hace internamente en **unidades enteras de medio metro**
  (`pasos = floor(max × 2)`), como recomienda el ticket, evitando aritmética fraccionaria.
- Backend: `Decimal(str(valor))` con cuantización solo en dinero; `Numeric(10,2)/(12,2)` en MySQL.
- La interfaz móvil muestra la convención de la web (punto decimal, `formatMetros`), conservando
  internamente el valor numérico correcto.

## 6. Archivos que requieren modificación (plan mínimo)

| Archivo | Cambio | Justificación |
|---|---|---|
| `movil/utils/metros.ts` | + funciones puras: `pasosMetraje`, `opcionesMetraje`, `maxMetrajePermitido`, `esMetrajeValido` | Fuente única (DRY) para generar opciones de 0,5 m y validar; reutilizable en las 3 pantallas |
| `movil/components/public/ProductCard.tsx` | opciones dinámicas limitadas por stock; stockTotal = `min(producto, mejor variante)` (paridad web/backend); clamp inicial; aviso sin metraje | Completar el selector (núcleo de PEN-08) |
| `movil/app/(tabs)/producto/[id].tsx` | chips dinámicos 0,5 m limitados por stock variante-aware; validación onBlur (múltiplo de 0,5 + tope); validación al agregar | Completar el selector del detalle |
| `movil/contexts/CartContext.tsx` | `stock_maximo` en `ItemCarrito`; `updateMetros` valida y devuelve error (paridad con web) | Límite por disponibilidad en el carrito |
| `movil/app/(tabs)/carrito.tsx` | stepper ±0,5 m con límites por stock; paridad de unidades; aviso de stock insuficiente | Completar el selector del carrito |
| `movil/contexts/translations/publicTranslations.ts` | + claves para mensajes nuevos (ES/EN) | Convención i18n del proyecto |

**No se modificarán:** backend (`be/`), web (`fe/`), contratos de API, esquemas de BD, migraciones,
`package.json`/lockfiles, ni los cambios preexistentes de otros integrantes en el working tree.

## 7. Pruebas planificadas

1. **Unitarias del cálculo** (script standalone): `opcionesMetraje` para 5,0 / 3,2 / 2,5 / 1,5 / 0,4 / 0,0 m;
   `esMetrajeValido` para 0,5 / 1,5 / 2,5 / máximo / excedente / no múltiplo.
2. **Backend (regresión)**: `tests\run_one.ps1 -Backend test_checkout_metros_http` (infra de pruebas del repo)
   + suite de disponibilidad si la infra lo permite.
3. **Web (regresión)**: `tests\run_one.ps1 -Frontend src/components/common/MetrosSelect.test.tsx`
   y `src/utils/metros.test.ts` (no deben verse afectadas).
4. **Móvil**: `pnpm typecheck`, `pnpm lint` (solo archivos del alcance) y ejecución real en emulador
   con capturas: opciones 0,5..max por disponibilidad, selección intermedia (1,5), rechazo de excedente,
   aviso sin metraje, decimal conservado en el carrito y en el checkout.
5. **Históricos**: lectura de `detalle_pedido.cantidad_metros` en BD de desarrollo antes/después
   (solo lectura; sin escritura) para comprobar que no cambia.

## 8. Riesgos identificados

| Riesgo | Mitigación |
|---|---|
| Cambio de `stockTotal` (suma → min) altera el número mostrado en tarjetas | Es la corrección hacia el comportamiento web/backend ya definido (`producto_disponible`); se documenta en el informe |
| Ítems de carrito guardados antes del cambio carecen de `stock_maximo` | `stock_maximo ?? Infinity` en validaciones → comportamiento anterior (sin límite) en ítems viejos; el backend sigue siendo la barrera (409) |
| Coma vs punto en la visualización | Se conserva la convención de la web (punto), con `parseMetros` aceptando ambas en la entrada manual |
| Emulador/Expo Go puede fallar (precedente ANR en PEN-07) | Evidencias por captura solo de pruebas reales; si falla, se documenta como bloqueado y se respaldan con pruebas de cálculo y typecheck |
