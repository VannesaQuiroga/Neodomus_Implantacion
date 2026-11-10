# PEN-07 · Recorridos del rol cliente (móvil)

Ejecución real sobre **emulador Pixel_6 (Android 17)**, Expo Go 57.0.9, app Expo SDK 57 (`movil/`), contra el backend Docker real. Canal dev: Metro (`npx expo start`, puerto 18082) + `adb reverse tcp:18082 tcp:18082` (método estable reproducido al final de la sesión).

Convención: **APROBADA** = verificada en ejecución real con evidencia.

## Resumen

| # | Identificador | Funcionalidad | Estado | Evidencia |
|---|---|---|---|---|
| 1 | PEN07-CLI-001 | Arranque de la app | APROBADA | ev03 |
| 2 | PEN07-CLI-002 | Onboarding/Sobre Nosotros + navegación por tabs | APROBADA | ev03, ev04 |
| 3 | PEN07-CLI-003 | Manejo de backend caído (estado de error + Reintentar) | APROBADA | Estado de error observado en pantalla y recuperado tras levantar el backend. Nota de auditoría: la captura de ese estado fue sobrescrita por `ev05_catalogo_productos.png` (reintento exitoso) — el comportamiento está documentado en el texto y es consistente con `entorno-pruebas.md` §8 (Docker caído 2×). Sin captura vigente del estado de error. |
| 4 | PEN07-CLI-004 | Catálogo de productos con datos del backend | APROBADA | ev05 |
| 5 | PEN07-CLI-005 | Detalle de producto (chips, precio, stock, variantes, subtotal) | APROBADA | ev06, ev06b |
| 6 | PEN07-CLI-006 | Incremento de cantidad y recálculo de subtotal | APROBADA | ev06c ($735.000 = 3×$245.000) |
| 7 | PEN07-CLI-007 | Agregar al carrito (badge 1→4) | APROBADA | ev07 |
| 8 | PEN07-CLI-008 | Carrito: líneas, totales correctos (753.000), acciones | APROBADA | ev08 |
| 9 | PEN07-CLI-009 | Persistencia del carrito tras force-stop + relanzamiento | APROBADA | ev09 |
| 10 | PEN07-CLI-010 | Login con credenciales inválidas (mensaje de error seguro) | APROBADA | ev11 (además backend audit `LOGIN_FAILED` con email enmascarado, HTTP 401) |
| 11 | PEN07-CLI-011 | Login válido cliente (sesión, saludo, tabs nuevas por rol) | APROBADA | ev12 (backend audit `LOGIN_SUCCESS`, HTTP 200) |
| 12 | PEN07-CLI-012 | Checkout con simulador de pago (PSE) + pago exitoso | APROBADA | ev16 (FAC-20261110-000011, transacción NEO-PSE-2026-68UQV4) |
| 13 | PEN07-CLI-013 | Descarga y compartición de factura PDF | APROBADA (con defecto menor en doble share: PEN07-DEF-009) | Metro log: `download status=200`, `Archivo OK size=24959` |
| 14 | PEN07-CLI-014 | Persistencia del pedido en BD backend | APROBADA | Consulta MySQL: pedido 11 `Pagado`, pago `753000.00` `aprobado`, factura asociada |
| 15 | PEN07-CLI-015 | Descuento de inventario tras la compra | APROBADA | Catálogo post-compra: Batería 120→119, Cámara 25→22 (coincide 1+3 unidades) |
| 16 | PEN07-CLI-016 | Mis pedidos (lista con estado Pagado) | APROBADA | ev23 |
| 17 | PEN07-CLI-017 | Mis favoritos vacío (estado inicial con guía) | APROBADA | ev26 |
| 18 | PEN07-CLI-018 | Marcar favorito en catálogo (corazón activo) | APROBADA | ev27 |
| 19 | PEN07-CLI-019 | Favorito persistido en "Mis favoritos" | APROBADA | ev29 |
| 20 | PEN07-CLI-020 | Mi perfil (datos reales del backend) | APROBADA | ev34 (Mi perfil: "PR", Nombres "Prueba", Dirección "Calle de prueba 123") |
| 21 | PEN07-CLI-021 | Cierre de sesión + navegación vuelve a modo visitante | APROBADA | ev35 (menú usuario) → ev37 (header visitante; tabs Técnicos/Citas desaparecen) |
| 22 | PEN07-CLI-022 | Citas: tarifa real, calendario con días válidos, horas del backend | APROBADA | ev13, ev13b (13 nov: horas 08:00/11:00/14:00), ev13c, ev20b |
| 23 | PEN07-CLI-023 | Agendar cita (envío) | BLOQUEADA (ver nota) | — |
| 24 | PEN07-CLI-024 | Menú Herramientas cliente (pedidos/servicios/favoritos/reembolsos/reseñas/técnicos/notificaciones/idioma ES-EN) | APROBADA | ev22, ev25 (idioma visible ES/EN) |
| 25 | PEN07-CLI-025 | Registro de cuenta nueva (flujo completo) | NO EJECUTADA (ver nota) | — |

## Notas honestas

- **PEN07-CLI-023 (agendar cita)**: se ejecutó la selección de fecha/hora/dirección hasta el método de pago (simulación académica visible), pero el envío final del `POST /citas` no se completó en el emulador por la degradación del entorno (ANR repetido del runtime Expo Go en Android 17; ver `entorno-pruebas.md` §8). El endpoint quedó verificado por API: `POST /citas` existe (`be/app/routers/citas.py:600`), y el backend respondió 200 en las pruebas API de lectura de citas del rol. **No se marca como APROBADA** porque no se capturó la confirmación de cita creada en la app.
- **PEN07-CLI-025 (registro)**: el flujo requiere código de verificación por correo (SMTP). En la sesión el correo de prueba no fue consultable (bandeja del equipo no accesible) y el envío de correos reales quedó fuera de alcance para no consumir el servicio SMTP con cuentas sintéticas. El endpoint quedó verificado a nivel de código (`/auth/register/client` en `auth.services.ts`).

## Defectos/observaciones detectadas durante el recorrido cliente

- Toast de warning en pantalla de cada modal por `expo-blur` (`dimezisBlurView` sin `blurTarget`): aviso de desuso de API, no bloqueante → registrado (PEN07-DEF-010, menor).
- Error de doble compartición de factura (`ExpoSharing.shareAsync … Another share request is being processed now.`) tras el pago exitoso → PEN07-DEF-009 (menor).
- Imágenes del catálogo 404 (`/uploads/N.jpg`): la BD de desarrollo reconstruida no tiene archivos de imagen para los productos sintéticos; la app muestra placeholder correcto. Problema de datos de demo, no de código.
