# Auditoría integrada PEN-08 · PEN-09 · PEN-10

**Fecha:** 2026-11-11 · **Rama:** `main` · **Sin commits ni push**
**Alcance:** validación de los tres requerimientos funcionando como un flujo de
negocio único, investigación de los fallos reportados, integridad de BD y
controles de calidad finales.

---

## 1. Protección inicial del proyecto

- **Rama:** `main` (sin commits nuevos: la restricción del ticket se mantuvo).
- **Cambios identificados y conservados:**
  - **PEN-08 (móvil):** `movil/utils/metros.ts`, `ProductCard.tsx`,
    `producto/[id].tsx`, `carrito.tsx`, `CartContext.tsx`,
    `publicTranslations.ts` (integrante; trabajo en curso preservado).
  - **PEN-09/10:** 6 archivos backend + migración `0063` + suite de pruebas +
    `OrdersTab.tsx`, `AdminDevoluciones.tsx`, `profileTabsTranslations.ts`,
    `perfil-cliente.css` + docs QA (esta sesión).
  - **Concurren­tes de otros integrantes:** ~15 archivos de `fe/` (auth, navbar,
    admin, cliente, estilos), `OrdersTab.test.tsx`, `ReviewsTab.test.tsx`,
    `keyboard.ts`, `pedidos.ts`, `0001_baseline_esquema_inicial.py`,
    `scripts/init_db.sql` y migración `0064`.
