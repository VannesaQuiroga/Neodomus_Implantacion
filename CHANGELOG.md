# Historial de cambios

## 1.0.1 — Prueba local

- Se agregó un archivo de versión a la imagen web para verificar el cambio de imagen.

### Al actualizar

Respaldar MySQL, aplicar el Compose de actualización y ejecutar la prueba de humo. Para volver a 1.0.0, levantar el servicio web con el Compose original. Esta prueba no cambia el esquema.

## 1.0.0 — 2026-11-04

- Primera entrega del despliegue de Neodomus con Nginx, FastAPI y MySQL.
- Pruebas de humo en Ubuntu sobre WSL y en Railway.

### Al actualizar

Generar claves independientes para cada entorno y ejecutar la prueba de humo después del arranque. Alembic aplica las migraciones antes de iniciar la API.
