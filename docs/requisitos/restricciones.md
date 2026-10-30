# Restricciones del Proyecto — Neodomus

<!--
  ¿Qué? Documento que define las restricciones técnicas, de herramientas, diseño, idioma, organizacionales y de seguridad del proyecto Neodomus.
  ¿Para qué? Establecer los límites y condiciones no negociables bajo las cuales se desarrolla la plataforma de servicios domóticos.
  ¿Impacto? Violar una restricción puede comprometer la calidad, seguridad, coherencia visual o mantenibilidad del sistema.
-->

---

## 1. Restricciones Tecnológicas

### RT-001 — Stack de backend obligatorio
El backend debe desarrollarse exclusivamente con:
- **Python 3.10+** como lenguaje (actual **3.12** en `be/.python-version:1` y `be/Dockerfile:1` `python:3.12-slim`, `pyproject.toml:5` `>=3.10`).
- **FastAPI** como framework web.
- **SQLAlchemy 2.0+** como ORM.
- **PyMySQL** como conector a base de datos.
- **Pydantic 2.0+** para validación de datos.
- **Alembic** para migraciones de base de datos.

No se permite el uso de otros frameworks web (Django, Flask, etc.) ni ORMs alternativos.

### RT-002 — Stack de frontend obligatorio
El frontend debe desarrollarse exclusivamente con:
- **React 18+** como biblioteca de UI.
- **TypeScript 5.0+** en modo estricto (`"strict": true`).
- **Vite 5.4+** como bundler y servidor de desarrollo (actual: 5.4.21 en `fe/package.json:28`).
- **CSS Modules / CSS puro** como sistema de estilos (no TailwindCSS en el código actual; `tailwind.config.js` no existe). Si se migra a Tailwind, usar 4+.
- **Framer Motion 12+** para animaciones y **React Icons 5.6+** para iconografía (reales en `fe/package.json:13,16`).
- **React Router 7+** para enrutamiento del lado del cliente.

No se permite el uso de otros frameworks (Angular, Vue, Svelte, etc.).

### RT-003 — Base de datos obligatoria
La base de datos debe ser **MySQL 8.0+** (con soporte de JSON, triggers, procedimientos almacenados y vistas). Durante el desarrollo se ejecutará en contenedor Docker. No se permiten bases de datos alternativas (PostgreSQL, SQLite en producción, MongoDB, etc.).

### RT-004 — Método de autenticación
La autenticación debe implementarse exclusivamente mediante **JWT (JSON Web Tokens)** con enfoque stateless. Los tokens JWT deben contener el rol del usuario (`usuario`, `tecnico`, `admin`) para autorización rápida. No se permiten sesiones basadas en cookies de servidor, OAuth de terceros ni integración con proveedores de identidad externos.

### RT-005 — Algoritmo de hashing
Las contraseñas deben hashearse exclusivamente con **bcrypt** (vía `passlib`). No se permiten otros algoritmos de hashing (MD5, SHA-256, argon2, etc.) salvo aprobación explícita.

### RT-006 — Mapa y geolocalización
El componente de mapas **puede** utilizar **Leaflet** (`react-leaflet`) como opción open-source. En la implementación actual **no hay mapa Leaflet** (`fe/package.json` y `movil/package.json` sin `leaflet`; ver `docs/referencia-tecnica/architecture.md`). Si se implementa mapa (HU-025/HU-034), usar Leaflet con soporte táctil y accesible por teclado. No se impone como obligatorio para la entrega actual.

### RT-007 — Integración de pagos
La pasarela de pagos en **desarrollo es simulador académico** (`PAYMENT_PROVIDER=simulator` en `be/app/config.py:50` y `docker-compose.yml:53`) sin credenciales reales. Para producción se podrá integrar **MercadoPago** o **Stripe** en modo sandbox/producción. El simulador es válido para la entrega académica (ver `be/app/services/pagos_service.py`).

### RT-008 — Correos y notificaciones
El envío de correos electrónicos se hará mediante **SMTP** (Gmail, SendGrid u otro). Las credenciales irán en variables de entorno. No se permite simular envíos con logs en consola en producción, aunque en desarrollo está permitido para pruebas.

---

## 2. Restricciones de Herramientas y Entorno

