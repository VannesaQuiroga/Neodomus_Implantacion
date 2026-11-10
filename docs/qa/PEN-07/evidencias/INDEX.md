# Índice de evidencias PEN-07

Generado en la auditoría final (2026-11-10). Cada archivo es una captura real del
emulador (`adb exec-out screencap -p`) o una salida real de comandos ejecutados
en la sesión. **Clasificación**: `APROBADA` (prueba con estado final aprobado),
`INTERMEDIA` (paso/estado de sesión útil para trazabilidad), `INCIDENTE` (evidencia
de un problema documentado).

## Capturas del emulador (58 PNG)

| Archivo | Contenido | Referencia | Clasificación |
|---|---|---|---|
| ev01_error_expo_go.png | ErrorActivity "Project is incompatible" (Expo Go 54) | DEF-003 | INCIDENTE |
| ev03_app_cargada_home.png | Onboarding NeoDomus (arranque correcto) | CLI-001, CLI-002 | APROBADA |
| ev04_home_cliente.png | "Sobre Nosotros" (misión/visión) | CLI-002 | APROBADA |
| ev05_catalogo_productos.png | Catálogo con datos reales del backend (estado final tras Reintentar; la captura del estado de error previo fue sobrescrita por esta) | CLI-004 | APROBADA |
| ev06_detalle_producto.png | Detalle Cámara IP 1080p (chips, precio, stock, color) | CLI-005 | APROBADA |
| ev06b_detalle_scroll.png | Detalle con scroll (descripción, garantías) | CLI-005 | APROBADA |
| ev06c_detalle_cantidad.png | Cantidad 3 + subtotal $735.000 (3×$245.000) | CLI-006 | APROBADA |
| ev07_agregar_carrito.png | Botón agregar al carrito (badge pasó a 4) | CLI-007 | APROBADA |
| ev08_carrito.png | Carrito: 2 líneas, $753.000 total | CLI-008 | APROBADA |
| ev09_persistencia_carrito.png | Carrito intacto tras force-stop + relanzamiento | CLI-009 | APROBADA |
| ev10_login_modal.png | Modal "Iniciar sesión" | CLI-010 | APROBADA |
| ev11_login_invalido.png | Error "Correo o contraseña incorrectos" | CLI-010 | APROBADA |
| ev12_login_valido.png | Header "Bienvenido Prueba Cliente" + tabs por rol | CLI-011 | APROBADA |
| ev12a_login_datos.png | Login con campos diligenciados (paso intermedio) | CLI-011 | INTERMEDIA |
| ev13_citas_cliente.png | Form Citas: tarifa $120.000 + calendario | CLI-022 | APROBADA |
| ev13b_citas_hora.png | 13-nov seleccionado + horas 08:00/11:00/14:00 | CLI-022 | APROBADA |
| ev13c_citas_agendar.png | Form con 11:00 seleccionada (scroll) | CLI-022, CLI-023 | APROBADA / INTERMEDIA |
| ev13d_citas_boton.png | Element inspector de DevTools abierto sobre Citas (incidente de interacción) | — | INCIDENTE |
| ev14_devmenu.png | Dev menu de Expo Go | — | INTERMEDIA |
| ev15_state_reinicio.png | Estado tras reinicio (verificación) | — | INTERMEDIA |
| ev16_checkout_simulador.png | **¡Pago exitoso!** FAC-20261110-000011, transacción NEO-PSE-2026-68UQV4 + share de factura_11.pdf | CLI-012 | APROBADA |
| ev17_citas_mis_citas.png | Diálogo ANR "Expo Go isn't responding" (evidencia del bloqueo) | Técnico UI | INCIDENTE |
| ev18_reinicio.png | Pantalla de error de Expo Go tras caída del dev server | — | INCIDENTE |
| ev19_app_restablecida.png | App restablecida (welcome, sesión activa) | — | INTERMEDIA |
| ev20_citas_agendar.png | Form Citas fresco tras reinicio | CLI-022, CLI-023 | INTERMEDIA |
| ev20b_citas_seleccion.png | 13-nov + 11:00 seleccionados | CLI-023 | INTERMEDIA (prueba BLOQUEADA al final) |
| ev20c_citas_boton.png | Form hasta método de pago (simulación académica) | CLI-023 | INTERMEDIA (prueba BLOQUEADA al final) |
| ev20d_citas_boton2.png | Pantalla Técnicos + menú usuario abierto (resultado de navegación) | CLI-024 | INTERMEDIA |
| ev21_tecnicos_publicos.png | Listado de técnicos públicos (demo 01–08, certificaciones, Disponible) | CLI-024 | INTERMEDIA |
| ev22_menu.png | Menú Herramientas cliente completo | CLI-024 | APROBADA |
| ev23_mis_pedidos.png | Mis pedidos: Pedido #11 Pagado $753.000 | CLI-016 | APROBADA |
| ev24_perfil_cliente.png | Dev menu abierto (tap avatar) | — | INTERMEDIA |
| ev25_menu_herramientas.png | Menú Herramientas sobre Mis pedidos (idioma ES/EN visible) | CLI-024 | APROBADA |
| ev26_favoritos.png | Mis favoritos vacío con guía | CLI-017 | APROBADA |
| ev27_fav_add.png | Corazón rojo activo en catálogo (batería) | CLI-018 | APROBADA |
| ev28_favoritos_con_producto.png | Catálogo con favorito (paso intermedio) | CLI-018/019 | INTERMEDIA |
| ev29_favoritos_con_producto.png | Mis favoritos con la batería persistida | CLI-019 | APROBADA |
| ev29a_menu_abierto.png | Menú Herramientas sobre catálogo | — | INTERMEDIA |
| ev30_perfil.png | Dev menu (intento de acceso a perfil) | — | INTERMEDIA |
| ev31_menu_usuario.png | Dev menu (reintento) | — | INTERMEDIA |
| ev32_menu_usu2.png | Mis favoritos (sin menú; tap fuera de zona) | — | INTERMEDIA |
| ev33_home_auth.png | Home autenticada (sin cambio de pantalla) | — | INTERMEDIA |
| ev34_perfil_deeplink.png | **Mi perfil** con datos reales (PR, Prueba, Calle de prueba 123) | CLI-020 | APROBADA |
| ev35_menu_usuario.png | Menú usuario: "Mi perfil" / "Cerrar sesión" | CLI-021 | APROBADA |
| ev36_reinicio_final.png | Home tras reinicio con menú usuario abierto | CLI-021 | INTERMEDIA |
| ev37_cierre_sesion.png | Header visitante tras Cerrar sesión (tabs por rol eliminadas) | CLI-021 | APROBADA |
| ev38_login_tec.png | Modal login en modo visitante (para técnico) | Técnico UI | INTERMEDIA (BLOQUEADA) |
| ev39_login_tecnico_ok.png | Element inspector sobre el modal login | Técnico UI | INCIDENTE |
| ev40_inspect_off.png | "Nothing is inspected" (inspector activo) | Técnico UI | INCIDENTE |
| ev40b_back.png | Home visitante + inspector aún activo | Técnico UI | INCIDENTE |
| ev41_devmenu2.png | Dev menu para apagar el inspector | Técnico UI | INTERMEDIA |
| ev42_inspector_apagado.png | Inspector apagado (gear azul de notificación) | Técnico UI | INTERMEDIA |
| ev43_login_tec_data.png | Campos de técnico + ANR | Técnico UI | INCIDENTE |
| ev43a_datos_tec.png | ANR durante reescritura de campos | Técnico UI | INCIDENTE |
| ev43b_login_tec_listo.png | ANR persistente | Técnico UI | INCIDENTE |
| ev44_app_reiniciada2.png | App reiniciada (visitante) para nuevo intento | Técnico UI | INTERMEDIA |
| ev45_dashboard_tecnico.png | ANR en el submit del login técnico | Técnico UI | INCIDENTE |
| ev46_wait_resultado.png | ANR persistente tras "Wait" | Técnico UI | INCIDENTE |

