# Requisitos Funcionales — Neodomus

**Proyecto:** Neodomus — Plataforma web de gestión de servicios domóticos  
**Versión:** 1.0  
**Fecha:** Mayo 2026  
**Clasificación:** Académico

---

## Módulo 1 — Autenticación y gestión de cuentas (RF-AUTH)

| ID | Requisito |
|---|---|
| RF-AUTH-01 | El sistema debe permitir a usuarios, técnicos y administradores registrarse ingresando nombre, apellido, tipo y número de documento, correo electrónico, dirección y número de teléfono. |
| RF-AUTH-02 | El sistema debe permitir iniciar sesión mediante correo electrónico y contraseña. |
| RF-AUTH-03 | El sistema debe permitir cerrar sesión de forma segura. |
| RF-AUTH-04 | El sistema debe permitir recuperar la contraseña mediante envío de código OTP al correo electrónico registrado. |
| RF-AUTH-05 | El sistema debe permitir a usuarios y técnicos editar sus datos personales y dirección. |
| RF-AUTH-06 | El sistema debe permitir al usuario eliminar su cuenta de forma voluntaria. |
| RF-AUTH-07 | El sistema debe mantener la sesión activa mediante tokens JWT con refresh automático. |

---

## Módulo 2 — Catálogo y servicios (RF-CAT)

| ID | Requisito |
|---|---|
| RF-CAT-01 | El sistema debe mostrar al usuario un catálogo de servicios domóticos disponibles (instalación, mantenimiento, automatización, asesorías). |
| RF-CAT-02 | El sistema debe mostrar para cada servicio: precio, descripción detallada y duración estimada. |
| RF-CAT-03 | El sistema debe permitir filtrar servicios por categoría. |
| RF-CAT-04 | El sistema debe permitir buscar servicios por nombre o palabra clave. |
| RF-CAT-05 | El administrador debe poder crear, editar o eliminar servicios del catálogo. |
| RF-CAT-06 | El administrador debe poder crear promociones o descuentos especiales por producto o categoría. |

---

## Módulo 3 — Solicitud y agendamiento de servicios (RF-REQ)

| ID | Requisito |
|---|---|
| RF-REQ-01 | El sistema debe permitir al usuario solicitar un servicio mediante un formulario que incluya fecha, hora y tipo de trabajo. |
| RF-REQ-02 | El sistema debe enviar al usuario una confirmación del servicio agendado por correo electrónico. |
| RF-REQ-03 | El sistema debe permitir al usuario visualizar el estado de sus solicitudes (pendiente, en proceso, finalizado, cancelado). |
| RF-REQ-04 | El sistema debe permitir al usuario modificar o cancelar un servicio antes de su confirmación. |
| RF-REQ-05 | La cancelación de una cita solo debe permitirse con al menos 48 horas de anticipación. |
| RF-REQ-06 | El administrador debe poder aprobar o rechazar solicitudes de servicios. |
| RF-REQ-07 | El sistema debe permitir al usuario consultar su historial de servicios anteriores. |
| RF-REQ-08 | El sistema debe enviar recordatorios automáticos al usuario antes de la fecha programada del servicio. |

---

## Módulo 4 — Pagos y facturación (RF-PAY)

| ID | Requisito |
|---|---|
| RF-PAY-01 | El sistema debe permitir al usuario realizar pagos directamente desde la plataforma de forma segura. |
| RF-PAY-02 | El sistema debe soportar pagos parciales (abonos) con registro de cada transacción. |
| RF-PAY-03 | El estado del pedido debe actualizarse a "pagado" cuando la suma de abonos alcance el total. |
| RF-PAY-04 | El sistema debe permitir al usuario visualizar y descargar comprobantes de pago o facturas. |
| RF-PAY-05 | El administrador debe poder monitorear pagos y transacciones realizadas en la plataforma. |
| RF-PAY-06 | El sistema debe soportar dos modalidades de compra: compra con cita y solo entrega. |

---

## Módulo 5 — Técnico y tareas (RF-TECH)

| ID | Requisito |
|---|---|
| RF-TECH-01 | El sistema debe permitir al técnico visualizar todos los servicios que le han sido asignados. |
| RF-TECH-02 | El sistema debe permitir al técnico consultar los detalles del servicio (cliente, dirección, fecha, tipo de trabajo). |
| RF-TECH-03 | El sistema debe permitir al técnico actualizar el estado del servicio (pendiente, en proceso, completado). |
| RF-TECH-04 | El sistema debe permitir al técnico subir fotos y observaciones al finalizar un servicio. |
| RF-TECH-05 | El sistema debe permitir al técnico visualizar las calificaciones y comentarios recibidos. |
| RF-TECH-06 | El sistema debe permitir al técnico descargar reportes de los servicios realizados. |
| RF-TECH-07 | El sistema debe permitir al técnico registrar su disponibilidad laboral (días y horas). |
| RF-TECH-08 | El sistema debe mostrar al técnico todas sus tareas en un mapa con marcadores diferenciados por tipo (cita o entrega). |

