# Informe técnico — Corrección de 6 hallazgos de SonarCloud (NeoDomus)

## A. Información general

| Campo | Valor |
|---|---|
| Proyecto | NeoDomus |
| Herramienta de análisis | SonarCloud |
| Hallazgos seleccionados | 6 |
| Archivos modificados | `fe/src/components/auth/CompletarDatosModal.tsx`, `fe/src/components/productos/ProductoCard.tsx` |
| Fecha de ejecución | 2026-11-07 |
| Objetivo | Eliminar las 6 violaciones reportadas (reglas Sonar `S3500`/`S2509`: preferir `Number.parseInt` y `Number.isNaN`) preservando exactamente el comportamiento funcional |

Reglas aplicadas:

- **javascript:S3500 / typescript:S3500** — «Preferir `Number.parseInt` en lugar de `parseInt`» (referencia global explícita; evita mutación accidental del objeto global al asignar alguna variable `parseInt`).
- **javascript:S2509 / typescript:S2509** — «Usar solo `Number.isNaN` para comprobar `NaN`» (`isNaN` global coerciona implícitamente; `Number.isNaN` es estricta).

## B. Análisis individual de cada hallazgo

### Hallazgo 1

**1. Identificación**

- N.º: 1
- Archivo: `fe/src/components/auth/CompletarDatosModal.tsx`
- Ubicación: `handleSubmit`, conversión del número de documento (línea 51 del original)
- Regla: SonarCloud S3500 — preferir `Number.parseInt`

**2. ANTES**

```ts
const doc = parseInt(documento, 10);
const tel = parseInt(telefono, 10);
if (!doc || doc <= 0) {
  setError('Ingresa un número de documento válido');
  return;
}
```

**3. Problema identificado**

SonarCloud recomienda la referencia estática `Number.parseInt` en lugar del global sin objeto: si en algún ámbito se asignara una variable denominada `parseInt`, el flujo rompería silenciosamente ambas formas de resolución (regla S3500).

**4. DESPUÉS**

```ts
const doc = Number.parseInt(documento, 10);
const tel = Number.parseInt(telefono, 10);
if (!doc || doc <= 0) {
  setError('Ingresa un número de documento válido');
  return;
}
```

**5. Justificación técnica**

Referencia estática al método de `Number` elimina la dependencia de la variable global y del `this` implícito, alineada con las guías modernas (`ES2015+`, `tsconfig` con lib DOM/es). Mejora la robustez sin costo de rendimiento.

**6. Impacto funcional**

Ninguno: mismo resultado numérico con `radix 10`, mismas validaciones (`!doc || doc <= 0`), mismos mensajes de error.

### Hallazgo 2

**1. Identificación**

- N.º: 2
- Archivo: `fe/src/components/auth/CompletarDatosModal.tsx`
- Ubicación: `handleSubmit`, conversión del teléfono (línea 52 del original)
- Regla: S3500 — preferir `Number.parseInt`

**2. ANTES**

```ts
const tel = parseInt(telefono, 10);
```

**3. Problema identificado**

Mismo fundamento del hallazgo 1: se proporciona `radix 10`, pero mediante el resolver global genérico.

**4. DESPUÉS**

```ts
const tel = Number.parseInt(telefono, 10);
```

**5. Justificación técnica**

Consistencia con la corrección del hallazgo 1 y con el estándar del proyecto; elimina la ambigüedad del global.

**6. Impacto funcional**

Ninguno: sin alterar la validación `!tel || String(telefono).length !== 10` ni el mensaje de error asociado.

### Hallazgo 3

**1. Identificación**

- N.º: 3
- Archivo: `fe/src/components/auth/CompletarDatosModal.tsx`
- Ubicación: `handleSubmit`, conversión del tipo de documento en el payload antes de la llamada a la API (línea 69 del original)
- Regla: S3500 — preferir `Number.parseInt`

**2. ANTES**

```ts
await api.put('/clients/me', {
  id_tipo_documento_c: parseInt(tipoDocumento, 10),
  documento_cliente: doc,
  telefono_cliente: tel,
  address: direccion.trim(),
});
```

**3. Problema identificado**

Tercera aparición del patrón global en el mismo componente; SonarCloud la enumeró de forma independiente.

