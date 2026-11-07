# Inventario de pruebas de NeoDomus

> Generado a partir de la auditoría del **2026-11-05** (conteos medidos con
> `def test_` / `it|test` por archivo, no estimados). Actualizar al añadir o
> retirar pruebas. Las clases de soporte (`testdb.py`) no son pruebas.

**Totales:** backend **249** casos (23 módulos unittest) · frontend **~86**
casos (23 archivos Vitest) · E2E **26** casos (8 specs Playwright) · móvil 0.

---

## 1. Backend — `be/app/tests/` (unittest)

Ejecución: `tests/run_backend_tests.ps1`. Infraestructura de aislamiento: `testdb.py`
(exige `TEST_DATABASE_URL` ≠ base de aplicación; neutraliza correo/scheduler;
configura `TEST_MINIO_*` si existe).

| # | Archivo | Casos | Tipo | Funcionalidad | MySQL | MinIO | Externos | Estado |
|---|---|---|---|---|---|---|---|---|
| 1 | `test_precio_service.py` | 5 | Unitaria | Reglas de precio (promos, variantes, metros) | No | No | No | Activo |
| 2 | `test_factura_pdf_logo.py` | 5 | Unitaria | Factura PDF (ReportLab): contenido y logo | No | No | mocks | Activo |
| 3 | `test_aislamiento.py` | 8 | Infraestructura | Verifica aislamiento total (bd autorea, scheduler, correo, MinIO no instanciado) | Inspección | Inspección | No | Activo |
| 4 | `test_auth.py` | 3 | Integración HTTP | Registro de clientes (esquema, contraseña, anti-escalada de rol) | Sí | No | correo neutralizado | Activo |
| 5 | `test_auth_session.py` | 8 | Integración HTTP | Restauración de sesión (Bearer/cookie, refresh, inactivo, inválido) | Sí | No | No | Activo |
| 6 | `test_t1_identidad.py` | 21 | Integración HTTP | Autenticación/autorización/propiedad (matriz T1) | Sí | No | No | Activo |
| 7 | `test_t1_1_cuentas.py` | 15 | Integración HTTP | Verificación de correo, recuperación de contraseña, expiración de tokens | Sí | No | correo neutralizado | Activo |
| 8 | `test_t1_1_archivos.py` | 9 | Integración HTTP | Evidencias privadas por ruta autorizada; desactivación del montaje legado; propiedad de notificaciones | Sí | No (FS legado `app/static/evidencias`) | No | Activo |
| 9 | `test_t1_2_minio.py` | 4 | Integración | Privacidad bucket privado vs catálogo público | Sí | **Sí (con `TEST_MINIO_*`; si no, skip honesto)** | URL pública | Activo (condicional) |
| 10 | `test_t1_3_permisos.py` | 6 | Integración HTTP | Evidencia de entrega al cliente + permisos de varios routers | Sí | opcional | No | Activo (condicional) |
| 11 | `test_bloque_2.py` | 18 | Integración | Agenda: capacidad por técnico, solapamientos, aptitud, jornada | Sí | No | No | Activo |
| 12 | `test_bloque_11.py` | 16 | Integración | Entregas: transiciones, reasignación prohibida, desactivación con custodia | Sí | No | No | Activo |
| 13 | `test_bloque_21.py` | 12 | Integración | Capacidad aplicada en flujos reales (creación/reagendar/autoasignar) | Sí | No | No | Activo |
| 14 | `test_bloque_21_cierre.py` | 14 | Integración | Coordinación transaccional en asignación/edición/desactivación | Sí | No | pago simulado anulado | Activo |
| 15 | `test_entregas_comportamiento.py` | 19 | Unitarias (2 clases puras) + Integración | Máquina de estados de entrega + endpoint real | 1 clase Sí | No | No | Activo |
| 16 | `test_reasignacion_transacciones.py` | 8 | Integración | Commit/rollback/cancelación en reasignación | Sí | No | No | Activo |
| 17 | `test_checkout_metros_http.py` | 15 | Integración HTTP | Checkout por metros con simulador (punto de pago) hasta Pagado | Sí | No | simulador | Activo |
| 18 | `test_t2_pago_pendiente.py` | 25 | Integración | `confirmar_pago_pendiente`: atomicidad, reintentos, concurrencia | Sí | No | simulador | Activo |
| 19 | `test_citas_reembolsos_admin.py` | 9 | Integración | Dashboard admin de citas + cancelación → reembolso | Sí | No | No | Activo |
| 20 | `test_disponibilidad_productos.py` | 7 | Integración | Disponibilidad: stock, última unidad, variantes, metros | Sí | No | No | Activo |
| 21 | `test_reportes_ventas.py` | 11 | Integración | Reporte de ventas: estados, decimales, permisos, PDF | Sí | No | PDF local | Activo |
| 22 | `test_factura_descarga_http.py` | 3 | Integración HTTP | Descarga de factura (dueño OK; 403 a anónimos y a otros clientes) | Sí | No | No | Activo |
| 23 | `test_foto_perfil_tecnico.py` | 8 | Integración | Foto de perfil técnico (Pillow valida contenido, reemplazo) | Sí | **Sí (con `TEST_MINIO_*`; si no, skip)** | No | Activo (condicional) |
| — | `testdb.py` | — | (no es test) | Aislamiento BD + neutralización de transportes + MinIO de pruebas | — | — | — | Infra |

