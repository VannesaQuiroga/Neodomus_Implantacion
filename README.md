# NeoDomus

Plataforma web y móvil para consultar productos de domótica, gestionar compras y coordinar servicios técnicos, citas e instalaciones. El repositorio reúne el backend, la aplicación web, la app móvil y la documentación del proyecto.

## Componentes

| Componente | Ubicación | Tecnologías confirmadas en configuración |
|---|---|---|
| API | `be/` | Python (rango `>=3.10`; contenedor Python 3.12), FastAPI 0.115.0, Uvicorn 0.30.0, SQLAlchemy 2.0.30 |
| Web | `fe/` | React 18.3.1, TypeScript 5.9.3, Vite 5.4.21 |
| Móvil | `movil/` | Expo 57.0.22, React Native 0.86.3, React 19.2.3, Expo Router 57.0.21 |
| Datos | Docker Compose / `be/alembic/` | MySQL 8.0, Alembic 1.13.2 |
| Archivos | API y Compose | MinIO, configurable por variables de entorno |

Las versiones corresponden a los manifiestos consultados en este repositorio y pueden cambiar. La API monta routers bajo `/api/v1`; el código de `be/app/main.py` es la fuente de verdad para su registro. Los pagos están configurados por defecto con un simulador académico; no se documentan como procesamiento real de tarjetas.

## Funciones visibles en el código

La aplicación web contiene flujos de autenticación, catálogo y detalle de producto, carrito y checkout, perfil de cliente, citas, paneles de cliente/técnico/administración, pedidos, facturas, devoluciones, notificaciones y reportes. La app móvil tiene pantallas públicas y de cliente, además de un área de técnico. La presencia de una pantalla o requisito no demuestra por sí sola que el flujo esté completo; consulta el informe de auditoría y los manuales para sus límites.

## Inicio local con Docker

Requisitos: Docker con el complemento Docker Compose y Git. Desde la raíz del repositorio:

1. Copia `.env.example` a `.env` y completa valores locales válidos. Como mínimo configura una `SECRET_KEY` aleatoria y las contraseñas locales de base de datos y MinIO. No uses esos valores de desarrollo en producción.
2. Inicia los servicios con `docker compose up --build`.
3. Abre la web en `http://localhost:5173`. La API escucha en `http://localhost:8000`; su ruta raíz y `/health` están definidas en `be/app/main.py`.

Compose levanta MySQL (`3307` en el equipo), API (`8000`), MinIO (`9000`, consola `9001`) y web (`5173`). El contenedor de API ejecuta las migraciones Alembic antes de iniciar Uvicorn. Para detalles y el modo sin Docker, consulta [guía con Docker](docs/setup/con-docker.md) y [guía sin Docker](docs/setup/sin-docker.md).

Para iniciar web o móvil por separado, revisa sus respectivos `package.json` y sus archivos `.env.example`; la API móvil puede configurarse con `EXPO_PUBLIC_API_URL`. En móvil, el emulador Android utiliza normalmente un host distinto de `localhost`; confirma la dirección de API que corresponde al dispositivo.

## Estructura

```text
be/       API FastAPI, modelos, servicios y migraciones Alembic
fe/       aplicación web React/Vite
movil/    aplicación Expo/React Native
scripts/  inicialización y utilidades de datos
 docs/    requisitos, conceptos, referencia técnica, setup y manuales
```

## Documentación


## Seguridad y límites conocidos

No publiques archivos `.env`, credenciales, tokens ni datos personales. La configuración de MinIO del servicio aplica lectura pública al bucket (`be/app/services/minio_service.py`); evalúa este comportamiento antes de almacenar información que no deba ser pública. El proveedor de pagos por defecto es `simulator`, y las URLs de desarrollo no son direcciones de producción verificadas. No se pudo confirmar en esta actualización la disponibilidad de un entorno desplegado ni acuerdos oficiales de soporte.

## Calidad

Hay pruebas en `be/app/tests/`, pero esta actualización documental no ejecutó la suite ni certifica el estado de las pruebas. Consulta los comandos declarados en cada componente y verifica dependencias y servicios antes de usarlos.