## Salidas de texto reales (7 archivos)

| Archivo | Contenido | Referencia |
|---|---|---|
| api_login_prueba_cuentas.md | Logins reales: 401 con errata de documentación, 429 rate limit, 200 con patrón correcto, auditoría enmascarada | DEF-001 |
| metro_error_shared.txt | Error ENOENT `../shared` que impedía arrancar Metro | DEF-002 |
| metro_bundled_ok.txt | Bundles servidos (1948 módulos ×3) + logs de factura 200/24.9KB + stock descontado | DEF-002/DEF-003, CLI-013/015 |
| expo_go_mismatch_text.md | Texto real de la ErrorActivity + versiones + resolución (APK oficial) | DEF-003 |
| metro_unabletoresolve.txt | UnableToResolveError de `expo-modules-core` + diagnóstico medido + resolución | DEF-004 |
| lint_movil_out.txt | Salida real de `eslint .` (auditoría final): 76 problemas (29 errores/47 warnings) | DEF-005 |
| typecheck_movil_out.txt | Salida real de `tsc --noEmit` (sin errores, exit 0) | Regresión |

## Notas de auditoría

1. `ev05_catalogo_productos.png` contiene el estado **final** (catálogo cargado);
   la captura del estado de error previo del backend fue sobrescrita y NO existe.
   El manejo del error está documentado en `pruebas-cliente.md` (CLI-003).
2. `ev02` **no existe** (nunca fue capturada): la referencia previa en
   `defectos-encontrados.md` (DEF-004) fue corregida para apuntar a
   `metro_unabletoresolve.txt`.
3. `ev06d` citado antes en el informe no existe; el detalle tiene 3 capturas
   (ev06, ev06b, ev06c).
4. Ninguna evidencia fue eliminada durante la auditoría; solo se agregaron los
   7 archivos de texto y este índice.
