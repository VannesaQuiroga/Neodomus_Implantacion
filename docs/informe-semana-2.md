# Informe de la Semana 2 — Migración, Respaldo e Instalación v0

> **Proyecto:** Neodomus — Plataforma web/móvil de domótica y servicios técnicos
> **Entregable:** Semana 2 — Planes de Migración, Respaldo e Instalación v0
> **Versión:** 1.0
> **Fecha:** 20/10/2026
> **Rama de trabajo:** `Week-2---Neodomus`
> **Stack real:** FastAPI 0.115 · MySQL 8.0.46 · MinIO · React/Vite · Expo/React Native
> **Convención de seguridad:** no se incluyen IPs reales, hosts de producción, credenciales, claves privadas ni datos personales. Los ejemplos usan `127.0.0.1`, `example.test` y variables de entorno.

---

## 1. Resumen ejecutivo

La Semana 2 cierra tres frentes del plan de implantación:

1. **Migración de datos (Sección 2):** origen real, mapeo campo por campo, staging, reglas de rechazo, cuatro validaciones obligatorias, rollback y matriz de riesgos.
2. **Respaldo v0 (Sección 3):** RPO/RTO justificados, estrategia 3-2-1, retención diaria/semanal/mensual, restauración en 8 pasos y evidencia de una restauración real en laboratorio.
3. **Instalación v0 (Sección 5):** diez secciones ejecutables para que un tercero despliegue el sistema desde cero, con requisitos, `.env`, Docker, Alembic, healthchecks, TLS, seguridad, MinIO, respaldo/rollback y aceptación.

Además se creó `scripts/respaldar.sh`, un respaldo modular de MySQL con compresión, checksum, retención y limpieza ante fallos. El script fue probado en modo local y en modo Docker, y su resultado se restauró en una base limpia con coincidencia total de conteos y sumatorias.

**Hallazgo relevante:** la base local estaba en la revisión Alembic `0060`, pero la rama de entrega solo contenía migraciones hasta `0057`. El API fallaba con `Can't locate revision identified by '0060'`. Se incorporaron las migraciones `0058`, `0059` y `0060` desde `development`; el API arrancó, `/health` respondió `200` y `alembic current` quedó en `0060 (head)`. No se borraron datos ni se manipuló `alembic_version`.

---

## 2. Objetivos de la semana

| Objetivo | Resultado | Evidencia |
|---|---|---|
| Documentar el plan de migración | Sección 2 completa | `docs/plan-implantacion.md` |
| Diseñar el respaldo v0 | Sección 3 completa | `docs/plan-implantacion.md` |
| Documentar la instalación desde cero | Sección 5 con 10 subsecciones | `docs/plan-implantacion.md` |
| Automatizar el respaldo MySQL | Script funcional y modular | `scripts/respaldar.sh` |
| Verificar integridad y restauración | Prueba en MySQL aislado | Tablas de la sección 6 |
| Resolver el desfase de esquema | Migraciones `0058`–`0060` incorporadas | `alembic current = 0060 (head)` |
| No publicar datos sensibles | Placeholders y variables de entorno | Revisión de los archivos |

---

## 3. Entregables

| Archivo | Tipo | Descripción |
|---|---|---|
| `scripts/respaldar.sh` | Nuevo | Respaldo lógico de MySQL en modo Docker/local, gzip, SHA-256, retención y limpieza. |
| `docs/plan-implantacion.md` | Modificado | Se incorporan las secciones 2, 3 y 5; se actualiza la ficha de MinIO y el alcance. |
| `docs/informe-semana-2.md` | Nuevo | Este informe. |
| `be/alembic/versions/0058_novedades_mensaje_cliente.py` | Nuevo en la rama | Migración faltante recuperada de `development`. |
| `be/alembic/versions/0059_pedidos_confirmacion_completa.py` | Nuevo en la rama | Migración faltante recuperada de `development`. |
| `be/alembic/versions/0060_stock_y_metros_decimal.py` | Nuevo en la rama | Migración faltante recuperada de `development`. |
| `.gitignore` | Modificado | Ignora `backups/` para no versionar respaldos locales. |

