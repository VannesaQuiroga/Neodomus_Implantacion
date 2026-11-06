# Restricciones del Proyecto — Neodomus

**Proyecto:** Neodomus — Plataforma web de gestión de servicios domóticos  
**Versión:** 1.0  
**Fecha:** Mayo 2026  
**Clasificación:** Académico

---

## RC-01 — Restricciones tecnológicas

| ID | Restricción | Justificación |
|---|---|---|
| RC-01.1 | El framework obligatorio para el frontend es **React 18** con **TypeScript** y **Vite**. No se permite Next.js, Gatsby, CRA u otros meta-frameworks. | El propósito del proyecto es demostrar las capacidades de React + Vite. |
| RC-01.2 | El backend debe ser **FastAPI (Python 3.10+)**. No se permite Django, Flask, Node.js ni otros frameworks. | Stack definido en la arquitectura del proyecto. |
| RC-01.3 | La base de datos debe ser **MySQL 8.0**. No se permite PostgreSQL, SQLite, MongoDB ni otros motores. | El script SQL incluye triggers, vistas y procedimientos específicos de MySQL. |
| RC-01.4 | El lenguaje es **TypeScript** en modo estricto (`"strict": true`) para el frontend. No se permite JavaScript puro. | Garantiza type safety y facilita el mantenimiento académico del código. |
| RC-01.5 | El único gestor de paquetes permitido para el frontend es **pnpm**. No se puede usar `npm`, `yarn` ni `bun`. | Reproducibilidad de builds y auditoría de dependencias centralizada. |
| RC-01.6 | Todas las versiones de dependencias deben ser **exactas** (sin `^`, `~`, `*` ni `latest`). | Previene la introducción silenciosa de CVEs y builds no reproducibles. |
| RC-01.7 | El backend usa **Python + pip/poetry** con lock de versiones exactas. | Consistencia en el entorno de desarrollo y producción. |

---

## RC-02 — Restricciones de APIs y servicios externos

| ID | Restricción | Justificación |
|---|---|---|
| RC-02.1 | El servicio de mapas debe ser **Leaflet** (open-source) o **Mapbox** (solo si hay clave gratuita). No se permite Google Maps sin autorización. | Restricción económica (coste de API key). |
| RC-02.2 | El envío de correos se realiza mediante **SMTP** (Gmail, SendGrid, u otro). Las credenciales van en `.env`. No se permite logs en consola como sustituto. | Requerimiento funcional H8, H14, H18. |
| RC-02.3 | El servicio de pagos en desarrollo puede ser **sandbox** (MercadoPago, Stripe o PayPal). En producción debe ser una pasarela real. | Restricción económica/académica. |
| RC-02.4 | Las notificaciones por WhatsApp son **opcionales** y requieren aprobación previa por coste. Priorizar correo electrónico. | Coste de API de WhatsApp Business. |

---

## RC-03 — Restricciones de plataforma

| ID | Restricción | Justificación |
|---|---|---|
| RC-03.1 | La prioridad de desarrollo es **Web responsiva → móvil → tableta**. Las funcionalidades deben verificarse primero en escritorio con Chrome DevTools. | Mayor cobertura de pruebas inicial. |
| RC-03.2 | La plataforma debe ser accesible desde **Chrome, Edge y Firefox**. No se requiere soporte para navegadores obsoletos. | Requerimiento no funcional RNF07. |
| RC-03.3 | El módulo de geolocalización para técnicos es **opcional**. Su ausencia no bloquea la entrega del proyecto. | Complejidad y permisos de usuario. |
| RC-03.4 | El sistema operativo del servidor puede ser **Linux (Ubuntu)** o **Windows**. El backend debe ser compatible con ambos. | Flexibilidad de despliegue. |

---

## RC-04 — Restricciones de seguridad

| ID | Restricción |
|---|---|
| RC-04.1 | Los archivos `.env`, `.env.local`, `.env.production` y cualquier variante **no deben commitearse** al repositorio. El `.gitignore` debe excluirlos. |
| RC-04.2 | Las contraseñas se almacenan exclusivamente con **bcrypt** (salt de 12+ rondas). No se permite texto plano ni hashes débiles (MD5, SHA1). |
| RC-04.3 | Los tokens JWT deben firmarse con `HS256` usando `SECRET_KEY` en variable de entorno. Access token = 15 minutos, refresh token = 7 días. |
| RC-04.4 | La recuperación de contraseña usa **código OTP de 6 dígitos** con bloqueo por IP tras 5 intentos fallidos en 15 minutos. |
| RC-04.5 | No se puede publicar la plataforma en producción con claves de desarrollo, sandbox o datos de prueba visibles. |
| RC-04.6 | Ninguna vulnerabilidad CVE de nivel **moderate, high o critical** puede llegar al branch principal sin mitigación documentada. |
| RC-04.7 | El proyecto no debe almacenar datos sensibles de terceros sin consentimiento explícito. Los datos son solo para gestión de servicios. |

