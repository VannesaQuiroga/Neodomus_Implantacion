# PEN-07 · Comparación Web vs Móvil

Bases de comparación (código real):
- Web: `fe/src/App.tsx` (rutas), `fe/src/pages/**`, consumos `api.get/post/put…` en cada página.
- Móvil: `movil/app/**` (Expo Router), `movil/services/**` (endpoints reales 1:1 con la web).
- Backend común: `be/app/routers/*` bajo `/api/v1`.

Matriz funcional (cliente):

| Funcionalidad | Web | Móvil | Diferencias | Resultado |
|---|---|---|---|---|
| Inicio de sesión cliente | `/login` (AuthRouteBridge) | Modal `login.tsx` (transparentModal) | Web = página; móvil = modal sobre contenido. Misma API `/auth/login` | Equivalente |
| Registro cliente | `/register` (verificación de correo) | `registro.tsx` + `verificar-correo.tsx` | Mismos campos; en móvil el flujo de verificación por código llegó implementado; no ejecutado en esta sesión | Equivalente (código); sin ejecución |
| Recuperación de contraseña | `/forgot-password` → `/verify-code` → `/reset-password` | `recuperar-password.tsx` → código 6 dígitos → `nueva-password.tsx` | Misma secuencia y endpoints (`/auth/forgot-password`, `/auth/verify-code`, `/auth/reset-password`) | Equivalente (código) |
| Catálogo | `/` y `/productos` (`ProductosPublicos`) | Tab "Productos" (`(tabs)/productos.tsx`) | Web usa `limit=100` y pagina en cliente; móvil replica lo mismo (`productos.service.ts`) | Equivalente |
| Detalle de producto | `/producto/:id` (`ProductoDetalle`) | `(tabs)/producto/[id].tsx` | Mismos datos (variantes, stock, tarifa de instalación) | Equivalente |
| Carrito | `/carrito` (`CarritoPage`) | Tab "Carrito" (`(tabs)/carrito.tsx`) | Persistencia: web localStorage / móvil AsyncStorage. Totales idénticos ($753.000 verificado móvil) | Equivalente |
| Checkout (pagos simulados) | `/checkout` (CheckoutPage; PSE/PayPal/tarjeta/punto de pago) | Tab/flujo `(tabs)/checkout.tsx` | Mismo simulador y estados (Aprobado/Rechazado/Pendiente); en móvil verificada compra real end-to-end | Equivalente |
| Factura PDF | Descarga en web | Descarga + `expo-sharing` nativo | Móvil añade compartir por apps nativas | Diferencia menor a favor de móvil |
| Mis pedidos | Web (cliente) | Menú Herramientas → Mis pedidos | Idéntica data (Pedido #11 Pagado) | Equivalente |
| Favoritos | Web | Tab + "Mis favoritos" | Persistidos por usuario (correo); en móvil verificado | Equivalente |
| Citas cliente | `/cliente/citas` (`CitasPage`) | Tab "Citas" (`(tabs)/citas-tab.tsx`) | Mismo form (tipo servicio, tarifa $120.000, fechas lunes-sábado, horas del backend, pago simulado) | Equivalente |
| Técnicos públicos | `/cliente/tecnicos` (`TecnicosPage`) | Tab "Técnicos" (`tecnicos-tab.tsx`) | Mismo listado (favoritos por técnico incluido) | Equivalente |
| Perfil cliente | `/perfil` (Perfil.tsx) | `(tabs)/perfil.tsx` | Campos idénticos (nombres, apellidos, teléfono, dirección); edición con confirmación | Equivalente |
| Notificaciones | `/notificaciones` | `(tabs)/notificaciones.tsx` | Mismo endpoint `/notificaciones/mias` | Equivalente (código) |
| Reembolsos | Web cliente | Menú → Mis reembolsos | `/reembolsos/mis` | Equivalente (código) |
| Reseñas | Web cliente | Menú → Mis reseñas | `/calificaciones/mis-dadas` | Equivalente (código) |
| Novedades | `/cliente/novedades` | `(cliente)/novedades.tsx` | `/novedades` | Equivalente (código) |
| Cambio de contraseña | `/cambiar-password` | `(tabs)/cambiar-password.tsx` | `/auth/change-password` | Equivalente (código) |

Matriz funcional (técnico):

| Funcionalidad | Web | Móvil | Diferencias | Resultado |
|---|---|---|---|---|
| Login técnico | Misma pantalla de login (roles) | Mismo modal; redirección por rol a `(tecnico)` (`app/_layout.tsx`, similar a `RoleRoute` web) | Navegación distinta, misma API y guardias | Equivalente |
| Dashboard técnico | `/dashboard/tecnico` (TechnicianDashboard) | `(tecnico)/index.tsx` | Móvil es adaptación 1:1 (mismos endpoints; estados ESTADOS_PROGRAMADA "Pendiente"/"Confirmada") | Equivalente |
| Citas asignadas | `/tecnico/citas` | `(tecnico)/citas.tsx` | Mismas `GET /tecnicos/mis-citas`, reagendar | Equivalente |
| Entregas / recogidas | `/tecnico/entregas` (+devoluciones) | `(tecnico)/entregas.tsx` (+`devoluciones.tsx`) | Estados, evidencias y ubicación (`POST /tecnicos/ubicacion`) | Equivalente |
| Clientes del técnico | `/tecnico/clientes` | `(tecnico)/clientes.tsx` | `mis-clientes` + citas por cliente | Equivalente |
| Historial/calificaciones | `/tecnico/historial`, `/tecnico/calificaciones` | `(tecnico)/historial.tsx`, `calificaciones.tsx` | `GET /calificaciones/mis` | Equivalente |
| Perfil técnico | `/perfil/tecnico` | `(tecnico)/perfil.tsx` (+ foto: `POST /users/me/foto`) | Igual funcionalidad (foto soportada en móvil) | Equivalente |
| Novedades técnico | `/tecnico/novedades` | `(tecnico)/novedades.tsx` | mismas API | Equivalente |
| Mensajes | `/tecnico/mensajes` | `(tecnico)/mensajes.tsx` | mismas API | Equivalente (código) |

Diferencias notables encontradas (reales, no especulativas):

1. **Alcance de funcionalidades web-only** (sin equivalente móvil, confirmado por rutas):
   - Todo el **panel administrador** (`/admin/**`: productos, técnicos, instalaciones, pedidos, facturas, consultas, devoluciones, clientes, proveedores, reportes) existe solo en web. El README del repo ya lo declara ("No se encontró una sección administrativa móvil").
   - `CambioPasswordObligatorio` (flujo de contraseña temporal obligatoria) existe en web; en móvil no hay pantalla equivalente visible en el router (`nueva-password.tsx` cubre el reset, no el cambio obligatorio post-seed).
   - **Pago PSE web** con redirección (`redirect_url`) vs simulador en móvil (misma data, UX distinta).
2. **Móvil-only**: compartir factura por apps nativas (`expo-sharing`), widgets/chatbot flotante móvil, selector de idioma ES/EN integrado en el menú Herramientas (web tiene i18n en rutas/admin).
3. **Navegación**: web usa URLs (React Router) + guards por rol; móvil usa Expo Router con grupos `(tabs)`/`(tecnico)` y guard `GateTecnico`; comportamiento equivalente pero el deep-linking de perfil (`--/(tabs)/perfil`) resultó frágil (ver PEN07-DEF-011).
4. **Validaciones**: las reglas de negocio viven en el backend para ambas (fechas 48h para cancelar, disponibilidad de horas, roles). La UI móvil replica mensajes de error del backend (ApiError → `extraerDetalle`).
5. **Permisos**: misma matriz efectiva (verificado por API: técnico vs admin 401/403).

Conclusión: el móvil replica el alcance cliente y técnico de la web 1:1 en endpoints y reglas; el panel admin es exclusivo de web; las diferencias de UX son de plataforma (modales/tabs vs rutas; sharing nativo).