No se modificó `docker-compose.yml` en esta semana: la Sección 5 documenta el despliegue actual y las mejoras obligatorias antes de producción (TLS, MySQL 8.4, puertos internos y credenciales sin defaults).

---

## 4. Arquitectura del script de respaldo

`scripts/respaldar.sh` sigue un flujo lineal con funciones de responsabilidad única:

```text
main
 ├─ load_configuration      # entorno + .env con lista blanca
 ├─ validate_configuration  # variables, puerto, retención
 ├─ detect_mode             # auto | docker | local
 ├─ check_dependencies      # gzip, find, sha256sum, mysqldump...
 ├─ check_database_access   # SELECT 1 sin imprimir credenciales
 ├─ prepare_backup_dir      # mkdir 700
 ├─ create_backup           # mysqldump | gzip -9 | gzip -t | SHA-256
 ├─ apply_retention_policy  # find -mtime +N y purga controlada
 └─ print_summary           # ruta, tamaño, hash, estado
```

### 4.1 Decisiones de diseño

| Decisión | Motivo |
|---|---|
| `set -Eeuo pipefail` | Detectar errores en funciones, variables no definidas y fallos dentro de pipelines. |
| `MYSQL_PWD` en lugar de `-p` | Evitar que la contraseña aparezca en la línea de comandos o en `ps`. |
| `mysqldump --single-transaction` | Consistencia para tablas InnoDB sin bloquear escrituras durante el dump. |
| `--quick --triggers --no-tablespaces` | Evitar cargar tablas completas en memoria y no exigir privilegios innecesarios. |
| `--set-gtid-purged=OFF` | Evitar errores de privilegios GTID en MySQL 8.0/8.4. |
| `gzip -9` + `gzip -t` | Compresión y verificación de que el archivo es un gzip válido. |
| `sha256sum` + `.sha256` | Evidencia de integridad y detección de alteraciones. |
| `trap cleanup EXIT` | Eliminar `.tmp` o respaldos incompletos si algo falla. |
| Retención después del respaldo | Nunca borrar la última copia buena antes de crear la nueva. |
| `.env` sin `source` | No ejecutar código arbitrario; solo se aceptan claves de una lista blanca. |

### 4.2 Modos de ejecución

| Modo | Cuándo se usa | Comando |
|---|---|---|
| `auto` | Detecta `neodomus_mysql`; si no está arriba, usa local | `./scripts/respaldar.sh` |
| `docker` | Ejecuta `mysqldump` dentro del contenedor | `BACKUP_MODE=docker DB_CONTAINER=neodomus_mysql ./scripts/respaldar.sh` |
| `local` | Usa `mysqldump` del host contra `127.0.0.1:3307` | `BACKUP_MODE=local MYSQL_HOST=127.0.0.1 MYSQL_PORT=3307 ./scripts/respaldar.sh` |

---

## 5. Contenido del plan de implantación

### 5.1 Sección 2 — Migración de datos

Incluye:

- origen real: `scripts/init_db.sql`, `scripts/export_seed.py`, migraciones Alembic, MySQL y MinIO;
- volumen de referencia y advertencia de que el volumen real debe medirse;
- mapeo campo por campo para clientes, usuarios, categorías, productos, pedidos, detalle, pagos, citas y MinIO;
- staging con tablas `stg_*`, tabla `stg_rechazos` y códigos `E-NULL`, `E-DUP`, `E-FK`, `E-TYPE`, `E-RANGE`, `E-ENCODING`, `E-TOTAL`, `E-PASSWORD`;
- cuatro validaciones obligatorias: conteos, sumatorias, integridad referencial y muestras aleatorias;
- rollback en 8 pasos con restauración en una base nueva y validación previa al cambio de tráfico;
- matriz de 10 riesgos con probabilidad, impacto, mitigación y responsable.