---

## RC-05 — Restricciones de calidad

| ID | Restricción |
|---|---|
| RC-05.1 | La cobertura de tests del backend no puede bajar del **70%** en módulos críticos (auth, pagos, citas). |
| RC-05.2 | No se puede hacer merge a `main` con errores de TypeScript (`pnpm tsc --noEmit`) ni de ESLint (`pnpm lint`) en el frontend. |
| RC-05.3 | No se puede hacer merge a `main` con errores de **pytest** o **mypy** en el backend. |
| RC-05.4 | No se permiten `// TODO` o `# TODO` sin issue asociado en el repositorio. |
| RC-05.5 | Cada endpoint de FastAPI debe tener documentación en **docstring** (qué hace, parámetros, respuestas, errores). |
| RC-05.6 | Cada componente de React debe tener documentación **TSDoc** con `@what / @why / @impact` antes de considerarse completo. |

---

## RC-06 — Restricciones de proceso y tiempo

| ID | Restricción |
|---|---|
| RC-06.1 | El proyecto sigue el formato **Conventional Commits** con cuerpo pedagógico (`feat:`, `fix:`, `docs:`, etc.). Commits sin este formato serán rechazados. |
| RC-06.2 | Cada módulo debe entregarse con su documentación y tests; no se aceptan módulos "en construcción" en la entrega final. |
| RC-06.3 | El proyecto es **académico y sin fines comerciales**. El uso de APIs externas está sujeto a sus respectivos términos de uso. |
| RC-06.4 | El script SQL completo (tablas, triggers, vistas, procedimientos) debe ejecutarse limpiamente en MySQL 8.0 sin errores. |

---

## RC-07 — Restricciones de arquitectura

| ID | Restricción |
|---|---|
| RC-07.1 | La estructura de carpetas del frontend es obligatoria: `src/components/`, `src/pages/`, `src/services/`, `src/hooks/`, `src/context/`, `src/types/`, `src/utils/`. |
| RC-07.2 | La estructura de carpetas del backend es obligatoria: `app/` (main.py), `app/routers/`, `app/models/`, `app/schemas/`, `app/services/`, `app/core/`, `app/utils/`. |
| RC-07.3 | No se permiten importaciones cruzadas entre módulos del backend. Toda lógica compartida va en `app/core/` o `app/utils/`. |
| RC-07.4 | El cliente de base de datos (SQLAlchemy) debe ser una instancia **singleton**. No se pueden crear conexiones múltiples por request. |
| RC-07.5 | Los servicios externos (SMTP, mapas, pagos) deben tener **interfaces abstractas** en `app/services/` con implementaciones desacopladas. |
| RC-07.6 | Todas las rutas protegidas deben validar el JWT mediante `Depends(get_current_user)` de FastAPI. |

---

## RC-08 — Restricciones de base de datos (MySQL)

| ID | Restricción |
|---|---|
| RC-08.1 | Todos los `id` deben ser `BIGINT AUTO_INCREMENT`. |
| RC-08.2 | Las tablas deben usar **InnoDB** como motor. |
| RC-08.3 | Las contraseñas en `usuario` se almacenan con `VARCHAR(255)`. |
| RC-08.4 | Los estados de cita y pedido deben ser **ENUM**: `pendiente`, `confirmada`, `en_progreso`, `completada`, `cancelada`. |
| RC-08.5 | La cancelación de citas (regla de 48 horas) debe implementarse como **trigger** o **procedimiento almacenado** en MySQL. |
| RC-08.6 | Las **vistas** deben usarse para reportes complejos (historial de servicios, etc.). |

---

## RC-09 — Restricciones de despliegue

| ID | Restricción |
|---|---|
| RC-09.1 | El frontend se despliega en **Vercel** o **Netlify**. No se permite hosting estático sin CI/CD. |
| RC-09.2 | El backend se despliega en **Railway**, **Render** o **PythonAnywhere** (planes gratuitos o económicos). |
| RC-09.3 | La base de datos MySQL se despliega en **Aiven**, **Clever Cloud** o **Railway MySQL**. |
| RC-09.4 | Las variables de entorno (`.env.production`) deben configurarse en la plataforma de hosting, nunca en el repositorio. |

---

## RC-10 — Restricciones de pagos y abonos

| ID | Restricción |
|---|---|
| RC-10.1 | El sistema de abonos (pagos parciales) debe registrar cada pago en una tabla `pago` vinculada a `pedido`. |
| RC-10.2 | El estado del pedido debe actualizarse automáticamente cuando la suma de abonos alcanza o supera el total. |
| RC-10.3 | En modo desarrollo, los pagos pueden simularse (sandbox). En producción, se requiere integración real. |
| RC-10.4 | Los comprobantes de pago se generan bajo demanda desde la tabla `pago`, no se almacenan como archivos. |

---

*Documento generado el Mayo 2026 para el proyecto Neodomus*