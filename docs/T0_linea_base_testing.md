# T0 — Aislamiento y línea base de testing (backend)

Ejecución reproducible y aislada de las pruebas existentes sobre MySQL dedicado,
con medición de cobertura inicial. Se conservan todos los cambios anteriores
(asignación, reasignación, especialidades y sus pruebas). No se hizo commit,
push ni despliegue; no se implementaron funciones de negocio nuevas.

## 1. Archivos modificados y motivo

| Archivo | Cambio | Motivo |
|---|---|---|
| `be/pyproject.toml` | Reemplaza `[tool.uv] dev-dependencies = []` (deprecado) por `[dependency-groups] dev = ["httpx>=0.28.1", "coverage>=7.16.2"]`. | Declarar las dependencias de test: `httpx` (cliente HTTP para la prueba de auth) y `coverage` (medición). La imagen de producción usa `uv sync --no-dev`, así que no altera el entorno productivo. |
| `be/app/tests/testdb.py` | Añade neutralización de `iniciar_scheduler`/`detener_scheduler` (no-op). | Impedir trabajos automáticos en segundo plano durante las pruebas. Conserva las guardas de `TEST_DATABASE_URL` y el parche del transporte de correo. |
| `be/app/tests/test_auth.py` | Reescrito de `pytest` a `unittest` y adaptado al contrato real de registro. | La prueba antigua estaba rota (`import pytest` → `ModuleNotFoundError`) y usaba campos/paths obsoletos. |
| `be/.coveragerc` | Configuración de cobertura: `source=app`, `branch=True`, `omit=app/tests/*`. | Medir líneas y ramas de toda la aplicación y excluir únicamente las pruebas. |
| `be/app/tests/test_entregas_comportamiento.py` | `IntegracionEntregasTestCase` crea sus propios cliente/técnico/usuario (fixtures únicos) en lugar de `Tecnico.first()`/`Cliente.first()`; limpieza en `tearDownClass`. | Eliminar la dependencia de datos preexistentes (T0.1). |
| `be/app/tests/test_aislamiento.py` | Nuevo módulo con comprobaciones de aislamiento (bind de sesiones, scheduler neutralizado, transporte de correo, MinIO no alcanzado). | Detectar cualquier conexión fuera de la base de pruebas autorizada, sin exponer credenciales (T0.1). |

Cambios previos conservados: `app/services/asignacion_service.py`,
`app/services/especialidades.py` y las pruebas de reasignación/cierre, sin modificar.

Nota: `be/uv.lock` se regeneró como consecuencia de `uv sync` (incluye las nuevas
dependencias dev). Los reportes de cobertura (`be/.coverage`, `be/coverage.xml`,
`be/coverage.json`, `be/htmlcov/`) son artefactos generados, no código fuente.

## 2. Comandos reproducibles, dependencias y variables

Variables necesarias:

- `TEST_DATABASE_URL` (obligatoria): URL MySQL de la base de pruebas `neodomus_test`,
  distinta de la base de aplicación. Credenciales de desarrollo definidas en
  `docker-compose.yml` (`neodomus`/`neodomus123`).
- `DATABASE_URL` (solo para migrar la base de pruebas): apuntando a `neodomus_test`.

Dependencias añadidas (grupo dev): `httpx>=0.28.1`, `coverage>=7.16.2`.

Comandos (desde la raíz del repo, con Docker en marcha):

```bash
# 1) Inicializar el esquema de la base de pruebas (una sola vez; no borra bases existentes)
docker compose exec -T -e DATABASE_URL="mysql+pymysql://neodomus:neodomus123@db:3306/neodomus_test?charset=utf8mb4" api uv run alembic upgrade head

# 2) Sincronizar dependencias (incluye el grupo dev) en el contenedor
docker compose exec -T api uv sync

# 3) Ejecutar la suite completa (descubrimiento automático)
docker compose exec -T -e TEST_DATABASE_URL="mysql+pymysql://neodomus:neodomus123@db:3306/neodomus_test?charset=utf8mb4" api uv run python -m unittest discover -s app/tests -p "test_*.py"

# 4) Cobertura (líneas + ramas), reportes HTML y XML
docker compose exec -T -e TEST_DATABASE_URL="mysql+pymysql://neodomus:neodomus123@db:3306/neodomus_test?charset=utf8mb4" api sh -c "uv run coverage erase && uv run coverage run --source=app --branch -m unittest discover -s app/tests -p 'test_*.py' && uv run coverage report && uv run coverage html && uv run coverage xml"
```

La cobertura se inicia con `coverage run` (inyecta su tracer al arrancar el
intérprete, antes de importar el código a medir), lo que garantiza que se mida
el código importado por `app.main` aunque ningún test lo invoque directamente.