Cobertura medida en T0 (línea base): 37,29 % líneas / 10,65 % ramas sobre el paquete `app`.

## 2. Frontend — unit/integración de UI (Vitest + Testing Library)

Ejecución: `tests/run_frontend_tests.ps1`. No necesitan MySQL/Docker (red mockeada con `vi.mock`).

| # | Archivo (ruta bajo `fe/src/`) | Casos | Tipo | Funcionalidad |
|---|---|---|---|---|
| 1 | `utils/metros.test.ts` | 6 | Unitaria | Cálculo de corte por metros |
| 2 | `utils/productoPrecio.test.ts` | 4 | Unitaria | Precio calculado en UI |
| 3 | `utils/productoDisponibilidad.test.ts` | 5 | Unitaria | Disponibilidad comercial |
| 4 | `i18n/pedidos.test.ts` | 2 (`it.each` es/en) | Unitaria | Claves de traducción de AdminPedidos |
| 5 | `hooks/usePaginacion.test.ts` | 5 | Unitaria (hook) | Paginación |
| 6 | `hooks/useAuthImage.test.ts` | 7 | Unitaria (hook) | Imagen privada (blob lifecycle) |
| 7 | `hooks/useNotificaciones.test.tsx` | 3 | Unitaria (hook) | Notificaciones usuario |
| 8 | `hooks/useAdminNotificaciones.test.tsx` | 4 | Unitaria (hook) | Notificaciones admin |
| 9 | `contexts/CartContext.test.tsx` | 8 | Unitaria (context) | Carrito de compras |
| 10 | `contexts/AuthImagesSession.test.tsx` | 2 (`it.each`) | Integración (mock red) | Sesión + invalidación de imágenes privadas |
| 11 | `components/chat/ChatBotWidget.test.tsx` | 5 | Unitaria | Widget chatbot |
| 12 | `components/common/AvatarFoto.test.tsx` | 4 | Unitaria | Avatar y fallback de iniciales |
| 13 | `components/common/MetrosSelect.test.tsx` | 3 | Unitaria | Selector de metros |
| 14 | `components/common/Paginacion.test.tsx` | 3 | Unitaria | Controles de paginación |
| 15 | `components/common/CardPaymentInput.test.tsx` | 1 | Unitaria | Input de tarjeta (simulador) |
| 16 | `components/layout/NotificacionesBell.test.tsx` | 2 | Unitaria | Campana de notificaciones |
| 17 | `components/productos/ProductoCard.test.tsx` | 2 | Unitaria | Tarjeta de producto |
| 18 | `pages/public/CarritoPage.test.tsx` | 12 | Integración de página | Carrito |
| 19 | `pages/public/Notificaciones.test.tsx` | 3 | Integración de página | Notificaciones |
| 20 | `pages/public/ProductoDetalle.integration.test.tsx` | 2 | Integración de página | Detalle de producto |
| 21 | `pages/admin/AdminDashboard.test.tsx` | 1 | Integración de página | Dashboard admin |
| 22 | `pages/admin/AdminProductoDetalle.test.tsx` | 1 | Integración de página | Ficha de producto admin |
| 23 | `pages/cliente/Perfil.test.tsx` | 1 | Integración de página | Perfil del cliente |