### RH-001 — Gestor de paquetes Python
El entorno de Python se gestiona con **uv (Astral)** (`be/pyproject.toml:31` `[tool.uv]`, `uv.lock`, `be/Dockerfile:3` `ghcr.io/astral-sh/uv`) con `pip + virtualenv` como alternativa compatible. Queda prohibido `conda`/`pipenv` si no permiten versionado exacto. `poetry` fue reemplazado por `uv` y se mantiene como referencia histórica.

### RH-002 — Gestor de paquetes Node.js
Las dependencias del frontend deben gestionarse preferentemente con **pnpm** (`fe/pnpm-lock.yaml`, `fe/Dockerfile:3` `pnpm@10`). Se tolera `npm`/`yarn` solo para compatibilidad Expo (`movil/package-lock.json` existe por `expo`), pero **pnpm es el gestor oficial** para `fe`. No mezclar gestores en el mismo módulo.

### RH-003 — Versiones exactas
Las dependencias críticas deben tener **versiones exactas** (sin `^`, `~`, `*`). En la práctica actual `fe/package.json:12,17,18` usa `^` para `axios`, `react-router-dom`, `@react-oauth/google` y `be/pyproject.toml:22,25-28` usa `>=` para `Pillow`, `requests`, `minio`, `tzdata`, `apscheduler`. Se recomienda fijar exactas en producción (`pnpm`/`uv.lock` ya garantiza reproducibilidad).

### RH-004 — Linter y formatter backend
Se debe usar exclusivamente **ruff** (o `pylint` + `black` si se prefiere, pero con una configuración fija) como linter y formatter para el código Python. No se permiten linters alternativos no documentados.

### RH-005 — Linter y formatter frontend
Se deben usar **ESLint** para linting y **Prettier** para formateo en el frontend. No se permiten herramientas alternativas.

### RH-006 — Control de versiones
El repositorio es **monorepo** con las carpetas `be/` (backend) y `fe/` (frontend) + `movil/` (Expo) en la raíz (ver `docker-compose.yml:24` `build: ./be`, `:93` `build: ./fe`). Históricamente `backend/`/`frontend/`; actual `be`/`fe`/`movil`. No se permiten repos separados.

---

## 3. Restricciones de Diseño Visual y UX

### RD-001 — Paleta de colores corporativa
Los colores principales son:
- **Primario (acento)**: Dorado `#D4AF37` (con sus variantes `primary-50` a `primary-950` en Tailwind).
- **Neutros**: Negro `#000000` y blanco `#FFFFFF` para fondos y textos.
- **Semánticos**: Verde para éxito, rojo para error, amarillo para advertencia, azul para información.

Queda **prohibido** el uso de otros colores como acento principal (no se permite usar `blue-600` como primario a menos que se trate de un componente de información).

### RD-002 — Prohibición de degradados
Queda **estrictamente prohibido** el uso de degradados (`gradient`) en cualquier elemento de la interfaz. Todos los fondos y colores deben ser sólidos y planos.

### RD-003 — Tipografía sans-serif exclusiva
Solo se permiten fuentes de la familia **sans-serif** (`Inter`, `system-ui`, `sans-serif`). Queda prohibido el uso de fuentes serif, monospace (fuera de bloques de código) u ornamentales.

### RD-004 — Alineación de botones de acción
Los botones de acción principal (Solicitar servicio, Pagar, Guardar, etc.) deben estar siempre alineados a la **derecha** del contenedor. Nunca centrados ni alineados a la izquierda.

### RD-005 — Biblioteca de iconos
Se usa **react-icons 5.6+** (`fe/package.json:16` `react-icons`, `fe/src/components/layout/Navbar.tsx:6` `react-icons/fa6`) como biblioteca de iconos. `lucide-react` fue la especificación inicial; la implementación real migró a `react-icons`. Se permite SVG personalizado para el logo.

### RD-006 — Accesibilidad mínima
Todo el frontend debe cumplir con **WCAG 2.1 nivel AA**. Esto implica:
- Contraste mínimo de 4.5:1 para texto normal.
- Área táctil mínima de 44×44 px en móvil.
- Uso de `aria-label` en botones sin texto visible.
- Soporte de navegación por teclado (TAB, ENTER).
- Los mensajes de error deben tener `role="alert"`.

---

## 4. Restricciones de Idioma