**Decisión importante:** el origen actual no contiene CSV/Excel. El plan no inventa archivos legados; define la ruta `data/legacy/` y el procedimiento para cuando exista un origen de ese tipo.

### 5.2 Sección 3 — Respaldo v0

Incluye:

- **RPO v0 = 24 h** y **RTO v0 = 4 h**, con objetivo de producción de **RPO 15 min** usando binlogs y **RTO 2 h** con runbook automatizado;
- justificación técnica del RPO/RTO y fórmula de medición;
- estrategia **3-2-1**: producción + copia local + copia remota/offline, en dos medios y una fuera de sitio;
- retención diaria (7 días), semanal (4 semanas), mensual (12 meses), binlogs (14 días) y MinIO (30 días/12 meses);
- restauración en 8 pasos;
- evidencia de restauración con datos sintéticos;
- verificación mensual, simulacro trimestral y alertas.

### 5.3 Sección 5 — Instalación v0

Contiene las 10 subsecciones solicitadas:

1. Requisitos previos de software y hardware.
2. Clonación y variables de entorno.
3. Construcción y despliegue con Docker.
4. Inicialización y migración con Alembic.
5. Verificación de servicios y healthchecks.
6. Nginx, TLS y exposición de puertos.
7. Seguridad, secretos y hardening.
8. Carga de datos iniciales y MinIO.
9. Respaldo, restauración y rollback del despliegue.
10. Aceptación, evidencias y traspaso a operación.

---

## 6. Pruebas realizadas y evidencia

### 6.1 Validación estática

| Prueba | Comando | Resultado |
|---|---|---|
| Sintaxis Bash | `bash -n scripts/respaldar.sh` | OK |
| ShellCheck | `shellcheck scripts/respaldar.sh` | OK, sin advertencias |
| Parser `.env` | Archivo de prueba con variable no permitida y una línea `EVIL=$(touch /tmp/pwned)` | Solo cargó variables de la lista blanca; no ejecutó código |
| Permisos | `chmod +x scripts/respaldar.sh` | Ejecutable |

### 6.2 Respaldo en modo local

Entorno aislado: contenedor MySQL 8.0 `neodomus_backup_db`, base `neodomus_test`, datos sintéticos con tildes y decimales. No se usaron datos de producción.

```text
[INFO] Modo de respaldo: local
[ OK ] Conexión verificada.
[ OK ] Respaldo creado y verificado: neodomus_20261020_213347.sql.gz
[ OK ] Retención aplicada. Archivos eliminados: 0.
 Estado: OK
```

| Métrica | Valor |
|---|---|
| Archivo | `neodomus_20261020_213347.sql.gz` |
| Tamaño | 2.044 bytes (4,0 KiB) |
| SHA-256 | `d5994398315fe1fc24cc14b4a738dc5dfffdf07f6e60c28f0f351e35cc352d3c` |
| `gzip -t` | OK |
| `sha256sum -c` | OK |

### 6.3 Restauración en base limpia

Se creó `neodomus_restore`, se importó el `.sql.gz` y se compararon conteos y sumatorias.

| Tabla | Antes | Después | Diferencia |
|---|---:|---:|---:|
| `clientes` | 3 | 3 | 0 |
| `usuarios` | 2 | 2 | 0 |
| `productos` | 4 | 4 | 0 |
| `pedidos` | 3 | 3 | 0 |
| `detalle_pedido` | 5 | 5 | 0 |
| `pagos` | 3 | 3 | 0 |
| `citas` | 2 | 2 | 0 |
| `novedades` | 1 | 1 | 0 |

| Sumatoria | Antes | Después | Diferencia |
|---|---:|---:|---:|
| `SUM(pedidos.total_pedido)` | 571.000,00 | 571.000,00 | 0,00 |
| `SUM(pagos.monto)` | 571.000,00 | 571.000,00 | 0,00 |
| `SUM(productos.stock_producto)` | 177,75 | 177,75 | 0,00 |

