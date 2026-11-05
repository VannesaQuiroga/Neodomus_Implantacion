# MANUAL TÉCNICO

**Sistema:** NeoDomus  
**Actualizado:** 30 de octubre de 2026  
**Público:** desarrollo, soporte y mantenimiento

## Contenido

- [Alcance y fuentes](#alcance-y-fuentes)
- [Arquitectura](#arquitectura)
- [Tecnologías](#tecnologías)
- [Estructura y procesos](#estructura-y-procesos)
- [Instalación y configuración](#instalación-y-configuración)
- [API e identidad](#api-e-identidad)
- [Datos y almacenamiento](#datos-y-almacenamiento)
- [Seguridad](#seguridad)
- [Pruebas, mantenimiento y soporte](#pruebas-mantenimiento-y-soporte)
- [Diagramas y referencias](#diagramas-y-referencias)

## Alcance y fuentes

Este manual describe la configuración y estructura presente en el repositorio; no acredita un despliegue de producción ni acuerdos operativos. En caso de contradicción, prevalecen el código, los manifiestos, las migraciones y Compose. Las historias y requisitos documentan lo solicitado, no necesariamente lo implementado.

## Arquitectura

La arquitectura y diagrama están en [referencia de arquitectura](docs/referencia-tecnica/architecture.md). La web y la app móvil consumen la API FastAPI bajo `/api/v1`; SQLAlchemy persiste datos en MySQL; MinIO almacena objetos. El compose local define `db`, `api`, `minio` y `frontend`.

## Tecnologías

| Área | Dependencias/versiones declaradas | Fuente |
|---|---|---|
| API | Python `>=3.10` (contenedor 3.12), FastAPI 0.115.0, Uvicorn 0.30.0, SQLAlchemy 2.0.30, Alembic 1.13.2 | `be/pyproject.toml`, `be/Dockerfile` |
| Web | React 18.3.1, React Router DOM 7.18.0, Vite 5.4.21, TypeScript 5.9.3 | `fe/package.json` |
| Móvil | Expo 57.0.22, Expo Router 57.0.21, React Native 0.86.3, React 19.2.3 | `movil/package.json` |
| Datos | MySQL 8.0 | `docker-compose.yml` |
| Objetos | MinIO SDK declarado `>=7.2.20` | `be/pyproject.toml`, `be/app/services/minio_service.py` |

Las versiones son declaraciones en el checkout revisado. Las lockfiles pueden fijar versiones exactas de dependencias transitivas.

## Estructura y procesos

- `be/app/main.py`: crea FastAPI, instala middlewares, registra 17 routers bajo `/api/v1`, monta recursos estáticos y administra el scheduler.
- `be/app/routers/`: endpoints agrupados por autenticación, usuarios/clientes, técnicos, productos, citas, pedidos, pagos, reportes, notificaciones, devoluciones y novedades.
- `be/app/models/`, `schemas/`, `services/`: modelos SQLAlchemy, contratos Pydantic y lógica/servicios auxiliares.
- `be/alembic/versions/`: migraciones. La revisión más reciente visible es `0060` (17 de octubre de 2026); comprueba el historial completo antes de desplegar.
- `fe/src/App.tsx`: rutas web públicas y protegidas por rol.
- `movil/app/`: navegación Expo Router pública/cliente y técnico.

Procesos con evidencia de código: autenticación y recuperación; consulta de catálogo; pedido y confirmación mediante simulador; generación/consulta de facturas; creación y gestión de citas; actividades técnicas y carga de evidencias. Los pasos y estados exactos dependen de cada router/servicio, y deben verificarse antes de cambiar procesos.

## Instalación y configuración

### Docker

Sigue [la guía con Docker](docs/setup/con-docker.md). El Compose actual usa puertos 3307, 8000, 5173, 9000 y 9001. Crea `.env` desde `.env.example`; completa secretos localmente sin compartirlos. La API aplica las migraciones antes de iniciar.

### Sin Docker

Sigue [la guía sin Docker](docs/setup/sin-docker.md), que utiliza las carpetas y gestores presentes (`be/`, `fe/`, `uv`, `pnpm`). Las versiones locales deben satisfacer los archivos declarados.

### Móvil

`movil/.env.example` documenta `EXPO_PUBLIC_API_URL` sin el sufijo `/api/v1`; `movil/constants/api.ts` agrega el prefijo. El host debe ser alcanzable desde el teléfono o emulador. Reinicia Expo cuando cambies variables públicas.

## API e identidad

- Prefijo `/api/v1`; el registro de módulos está en `be/app/main.py`.
- `be/app/routers/` implementa rutas; `be/app/main.py` deja la documentación OpenAPI predeterminada de FastAPI disponible en `/docs` cuando el servicio está levantado.
- Los endpoints de autenticación incluyen registro de cliente, verificación, login, Google, refresh, logout, recuperación y cambio de contraseña (`be/app/routers/auth.py`).
- Módulos de productos, pedidos, citas, técnicos y reportes tienen sus routers dedicados. Consulta [API](docs/referencia-tecnica/api-endpoints.md); las tablas antiguas de ese documento se reemplazan en esta actualización por una guía de módulos y advertencia de fuente de verdad.
- Roles web visibles: visitante, cliente, técnico y administrador. La autorización se aplica en rutas de frontend y dependencias/endpoints del backend; la UI por sí sola no es un control de seguridad.

## Datos y almacenamiento

- Conexión mediante `DATABASE_URL`; engine y sesión en `be/app/database.py`.
- Modelos SQLAlchemy en `be/app/models/`; migraciones Alembic en `be/alembic/versions/`; el Compose crea base de datos `neodomus`.
- El historial actual llega a revisión `0060`. Esquema exacto debe reconstruirse desde modelos y migraciones; el diagrama de referencia puede no reflejar cada migración reciente.
- `be/app/services/minio_service.py` crea bucket si falta y establece lectura pública para objetos. Revisa privacidad y exposición antes de usarlo con contenido personal o sensible.
- `scripts/init_db.sql` es un script de inicialización adicional. Verifica su compatibilidad con las migraciones antes de elegirlo como procedimiento de instalación.

## Seguridad

- `.env` está ignorado por Git; `.env.example` sirve de plantilla y requiere valores locales. Nunca publiques secretos.
- `be/app/config.py` valida ciertos secretos cuando `ENVIRONMENT=production`, pero eso no sustituye una revisión de seguridad del despliegue.
- Hay middlewares de CORS, límites de solicitudes y encabezados de seguridad (`be/app/middleware/`).
- Tokens y controles de acceso aparecen en servicios y routers; verifica expiración/configuración efectiva por entorno.
- MinIO concede lectura pública al bucket. Este es un riesgo de privacidad que requiere decisión de arquitectura antes de almacenar archivos privados.
- El pago usa `PAYMENT_PROVIDER=simulator` por defecto; el código de simulación no debe considerarse integración con una pasarela real.

## Pruebas, mantenimiento y soporte

Hay al menos `be/app/tests/test_auth.py` y un script `scripts/verify_syntax.py`; esta tarea no ejecutó pruebas ni verificó cobertura. Consulta los scripts de cada paquete y valida servicios antes de anunciar resultados. Mantén el orden de migraciones y realiza respaldos antes de operaciones sobre bases de datos.

No se encontró definición oficial de mesa de ayuda, responsables, horarios ni ANS. Estos valores deben acordarse con el equipo; no se inventan en esta documentación.

## Diagramas y referencias

- [Diagrama de arquitectura y componentes](docs/referencia-tecnica/architecture.md)
- [API](docs/referencia-tecnica/api-endpoints.md)
- [Modelo/diccionario de datos](docs/referencia-tecnica/database-schema.md) y [diccionario extendido](docs/referencia-tecnica/diccionario-de-datos.md)
- [Setup Docker](docs/setup/con-docker.md) · [setup local](docs/setup/sin-docker.md)
- [Auditoría documental](docs/auditoria-documental.md)