**4. DESPUÉS**

```ts
await api.put('/clients/me', {
  id_tipo_documento_c: Number.parseInt(tipoDocumento, 10),
  documento_cliente: doc,
  telefono_cliente: tel,
  address: direccion.trim(),
});
```

**5. Justificación técnica**

Unifica la técnica de conversión del componente (3 usos) bajo la referencia estática; el contrato del payload (campos y tipos) no se modifica.

**6. Impacto funcional**

Ninguno: la petición `PUT /clients/me` conserva su estructura exacta (mismos campos, mismos valores converted).

### Hallazgo 4

**1. Identificación**

- N.º: 4
- Archivo: `fe/src/components/productos/ProductoCard.tsx`
- Ubicación: `handleCantidadBlur`, parseo de la cantidad digitada (línea 221 del original)
- Regla: S3500 — preferir `Number.parseInt`

**2. ANTES**

```ts
const handleCantidadBlur = (e: React.FocusEvent<HTMLInputElement>) => {
  const raw = e.target.value.trim();
  const num = parseInt(raw, 10);
  if (raw === '' || isNaN(num) || num < 1) { ... }
```

**3. Problema identificado**

La conversión controla la normalización de la cantidad al abandonar el campo; SonarCloud pidió la referencia estática.

**4. DESPUÉS**

```ts
const handleCantidadBlur = (e: React.FocusEvent<HTMLInputElement>) => {
  const raw = e.target.value.trim();
  const num = Number.parseInt(raw, 10);
  if (raw === '' || Number.isNaN(num) || num < 1) { ... }
```

**5. Justificación técnica**

Elimina la resolución global en el camino de entrada del carrito (componente crítico para compras) y estandariza la técnica.

**6. Impacto funcional**

Ninguno: la normalización (`num > stockDisponible ? stockDisponible : num`) y el reinicio a 1 se mantienen exactos.

### Hallazgo 5

**1. Identificación**

- N.º: 5
- Archivo: `fe/src/components/productos/ProductoCard.tsx`
- Ubicación: `handleCantidadBlur`, chequeo `NaN` de la cantidad (línea 222 del original)
- Regla: S2509 — usar `Number.isNaN` en lugar de `isNaN`

**2. ANTES**

```ts
if (raw === '' || isNaN(num) || num < 1) {
  setCantidad(1);
  setDisplayValue('1');
}
```

**3. Problema identificado**

El `isNaN` global **coerciona** su argumento a número antes de comparar (p. ej. `isNaN('abc')` devuelve `true` por coerción): en este código el argumento ya es número, pero la regla exige comprobación estricta para prevenir errores si el tipo cambia a futuro.

**4. DESPUÉS**

```ts
if (raw === '' || Number.isNaN(num) || num < 1) {
  setCantidad(1);
  setDisplayValue('1');
}
```

**5. Justificación técnica**

`Number.isNaN` esIME la comprobación estricta (devuelve `true` únicamente si el valor ES `NaN`, sin coerción):-semántica más firme y recomendación directa de SonarCloud.

**6. Impacto funcional**

Ninguno: con `num` ya siendo número, ambos devuelven el mismo resultado; las ramas y los mensajes no cambian.

### Hallazgo 6

**1. Identificación**

- N.º: 6
- Archivo: `fe/src/components/productos/ProductoCard.tsx`
- Ubicación: `onBlur` del campo de unidades (productos por metraje), línea 391 del original
- Regla: S3500 — preferir `Number.parseInt` (y revisión de `isNaN` en la misma ubicación)

**2. ANTES**

```ts
onBlur={(e) => {
  const raw = e.target.value.trim();
  const num = parseInt(raw, 10);
  const stock = stockDisponible;
  const maxU = Number.isFinite(stock)
    ? Math.max(1, Math.floor(stock / metros) || 1)
    : Infinity;
  if (raw === '' || isNaN(num) || num < 1) {
    setUnidades(1);
  } else {
    setUnidades(num > maxU ? maxU : num);
  }
  setDisplayUnidades(undefined);
}}
```

**3. Problema identificado**

Mismo patrón global (parseo + `isNaN`) en el control de unidades por metraje; SonarCloud lo levantó como hallazgo separado por otra función.

**4. DESPUÉS**

