# Requisitos No Funcionales — Neodomus

**Proyecto:** Neodomus — Plataforma web de gestión de servicios domóticos  
**Versión:** 1.0  
**Fecha:** Mayo 2026  
**Clasificación:** Académico

---

## RNF-01 — Rendimiento

| ID | Requisito | Métrica |
|---|---|---|
| RNF-01.1 | La plataforma debe soportar al menos 500 usuarios concurrentes sin degradación del rendimiento. | Usuarios concurrentes ≥ 500 |
| RNF-01.2 | El tiempo de respuesta de la API para operaciones de lectura (GET) debe ser menor a 500 ms en condiciones normales de carga. | Tiempo respuesta API ≤ 500 ms |
| RNF-01.3 | El tiempo de respuesta de la API para operaciones de escritura (POST/PUT) debe ser menor a 1 segundo. | Tiempo respuesta API ≤ 1 s |
| RNF-01.4 | La pantalla de inicio debe cargarse por completo en menos de 3 segundos en conexión estándar (10 Mbps). | Tiempo carga inicial ≤ 3 s |
| RNF-01.5 | El catálogo de servicios debe renderizarse con paginación o virtualización eficiente para evitar sobrecarga del navegador. | Paginación ≥ 20 ítems por página |
| RNF-01.6 | Las consultas a la base de datos deben estar optimizadas con índices para no superar los 200 ms en tablas con más de 10.000 registros. | Tiempo consulta DB ≤ 200 ms |

---

## RNF-02 — Disponibilidad y fiabilidad

| ID | Requisito | Métrica |
|---|---|---|
| RNF-02.1 | El sistema debe garantizar una disponibilidad del 99% en horario comercial (8:00 a 20:00). | Disponibilidad ≥ 99% |
| RNF-02.2 | El sistema debe realizar copias de seguridad automáticas de la base de datos cada 24 horas. | Frecuencia backups = 24 h |
| RNF-02.3 | El sistema debe permitir la restauración de la base de datos desde el último backup en menos de 2 horas. | RTO (Recovery Time Objective) ≤ 2 h |
| RNF-02.4 | La pérdida máxima de datos aceptable en caso de desastre es de 24 horas (un día de operaciones). | RPO (Recovery Point Objective) = 24 h |
| RNF-02.5 | El sistema debe manejar fallos de conexión a APIs externas (pagos, correos) con reintentos automáticos (máximo 3 intentos con backoff exponencial). | Reintentos = 3, backoff exponencial |

---

## RNF-03 — Seguridad

| ID | Requisito |
|---|---|
| RNF-03.1 | Todas las comunicaciones entre frontend y backend deben estar cifradas mediante HTTPS (TLS 1.2 o superior). |
| RNF-03.2 | Las contraseñas deben almacenarse únicamente mediante bcrypt (salt de 12+ rondas), no en texto plano ni con hashes débiles. |
| RNF-03.3 | Las variables de entorno (claves de API, secretos JWT, credenciales SMTP) no deben commitearse al repositorio ni exponerse en el frontend. |
| RNF-03.4 | Los roles de acceso deben implementarse con permisos diferenciados: usuario, técnico, administrador. |
| RNF-03.5 | Las sesiones deben expirar automáticamente: access token a los 15 minutos, refresh token a los 7 días. |
| RNF-03.6 | La recuperación de contraseña debe incluir bloqueo temporal por IP tras 5 intentos fallidos en 15 minutos. |
| RNF-03.7 | Las dependencias deben auditarse periódicamente para detectar vulnerabilidades CVE de nivel moderate, high o critical. |
| RNF-03.8 | Las rutas protegidas deben validar JWT en cada request mediante middleware o dependency injection. |

---

## RNF-04 — Mantenibilidad

| ID | Requisito |
|---|---|
| RNF-04.1 | La cobertura de tests del backend debe ser ≥ 70% en módulos críticos (autenticación, pagos, citas). |
| RNF-04.2 | El frontend debe pasar las pruebas de TypeScript (`pnpm tsc --noEmit`) y ESLint (`pnpm lint`) sin errores. |
| RNF-04.3 | El backend debe pasar las pruebas de pytest y mypy (type checking) sin errores. |
| RNF-04.4 | Todo elemento de código (función, componente, endpoint) debe documentarse con docstring o TSDoc siguiendo `@what / @why / @impact`. |
| RNF-04.5 | No se permite el uso de `any` en TypeScript ni `# type: ignore` en Python sin comentario justificativo. |
| RNF-04.6 | La estructura de carpetas (frontend y backend) es fija y no puede modificarse sin aprobación. |
| RNF-04.7 | No se permiten importaciones cruzadas entre módulos; toda lógica compartida va en `shared/` (frontend) o `core/utils/` (backend). |

---

## RNF-05 — Usabilidad y accesibilidad

