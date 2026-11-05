# Instalación local sin Docker

Guía basada en el layout actual `be/`, `fe/` y `movil/`. Requiere disponer de MySQL y servicios externos configurados por separado. No se comprobó esta instalación ejecutando los servicios.

## Requisitos indicados por el repositorio

- Python 3.10 o superior según `be/pyproject.toml`; `be/Dockerfile` usa Python 3.12.
- Node.js 22 según `fe/Dockerfile` y el frontend configurado.
- MySQL 8.0 para alinearse con `docker-compose.yml`.
- `uv` para dependencias Python y pnpm para la app móvil. El frontend tiene `pnpm-lock.yaml` y `package-lock.json`; no hay versión de pnpm declarada como campo `packageManager`, por lo que utiliza la versión disponible compatible con sus lockfiles. El Dockerfile web prepara pnpm 10.

## 1. Base de datos y servicios

Crea una base MySQL local `neodomus` y un usuario de desarrollo con permisos para esa base. No reutilices contraseñas de ejemplo en entornos compartidos. Para correo, MinIO y Google OAuth revisa los ajustes necesarios en `be/app/config.py` y `.env.example`.

## 2. Backend

Desde `be/` crea un entorno e instala dependencias declaradas:

```sh
uv sync
```

Configura `be/.env` con una `DATABASE_URL` que use `localhost` y el puerto MySQL local (normalmente 3306), una `SECRET_KEY` aleatoria y la configuración de servicios que usarás. Usa como referencia las variables de `.env.example` en la raíz; el backend carga `.env` desde su directorio actual.

Aplica las migraciones y arranca la API:

```sh
uv run alembic upgrade head
uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

API: `http://localhost:8000`; Swagger predeterminado de FastAPI: `/docs`; salud: `/health`.

## 3. Aplicación web

En otra terminal, desde `fe/` instala dependencias con el gestor elegido, respetando una lockfile coherente con el equipo. La configuración de Docker usa pnpm 10; este repositorio también contiene `package-lock.json`, de modo que acuerda con el equipo cuál lockfile es la fuente antes de actualizar dependencias.

```sh
pnpm install
pnpm dev
```

Vite sirve por defecto en `http://localhost:5173`. Para apuntar la web a otro backend, configura `VITE_API_URL` antes de iniciar (valor por defecto en el cliente: `http://localhost:8000/api/v1`).

## 4. Aplicación móvil (opcional)

Desde `movil/`, instala las dependencias según el lockfile del proyecto y configura `movil/.env` con `EXPO_PUBLIC_API_URL`, sin `/api/v1`. La app agrega el prefijo automáticamente. En teléfono físico usa una IP LAN alcanzable; para emulador Android la plantilla propone `http://10.0.2.2:8000`.

```sh
pnpm install
pnpm start
```

Consulta `movil/README.md` (guía del proyecto actualizada) y `movil/.env.example`. El `AGENTS.md` local contiene una referencia Expo 54, pero el manifiesto presente declara Expo 57; confirma la versión efectiva del checkout antes de aplicar instrucciones versionadas de Expo.

## Límites y diagnóstico

- No incluyas secretos en archivos versionados ni en reportes.
- Una falla de conexión puede provenir de `DATABASE_URL`, CORS, SMTP, MinIO o URL de API no accesible.
- Los archivos de migración de `be/alembic/versions/` son la referencia para el esquema; no ejecutes scripts de inicialización sin revisar su efecto.
- Para un arranque reproducible con todos los servicios, usa [Docker](con-docker.md).
