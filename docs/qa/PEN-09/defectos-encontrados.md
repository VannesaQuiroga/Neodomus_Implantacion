# PEN-09 — Defectos encontrados, correcciones y pendientes

## Defectos corregidos en esta sesión

### D1. Un corte de metros entraba al flujo de devolución como unidad entera (defecto raíz de PEN-09)
- **Síntoma:** corte de 2,5 m (detalle `cantidad_metros=2.50`, `cantidad_detalle=1`)
  se ofrecía para devolución como «1 unidad» con monto máximo igual a 1 metro.
- **Origen:** `elegibilidad_pedido()` leía `int(d.cantidad_detalle)`; defecto
  documentado en `docs/T2_consistencia_pago_pendiente.md` (§8.6, «resultado C,
  pendiente de decisión comercial») y reproducido por `DevolucionMetrosTestCase`.
- **Corrección:** elegibilidad por metros + validación de corte completo en
  `crear_solicitud()` + columnas `cantidad_metros`. El test documental T2 sigue
  pasando sin cambios (los campos legados se conservan).
- **Evidencia:** `pruebas-funcionales.md` casos 1, 2, 15.

### D2. `POST /devoluciones` y `POST /devoluciones/solicitudes` respondían 500 ante pedido ajeno/inexistente (preexistente)
- **Origen:** el router solo capturaba `ItemInvalido`; `PermissionError` del
  servicio de elegibilidad llegaba sin manejar (crash ASGI).
- **Corrección:** `except PermissionError → 404` en ambos endpoints. Cumple la
  matriz del ticket («pedido inexistente / de otro cliente → se rechaza») y
  evita exponer trazas internas.
- **Evidencia:** `test_pedido_ajeno_rechazado_http`, `test_elegibilidad_pedido_inexistente`.

### D3. Reposición de inventario con cantidad incorrecta para metros (PEN-10, pero mismo defecto raíz)
- **Síntoma:** al confirmar la recogida se hacía `stock += cantidad` (→ +1 m
  para un corte de 2,5 m) y la variante no se restituía nunca.
- **Corrección:** `reintegrar_stock()` (espejo de `descontar_stock`) con la
  cantidad exacta en `Decimal` y restitución también de la variante deducida
  de la descripción congelada del pedido.
- **Evidencia:** `test_reposicion_registra_metros_exactos`,
  `test_reposicion_reintegra_variante_con_metros`.

### D4. Reembolso de un corte por metros usaba el precio × 1 (PEN-10)
- **Corrección:** `monto_total` de la solicitud = precio unitario histórico × metros;
  el reembolso se crea a partir de ese monto. Probado cambiando el precio del
  catálogo DESPUÉS de la compra: el reembolso sigue siendo 2,5 × 20.000.
- **Evidencia:** `test_reembolso_usa_importe_historico_del_corte`.

### D5. Carrera de idempotencia en aprobación y recogida (PEN-10)
- **Origen:** dedup de reembolsos solo por consulta sin índice; la recogida no
  bloqueaba la fila de la devolución.
- **Corrección:** `SELECT ... FOR UPDATE` en `cambiar_estado()` y en la
  confirmación de recogida; índice único `reembolsos.id_solicitud_origen`.
- **Evidencia:** `test_aprobacion_concurrente_genera_un_solo_reembolso`,
  `test_reintento_recogida_no_duplica_inventario`,
  `test_reposicion_concurrente_una_sola_ejecuta`.

## Defectos preexistentes NO corregidos (fuera de alcance)

1. **`test_auth_session.test_bearer_sin_cookie_restaura_cliente` falla en la suite completa:**
   `/api/v1/auth/session` devuelve un campo `rol_label: 'Cliente'` que el test
   no espera (deriva de contrato confirmada en el repo, ajena a devoluciones).
   No se modificó ni el test ni el endpoint (reglas 1 y 14 del ticket).
2. **Dinero persistido como `Float`** en `pedidos.total_pedido`, `pagos.monto`,
   `reembolsos.monto`, etc. El cálculo es `Decimal` exacto con cuantización
   `0.01` ROUND_HALF_UP; cambiar tipos monetarios en BD es una decisión global
   fuera de este ticket.
3. **Dos líneas del mismo producto en un pedido** (unidades + corte) colapsan en
   la vista por producto de la elegibilidad (limitación preexistente; el
   backend acepta `cantidad` y `metros` simultáneos para ese caso).
4. **Pasarela simulada:** `pagos_service.procesar_reembolso` aprueba siempre;
   no existe integración real (documentado como limitación, no como éxito).
5. **Flujo de solicitud de devolución ausente en móvil** (preexistente).

## Cambios concurrentes de otros integrantes (conservados, no sobrescritos)

Durante la sesión otro integrante trabajó en paralelo sobre el mismo working
tree (sin commits): amplió la implementación móvil de PEN-08
(`ProductCard.tsx`, `producto/[id].tsx`, `carrito.tsx`), cambió archivos de
`fe/` (auth, navbar, admin, cliente, estilos), añadió tests nuevos
(`OrdersTab.test.tsx`, `ReviewsTab.test.tsx`), corrigió las semillas de
proveedores (`0001_baseline`, `scripts/init_db.sql`) y creó la migración
`0064_domotizar_proveedores_demo.py` con `down_revision = "0063"` — es decir,
construida **sobre** la migración de PEN-09/10: la cadena de Alembic queda
coherente (0062 → 0063 → 0064). Todo ese trabajo se conservó intacto; los
archivos compartidos (`OrdersTab.tsx`, `perfil-cliente.css`,
`profileTabsTranslations.ts`) conviven con ambos conjuntos de cambios y el
typecheck + Vitest del estado combinado pasan (105/108).

## Contaminación detectada y saneada durante las pruebas

La **primera** ejecución de la nueva suite falló (arreglos en curso) y su
`tearDown` dejó filas huérfanas en `neodomus_test` (10 productos `REF-PEN-%`,
2 pedidos/pagos `TX-PEN-%`, 2 solicitudes/devoluciones y 8 clientes de prueba).
Esa contaminación hizo fallar después a `test_reportes_ventas`,
`test_bloque_2`, `test_bloque_11` y `test_bloque_21`. Se eliminó únicamente
esas filas identificables por sus prefijos; tras la limpieza esos módulos
volvieron a pasar y la suite completa quedó en 282 pruebas con solo el fallo
preexistente de `test_auth_session`. El `tearDown` de la suite además se hizo
resiliente (rollback inicial). No se tocó ningún dato de `neodomus` (desarrollo).
