# Carpeta `scripts/`

Scripts de base de datos de NEODOMUS. Todo lo relacionado con datos iniciales,
seeds y utilidades de base de datos se organiza aquí.

## Contenido

verificar-requisitos.sh comprueba dependencias, acceso al daemon Docker, Docker Compose, RAM (mínimo 4 GiB), disco libre (mínimo 10 GiB) y disponibilidad de puertos TCP. Permite fallo intencional con SIMULATE_FAIL=true.

Ejecutar desde Linux antes de desplegar:

~~~bash
bash scripts/verificar-requisitos.sh
SIMULATE_FAIL=true bash scripts/verificar-requisitos.sh
~~~

El modo SIMULATE_FAIL debe terminar con código 1 y sirve para verificar el manejo de fallos; no acredita requisitos del host. El script no necesita privilegios root. El acceso al socket Docker equivale a privilegios elevados: concederlo solo a operadores autorizados.

| Archivo | Descripción |
|---|---|
| `seed_test_users.py` | Crea automáticamente los usuarios de prueba (clientes, administrador y técnico) con contraseña temporal con hash. Idempotente: no duplica ni sobrescribe usuarios existentes. |
| `export_seed.py` | Guarda los registros actuales de la BD (clientes, usuarios, técnicos) dentro de `init_db.sql`, regenerando su sección final con `INSERT IGNORE`. |
| `init_db.sql` | Esquema y datos iniciales en SQL (no destructivo e idempotente). Este archivo es la fuente de datos que regenera `export_seed.py`. |
| `respaldar.sh` | Genera un dump comprimido de MySQL, valida el gzip, permite cifrado opcional con `age` y elimina respaldos locales vencidos. |

> Nota: el **versionado real del esquema** (tablas, columnas, seeds) se gestiona
> con **Alembic** en `be/alembic/versions/`, que es el que ejecuta el contenedor
> `api` al arrancar. `init_db.sql` se conserva como respaldo/referencia SQL.

## Usuarios de prueba

Los usuarios de prueba usan una contraseña temporal con este patrón:

```
12345678 + inicial del nombre en MAYÚSCULA + inicial del primer apellido en minúscula + .
```

| Email | Nombre | Contraseña temporal |
|---|---|---|
| `prueba.cliente@neodomus.com` | Prueba Cliente | `12345678Pc.` |
| `cliente.demo@neodomus.com` | Carolina Mendez | `12345678Cm.` |
| `admin@neodomus.com` | Admin Neodomus | `12345678An.` |
| `tecnico@neodomus.com` | Tecnico Prueba | `12345678Tp.` |

> ⚠️ Seguridad: la base de datos solo guarda el **hash bcrypt** de la contraseña,
> nunca el texto plano. Las contraseñas de esta tabla son solo de referencia
> para pruebas. Para verlas en consola ejecuta el script con `--mostrar-claves`.

## Ejecución

Dentro del contenedor `api` (recomendado, usa la BD de Docker; `scripts/` está
montado en `/app/scripts` vía `docker-compose.yml`):

```bash
docker exec -it neodomus_api uv run python /app/scripts/seed_test_users.py
```

Para ver las contraseñas temporales en consola (solo pruebas):

```bash
docker exec -it neodomus_api uv run python /app/scripts/seed_test_users.py --mostrar-claves
```

O desde el host con el backend disponible:

```bash
cd be && uv run python ../scripts/seed_test_users.py
```

Para regenerar el SQL inicial desde la BD actual:

```bash
python scripts/export_seed.py
```

## Reglas de idempotencia

- Si un email ya existe, no se duplica ni se sobrescribe su contraseña.
- No elimina usuarios existentes.
- Solo inserta datos si faltan.

## Migraciones

El esquema de base de datos se gestiona con **Alembic** en `be/alembic/versions/`.
Las nuevas tablas/columnas del proyecto (marcas, venta por metros, pagos,
facturas) están en las migraciones `0002_*`.

## Respaldo de MySQL

Desde la raíz del repositorio con Docker Compose v2 y el servicio `db` activo:

```bash
BACKUP_SOURCE=docker bash ./scripts/respaldar.sh
```

Para producción/staging configura directorio seguro, retención y cifrado con `age` mediante variables de entorno; la clave privada de descifrado se mantiene fuera del servidor de respaldos. El script no realiza copia off-site ni restaura la base. Consulta el runbook en [`docs/implantacion/plan-implantacion.md`](../docs/implantacion/plan-implantacion.md) y ensaya una restauración aislada.
