# Plan de Trabajo — Neodomus (Documentación + Mockups Móvil)

**Proyecto:** Neodomus — Plataforma web de gestión de servicios domóticos  
**Enfoque:** Documentación técnica + Diseño de mockups para versión móvil  
**Stack de documentación:** Markdown · Draw.io / Figma / Balsamiq · Lucidchart  
**Plataforma objetivo:** Móvil (iOS · Android) — Web responsive secundaria  
**Última actualización:** Mayo 2026

> Marcar cada ítem con `[x]` al completarlo.  
> Añadir la fecha de cierre al final del ítem: `[x] descripción — ✅ 2026-05-20`

---

## Fase 0 — Fundamentos del proyecto (documentación)

### 0.1 Documentación base del proyecto
- [ ] `README.md` — visión general, stack, estructura del repositorio
- [ ] `copilot-instructions.md` — tema domótica, tecnologías, APIs y buenas prácticas
- [ ] `.github/instructions/` — módulos, testing, base de datos, despliegue
- [ ] `.github/prompts/` — templates para nuevas funcionalidades
- [ ] `.gitignore` — excluir `.env*`, `node_modules`, `dist`, `__pycache__`, archivos de diseño

### 0.2 Requisitos del sistema
- [ ] `docs/requirements/functional.md` — 44 requisitos funcionales (RF01–RF44)
- [ ] `docs/requirements/non-functional.md` — 10 requisitos no funcionales (RNF01–RNF10)
- [ ] `docs/requirements/user-stories.md` — 44 historias de usuario (HU-01 a HU-44)
- [ ] `docs/requirements/constraints.md` — restricciones tecnológicas y de proyecto (RC-01 a RC-10)
- [ ] `docs/requirements/trazabilidad.md` — matriz de trazabilidad HUs ↔ RFs ↔ RNFs

### 0.3 Arquitectura del sistema
- [ ] Diagrama de arquitectura general (frontend + backend + BD)
- [ ] Diagrama de componentes (React ↔ FastAPI ↔ MySQL)
- [ ] Diagrama de despliegue (Vercel/Netlify + Railway/Render + Aiven/Clever Cloud)
- [ ] Diagrama de base de datos (entidad-relación con tablas principales)
- [ ] Documento de arquitectura (`docs/architecture/overview.md`)

### 0.4 Modelo de datos
- [ ] Diccionario de datos: tabla `usuario`
- [ ] Diccionario de datos: tabla `tecnico`
- [ ] Diccionario de datos: tabla `servicio`
- [ ] Diccionario de datos: tabla `cita`
- [ ] Diccionario de datos: tabla `pedido`
- [ ] Diccionario de datos: tabla `pago`
- [ ] Diccionario de datos: tabla `calificacion`
- [ ] Diccionario de datos: tabla `mensaje` (chat)
- [ ] Diccionario de datos: tabla `notificacion`
- [ ] Diccionario de datos: tabla `promocion`
- [ ] Diagrama entidad-relación completo (PDF/PNG)

### 0.5 Scripts y base de datos
- [ ] Script `init.sql` con todas las tablas
- [ ] Script con ENUMs: `estado_cita`, `estado_pedido`, `rol_usuario`
- [ ] Script con triggers: cancelación 48h, actualización automática de estado por abonos
- [ ] Script con vistas: `v_historial_servicios_usuario`, `v_reportes_tecnicos`, `v_dashboard_admin`
- [ ] Script con datos de prueba (seeders) para demostración
- [ ] Documentación de scripts (`docs/database/scripts.md`)

---

## Fase 1 — Mockups de la versión móvil

### 1.1 Setup de herramientas de diseño
- [ ] Seleccionar herramienta: Figma (recomendado) / Balsamiq / Draw.io
- [ ] Crear proyecto "Neodomus - Mobile Mockups"
- [ ] Definir guía de estilos (colores, tipografías, espaciados)
- [ ] Paleta de colores: Negro `#000000` · Dorado `#D4AF37` · Blanco `#FFFFFF` · Gris oscuro `#333333`
- [ ] Definir componentes base (botones, inputs, tarjetas, modales, tabs)

### 1.2 Flujo de autenticación (HU-01 a HU-06)
- [ ] Pantalla de bienvenida / onboarding
- [ ] Pantalla de login (correo + contraseña)
- [ ] Pantalla de registro (formulario completo)
- [ ] Pantalla de recuperación de contraseña (OTP)
- [ ] Pantalla de perfil de usuario (editar datos)
- [ ] Pantalla de confirmación de eliminación de cuenta
- [ ] Diagrama de flujo de autenticación (Lucidchart/Draw.io)