| ID | Requisito | Métrica |
|---|---|---|
| RNF-05.1 | La interfaz debe ser limpia, moderna y comprensible; un usuario debe poder solicitar un servicio en menos de tres pasos. | Pasos para solicitar servicio ≤ 3 |
| RNF-05.2 | El sistema debe ser accesible para personas con discapacidad visual parcial mediante compatibilidad con lectores de pantalla (WCAG 2.1 nivel AA). | Cumplimiento WCAG 2.1 AA |
| RNF-05.3 | El contraste mínimo entre texto y fondo debe ser ≥ 4.5:1 para texto normal y ≥ 3:1 para texto grande. | Contraste WCAG AA |
| RNF-05.4 | Los elementos interactivos (botones, enlaces) deben tener un área táctil mínima de 44×44 px en dispositivos móviles. | Área táctil ≥ 44×44 px |
| RNF-05.5 | Los mensajes de error deben ser claros y orientar al usuario sobre cómo resolver el problema. | Mensajes accionables |
| RNF-05.6 | El sistema debe mostrar indicadores de carga (spinners, skeletons) en operaciones que demoren más de 500 ms. | Indicador visible tras 500 ms |

---

## RNF-06 — Compatibilidad de plataformas

| ID | Requisito |
|---|---|
| RNF-06.1 | El sistema debe funcionar correctamente en los navegadores: Google Chrome (últimas 2 versiones), Mozilla Firefox (últimas 2 versiones) y Microsoft Edge (últimas 2 versiones). |
| RNF-06.2 | El sistema debe ser completamente responsivo, adaptándose a dispositivos móviles (320 px - 480 px), tablets (768 px - 1024 px) y escritorio (≥ 1024 px). |
| RNF-06.3 | El backend debe ejecutarse sin modificaciones en sistemas operativos Linux (Ubuntu 20.04+) y Windows (10/11). |
| RNF-06.4 | La aplicación web debe ser funcional en Android (Chrome) e iOS (Safari) como mínimo. |

---

## RNF-07 — Escalabilidad

| ID | Requisito |
|---|---|
| RNF-07.1 | La arquitectura debe permitir la integración futura de nuevos módulos (monitoreo IoT, control por voz, etc.) sin rediseñar el sistema completo. |
| RNF-07.2 | La base de datos debe estar normalizada y con índices adecuados para soportar el crecimiento de registros a largo plazo. |
| RNF-07.3 | El sistema debe permitir el escalado horizontal del backend mediante balanceo de carga si es necesario en el futuro. |
| RNF-07.4 | Las APIs externas (pagos, correos, mapas) deben estar desacopladas mediante interfaces abstractas para facilitar el cambio de proveedor. |

---

## RNF-08 — Calidad de código y proceso

| ID | Requisito |
|---|---|
| RNF-08.1 | El proyecto debe seguir el formato Conventional Commits: `feat:`, `fix:`, `docs:`, `style:`, `refactor:`, `test:`, `chore:`. |
| RNF-08.2 | No se permite hacer merge a `main` con errores de TypeScript, ESLint (frontend) o pytest/mypy (backend). |
| RNF-08.3 | No se permite el uso de `// TODO` o `# TODO` sin un issue asociado en el repositorio. |
| RNF-08.4 | Los mensajes de commit deben incluir un cuerpo pedagógico explicando qué se hizo y por qué. |
| RNF-08.5 | Cada Pull Request debe ser revisado por al menos otro miembro del equipo antes de ser fusionado. |
| RNF-08.6 | El proyecto debe incluir un `README.md` completo con instrucciones de instalación, configuración y despliegue. |

---

## RNF-09 — Eficiencia de base de datos

| ID | Requisito |
|---|---|
| RNF-09.1 | Las consultas más frecuentes (login, catálogo, estado de servicios) deben tener índices creados sobre las columnas de búsqueda (email, id_usuario, estado). |
| RNF-09.2 | Las tablas deben usar el motor InnoDB para soportar transacciones ACID y claves foráneas. |
| RNF-09.3 | La base de datos debe estar normalizada hasta la tercera forma normal (3NF) para evitar redundancias. |
| RNF-09.4 | Las vistas y procedimientos almacenados deben usarse para reportes complejos, no para operaciones transaccionales cotidianas. |
| RNF-09.5 | El sistema de abonos debe actualizar el estado del pedido mediante triggers o procedimientos almacenados, no en la lógica de aplicación. |

---

## RNF-10 — Experiencia de usuario específica

| ID | Requisito |
|---|---|
| RNF-10.1 | Los colores corporativos son negro y dorado (#000000, #D4AF37), representando elegancia, tecnología y confianza. |
| RNF-10.2 | Las notificaciones deben mostrarse en la interfaz (campana) y opcionalmente por correo/WhatsApp según preferencia del usuario. |
| RNF-10.3 | El chat entre usuario y técnico debe mostrar el contexto del pedido (dirección, productos) para facilitar la comunicación. |
| RNF-10.4 | El mapa del técnico debe diferenciar visualmente entre citas y entregas con íconos o colores distintos. |
| RNF-10.5 | La calificación de técnicos debe permitirse solo después de que el servicio esté en estado "completado". |

---

*Documento generado el Mayo 2026 para el proyecto Neodomus*