- **Cadena de migraciones verificada:** `0062 → 0063 (PEN-09/10, `down_revision=0062`)
  → 0064 (integrante, `down_revision=0063`). `alembic heads` = **un solo head
  (`0064`)**; aplicada y verificada en `neodomus` (dev) y `neodomus_test`.

## 2. Auditoría PEN-08 (selector de metraje móvil)

**Revisión de código (paridad de reglas móvil ↔ backend ↔ web):**

| Requisito | Verificación | Resultado |
|---|---|---|
| Incrementos de 0,5 m | `PASO_METROS=0.5`; opciones `(i+1)/2` hasta `floor(max×2)` | ✅ |
| Límite por disponibilidad real | `stockTotal = min(producto, mejor variante)` — **idéntico** a `disponibilidad_service.stock_disponible_producto` | ✅ |
| Validación al agregar | `esMetrajeValido()` + `totalMetros > stockTotal → return` antes de `addItem` | ✅ |
| Validación al actualizar | `updateMetros` devuelve error («Stock insuficiente: solo hay X m») y `carrito.tsx` muestra toast de 3 s | ✅ |
| Mensaje sin metraje disponible | `sinCortesDisponibles` cuando `opcionesMetraje` = [] | ✅ |
| Checkout envía decimales | `cliente.services.ts` envía `metros` por ítem; el backend valida (E4c: 409 en exceso) | ✅ |
| Decimales conservados | clave de línea `${metros}m`; display `formatMetros`; backend Decimal | ✅ |
| Respuestas 400/409 | backend rechaza >2 decimales (400) y stock insuficiente (409); probado en E-tests | ✅ |

**Controles de calidad:**
- `tsc --noEmit` (móvil) ✅.
- **Bundle Android (`expo export`)** ✅ — `entry-…hbc` 4,8 MB generado con todos
  los cambios PEN-08 (compilación real del flujo checkout incluido).
- **Lint móvil:** 86 hallazgos (27 errores, 59 warnings). **Clasificados:
  todos preexistentes** (deuda de la actualización a Expo 58 y archivos ajenos
  a PEN-08). En los archivos de PEN-08 solo quedan 3 hallazgos
  (`carrito.tsx:18` tipo sin usar, `producto/[id].tsx:81` constante sin usar y
  `:103` setState-en-effect) — **las 3 líneas están fuera de los hunks del
  diff de PEN-08** (ver `PEN-08/evidencias/lint-archivos-pen08.txt`). No se
  refactorizó masivamente (restricción del ticket).
- **Prueba visual de checkout (Expo Go): BLOQUEADA por entorno** — no existe
  `adb` ni emulador/dispositivo Android en esta máquina (el proceso qemu
  activo es la VM de Docker). El flujo se validó a nivel de compilación
  (bundle) y de contrato HTTP (E-tests). No se declara aprobada la prueba visual.

## 3. Auditoría PEN-09/PEN-10 y ESCENARIOS DE INTEGRACIÓN (E1-E4)

Suite nueva: `be/app/tests/test_auditoria_integrada_pen08_09_10.py` — HTTP real
(ASGI) + lectura del estado REAL de la BD con sesiones independientes. El
checkout usa el punto de pago del producto y la confirmación idempotente
(documentada en T2). Evidencia: `evidencias/auditoria-integrada-e1-e4.txt`.

| Escenario | Qué ejecuta | Resultado real verificado en BD |
|---|---|---|
| **E1** compra→devolución | `POST /pedidos` (2,5 m) + 2× `confirmar-pago` (idempotente) + entrega + solicitud HTTP | stock 10,00 → **7,50**; variante intacta (sin selección); `detalle.cantidad_metros=2.50`, precio congelado 20.000; total 50.000; elegibilidad muestra **2,5 m / $50.000**; solicitud por 2,5 m, `monto_total=50.000,00`, estado `Solicitada` ✅ |
| **E1b** parciales | 1,5 m · 3,0 m · 2,505 m por HTTP | 3× 400 («corte completo» / «máximo 2 decimales»); **0 registros** ✅ |
| **E1c** ajenos/duplicados | token de otro cliente + pedido 99999999 + repetida | 404 · 404 · 400; **1 sola solicitud** en BD ✅ |
| **E2** reposición (Camino A) | compra CON variante → aprobar `Cambio` → recogida física HTTP con foto (técnico real) | aprobación **no toca stock**; recogida reintegra **exactamente 2,50 a producto Y variante**; 0 reembolsos; pipeline `Recibida`; repetida → 400 sin duplicar stock ✅ |
| **E3** reembolso (Camino B) | aprobar `Reembolso` con precio de catálogo cambiado a 99.000 | reembolso **50.000,00** (histórico), estado `Reembolsado`, `id_solicitud_origen` registrado; pedido/detalle intactos; recogida → `Reembolso procesado`; cambiar resolución → 400; **1 solo reembolso** ✅ |
| **E4a** 2 admins concurrentes | 2 hilos con decisión idéntica | 1 éxito + 1 rechazo (400 o error de concurrencia BD); **1 sola decisión y 1 reembolso** ✅ |
| **E4b** pasarela fallida + reintento | `procesar_reembolso` lanza error al aprobar | reembolso **`Rechazado`**, pipeline **NO** avanza a «Reembolso procesado»; reintento admin → `Reembolsado` **sin duplicar**; recogida cierra el pipeline ✅ |
| **E4c** stock/variante | checkout 10,5 m y variante 99999999 | 409 real («Stock insuficiente») y 400/404; **0 pedidos creados** ✅ |
| **E4d** integridad histórica | flujo completo y comparación antes/después | `pedidos.total/estados`, `detalle.metros/precio/subtotal/descripcion` y `pagos` **idénticos** ✅ |

**Operaciones simuladas vs reales** (documentación honesta):
- **Real:** descuento/reposición de inventario, solicitud, decisión, pipeline,
  evidencia de recogida (foto → MinIO en producción; stub en pruebas),
  confirmación idempotente de pago (punto de pago).
- **Simulada (producto académico):** la pasarela (`PAYMENT_PROVIDER=simulator`)
  y el correo/SMTP. Un «reembolso enviado/confirmado» representa la aprobación
  del simulador; con una pasarela real el punto de conexión es
  `reembolso_service.procesar_reembolso` y el estado `Rechazado` es un
  resultado válido y trazable (E4b lo demuestra).

## 4. Investigación de los fallos reportados

### 4.1 Backend: `test_auth_session.test_bearer_sin_cookie_restaura_cliente`
- **Causa exacta:** el commit `22e89ba` (2026-11-08, «fix:complete web and
  mobile translations») añadió `rol_label` (etiqueta traducida de presentación)
  a la respuesta de `/api/v1/auth/session`; el test esperaba el contrato de 3 claves.
- **Preexistente:** sí — el commit es anterior a PEN-08/09/10 y ningún archivo
  de estos tickets toca `auth.py` (verificado con `git log -S rol_label`).
- **¿Seguridad?** No: no afecta autenticación ni autorización (`user_type`/`rol`
  intactos); es un campo de presentación.
- **Corrección aplicada:** se actualizó la aserción del test al contrato actual
  (`rol_label: 'Cliente'`), sin modificar la implementación del integrante.

### 4.2 Frontend: 3 pruebas Vitest fallidas
| Prueba | Componente | Causa | ¿Preexistente? | Corrección |
|---|---|---|---|---|
| `NotificacionesBell.test.tsx > marca como leída…` y `> muestra el error…` | `NotificacionesBell` (campana del navbar) | El commit `22e89ba` hizo que el componente use `useIdioma()` y traduzca el `aria-label` a «Ver todas las notificaciones»; el test no proveía `IdiomaProvider` y buscaba la etiqueta antigua | Sí (archivos idénticos a HEAD) | Se añadió `IdiomaProvider` al render y la etiqueta accesible actual — solo el **setup del test**; la implementación no se tocó |
| `AuthImagesSession.test.tsx > login google…` | `AuthProvider.googleLogin` | El commit `fc0a1d7` (2026-11-06) añadió la revalidación del rol vía `GET /auth/session` dentro de `googleLogin`; el mock del test no respondía `rol`/`user_type` → «La cuenta no tiene un rol válido» | Sí | Se añadió la rama `/auth/session` al mock (contrato actual). El cambio **refuerza** la seguridad (el test ahora valida la revalidación de rol) |

Ambas correcciones se verificaron: **108/108 pruebas Vitest** pasan.

### 4.3 Lint móvil
- 86 hallazgos totales (27 errores, 59 warnings) — **todos preexistentes**
  (Expo 58 upgrade `5795f14` y archivos ajenos). Ninguno introducido por
  PEN-08/09/10 (verificado línea a línea contra los hunks de `git diff`).
- Nota: `movil/AGENTS.md` sigue apuntando a la documentación de Expo v54
  mientras el proyecto está en Expo 58 — puntero desactualizado a coordinar
  (no se modificó: es un archivo de guía del equipo).
- No se realizó refactor masivo para «lint cero» (regla del ticket).

## 5. Base de datos e integridad

| Chequeo | `neodomus_test` | `neodomus` (dev) |
|---|---|---|
| FK huérfanas (devoluciones→pedidos/productos/clientes) | 0 | — |
| Pedidos sin cliente / reembolsos sin pedido ni cita | 0 | 0 |
| Duplicados `reembolsos.id_solicitud_origen` | 0 | 0 |
| Filas de devoluciones por metros residuales de pruebas | 0 | — |
| Residuos de pruebas (`REF-AUD-`, `REF-PEN-`, `audit.%`) | 0 | 0 |
| `cantidad_metros decimal(10,2)` e índice único presentes | ✅ | ✅ |
| Pedidos históricos intactos | — | **17 pedidos**, 1 solicitud preexistente, stock sin negativos |
| Migraciones | 0064 | 0064 |

Las suites limpian sus datos por propietario y en orden FK-safe; los registros
de pruebas son identificables por sus prefijos (`REF-AUD-`, `TX-PEN-`, `audit.%`,
`t1.cli.*`).

## 6. Resultado final de controles de calidad

| Control | Resultado | Evidencia |
|---|---|---|
| Suite PEN-09/10 (27) + auditoría integrada (9) | **36/36 OK** | `suites-pen09-10-e-integrada-36tests.txt` |
| Suite completa backend (discover) | **291/291 OK**, 15 skipped (MinIO opcional) | `regresion-suite-backend-291tests.txt` |
| Vitest frontend | **108/108 OK** (28 archivos) | `vitest-frontend-108tests.txt` |
| `tsc --noEmit` frontend y móvil | OK | — |
| `vite build` | OK (7,7 s) | — |
| `expo export` (bundle Android) | OK (4,8 MB) | `bundle-movil-android.txt` |
| Lint móvil | 86 hallazgos preexistentes clasificados | `lint-movil-clasificado.txt`, `lint-archivos-pen08.txt` |
| Migraciones | cadena única 0062→0063→0064 aplicada en ambas BD | §5 |

## 7. Pendientes y coordinación

1. **Prueba visual de checkout móvil (Expo Go): bloqueada por entorno** (sin
   `adb`/emulador/dispositivo). Pendiente de ejecución en una máquina con
   dispositivo; el bundle y el contrato HTTP ya están validados.
2. **Lint móvil (86 hallazgos)**: deuda preexistente de la actualización a
   Expo 58; requiere decisión del responsable del upgrade (regla 48h,
   setState-in-effect en pantallas de citas/producto, imports sin usar).
   Fuera del alcance de estos tickets.
3. **Pasarela real de reembolsos**: integración futura en
   `reembolso_service.procesar_reembolso` (limitación conocida del proyecto).
4. **`movil/AGENTS.md`** apunta a docs de Expo v54 (proyecto en v58): actualizar
   el puntero (archivo del equipo).
5. **Dinero en `Float`** en BD (convención global; cálculo Decimal exacto).

## 8. Conclusión

PEN-08, PEN-09 y PEN-10 funcionan **de forma integrada** sobre un flujo real:
compra por metros → devolución del corte completo → decisión administrativa →
reposición exacta (producto + variante) o reembolso con valores históricos →
trazabilidad completa, sin duplicados ni estados engañosos, sin tocar los
históricos. Sin regresiones: 291/291 backend, 108/108 frontend, typechecks y
builds OK. **Listo para commit y push tras la revisión del equipo.**