### 1.3 Flujo de catálogo y servicios (HU-07 a HU-12)
- [ ] Pantalla de inicio / dashboard (resumen rápido)
- [ ] Pantalla de listado de servicios (grid/lista, filtros)
- [ ] Pantalla de detalle de servicio (precio, descripción, duración)
- [ ] Pantalla de solicitud de servicio (formulario fecha/hora)
- [ ] Pantalla de confirmación de solicitud
- [ ] Pantalla "Mis servicios" (lista con estados)
- [ ] Pantalla de detalle de servicio solicitado (estado, técnico, acciones)
- [ ] Modal de modificación de servicio
- [ ] Modal de cancelación de servicio (con confirmación)
- [ ] Pantalla de historial de servicios anteriores
- [ ] Diagrama de flujo de contratación

### 1.4 Flujo de pagos (HU-13 a HU-14)
- [ ] Pantalla de checkout / resumen de pago
- [ ] Componente selector: pago total vs. abonos
- [ ] Pantalla de método de pago (tarjeta, transferencia)
- [ ] Pantalla de resultado de pago (éxito/fracaso)
- [ ] Pantalla "Mis pagos" (lista de transacciones)
- [ ] Pantalla de detalle de comprobante (visualización PDF)
- [ ] Diagrama de flujo de pagos

### 1.5 Flujo de calificaciones (HU-15)
- [ ] Modal de calificación (1-5 estrellas + comentario)
- [ ] Pantalla de calificaciones del técnico (para usuarios)
- [ ] Visualización de promedio y comentarios en perfil del técnico

### 1.6 Flujo de notificaciones y chat (HU-16 a HU-18)
- [ ] Componente campana de notificaciones (con contador)
- [ ] Pantalla de lista de notificaciones
- [ ] Pantalla de configuración de notificaciones (preferencias)
- [ ] Pantalla de chat (lista de conversaciones)
- [ ] Pantalla de conversación con técnico (contexto del servicio visible)
- [ ] Diagrama de flujo de notificaciones

### 1.7 Flujo del técnico (HU-20 a HU-27)
- [ ] Pantalla de login técnico (mismo que usuario, redirige según rol)
- [ ] Pantalla "Mis tareas" (lista de servicios asignados)
- [ ] Pantalla de detalle de tarea (cliente, dirección, fecha, tipo)
- [ ] Botones de cambio de estado (pendiente → en_progreso → completado)
- [ ] Pantalla de subida de evidencias (fotos + observaciones)
- [ ] Pantalla "Mis calificaciones" (promedio + lista de comentarios)
- [ ] Pantalla de descarga de reportes (PDF)
- [ ] Pantalla de configuración de disponibilidad (días/horas)
- [ ] Pantalla de mapa (tareas geolocalizadas)
- [ ] Diagrama de flujo del técnico

### 1.8 Flujo del administrador (HU-28 a HU-43)
- [ ] Pantalla de login administrador
- [ ] Dashboard (métricas: servicios, ingresos, calificaciones)
- [ ] Pantalla de gestión de técnicos (CRUD, activar/desactivar)
- [ ] Pantalla de gestión de solicitudes (aprobar/rechazar)
- [ ] Pantalla de asignación manual de técnicos
- [ ] Pantalla de gestión de servicios del catálogo (CRUD)
- [ ] Pantalla de gestión de promociones/descuentos
- [ ] Pantalla de monitoreo de pagos (transacciones)
- [ ] Pantalla de reportes (exportar PDF/Excel)
- [ ] Pantalla de configuración (horarios generales, roles)
- [ ] Pantalla de copias de seguridad
- [ ] Pantalla de envío de comunicados masivos
- [ ] Diagrama de flujo del administrador

### 1.9 Componentes comunes y navegación
- [ ] Barra de navegación inferior (Bottom Tab Bar): Inicio, Servicios, Mis Servicios, Perfil
- [ ] Barra superior (App Bar) con título y botones (campana, menú)
- [ ] Menú lateral (Drawer) para técnico y administrador
- [ ] Componente de carga (skeleton / spinner)
- [ ] Componente de error (mensaje + reintentar)
- [ ] Modal de confirmación genérico
- [ ] Toast / Snackbar para mensajes temporales

---

## Fase 2 — Prototipado interactivo

### 2.1 Conexión de pantallas (Figma)
- [ ] Vincular todas las pantallas con interacciones (clics, desplazamientos)
- [ ] Configurar navegación entre flujos (login → dashboard → detalles)
- [ ] Añadir transiciones y animaciones básicas
- [ ] Verificar que todos los botones tengan destino asignado

### 2.2 Revisión de experiencia de usuario (UX)
- [ ] Verificar que un usuario puede solicitar un servicio en menos de 3 pasos
- [ ] Verificar consistencia visual (colores, espaciados, tipografías)
- [ ] Verificar tamaños táctiles (mínimo 44×44 px)
- [ ] Verificar legibilidad (contraste de textos)
- [ ] Verificar estados de error y carga en todos los formularios

### 2.3 Revisión de accesibilidad
- [ ] Verificar compatibilidad con lectores de pantalla (etiquetas aria)
- [ ] Verificar navegación por teclado (TAB, ENTER)
- [ ] Verificar soporte de zoom (texto redimensionable)
- [ ] Documentar decisiones de accesibilidad (`docs/accessibility.md`)