## 3. Aislamiento demostrado

### 3.1 Sesiones y base dedicada

- `be/app/tests/testdb.py` sustituye `app.database.SessionLocal` y `app.database.engine`
  por la sesión de pruebas al importarse, ANTES de importar la aplicación. Las
  dependencias HTTP (`get_db`) usan esa sesión.
- Guardas comprobadas (evidencia de ejecución):

```text
# Sin TEST_DATABASE_URL
RuntimeError: TEST_DATABASE_URL no está definida. Las pruebas requieren una base
MySQL de pruebas SEPARADA de la aplicación. Define TEST_DATABASE_URL y vuelve a ejecutarlas.

# TEST_DATABASE_URL apuntando a la base de aplicación
RuntimeError: TEST_DATABASE_URL apunta a la misma base que la aplicación ('neodomus').
Usa una base MySQL de pruebas separada (p. ej. 'neodomus_test').
```

- Migraciones vigentes en la base dedicada: `alembic current` = `0057 (head)`,
  coincidente con `alembic heads`.

### 3.2 Scheduler

`testdb.py` neutraliza `iniciar_scheduler` y `detener_scheduler` a nivel de módulo,
por lo que ningún flujo arranca trabajos en segundo plano sobre la base de pruebas
(el cliente ASGI de httpx tampoco ejecuta el `lifespan` que lo arrancaría).

### 3.3 Transportes externos (sustituidos, no eliminados)

- **Correo**: `testdb.py` reemplaza `_send_email_sync` y `send_email_with_attachment`
  (SMTP/Resend/Gmail API). La prueba de auth sustituye `send_verification_email` y
  **cuenta su invocación** (1).
- **Pagos**: `PAYMENT_PROVIDER=simulator` (simulador local, sin pasarela externa);
  los flujos que procesan pago se mockean por test (`_crear_cita_anulado`).
- **Facturas**: el envío usa `send_email_with_attachment` (neutralizado); la generación
  de factura se mockea por test. Las escrituras internas (historial, notificaciones,
  reembolsos) se conservan y se verifican en las pruebas de reasignación.
- **Archivos/MinIO**: no es ejercido por ninguna prueba actual (ver hallazgos).

### 3.4 Limpieza y repetibilidad

Cada prueba crea sus propias fixtures y las elimina en `tearDown`; las sesiones por
hilo son independientes (`SessionLocal()` dentro de cada hilo). Se verificó que los
recuentos de filas de prueba son **estables entre ejecuciones** (no crecen):

| Tabla | Antes/después |
|---|---|
| citas, historial_citas, reembolsos, notificaciones, facturas, pagos, pending_registration | 0 |
| cliente / usuario / tecnico / pedido | 13 / 12 / 11 / 10 (residual histórico, sin cambios) |

El residual (13 clientes, 11 técnicos, 10 pedidos) es preexistente en la base de
pruebas y NO crece con las ejecuciones (ver hallazgos 6.2).

## 4. Inventario de pruebas y resultados reales

Ejecutor: `unittest` (la suite ya era `unittest`; `test_auth.py` se convirtió a
`unittest` para mantener un único runner). `pytest` no es necesario.

| Módulo | Tests | Resultado |
|---|---|---|
| `test_auth.py` | 3 | OK |
| `test_bloque_2.py` | 18 | OK |
| `test_bloque_11.py` | 16 | OK |
| `test_bloque_21.py` | 12 | OK |
| `test_bloque_21_cierre.py` | 14 | OK |
| `test_entregas_comportamiento.py` | 19 | OK |
| `test_reasignacion_transacciones.py` | 8 | OK |
| `test_aislamiento.py` | 8 | OK |
| **Total** | **98** | **98 OK · 0 fallidas · 0 omitidas · 0 errores de colección** |

Estado previo a T0: `test_auth.py` daba **1 error de colección**
(`ModuleNotFoundError: No module named 'pytest'`); las otras 88 pruebas pasaban.
Tras adaptar `test_auth.py` (3 pruebas) y añadir `test_aislamiento.py` (8 pruebas),
la colección pasa a 98 pruebas, todas en verde.

Repetibilidad: dos ejecuciones consecutivas → `Ran 98 tests … OK` en ambas, con
recuento de filas estable (ver sección T0.1).

## 5. Cobertura de líneas y ramas

- **Líneas: 37.29 %** (3568 / 9568 ejecutables).
- **Ramas: 10.65 %** (295 / 2770 ramas completamente cubiertas; 149 parciales).

Denominador: todas las líneas ejecutables y ramas del paquete `app`
(models, routers, services, schemas, utils, middleware, config, database, main),
**incluidos módulos que ningún test invoca** (p. ej. `recomendacion_service.py` 0 %).
Exclusiones únicas: `app/tests/*` (pruebas). Dependencias, `.venv` y artefactos
generados quedan fuera de `source=app`.

