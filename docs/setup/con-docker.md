# Instalación local con Docker

Guía correspondiente al `docker-compose.yml` de la raíz revisado el 30 de octubre de 2026.

## Requisitos

- Git.
- Docker Desktop (Windows/macOS) o Docker Engine y complemento Compose (Linux).
- `.env` local basado en `.env.example`.

No se certifican requisitos mínimos de hardware. La primera construcción requiere acceso a imágenes y dependencias.

## Preparar el entorno

1. Clona el repositorio y entra en su carpeta raíz.
2. Copia `.env.example` a `.env`.
3. Genera una clave privada aleatoria para `SECRET_KEY` y contraseñas locales robustas para MySQL y MinIO. Completa solo los servicios que vayas a usar. No uses valores de desarrollo en producción ni compartas `.env`.
4. Comprueba que los puertos `3307`, `8000`, `5173`, `9000` y `9001` estén disponibles.

En PowerShell, la copia se realiza con `Copy-Item .env.example .env`; en macOS/Linux, con `cp .env.example .env`.

## Iniciar

Desde la raíz del proyecto:

```sh
docker compose up --build
```

Compose crea estos servicios: MySQL 8.0 (`3307` en el host), API (`8000`), MinIO (`9000`, consola `9001`) y web (`5173`). La API ejecuta `uv run alembic upgrade head` antes de Uvicorn. El frontend usa Vite en el contenedor.

Direcciones locales configuradas:

- Web: `http://localhost:5173`
- API: `http://localhost:8000`
- OpenAPI/Swagger: `http://localhost:8000/docs`
- Salud API: `http://localhost:8000/health`
- Consola MinIO: `http://localhost:9001`

Las credenciales de consola se derivan de variables `MINIO_ROOT_USER` y `MINIO_ROOT_PASSWORD`; no se publican aquí.

## Operación diaria

```sh
docker compose ps
docker compose logs -f api
docker compose logs -f frontend
docker compose stop
docker compose down
```

`docker compose down` conserva el volumen nombrado de MySQL. `docker compose down -v` elimina ese volumen y puede borrar la base local; úsalo únicamente si deseas descartar esos datos.

## Variables relevantes

La configuración está en `.env.example`, `docker-compose.yml` y `be/app/config.py`. Entre otras: `SECRET_KEY`, `DATABASE_URL`, `MYSQL_*`, `SMTP_*`, `EMAIL_PROVIDER`, `GOOGLE_*`, `PAYMENT_PROVIDER`, `FRONTEND_URL` y `MINIO_*`. No copies credenciales reales a documentación. Docker define los puertos y algunos valores predeterminados; revisa Compose antes de cambiar cualquier variable.

## Problemas frecuentes

- **Puerto ocupado:** libera el puerto o ajusta el mapeo de Compose y las URL de clientes.
- **API no inicia:** revisa `docker compose logs api`; confirma `.env` y que MySQL/MinIO respondan.
- **Web no llega a API:** comprueba `VITE_API_URL` y CORS del backend.
- **Móvil no llega a API:** `localhost` dentro del teléfono no es el equipo host. Usa la IP LAN del equipo o `10.0.2.2` en emulador Android, conforme a `movil/.env.example`.
- **Datos locales:** están persistidos en el volumen `mysql_data` y en el directorio local `minio_data/`; no borres esos datos sin respaldo.

Para desarrollo sin contenedores consulta [sin Docker](sin-docker.md). Esta guía describe la configuración del repositorio y no acredita disponibilidad productiva.