---

## Fase 3 — Entregables de documentación

### 3.1 Documentación de diseño
- [ ] Exportar mockups como PDF (todas las pantallas)
- [ ] Exportar mockups como PNG por pantalla (para documentación)
- [ ] Crear archivo `docs/mockups/mobile-screens.md` con índice de pantallas
- [ ] Crear archivo `docs/mockups/design-system.md` (guía de estilos)
- [ ] Crear archivo `docs/mockups/component-library.md` (componentes reutilizables)

### 3.2 Diagramas de flujo
- [ ] Diagrama de flujo de autenticación (`docs/diagrams/auth-flow.png`)
- [ ] Diagrama de flujo de contratación (`docs/diagrams/booking-flow.png`)
- [ ] Diagrama de flujo de pagos (`docs/diagrams/payment-flow.png`)
- [ ] Diagrama de flujo del técnico (`docs/diagrams/tech-flow.png`)
- [ ] Diagrama de flujo del administrador (`docs/diagrams/admin-flow.png`)
- [ ] Diagrama general de navegación (`docs/diagrams/navigation-flow.png`)

### 3.3 Documentación de APIs (diseño)
- [ ] Documentar endpoints de autenticación (Swagger/OpenAPI YAML)
- [ ] Documentar endpoints de catálogo
- [ ] Documentar endpoints de servicios/citas
- [ ] Documentar endpoints de pagos
- [ ] Documentar endpoints de técnico
- [ ] Documentar endpoints de administrador
- [ ] Documentar endpoints de chat y notificaciones
- [ ] Crear `docs/api/openapi.yaml` (definición completa)

### 3.4 Plan de pruebas (diseño)
- [ ] Definir casos de prueba por módulo (basados en RFs)
- [ ] Definir matriz de pruebas de regresión
- [ ] Definir escenarios de prueba de usabilidad
- [ ] Documentar `docs/testing/test-plan.md`

### 3.5 Plan de despliegue (diseño)
- [ ] Definir arquitectura de despliegue (diagrama)
- [ ] Documentar variables de entorno necesarias (frontend + backend + BD)
- [ ] Documentar pasos para despliegue en Vercel/Netlify
- [ ] Documentar pasos para despliegue en Railway/Render
- [ ] Documentar pasos para despliegue de BD en Aiven/Clever Cloud
- [ ] Crear `docs/deployment/deployment-guide.md`

---

## Fase 4 — Revisión y validación

### 4.1 Revisión interna
- [ ] Revisión de consistencia entre HUs, RFs y mockups
- [ ] Verificar que cada HU tenga al menos una pantalla asociada
- [ ] Verificar que cada RF tenga cobertura en mockups
- [ ] Validar matriz de trazabilidad completa

### 4.2 Validación con stakeholders (simulada)
- [ ] Presentación de mockups (PPT/PDF)
- [ ] Recorrido guiado por los flujos principales
- [ ] Registro de feedback y observaciones
- [ ] Actualización de mockups según feedback

### 4.3 Aprobación final
- [ ] Documento de aprobación de diseño (`docs/approvals/design-signoff.md`)
- [ ] Commit final: `docs(project): finalize mobile mockups and technical documentation`

---

## Resumen de progreso

| Fase | Módulo | Estado |
|---|---|---|
| 0 | Fundamentos del proyecto (documentación) | ⬜ Pendiente |
| 1 | Mockups de la versión móvil | ⬜ Pendiente |
| 2 | Prototipado interactivo | ⬜ Pendiente |
| 3 | Entregables de documentación | ⬜ Pendiente |
| 4 | Revisión y validación | ⬜ Pendiente |

**Leyenda:** ✅ Completo · 🟡 En progreso · ⬜ Pendiente

---

## Resumen de entregables

| Tipo | Entregable | Formato |
|---|---|---|
| Documentación | Requisitos funcionales (44 RFs) | Markdown |
| Documentación | Requisitos no funcionales (10 RNFs) | Markdown |
| Documentación | Historias de usuario (44 HUs) | Markdown |
| Documentación | Restricciones del proyecto (10 RCs) | Markdown |
| Documentación | Matriz de trazabilidad | Markdown / Excel |
| Diagramas | Arquitectura del sistema | PNG / PDF |
| Diagramas | Modelo entidad-relación (BD) | PNG / PDF |
| Diagramas | Diagramas de flujo (5+) | PNG / PDF |
| Mockups | Pantallas móviles (40+) | Figma / PDF / PNG |
| Documentación | Guía de estilos y componentes | Markdown |
| Documentación | OpenAPI / Swagger | YAML |
| Documentación | Plan de pruebas | Markdown |
| Documentación | Guía de despliegue | Markdown |

---

*Documento generado el Mayo 2026 para el proyecto Neodomus — Fase de documentación y diseño*