### RI-001 — Código en inglés
Todo el código fuente debe escribirse en inglés:
- Variables, funciones, clases, métodos, constantes.
- Nombres de archivos y carpetas de código (ej. `authService.py`, `UserProfile.tsx`).
- Endpoints y rutas de la API (ej. `/api/v1/auth/login`).
- Nombres de tablas y columnas en la base de datos (ej. `users`, `hashed_password`).
- Mensajes de commits y nombres de ramas.

### RI-002 — Documentación en español
Toda la documentación y comentarios deben escribirse en español:
- Comentarios en el código (`#`, `//`, `/* */`).
- Docstrings de funciones y clases.
- Archivos de documentación en Markdown (`.md`).
- Descripciones en archivos de configuración (`.env.example`, etc.).
- Mensajes visibles al usuario (UI) deben estar en español.

---

## 5. Restricciones Organizacionales

### RO-001 — Proyecto educativo
Este es un proyecto académico. Cada línea de código y documentación debe tener enfoque pedagógico. Los comentarios deben explicar el "qué", "para qué" e "impacto" de cada decisión técnica.

### RO-002 — Conventional Commits
Todos los mensajes de commit deben seguir el formato **Conventional Commits** con cuerpo que incluya:
- `What`: qué cambio se hizo.
- `Why`: por qué es necesario.
- `Impact`: qué partes del sistema afecta.

Ejemplo:

feat(pagos): agregar webhook de MercadoPago

What: Se añade endpoint POST /api/v1/pagos/webhook para recibir notificaciones.
Why: Para actualizar el estado del pedido cuando el pago es aprobado.
Impact: Afecta a los módulos de pagos y pedidos. Se requiere clave de webhook.


### RO-003 — Versionamiento de API
Todos los endpoints deben estar bajo el prefijo `/api/v1/`. Cambios incompatibles requerirían una nueva versión (`/api/v2/`).

### RO-004 — No despliegue en producción (versión académica)
El proyecto se desarrolla y ejecuta en entornos de desarrollo local. No hay requisitos de despliegue en producción, CI/CD ni infraestructura cloud, aunque se puede desplegar demostrativamente en plataformas gratuitas (Vercel, Railway, etc.) siempre que no se usen claves reales de producción.

---

## 6. Restricciones de Seguridad

### RS-001 — Credenciales en variables de entorno
Toda información sensible (claves secretas, credenciales de BD, configuraciones SMTP, claves de pasarela de pagos) debe almacenarse en archivos `.env` no versionados en git. Nunca se deben hardcodear valores sensibles en el código.

### RS-002 — Archivo .env.example obligatorio
Debe existir una plantilla de entorno con variables necesarias y valores no sensibles. El repositorio actual tiene `.env.example` en la raíz y `movil/.env.example`; verifica su contenido por componente.

### RS-003 — No exponer contraseñas
Las contraseñas (hasheadas o en texto plano) nunca deben aparecer en:
- Respuestas de la API (los DTOs deben omitir `hashed_password`).
- Logs del servidor.
- Mensajes de error al cliente.

### RS-004 — Tokens de recuperación y verificación
Los tokens de recuperación y verificación deben:
- Ser UUID o código de 6 dígitos (actual: código de 6 dígitos `be/app/services/auth_service.py:115,169,422`, `be/app/schemas/auth.py:75`).
- Tener expiración (verificación 24h `be/app/config.py:23` `VERIFICATION_TOKEN_EXPIRE_HOURS=24`, reset 10 minutos `be/app/config.py:25` `PASSWORD_RESET_TOKEN_EXPIRE_MINUTES=10`; históricamente 1h).
- Ser de un solo uso (campo `used` en la tabla).
- No contener información del usuario en texto plano.

### RS-005 — CORS restringido
La API debe configurar CORS para aceptar únicamente el origen del frontend (`FRONTEND_URL`). En desarrollo puede ser `http://localhost:5173`. En producción, debe ser el dominio real (ej. `https://app.neodomus.com`). Nunca se debe usar `allow_origins=["*"]`.

### RS-006 — Sanitización de salida
El frontend debe escapar automáticamente el contenido de usuarios (React lo hace por defecto). Si se usa `dangerouslySetInnerHTML`, se debe sanitizar el contenido con `DOMPurify` para evitar XSS.

### RS-007 — Control de acceso por roles
Cada endpoint protegido debe verificar el rol del usuario (extraído del JWT) y denegar el acceso con `403` si el rol no tiene permiso. No se debe confiar en ningún parámetro enviado por el cliente para determinar el rol.

