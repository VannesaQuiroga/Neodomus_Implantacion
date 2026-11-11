# PEN-08 — Auditoría del selector de metraje móvil

**Fecha:** 2026-11-11 · **Autor de la implementación:** integrante de PEN-08
(trabajo en curso, conservado) · **Esta auditoría es complementaria** al
`analisis-implementacion.md` original y al informe compartido
`../auditoria-integrada.md`.

## Verificación por pantalla

| Pantalla | Archivo | Verificación | Resultado |
|---|---|---|---|
| Tarjeta de producto | `movil/components/public/ProductCard.tsx` | opciones 0,5 m hasta `floor(max×2)`; acotado por disponibilidad derivada; `esMetrajeValido` antes de `addItem`; `stock_maximo` guardado en el ítem | ✅ |
| Detalle de producto | `movil/app/(tabs)/producto/[id].tsx` | `opcionesMetraje(stockDisponible)`; `esMetrajeValido` + toast «stockInsuficienteMetros» al confirmar; disponibilidad = `min(producto, variante)` | ✅ |
| Carrito | `movil/app/(tabs)/carrito.tsx` | stepper ±0,5 m con límites por línea (`maxMetrosPorLinea`), unidades acotadas por `maxUnidadesPorLinea`, toast de «Stock insuficiente…» cuando el contexto rechaza | ✅ |
| Checkout | `movil/services/cliente.services.ts` | envía `metros` decimal por ítem; el backend revalida (409 si excede) | ✅ |

## Paridad de reglas con el backend

`ProductCard`/`producto/[id].tsx` calculan `min(stock_producto, mejor variante)`,
exactamente como `disponibilidad_service.stock_disponible_producto` del backend.
El corte nunca se redondea: se trabaja en «pasos» enteros de 0,5 m
(`pasosMetraje`) y `formatMetros` evita residuos de coma flotante.

## Controles ejecutados (real, esta sesión)

- `tsc --noEmit` móvil: **OK**.
- **Bundle Android** (`npx expo export --platform android`): **OK** (4,8 MB
  `entry-…hbc`) — compila con todos los cambios PEN-08.
- Lint: 86 hallazgos (27 errores/59 warnings), **todos preexistentes** (Expo 58
  y archivos ajenos); los 3 de archivos PEN-08 están fuera del diff (líneas 18,
  81 y 103). Evidencia: `evidencias/lint-movil-clasificado.txt`,
  `evidencias/lint-archivos-pen08.txt`.
- Flujo de negocio con compras por metros: cubierto por los escenarios E1-E4
  del backend (HTTP real), ver `../auditoria-integrada.md` §3.

## Bloqueada

- **Prueba visual del checkout en Expo Go:** sin `adb` ni emulador/dispositivo
  Android en esta máquina (el proceso qemu activo es la VM de Docker); antecedente
  PEN-07 (ANR en Expo Go). Se valida compilación (bundle) y contrato HTTP, y se
  deja la prueba visual **bloqueada por entorno**, no aprobada.