**Resultado:** restauración correcta, 23 filas recuperadas, sin diferencias.

### 6.4 Respaldo en modo Docker

```text
[INFO] Modo de respaldo: docker
[ OK ] Conexión verificada.
[ OK ] Respaldo creado y verificado: neodomus_20261020_213649.sql.gz
 Estado: OK
```

| Métrica | Valor |
|---|---|
| Archivo | `neodomus_20261020_213649.sql.gz` |
| Tamaño | 2.041 bytes |
| SHA-256 | `53ef5a70fc76205fc79fa43df8b57665dd00701af413b6c22e246816a036b14f` |
| `sha256sum -c` | OK |

### 6.5 Retención

Se crearon dos archivos simulados con 10 días de antigüedad y se ejecutó el script con `RETENTION_DAYS=7`:

```text
[INFO] Eliminado por retención: neodomus_20200101_000000.sql.gz
[INFO] Eliminado por retención: neodomus_20200101_000000.sql.gz.sha256
[ OK ] Retención aplicada. Archivos eliminados: 2.
```

El respaldo nuevo se conservó y los archivos antiguos se eliminaron. La retención no borra la copia recién creada.

### 6.6 Reparación del desfase Alembic

| Paso | Resultado |
|---|---|
| Síntoma | `FAILED: Can't locate revision identified by '0060'` |
| Causa | Base en `0060`; rama con migraciones solo hasta `0057` |
| Acción | Incorporar `0058`, `0059` y `0060` desde `development` |
| Verificación | `alembic current` → `0060 (head)`; `alembic heads` → `0060 (head)` |
| Salud | `GET /health` → `200 {"status":"ok"}` |
| Datos | No se borró ni se recreó la base; no se perdió información |

La ruta `/v1/models` observada en los logs no pertenece a Neodomus. Las rutas de negocio están bajo `/api/v1` y el healthcheck es `/health`; un `404` en `/v1/models` es una sonda o URL externa mal configurada.

### 6.7 Estado del entorno local al cierre

| Servicio | Estado |
|---|---|
| `neodomus_mysql` | Up, healthy |
| `neodomus_api` | Up, `/health` 200 |
| `neodomus_minio` | Up |
| `neodomus_frontend` | Up |
| Alembic | `0060 (head)` |
| Base local | 52 tablas, 16 productos de laboratorio |

> Los conteos locales no representan el volumen de producción. El plan de migración exige medir el volumen real antes de la ventana.

---

## 7. Hallazgos y riesgos

| ID | Hallazgo | Impacto | Acción |
|---|---|---|---|
| S2-01 | La rama no tenía las migraciones `0058`–`0060` que sí existían en la base/desarrollo | API en bucle, imposibilidad de migrar | Incorporadas y verificadas; no borrar `alembic_version` |
| S2-02 | `docker-compose.yml` conserva credenciales por defecto y publica MySQL/MinIO en todas las interfaces | Riesgo de exposición | Sección 5.7: eliminar defaults, usar `.env` y limitar a `127.0.0.1`/VPN |
| S2-03 | El frontend v0 usa el servidor de desarrollo de Vite | No apto para producción | Sección 5.6: build estático + Nginx/TLS |
| S2-04 | MySQL 8.0 está al final de su soporte extendido | Sin parches de seguridad | Migrar a MySQL 8.4 LTS antes de producción |
| S2-05 | El respaldo v0 es diario; no hay binlogs ni PITR | RPO de hasta 24 h | Implementar binlogs y envío cada 15 min para producción |
| S2-06 | MinIO se respalda aparte; no está dentro del `.sql.gz` | URL rotas si se restaura solo MySQL | Restaurar DB + MinIO juntos y conciliar rutas |
| S2-07 | La sonda `/v1/models` devuelve 404 | Ruido en logs | Corregir la URL del cliente; usar `/health` y `/api/v1` |