### RS-008 — Rate limiting
Los siguientes endpoints deben tener límite de peticiones por IP:
- `POST /api/v1/auth/login`: 10/minuto.
- `POST /api/v1/auth/register`: 5/minuto.
- `POST /api/v1/auth/forgot-password`: 5/minuto.
- `POST /api/v1/citas`: 20/minuto por usuario.
- `POST /api/v1/pagos/iniciar`: 10/minuto por usuario.

---

## 7. Restricciones de Base de Datos

### RBD-001 — Engine InnoDB obligatorio
Todas las tablas deben usar el motor **InnoDB** (para soporte de transacciones y claves foráneas). No se permiten tablas MyISAM.

### RBD-002 — Triggers para reglas de negocio
La regla de cancelación con **3 horas** de anticipación (actual `be/app/routers/citas.py:548` `now+3h`, no 48h) se valida en la lógica de aplicación (`cita_service` + `citas.py:501-510` lun-sáb 08-18). El trigger BD es opcional/futuro; actualmente no hay trigger en `be/alembic/versions/` (ver `docs/referencia-tecnica/architecture.md:436`). Se mantiene consistencia via servicio y `slot_tomado`.

### RBD-003 — Vistas para reportes
Las consultas de reportes (historial, ranking técnicos) **pueden** implementarse como vistas en BD, pero la implementación actual usa consultas SQLAlchemy en `be/app/routers/reports.py:43-1143` y `be/app/services/reportes_service.py`. Las vistas son recomendadas para optimización futura, no obligatorias en la entrega actual.

### RBD-004 — Enums para estados y roles
Los estados de cita (`pendiente`, `confirmada`, `en_progreso`, `completada`, `cancelada`), estado de pedido (`pendiente_pago`, `parcial`, `pagado`, `reembolsado`) y roles (`usuario`, `tecnico`, `admin`) deben definirse como **ENUM** en la base de datos.

### RBD-005 — Índices necesarios
Se deben crear índices al menos en las columnas:
- `usuarios.email`
- `usuarios.numero_documento`
- `citas.usuario_id`
- `citas.tecnico_id`
- `citas.fecha`
- `citas.estado`
- `pagos.pedido_id`

---

## 8. Restricciones de Pruebas y Calidad

### RPC-001 — Cobertura mínima de tests
- Backend: al menos **70%** de cobertura de líneas y ramas en módulos críticos (autenticación, pagos, citas).
- Frontend: al menos **80%** de cobertura en componentes y hooks críticos.

### RPC-002 — No merge sin pasar linters y tipos
No se puede hacer merge a `main` si:
- `pnpm tsc --noEmit` falla (frontend).
- `pnpm lint` falla (frontend).
- `pytest` falla o cobertura es inferior al umbral (backend).
- `mypy` (si se usa) falla.

### RPC-003 — No `// TODO` sin issue
No se permiten comentarios `// TODO` o `# TODO` sin un issue asociado en el repositorio que justifique el trabajo pendiente.

### RPC-004 — Documentación de endpoints
Cada endpoint debe tener documentación con docstring (FastAPI genera Swagger automáticamente) y, además, debe mantenerse actualizada la referencia en Markdown (este documento de restricciones complementa la documentación).

---

## 9. Restricciones de Experiencia de Usuario (UX)

### RUX-001 — Solicitud de servicio en menos de 3 pasos
Un usuario debe poder solicitar un servicio en **como máximo 3 clics** después de seleccionar el servicio del catálogo:
1. Hacer clic en "Solicitar".
2. Seleccionar fecha/hora (paso integrado).
3. Confirmar.

### RUX-002 — Mapa del técnico usable en móvil
En la vista de mapa para técnico, los marcadores deben ser fácilmente seleccionables con el dedo (tamaño mínimo 44×44px). Debe haber un botón de "Centrar en mi ubicación" y otro de "Lista de tareas" para alternar vista.

### RUX-003 — Feedback claro en operaciones asíncronas
Toda operación que demore más de 500 ms debe mostrar un indicador de carga (spinner, skeleton, o mensaje "Procesando..."). Las operaciones de pago deben mostrar un overlay o modal que impida doble clic.

### RUX-004 — Confirmaciones destructivas
Las acciones destructivas (cancelar cita, eliminar cuenta, eliminar técnico) deben requerir confirmación explícita con un diálogo que describa las consecuencias.

---
