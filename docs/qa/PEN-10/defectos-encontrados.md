# PEN-10 — Defectos encontrados, correcciones y pendientes

## Corregidos en esta sesión (implícitos en el flujo PEN-09/10)

### C1. Reposición con metros incorrectos
- **Síntoma:** al confirmar la recogida de un corte de 2,5 m se sumaba 1 al stock.
- **Corrección:** `reintegrar_stock()` con la cantidad exacta (`Decimal`), la
  misma que se descontó en el checkout.
- **Prueba:** `test_reposicion_registra_metros_exactos` (10.00 → 12.50).

### C2. Deriva de inventario: la variante no se reponía
- **Síntoma:** el checkout descuenta producto + variante; la reposición solo
  devolvía el stock del producto.
- **Corrección:** la variante se deduce de la descripción congelada del pedido
  y se reponen ambas existencias con la misma cantidad.
- **Prueba:** `test_reposicion_reintegra_variante_con_metros`.

### C3. Doble reintegro de stock en condiciones de carrera
- **Síntoma (potencial):** dos confirmaciones simultáneas de recogida (doble
  clic, dos técnicos, reintento tras error de red) podían sumar el stock dos
  veces: la comprobación `recogida_estado == 'Recogida'` no estaba protegida.
- **Corrección:** `SELECT ... FOR UPDATE` sobre la fila de la devolución +
  revalidación del estado dentro de la transacción (evidencia + estado +
  reintegro en un solo commit).
- **Pruebas:** `test_reintento_recogida_no_duplica_inventario`,
  `test_reposicion_concurrente_una_sola_ejecuta` (códigos `[200, 400]`,
  stock exactamente +2,50).

### C4. Reembolso duplicable en carrera / sin barrera en BD
- **Síntoma (potencial):** el dedup era una consulta (LIKE sobre el motivo);
  dos aprobaciones simultáneas de la misma solicitud podían crear dos
  reembolsos; además estado y reembolso se confirmaban en commits separados.
- **Corrección:** bloqueo pesimista de la solicitud + transición validada tras
  el bloqueo + commit único (estado + reembolso) + índice único
  `reembolsos.id_solicitud_origen` (migración 0063) + manejo de
  `IntegrityError` con rollback limpio.
- **Pruebas:** `test_aprobacion_concurrente_genera_un_solo_reembolso`,
  `test_reintentar_aprobacion_no_duplica_reembolso`.

### C5. Monto del reembolso para cortes por metros
- **Síntoma:** `monto_total = precio/m × 1`; el reembolso nacía incorrecto.
- **Corrección:** cálculo `Decimal` precio unitario histórico × metros.
- **Prueba:** `test_reembolso_usa_importe_historico_del_corte` (50.000,00 con
  precio de catálogo cambiado a posteriori).

### C6. Respuesta 500 ante pedido ajeno/inexistente (compartido con PEN-09)
- **Corrección:** 404 limpio en los endpoints de creación (no expone detalle
  interno). Ver `PEN-09/defectos-encontrados.md` D2.

## Preexistentes NO corregidos (fuera de alcance)

1. **`test_auth_session.test_bearer_sin_cookie_restaura_cliente`** falla en la
   suite completa: `/api/v1/auth/session` incluye `rol_label` y el test espera
   el contrato anterior. Deriva de un cambio confirmado de otro integrante;
   no se modificó ni test ni endpoint (reglas 1 y 14 del ticket). **Es el único
   fallo de la suite completa (282 pruebas).**
2. **Deadlock intermitente en `test_bloque_11`** observado en una ejecución
   saturada de la suite (error 1213 de MySQL); no reproducible de forma
   determinista y desapareció en la re-ejecución. Preexistente (asignación de
   técnicos), no relacionado con devoluciones.
3. **Pasarela simulada** (`PAYMENT_PROVIDER=simulator`): el reembolso no viaja
   a un proveedor real; la integración futura debe hacerse en
   `reembolso_service.procesar_reembolso` e incluir clave de idempotencia del
   proveedor.
4. **Dinero como `Float` en BD** (convención del proyecto); el cálculo es
   `Decimal` exacto y cuantizado.
5. **Filas legadas** de `devoluciones` sin `id_solicitud_dv` mantienen el flujo
   antiguo sin metadatos de metros.

## Contaminación de la base de pruebas saneada

Durante el desarrollo de la suite, una ejecución fallida dejó filas huérfanas
en `neodomus_test` que alteraban después los conteos de `test_reportes_ventas`
y `test_bloque_2/11/21`. Se eliminaron únicamente las filas identificables por
sus prefijos de prueba (`REF-PEN-`, `TX-PEN-`, `DEV-`, clientes `t1.cli.*` sin
vínculos) y se re-ejecutó todo: los módulos afectados volvieron a pasar y la
suite completa quedó en 281/282 OK. Ningún dato de la base de desarrollo
(`neodomus`) fue borrado ni alterado (solo recibió la migración aditiva 0063).