Config: `fe/vitest.config.ts` (jsdom, globals, setup `fe/src/test/setup.ts` con shim de `URL.createObjectURL`).

## 3. E2E — `fe/e2e/` (Playwright) y orquestadores `scripts/`

Ejecución: `tests/run_e2e_tests.ps1` → `python scripts/e2e_*.py`. Los
orquestadores exigen `TEST_DATABASE_URL` al importar, llaman
`testdb.ensure_test_schema()`, crean fixtures únicas, levantan API efímera
(`DISABLE_SCHEDULER=1`, pagos simulados) + Vite efímero, corren el spec y
validan la BD al final.

| Spec (`fe/e2e/`) | Casos | Orquestador (`scripts/`) | Requisitos | Estado |
|---|---|---|---|---|
| `admin-paginacion.e2e.spec.ts` | 9 | `e2e_admin_paginacion.py` | MySQL pruebas + fe deps + node | Activo |
| `foto-tecnico.e2e.spec.ts` | 5 | `e2e_foto_tecnico.py` | idem | Activo |
| `cart-checkout.e2e.spec.ts` | 2 | `e2e_cart_checkout.py` | idem (valida pedido en BD) | Activo |
| `register.e2e.spec.ts` | 2 | `e2e_register.py` | idem (`test.skip` si falta `E2E_REGISTER_EMAIL`) | Activo |
| `session.e2e.spec.ts` | 1 | `e2e_session.py` | idem + seed `e2e_seed.py` | Activo |
| `reporte-ventas.e2e.spec.ts` | 1 | `e2e_reporte_ventas.py` | idem | Activo |
| `metros.e2e.spec.ts` | 3 | **sin orquestador** (`e2e_verify.py` valida BD; env fallback IDs `139`/`140`) | stack manual + datos concretos | ⚠ Manual/frágil |
| `chatbot.e2e.spec.ts` | 3 | **sin orquestador** (sin env; usa `baseURL` 5174) | stack dev manual | ⚠ Manual/frágil |

Soporte de E2E (no son pruebas): `scripts/e2e_seed.py` (seed determinista con
`--reset` propio), `scripts/e2e_verify.py` (validador BD del spec metros),
`scripts/seed_test_users.py` (usuarios de prueba idempotentes).

## 4. Utilidades en `scripts/` (no tests)

`crear_admin.py`, `check_tecnico.py`, `reset_passwords.py`, `export_seed.py`,
`verify_syntax.py` — herramientas de administración de datos/sintaxis, fuera
del alcance de `tests/`.

## 5. Huecos de cobertura conocidos (para planificar nuevas pruebas)

Backend con poca/ninguna cobertura (según acta T0 y endpoints existentes sin
pruebas): `routers/products` CRUD admin (16 endpoints), `routers/reports` (9),
`routers/devoluciones` (16), `routers/novedades` + cupones (22),
`routers/consultas` (3), `tarifas` (2), `solicitudes` (7), `users` CRUD,
`services/recomendacion_service` (0 %), `services/notificaciones` (34,8 %),
`tareas_programadas`/scheduler, login con Google (`/auth/google`), logout.
Frontend sin pruebas: `CheckoutPage`, `Login/Register` (page-level), paneles
admin (Pedidos/Facturas/Consultas/Devoluciones), `utils/google.ts`,
`utils/favoritos.ts`, `profileStorage`. Móvil: 0 (sin infraestructura de
testing). E2E pendientes: flujo de citas del cliente, devolución, notificaciones.

## 6. Riego de nomenclatura (documentado)

- `be/app/tests/testdb.py` **no** es un test (infraestructura); unittest no lo
  recoge por patrón (`test_*.py`). No renombrar: `testdb` es distinto de `test_<dominio>`.
- Bloques `bloque_2/11/21/21_cierre`, `t1_*`, `t2_*` remiten a actas T0/T1/T2 (`docs/`).