```ts
onBlur={(e) => {
  const raw = e.target.value.trim();
  const num = Number.parseInt(raw, 10);
  const stock = stockDisponible;
  const maxU = Number.isFinite(stock)
    ? Math.max(1, Math.floor(stock / metros) || 1)
    : Infinity;
  if (raw === '' || Number.isNaN(num) || num < 1) {
    setUnidades(1);
  } else {
    setUnidades(num > maxU ? maxU : num);
  }
  setDisplayUnidades(undefined);
}}
```

**5. Justificación técnica**

Consistencia total del componente (ambos controles usan ahora referencias estáticas); el cálculo de `maxU`, el tratamiento de existencias y las condiciones quedan intactos.

**6. Impacto funcional**

Ninguno: la lógica de unidades por metraje (límite por stock, reinicio a 1, limpieza del valor temporal) se mantiene exactamente.

## C. Resumen comparativo

| N.º | Archivo | Problema detectado | Corrección aplicada | Estado |
|---|---|---|---|---|
| 1 | CompletarDatosModal.tsx | parseInt | Number.parseInt | Corregido |
| 2 | CompletarDatosModal.tsx | parseInt | Number.parseInt | Corregido |
| 3 | CompletarDatosModal.tsx | parseInt | Number.parseInt | Corregido |
| 4 | ProductoCard.tsx | parseInt | Number.parseInt | Corregido |
| 5 | ProductoCard.tsx | isNaN | Number.isNaN | Corregido |
| 6 | ProductoCard.tsx | parseInt | Number.parseInt | Corregido |

## D. Resultados de las pruebas

| Comprobación | Comando | Resultado |
|---|---|---|
| Verificación de restos de `parseInt`/`isNaN` globales en los 2 archivos (regex extendida) | `Select-String "(?<!Number\.)\bparseInt\(|(?<!Number\.)\bisNaN\("` | **PASS** — 0 restos |
| TypeScript (comprobación de tipos) | `node node_modules/typescript/bin/tsc --noEmit` | **PASS con avisos preexistentes** (2 errores en `ProductoDetalle.integration.test.tsx` presentes en `main` ANTES de esta intervención; sin errores nuevos attributables) |
| Suite relacionada (carrito/detalle/selector) | `node node_modules/vitest/vitest.mjs run src/components/productos/ProductoCard.test.tsx src/pages/public/ProductoDetalle.integration.test.tsx src/components/common/MetrosSelect.test.tsx src/pages/public/CheckoutPage.pse.test.tsx …` | **PASS 9/9** |
| Suite completa del frontend | `node node_modules/vitest/vitest.mjs run --pool=threads --maxWorkers=1 --minWorkers=1` | **101/102 PASS** (el único fallo es el mismo preexistente de `main`: `AuthImagesSession.test.tsx`, no relacionadas con los hallazgos) |
| ESLint | — | **NOT RUN** — el proyecto declara `eslint.config.js`, pero el binario no está instalado en `node_modules` actual (instalación local incompleta documentada previamente); tras instalar las herramientas podría ejecutarse, pero no se modificó el lockfile para esta tarea |

## E. Conclusiones

- **Corregidos**: los 6 hallazgos seleccionados de SonarCloud dentro de los 2 archivos señalados, sin tocar ningún otro módulo.
- **Mejora de calidad**: referencias estáticas (`Number.parseInt`/`Number.isNaN`) en los 6 puntos → eliminación de la resolución global y de la coerção implícita de `isNaN`; código más predecible y alineado con las reglas S3500/S2509.
- **Mantenibilidad**: patrón único de conversión numérica en cada componente; más fácil de auditar y de mantener evolutivamente.
- **Comportamiento funcional**: preservado en su totalidad — las validaciones (documento, teléfono, dirección, límites de stock, reinicios), mensajes y payloads no cambiaron; lo confirman las 9 pruebas dirigidas y la suite completa (101/102 con el mismo único fallo preexistente de `main`).
- **Pendiente**:
- Que SonarCloud deje de reportar los hallazgos requiere un **nuevo análisis en el pipeline** (no ejecutado en local; no se afirma que ya esté limpio).
- ESLint disponible para ejecutarse cuando el entorno instale el binario (no se tocó `package.json`/lockfile).