---

## Módulo 6 — Administración y gestión (RF-ADMIN)

| ID | Requisito |
|---|---|
| RF-ADMIN-01 | El administrador debe poder registrar nuevos técnicos en la plataforma. |
| RF-ADMIN-02 | El administrador debe poder editar la información de los técnicos. |
| RF-ADMIN-03 | El administrador debe poder eliminar definitivamente usuarios o técnicos inactivos o con faltas graves. |
| RF-ADMIN-04 | El administrador debe poder reactivar usuarios o técnicos suspendidos. |
| RF-ADMIN-05 | El administrador debe poder asignar técnicos manualmente a los servicios. |
| RF-ADMIN-06 | El administrador debe poder visualizar todos los servicios activos, cancelados o finalizados. |
| RF-ADMIN-07 | El administrador debe poder configurar los horarios generales de atención. |
| RF-ADMIN-08 | El administrador debe poder gestionar roles y permisos de acceso. |
| RF-ADMIN-09 | El administrador debe poder enviar comunicados o mensajes masivos a usuarios y técnicos. |
| RF-ADMIN-10 | El administrador debe poder visualizar y exportar reportes de desempeño general en formato PDF o Excel. |

---

## Módulo 7 — Comunicación y notificaciones (RF-NOTIF)

| ID | Requisito |
|---|---|
| RF-NOTIF-01 | El sistema debe notificar al usuario por correo electrónico los cambios en el estado de su servicio. |
| RF-NOTIF-02 | El sistema debe permitir la comunicación directa entre el usuario y el técnico asignado mediante chat integrado. |
| RF-NOTIF-03 | El chat debe almacenar mensajes con timestamp y estado de lectura. |
| RF-NOTIF-04 | El sistema debe enviar alertas automáticas al administrador sobre reclamos o fallas por correo electrónico. |
| RF-NOTIF-05 | El sistema debe mostrar notificaciones en la interfaz (campana) para eventos importantes. |
| RF-NOTIF-06 | El sistema debe enviar notificaciones automáticas a técnicos cuando se les asigna una cita o entrega. |

---

## Módulo 8 — Mapa y geolocalización (RF-MAP)

| ID | Requisito |
|---|---|
| RF-MAP-01 | El sistema debe mostrar un mapa (Leaflet) con todas las tareas asignadas al técnico. |
| RF-MAP-02 | El sistema debe diferenciar visualmente entre citas y entregas en el mapa. |
| RF-MAP-03 | El sistema debe permitir al técnico centrar el mapa en una tarea específica. |
| RF-MAP-04 | El sistema debe almacenar coordenadas de direcciones en las tablas de cita y pedido. |

---

## Módulo 9 — Calificaciones y feedback (RF-RATING)

| ID | Requisito |
|---|---|
| RF-RATING-01 | El sistema debe permitir al usuario calificar el servicio recibido con una puntuación de 1 a 5 estrellas. |
| RF-RATING-02 | El sistema debe permitir al usuario registrar comentarios escritos sobre el servicio. |
| RF-RATING-03 | Las calificaciones solo pueden dejarse después de que el servicio esté en estado "completado". |
| RF-RATING-04 | El técnico debe poder visualizar sus calificaciones y comentarios recibidos. |

---

## Módulo 10 — Seguridad y respaldos (RF-SEC)

| ID | Requisito |
|---|---|
| RF-SEC-01 | El sistema debe realizar copias de seguridad automáticas de la información cada 24 horas. |
| RF-SEC-02 | El sistema debe cifrar contraseñas mediante bcrypt (12+ rondas). |
| RF-SEC-03 | El sistema debe operar exclusivamente bajo HTTPS en entornos de producción. |
| RF-SEC-04 | El sistema debe diferenciar accesos por roles (usuario, técnico, administrador) con permisos específicos. |
| RF-SEC-05 | La recuperación de contraseña debe incluir bloqueo por IP tras 5 intentos fallidos en 15 minutos. |

---

## Módulo 11 — Accesibilidad y experiencia (RF-UX)

| ID | Requisito |
|---|---|
| RF-UX-01 | El sistema debe ser completamente responsivo, funcionando en móviles, tablets y computadores. |
| RF-UX-02 | El sistema debe ser accesible para personas con discapacidad visual parcial mediante compatibilidad con lectores de pantalla. |
| RF-UX-03 | Un usuario debe poder solicitar un servicio en menos de tres pasos desde el catálogo. |
| RF-UX-04 | El sistema debe funcionar en navegadores Chrome, Edge y Firefox. |

---

## Módulo 12 — Escalabilidad futura (RF-FUT)

| ID | Requisito |
|---|---|
| RF-FUT-01 | La arquitectura debe permitir la integración futura de monitoreo IoT sin rediseñar el sistema. |
| RF-FUT-02 | La arquitectura debe permitir la integración futura de control por voz sin rediseñar el sistema. |

---

*Documento generado el Mayo 2026 para el proyecto Neodomus*