Reportes:

- HTML: `be/htmlcov/index.html`
- XML: `be/coverage.xml`
- JSON: `be/coverage.json`

Cobertura por módulo (líneas % / ramas %) — núcleo cubierto y áreas sin cubrir:

| Módulo | Líneas | Ramas |
|---|---|---|
| `services/especialidades.py` | 88.0 % | 74.1 % |
| `services/estados_entrega.py` | 100 % | 100 % |
| `services/asignacion_service.py` | 65.3 % | 50.0 % |
| `services/auth_service.py` | 14.8 % | 2.3 % |
| `services/pedidos_service.py` | 7.4 % | 0.0 % |
| `services/pagos_service.py` | 23.0 % | 0.0 % |
| `services/factura_service.py` | 16.1 % | 5.0 % |
| `services/notificaciones.py` | 34.8 % | 14.9 % |
| `routers/citas.py` | 33.5 % | 12.9 % |
| `routers/tecnicos.py` | 42.7 % | 14.3 % |
| `routers/users.py` | 48.4 % | 19.6 % |
| `routers/pedidos.py` | 40.2 % | 18.9 % |
| `routers/auth.py` | 46.3 % | 0.0 % |
| `schemas/*` | 0–100 % | — |
| `models/*` | 100 % | — (clases declarativas) |

El resto de routers/services está entre 0 % y ~45 % de líneas (detalle completo en
los reportes HTML/XML). No se fija ningún umbral: estos números son la línea base,
no una declaración de cobertura funcional.

## 6. Hallazgos de negocio pendientes

### 6.1 T2 — Riesgo en `confirmar_pago_pendiente` (NO corregido)

`be/app/services/pedidos_service.py:1415` (`confirmar_pago_pendiente`):

- Línea 1435-1436: marca `pedido.estado_pedido = "Pagado"` y hace `db.commit()`
  **antes** del descuento de stock (bucle de `descontar_stock`, línea 1469 y ss.).
- Línea 1428-1432: si `pago.estado == "aprobado"`, retorna anticipadamente con la
  factura existente (sin volver a descontar stock).

Escenario de riesgo: si el descuento de stock falla o queda a medias tras el commit
del "Pagado", el pedido queda pagado sin stock descontado; un reintento con el pago
ya aprobado se salta por completo el descuento. No se dio por corregido con mocks.

### 6.2 Aislamiento de `IntegracionEntregasTestCase` — RESUELTO en T0.1

En T0 se detectó que `IntegracionEntregasTestCase` dependía de
`db.query(Tecnico).first()` y `db.query(Cliente).first()`. En T0.1 se eliminó esa
dependencia: la prueba crea sus propios cliente/técnico/usuario con identificadores
únicos y los elimina en `tearDownClass` (ver sección T0.1).

## 7. T0.1 — Independencia de fixtures y comprobación del aislamiento

### 7.1 Dependencia de datos preexistentes eliminada

`IntegracionEntregasTestCase` (`be/app/tests/test_entregas_comportamiento.py`) ya no
usa `Tecnico.first()` ni `Cliente.first()`. Crea sus propias fixtures en `setUpClass`
(reutilizando `_crear_tecnico`/`_crear_cliente` de `test_bloque_2`) con identificadores
únicos y los elimina en `tearDownClass` en orden de claves foráneas
(técnico → usuario → cliente). El pedido desechable se crea/elimina por test.

### 7.2 Revisión del resto de la suite

Se buscó la misma dependencia (`.first()` sobre registros sembrados). Único punto
adicional detectado y **clasificado como dato de referencia creado por migraciones**:
`test_bloque_21_cierre.py` usa `db.query(User).filter(User.id_rol_u == 1).first()`
para obtener el administrador que actúa en `desactivar_empleado`. Ese administrador
es sembrado por la migración base `0001_baseline_esquema_inicial` (usuarios 1..10,
roles 1/2), por lo que existe en una base recién migrada y no es un registro operativo
que cada prueba deba preparar. Se deja así (documentado); no bloquea la ejecución
desde una base recién migrada.

Datos de referencia creados por migraciones (dependencia legítima): `roles_usuario`
(2), `tipos_documento` (2), `especializaciones` (17), `usuarios`/`clientes`/`tecnicos`/
`pedidos`/`productos` sembrados por `0001`. Todo registro operativo creado por una
prueba se prepara y limpia por la propia prueba.

### 7.3 Aislamiento de conexiones comprobado

El parche de `app.database.SessionLocal` en `testdb.py` se aplica antes de importar la
aplicación, por lo que los módulos que capturan `SessionLocal` al importarse
(`app.services.scheduler`, `app.utils.respaldo_usuarios`) reciben la sesión de pruebas.
Se añadió `test_aislamiento.py` con comprobaciones que detectan una conexión fuera de
la base autorizada (sin exponer credenciales):