---

## 8. Cómo usar el respaldo localmente

### 8.1 Preparación

```bash
cp .env.example .env
# Editar .env con credenciales locales; nunca subirlo al repositorio.
chmod 600 .env
```

### 8.2 Ejecución

```bash
# Modo automático: usa el contenedor neodomus_mysql si está arriba.
./scripts/respaldar.sh

# Modo local contra el puerto publicado por Docker.
BACKUP_MODE=local MYSQL_HOST=127.0.0.1 MYSQL_PORT=3307 ./scripts/respaldar.sh

# Destino y retención personalizados.
BACKUP_DIR=/var/backups/neodomus RETENTION_DAYS=14 ./scripts/respaldar.sh

# Ayuda.
./scripts/respaldar.sh --help
```

### 8.3 Verificación

```bash
cd /var/backups/neodomus
sha256sum -c neodomus_YYYYMMDD_HHMMSS.sql.gz.sha256
gzip -t neodomus_YYYYMMDD_HHMMSS.sql.gz
```

### 8.4 Restauración de prueba

```bash
# Crear una base limpia y restaurar; no usar producción.
mysql -h 127.0.0.1 -P 3307 -u "$MYSQL_USER" -e \
  "CREATE DATABASE neodomus_restore CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

gunzip -c neodomus_YYYYMMDD_HHMMSS.sql.gz | \
  mysql -h 127.0.0.1 -P 3307 -u "$MYSQL_USER" neodomus_restore
```

La guía completa, con los 8 pasos y las validaciones, está en la Sección 3 de `docs/plan-implantacion.md`.

---

## 9. Criterios de aceptación de la Semana 2

- [x] Sección 2 con origen, mapeo, staging, rechazos, cuatro validaciones, rollback y riesgos.
- [x] Sección 3 con RPO/RTO, 3-2-1, retención, restauración en 8 pasos y evidencia.
- [x] Sección 5 con 10 subsecciones de instalación.
- [x] Script `scripts/respaldar.sh` con `set -euo pipefail`, funciones, compresión, checksum, retención y limpieza.
- [x] `bash -n` y ShellCheck sin errores.
- [x] Respaldo local y en Docker probado.
- [x] Restauración con conteos y sumatorias coincidentes.
- [x] Retención probada con archivos antiguos.
- [x] Desfase Alembic `0060` resuelto sin pérdida de datos.
- [x] Sin credenciales, IPs reales ni datos de producción en la documentación.
- [ ] Prueba en servidor real con Nginx/TLS y MySQL 8.4 (Semana 3).
- [ ] Binlogs/PITR y copia externa automatizada (Semana 3).

---

## 10. Próximos pasos

1. Implementar Nginx/TLS y servir el build estático del frontend.
2. Migrar MySQL 8.0 a 8.4 LTS y fijar imágenes por digest.
3. Configurar binlogs y envío cada 15 minutos para RPO de 15 min.
4. Automatizar la copia semanal/mensual a almacenamiento externo y la copia offline.
5. Ejecutar una restauración real en el servidor de staging y medir RTO.
6. Completar la Sección 4 (operación, monitoreo y pruebas de carga).
7. Programar la primera prueba mensual de restauración y el simulacro trimestral.

---

## 11. Conclusión

La Semana 2 deja un plan de migración verificable, un esquema de respaldo probado y una guía de instalación que un tercero puede seguir. El respaldo no se limita a generar un archivo: valida gzip, calcula SHA-256, aplica retención, limpia fallos y fue restaurado con éxito en una base limpia. El incidente de Alembic quedó documentado y resuelto, y la instalación incorpora el diagnóstico para evitar que vuelva a ocurrir.

La deuda principal para producción no es el script, sino la infraestructura: TLS, MySQL 8.4, binlogs/PITR, copia externa y pruebas en un servidor real. Esas acciones quedan priorizadas para la Semana 3.