- `engine.url.database` == base autorizada y != base de aplicación.
- `SessionLocal().get_bind().url.database` == base autorizada.
- `get_db()` entrega una sesión ligada a la base autorizada.
- `scheduler.SessionLocal` y `respaldo_usuarios.SessionLocal` apuntan a la base autorizada.

### 7.4 Scheduler y transportes externos

- **Scheduler**: `testdb.py` neutraliza `iniciar_scheduler`/`detener_scheduler` antes de
  cualquier ciclo de vida; `test_aislamiento.py` comprueba que `iniciar_scheduler()` no
  crea el scheduler (`_scheduler is None`).
- **Correo**: transporte SMTP/Resend/Gmail neutralizado (`_send_email_sync` es no-op);
  la prueba de auth cuenta la invocación del transporte de verificación.
- **Archivos/MinIO**: el cliente se crea de forma diferida; `test_aislamiento.py`
  comprueba que ninguna prueba lo instancia (`minio_service._client is None`).
- **Pagos**: `pagos_service` es un simulador local (sin pasarela externa); los flujos
  que lo usan se mockean por test.

### 7.5 Ejecución sobre base recién creada y migrada

Se creó una base adicional **`neodomus_test_t01`** (sin reutilizar ni vaciar bases
existentes):

```bash
# Crear la base y conceder acceso (SQL ejecutado como root del contenedor db)
# CREATE DATABASE IF NOT EXISTS neodomus_test_t01 ...;
# GRANT ALL PRIVILEGES ON neodomus_test_t01.* TO 'neodomus'@'%';

# Migrar
docker compose exec -T -e DATABASE_URL="mysql+pymysql://neodomus:neodomus123@db:3306/neodomus_test_t01?charset=utf8mb4" api uv run alembic upgrade head

# Ejecutar
docker compose exec -T -e TEST_DATABASE_URL="mysql+pymysql://neodomus:neodomus123@db:3306/neodomus_test_t01?charset=utf8mb4" api uv run python -m unittest discover -s app/tests -p "test_*.py"
```

Resultado de las dos ejecuciones consecutivas: **`Ran 98 tests … OK`** en ambas.

### 7.6 Limpieza verificada (datos pertinentes, no solo totales)

Antes y después de cada ejecución se comparó una huella de los **registros de
referencia** (ids 1..10 de `clientes`, `usuarios`, `tecnicos`, `pedidos`) y los
contadores de registros operativos/derivados. Ambas ejecuciones dejaron el estado
idéntico:

```text
HUELLA_CLIENTES_SEED  8a1f69c01901   (igual antes/después)
HUELLA_USUARIOS_SEED  98a3cfecfd4c   (igual antes/después)
HUELLA_TECNICOS_SEED  7cbd79cfa2a5   (igual antes/después)
HUELLA_PEDIDOS_SEED   4519fd0832a8   (igual antes/después)
clientes>10: 0 · usuarios>10: 0 · tecnicos>10: 0 · pedidos>10: 0
citas/pending/historial/reembolsos/notificaciones/facturas/pagos: 0
```

Es decir: **sin fixtures residuales y sin modificación de registros de referencia**.

### 7.7 Cobertura regenerada

Mismo alcance de T0 (`--source=app --branch`, omitiendo solo `app/tests/*`):
**líneas 37.29 % (3568/9568) · ramas 10.65 % (295/2770)** — sin cambios respecto a T0
(las comprobaciones de aislamiento no añaden líneas de aplicación nuevas; el refactor
de fixtures de entregas ejercita el mismo código). Reportes regenerados en
`be/htmlcov/`, `be/coverage.xml` y `be/coverage.json`.

### 7.8 Pendientes explícitos

- `confirmar_pago_pendiente` (T2) sigue sin corregir (sección 6.1).
- El administrador sembrado usado por `test_bloque_21_cierre` (`User.id_rol_u == 1`)
  es dato de referencia de migración; podría migrarse a fixture propio en un bloque
  futuro, pero hoy no depende de registros operativos externos.
- La base `neodomus_test_t01` se dejó creada (es una base dedicada adicional, no
  destructiva); puede eliminarse si no se necesita.

## 8. Qué no se pudo ejecutar

Nada quedó bloqueado. T0.1 se comprobó íntegramente sobre una base MySQL dedicada
recién creada y migrada (`neodomus_test_t01`), con aislamiento de conexiones y
transportes verificado por `test_aislamiento.py`, limpieza confirmada por huellas de
referencia y cobertura regenerada. El único trabajo pendiente es de negocio (T2).
