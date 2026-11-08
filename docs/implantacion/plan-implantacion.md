# Plan de Implantación Neodomus — Semanas 1–3 (v0)

**Estado:** borrador operativo para revisión. **Alcance:** Semana 1 (ficha técnica y requisitos), Semana 2 (migración, respaldo/restauración e instalación) y Semana 3 (hosting, dominio y reverse proxy).

## Base técnica y límites del plan

La configuración comprobada en este repositorio es una API **Python/FastAPI** con SQLAlchemy y Alembic, una aplicación web React/Vite, una app móvil Expo/React Native, **MySQL 8.0** y MinIO. Este checkout no configura una API Node.js/Express ni bases PostgreSQL o MongoDB; los procedimientos de esta versión se limitan a MySQL.

El `docker-compose.yml` actual es de desarrollo: monta el código fuente, arranca servidores de desarrollo y puede sembrar usuarios si `EJECUTAR_SEED_AL_ARRANCAR` no se desactiva. No es una configuración productiva certificada. Antes de desplegar producción se requiere un Compose/manifest endurecido, TLS, gestión de secretos, red privada, límites de recursos, monitoreo y revisión del acceso de MinIO.

No se encontró en el repositorio un extracto legado de producción, un inventario de volumen real ni evidencia de una restauración en un entorno aislado. Esos datos se registran como pendientes y no se sustituyen por cifras inventadas. El SQL versionado `scripts/init_db.sql` es una referencia de inicialización/semillas, no prueba de ser el origen oficial de datos productivos.

---

## 1. Ficha Técnica y Matriz de Requisitos

### 1.1 Inventario de componentes y licenciamiento

Inventario contrastado con manifiestos y Compose. Las etiquetas de imagen mysql:8.0, node:22-alpine y elestio/minio:latest no fijan una versión de parche; antes de producción deben fijarse versiones exactas y, preferiblemente, digest.

| Componente | Software y versión observada | Tipo | Licencia | Estado de pin |
|---|---|---|---|---|
| Web | React 18.3.1, Vite 5.4.21; Node.js 22 (node:22-alpine) | Web | React/Vite MIT; Node.js MIT y avisos de terceros | Paquetes fijados; imagen Node solo mayor |
| API | Python 3.12, FastAPI 0.115.0, SQLAlchemy 2.0.30, Uvicorn 0.30.0 | API | PSF-2.0, MIT, MIT, BSD-3-Clause | Paquetes en be/uv.lock; imagen python:3.12-slim sin digest |
| Migraciones | Alembic 1.13.2 | Migrador | MIT | Versión declarada en backend |
| Móvil | Expo 57.0.22, React Native 0.86.3, React 19.2.3 | Móvil | MIT | Verificar lockfile antes de publicación |
| Base de datos | MySQL Community Server 8.0 (mysql:8.0) | DB | GPL-2.0 Community Edition | Tag de rama, no parche |
| Objetos | MinIO (elestio/minio:latest) | Almacenamiento | AGPL-3.0 para MinIO; confirmar licencia del artefacto exacto | latest, no reproducible |
| Proxy local | Caddy 2 (caddy:2-alpine) | Proxy | Apache-2.0 | Tag flotante; perfil local |
| Contenedores | Docker Engine y Docker Compose v2 | Plataforma | Compose Apache-2.0; Engine incluye componentes con términos propios | Versiones del host no fijadas |

El licenciamiento del artefacto desplegado debe verificarse con su SBOM y avisos incluidos. Este checkout no configura una API Node/Express ni PostgreSQL o MongoDB.

### 1.2 Consumo por servicio y medición

No hay medición de docker stats ni perfil de carga registrado en este entorno. Los datos se dejan pendientes, sin presentar estimaciones como resultados medidos. En un host con el stack activo, capturar reposo y repetir durante una prueba de carga reproducible:

~~~bash
docker compose up -d
docker stats --no-stream --format 'table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}\t{{.BlockIO}}'
~~~

| Servicio | Reposo medido | Carga simulada medida | Medición requerida |
|---|---|---|---|
| frontend (Vite dev) | Pendiente | Pendiente | Navegación y solicitudes concurrentes |
| api (FastAPI) | Pendiente | Pendiente | CRUD autenticado; latencia p50/p95, CPU y RAM |
| db (MySQL) | Pendiente | Pendiente | Consultas y transacciones representativas |
| minio | Pendiente | Pendiente | Subidas/lecturas de objetos y ancho de banda |
| caddy | Pendiente | Pendiente | Solicitudes HTTPS a frontend y API |

Archivar salida, fecha, commit, conjunto de datos anonimizado, configuración y herramienta de carga. docker stats informa consumo por contenedor, pero no latencia ni integridad de datos.

### 1.3 Requisitos mínimos, recomendados y headroom

Dimensionamiento inicial de un nodo pequeño de desarrollo/staging; IOPS son objetivos de planificación pendientes de benchmark.

| Recurso | Mínimo v0 | Recomendado v0 |
|---|---:|---:|
| CPU | 2 vCPU | 4 vCPU |
| RAM | 4 GiB | 8 GiB |
| Disco | 20 GiB total, mínimo 10 GiB libres | 100 GiB SSD/NVMe, alerta al 20% libre |
| IOPS aleatorias | 1.000 sostenidas | 3.000 sostenidas |

Headroom = (recomendado − mínimo) / mínimo × 100: CPU (4−2)/2 = 100%; RAM (8−4)/4 = 100%; disco (100−20)/20 = 400%; IOPS (3.000−1.000)/1.000 = 200%. Márgenes de diseño, no resultados de benchmark. Los 10 GiB libres son una condición previa, no la capacidad total.

### 1.4 Sistema operativo

Recomendación: Ubuntu Server 24.04 LTS, arquitectura amd64/x86_64, instalación mínima. Fin del mantenimiento de seguridad estándar: 31 de mayo de 2029; Ubuntu Pro puede ampliar la cobertura según sus condiciones. Planificar actualización antes del fin de soporte estándar. [Ciclo oficial de Ubuntu](https://ubuntu.com/about/release-cycle)

### 1.5 Infraestructura on-premise y RAID

Para la primera implantación se recomienda VPS y respaldos externos por menor inversión inicial y carga operativa. Si on-premise es obligatorio, usar servidor rack para producción por fuentes redundantes, discos hot-swap y expansión; torre para piloto pequeño; blade no se justifica por costo y dependencia del chasis compartido. Para MySQL con al menos cuatro discos, RAID 10 ofrece espejo más striping y tolerancia a una falla por espejo con buen rendimiento de escritura; con dos discos, RAID 1. RAID no reemplaza respaldos independientes. Validar capacidad útil y practicar reconstrucción.

### 1.6 Restricciones de licencias

React, Vite, FastAPI, SQLAlchemy, Alembic, Expo y React Native usan licencias permisivas según metadatos; conservar avisos y revisar dependencias transitivas. MySQL Community GPL-2.0 requiere revisión legal si se redistribuye servidor o derivados. MinIO AGPL-3.0 puede requerir ofrecer código fuente correspondiente de versiones modificadas disponibles por red; revisar licencia y modelo comercial vigentes antes de operación pública. Caddy/Compose Apache-2.0 no elimina obligaciones de terceros. No se presupuestan soporte comercial, Ubuntu Pro, nube, dominio, correo o distribución móvil.

### 1.7 Salida ilustrativa del verificador

Ejemplo simulado para la rúbrica; no es una captura ni medición real de este servidor.

~~~text
$ bash scripts/verificar-requisitos.sh
[OK] Dependencias del sistema disponibles.
[OK] UID 1000 tiene acceso al daemon Docker; no se requiere root.
[OK] Docker está instalado y ejecutándose (Docker version <VERSION>).
[OK] Docker Compose disponible (v2.<VERSION>).
[OK] RAM total: 8.0 GiB (mínimo 4 GiB).
[OK] Espacio libre: 42.0 GiB (mínimo 10 GiB).
[OK] Puerto TCP 80 disponible.
[OK] Puerto TCP 443 disponible.
[OK] Puerto TCP 3307 disponible.
[OK] Puerto TCP 5173 disponible.
[OK] Puerto TCP 8000 disponible.
[OK] Puerto TCP 9000 disponible.
[OK] Puerto TCP 9001 disponible.
[RESULTADO] Todos los requisitos se cumplen.
~~~

La simulación determinista de fallo se ejecuta con SIMULATE_FAIL=true bash scripts/verificar-requisitos.sh y debe terminar con código 1.

---

## 2. Plan de Migración de Datos

### 2.1 Origen y estado de los datos

| Aspecto | Estado v0 | Acción requerida antes de migrar |
|---|---|---|
| Origen legado | No identificado en el checkout. No hay CSV/Excel legado ni conexión a una BD origen documentada. | El Propietario de Datos debe identificar sistema, exportación, formato, codificación, zona horaria y responsable de entrega. |
| Artefacto versionado | `scripts/init_db.sql`, usado como referencia de inicialización/semillas; no asumir que refleja producción. | Revisar procedencia y fecha con el responsable funcional antes de usarlo como fuente. |
| Volumen | Desconocido. No hay acceso de lectura a producción ni conteo certificado. | Medir filas y tamaño por entidad con el origen autorizado; registrar fecha, método y total en el acta de migración. |
| Propietario funcional | Responsable de Producto/Datos, por asignar por nombre. | Aprobar reglas de equivalencia, valores rechazados y conciliación. |
| Responsable técnico | DBA/DevOps y responsable de aplicación, por asignar por nombre. | Preparar staging, respaldo, migración Alembic, permisos y ventana de cambio. |
| Datos sensibles | Usuarios, clientes, documentos, teléfonos, direcciones, hashes de contraseña y datos transaccionales. | Cifrar exportaciones y staging, restringir acceso por rol, auditar accesos y eliminar temporales según política aprobada. |

**Estimación de capacidad v0:** no asignada hasta obtener conteos reales. Antes de iniciar, medir tamaño lógico y físico, crecimiento mensual y volumen de adjuntos de MinIO. Dimensionar staging y respaldo con margen aprobado por Infraestructura; comprobar espacio libre antes de exportar. No usar información real en staging compartido sin anonimización o autorización y controles equivalentes.

### 2.2 Mapeo y transformación

Los nombres de la columna origen son nombres lógicos de ejemplo, porque el esquema legado aún no está identificado. Los destinos sí corresponden al modelo actual (`be/app/models/`). Debe aprobarse una matriz definitiva origen-destino con el propietario de datos antes de la carga.

| Entidad / campo de origen lógico | Tipo de origen esperado | Destino actual | Tipo / regla de transformación |
|---|---|---|---|
| Persona: `source_id` | Texto o entero | Tabla de control de migración (staging), no columna de negocio | Conservar como clave externa de trazabilidad; no reutilizar PK sin comprobar colisiones. |
| Persona: `nombres`, `apellidos` | Texto | `clientes.first_name`, `clientes.last_name` o `usuarios.first_name`, `usuarios.last_name` | UTF-8; quitar espacios exteriores; rechazar nulos y longitudes mayores a 100; resolver la clasificación cliente/empleado con negocio. |
| Persona: `correo` | Texto | `clientes.email` / `usuarios.email` | Recortar, normalizar a minúsculas para detección de duplicados; validar formato; máximo 100; debe ser único por tabla. No fusionar identidades automáticamente. |
| Persona: `documento` | Texto | `clientes.documento_cliente` / `usuarios.documento_usuario` | El destino actual es entero. Normalizar solo separadores aprobados; rechazar letras, ceros iniciales significativos, overflow o pérdida de semántica. Evaluar cambiar a texto antes de migrar si los documentos pueden tener ceros, letras o guiones. |
| Persona: `teléfono` | Texto | `clientes.telefono_cliente` / `usuarios.telefono_usuario` | El destino actual es `BIGINT`; convertir solo después de definir código de país y formato. Rechazar valores que perderían `+`, ceros iniciales o extensión; considerar migración de esquema a texto. |
| Persona: `password` o hash legado | Texto sensible | `password_hash` | Nunca importar contraseñas en claro. Aceptar hash solo si algoritmo y parámetros son compatibles y verificados; de lo contrario, crear flujo de restablecimiento/invitación y marcar la contraseña como pendiente de cambio. |
| Técnico: `user_source_id`, `certificación` | Clave/texto | `tecnicos.id_usuario_t`, `tecnicos.certificacion_t` | Resolver la FK con tabla de correspondencia de usuarios; máximo 100 caracteres para certificación. Rechazar técnicos sin usuario enlazable. |
| Producto: `nombre`, `marca`, `referencia` | Texto | `productos.nombre_producto`, `marca`, `referencia_producto` | UTF-8; límites actuales 100/100/50; referencia única; duplicados se ponen en cuarentena, no se sobrescriben. |
| Producto: `stock`, `precio_compra`, `precio_venta` | Decimal/texto decimal | `productos.stock_producto`, `precio_compra_producto`, `precio_venta_producto` | Parsear con separador decimal explícito; nunca inferir separadores ambiguos. Stock usa `NUMERIC(12,2)`; los precios del modelo actual son `FLOAT`, por lo que se concilian a 2 decimales y se debe evaluar `NUMERIC` antes de migrar importes financieros. |
| Pedido: `customer_source_id`, fecha, total, estado | Clave/fecha/decimal/texto | `pedidos.id_cliente_pe`, `fecha_peedido`, `total_pedido`, `estado_pedido` | Resolver cliente; fecha ISO-8601 y zona `America/Bogota`; mapear estados con catálogo aprobado; preservar total como decimal en staging y conciliar a 2 decimales. |
| Línea de pedido: `order_source_id`, `product_source_id`, cantidad, importe | Claves/decimal | `detalle_pedido.id_pedido_d`, `id_producto_d`, `cantidad_detalle`, `precio_unitario_detalle`, `subtotal_detalle` | Resolver ambas FKs; validar cantidad positiva; conciliar subtotal = cantidad × precio según regla comercial aprobada. Servicios sin producto se asignan a `id_servicio_d` solo con catálogo válido. |
| Cita: cliente, técnico, fecha/hora, servicio, costo, estado | Clave/fecha/texto/decimal | `citas.id_cliente`, `id_tecnico`, `fecha`, `hora`, `tipo_servicio`, `costo_cita`, `estado` | Resolver cliente/técnico; normalizar fechas y hora local; estados y tipos mediante tabla de equivalencia versionada; costo con precisión de 2 decimales. |
| Factura: pedido/cita, número, fecha, total, pago | Claves/texto/fecha/decimal | `facturas.id_pedido`, `id_cita`, `numero_factura`, `fecha_factura`, `monto_total`, campos de pago | Cada factura debe apuntar a pedido o cita, nunca quedar sin origen; número único; fecha ISO; validar total contra documento fuente. |

**Trazabilidad:** cargar el extracto original en tablas `stg_*` de una instancia aislada y restringida; conservar `source_id`, `batch_id`, fila original, hash del archivo, fecha de carga y resultado de validación. No importar directamente desde CSV a tablas de negocio. La tabla de correspondencia de IDs se conserva con acceso restringido hasta la aprobación y cierre del cambio.

### 2.3 Staging y reglas de rechazo

1. Crear una instancia/base MySQL de staging separada de producción, con versión compatible con MySQL 8.0, credenciales propias y sin acceso público.
2. Congelar el extracto autorizado y guardar su hash SHA-256, codificación, delimitador, zona horaria, número de filas y fecha de extracción. Conservar el original en almacenamiento cifrado y de acceso mínimo.
3. Cargar valores crudos como texto a tablas `stg_*`; conservar la fila original y añadir `batch_id`, `source_id`, `loaded_at`, `validation_status` y `rejection_reason`.
4. Transformar en una segunda etapa idempotente; la clave `(batch_id, source_id)` impide duplicar la misma carga. No actualizar automáticamente una fila de negocio existente.
5. Enviar a cuarentena y bloquear publicación cuando haya campos obligatorios nulos, correo/clave única duplicada, FK inexistente, fecha imposible, decimal inválido, estado desconocido, identificador truncado o conversión con pérdida. No descartar filas silenciosamente.
6. El Propietario de Datos decide corrección en origen, regla de equivalencia o exclusión. Registrar cada excepción y aprobación; volver a procesar el mismo lote de forma idempotente.
7. No comenzar la carga de negocio hasta que el lote tenga 0 rechazos sin resolver y exista aprobación técnica y funcional firmada.

### 2.4 Validaciones y conciliación obligatorias

Las cuatro verificaciones se ejecutan en origen, staging y destino; se guardan consultas, resultados, timestamp, versión de aplicación y responsable.

1. **Conteo:** filas por entidad y estado, antes/después; explicar cada diferencia con filas aprobadas en cuarentena o exclusión firmada. No aceptar diferencia inexplicada.
2. **Sumatorias:** totales de pedidos, facturas, pagos y stock valorizado por moneda/estado, usando decimales a dos cifras; conciliar totales por período y cantidad de documentos.
3. **Integridad referencial:** consultas de huérfanos para cliente-pedido/cita, pedido-detalle, detalle-producto, técnico-usuario y factura-pedido/cita; el resultado esperado es cero huérfanos no exceptuados.
4. **Muestra aleatoria estratificada:** revisar al menos 30 registros por entidad cuando existan 30 o más (si hay menos, revisar todos), incluyendo casos límite; comparar campos normalizados contra fuente y guardar evidencia anonimizada.

### 2.5 Secuencia de migración y aceptación

1. Aprobar origen, mapeo, volumen, ventana, criterios de rechazo y responsables.
2. Restaurar una copia de la BD de destino en un entorno aislado y ensayar el lote completo, conciliación y tiempo total.
3. Generar y verificar un respaldo antes del cambio. Confirmar que se puede restaurar en otra base limpia.
4. Congelar escrituras del origen o acordar una ventana sin cambios. Exportar el corte final y registrar su hash.
5. Cargar y transformar en staging; resolver rechazos y obtener las cuatro conciliaciones firmadas.
6. Aplicar las migraciones Alembic aprobadas; cargar datos por dependencias (catálogos, usuarios/clientes, técnicos, productos, pedidos/detalles, citas, facturas).
7. Ejecutar conciliación final en destino; realizar smoke test de lectura y flujos acordados; no habilitar escrituras hasta aprobación.
8. Habilitar servicio, monitorear errores y métricas durante la ventana de estabilización. Conservar origen de solo lectura durante el período de reversa aprobado.

### 2.6 Rollback ante falla crítica

1. Declarar incidente, detener el avance y registrar hora, lote, revisión de código/Alembic y último checkpoint conciliado.
2. Deshabilitar escrituras y sacar la versión nueva del balanceador/entrada; mantener la instancia fallida aislada y de solo lectura para análisis.
3. No ejecutar `alembic downgrade` a ciegas: revisar si la migración tiene downgrade seguro y si ocurrieron escrituras con el esquema nuevo.
4. Aprovisionar una base MySQL vacía con el esquema/versión anterior. Restaurar allí el respaldo previo al cambio; nunca sobrescribir la única copia ni borrar el origen fallido.
5. Validar el respaldo (`gzip -t` o descifrado + `gzip -t`), ejecutar cuatro conciliaciones y comprobar `/health` con la versión anterior.
6. Revertir la configuración de conexión al esquema restaurado y desplegar la imagen anterior conocida. Si hubo escrituras posteriores, conciliarlas antes de descartar datos; no hacer dual-write improvisado.
7. Reabrir lecturas y, con aprobación del responsable del incidente, escrituras. Mantener el esquema fallido aislado hasta finalizar análisis.
8. Registrar RTO real, pérdida de datos/RPO observado, causa, decisiones y acción preventiva. El dueño de negocio aprueba el cierre.

### 2.7 Matriz de riesgos de migración

| Riesgo | Probabilidad v0 | Impacto | Mitigación / respuesta |
|---|---|---|---|
| No se conoce el origen legado ni su volumen | Alta | Alto | Puerta de inicio: inventario firmado; no ejecutar migración productiva hasta recibir extracto y conteos. |
| Duplicados de correo/documento o claves | Media | Alto | Validar unicidad en staging, conservar excepciones en cuarentena y no fusionar identidades automáticamente. |
| Pérdida por conversión de documento/teléfono a entero | Media | Alto | Comparar dominio real y ceros iniciales; rechazar pérdida y migrar columnas a texto antes de cargar si es necesario. |
| Redondeo de importes por columnas `FLOAT` | Media | Alto | Cargar en decimal, conciliar sumas y evaluar cambio de esquema a `NUMERIC` antes de migrar dinero. |
| Relaciones huérfanas o IDs que colisionan | Media | Alto | Tabla de correspondencia, orden por dependencias, FKs en staging y consulta de huérfanos con resultado cero. |
| Respaldo incompleto o no restaurable | Media | Crítico | Dump comprimido, prueba de integridad, copia fuera del host y ensayo real de restauración antes de aprobar la ventana. |
| Exposición de PII en CSV, logs o staging | Media | Crítico | Cifrado, permisos mínimos, anonimización en pruebas, no guardar filas personales en logs ni repositorio. |
| Ventana excedida o interrupción del servicio | Media | Alto | Ensayo cronometrado, congelamiento de escrituras, umbral go/no-go y rollback preparado antes del corte. |

---

## 3. Plan de Respaldo v0

### 3.1 Alcance y objetivos RPO/RTO

El alcance del script es la base **MySQL 8.0** configurada en Docker Compose o una instancia MySQL local. El dump incluye tablas, datos, vistas que permita la cuenta, rutinas, triggers y eventos. No respalda el volumen de MinIO, código, secretos ni la configuración de infraestructura; los adjuntos requieren un plan separado de versionado/replicación de objetos. MinIO en el mismo host no cuenta como copia off-site.

| Métrica | Objetivo v0 | Justificación y condición |
|---|---|---|
| RPO operativo | 24 horas como máximo para respaldo diario completado | Corresponde a una copia completa cada 24 h. No hay binlogs/PITR configurados en el repositorio, por lo que no se promete recuperación a minutos. Para cada release/migración se crea además una copia previa al cambio. |
| RTO objetivo | 4 horas para restaurar BD y recuperar API básica | Objetivo provisional para un stack de tamaño aún no medido: aprovisionar MySQL, importar dump, validar conteos y poner API en servicio. Debe medirse en un simulacro con tamaño real; no es SLA certificado. |

El RPO/RTO definitivo depende del volumen, velocidad de disco/red, copia fuera del host y ventana aceptable del negocio. Registrar duración real, tamaño y resultado en cada simulacro; si no se cumple, ajustar infraestructura o objetivos, no omitir el registro.

### 3.2 Estrategia 3-2-1 y retención

- **3 copias:** base primaria; dump cifrado en almacenamiento separado; réplica cifrada off-site con identidad de acceso distinta.
- **2 medios:** almacenamiento de base de datos y almacenamiento de archivos/objeto independiente. Dos directorios del mismo disco no cuentan como dos medios.
- **1 off-site:** bucket/cuenta/región administrados por separado, con cifrado del lado del proveedor, MFA, permisos mínimos y retención protegida contra borrado accidental/ransomware.
- **Retención inicial:** dumps diarios locales por 30 días (política del script); copias semanales off-site por 8 semanas y mensuales por 12 meses. Revisar retención con Legal/Privacidad y políticas corporativas antes de producción; ejecutar borrado seguro al expirar.
- **Cifrado:** en producción, configurar `BACKUP_ENCRYPTION=age` con `BACKUP_AGE_RECIPIENT` público. La clave privada de descifrado se guarda fuera del servidor de respaldo, en un gestor de secretos/medio controlado, con acceso de emergencia probado. El modo `none` solo se admite en entorno local protegido y con volumen cifrado/permisos `0700`. Durante el cifrado se crea temporalmente un `.sql.gz` con permisos restrictivos; para datos reales, el volumen debe tener cifrado en reposo.
- **Automatización:** ejecutar el script diariamente desde un scheduler administrado, alertar si el proceso falla o el último respaldo supera 26 horas; copiar el artefacto validado fuera del host y verificar hash/tamaño en destino. La copia off-site y la alerta no están implementadas por el script v0.
- **Permisos:** el script usa `umask 077` y permisos `0700` para el directorio local. El dump contiene datos personales y se trata como dato sensible.

Ejemplo de programación Linux (ajustar rutas, usuario y scheduler aprobados; no poner secretos en la línea cron):

```cron
15 2 * * * cd /ruta/instalacion/neodomus && BACKUP_SOURCE=docker BACKUP_DIR=/ruta/segura/backups BACKUP_RETENTION_DAYS=30 BACKUP_ENCRYPTION=age BACKUP_AGE_RECIPIENT='<DESTINATARIO_AGE_PUBLICO>' bash ./scripts/respaldar.sh
```

Para esta instalación Docker, Compose lee la configuración del archivo `.env` en la raíz del proyecto. No uses `source .env` en automatizaciones ni pases contraseñas con `-p` en argumentos del proceso.

### 3.3 Ejecución manual del respaldo

Desde la raíz del repositorio con Docker/Compose v2 y la base activa:

```bash
BACKUP_SOURCE=docker bash ./scripts/respaldar.sh
```

En una instalación local, exporta `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_DATABASE`, `MYSQL_USER` y `MYSQL_PASSWORD` desde un gestor de secretos/entorno seguro, y ejecuta:

```bash
BACKUP_SOURCE=local bash ./scripts/respaldar.sh
```

El modo local requiere `mysqldump`; la contraseña se pasa al proceso por variable de entorno y nunca se imprime. Para staging/producción se recomienda `BACKUP_ENCRYPTION=age`. El script comprime el dump, valida tamaño y `gzip -t`, publica el archivo mediante renombrado atómico, aplica retención por antigüedad y presenta ruta, tamaño, SHA-256 y estado. Código 0 indica respaldo y retención completados; código 1 indica fallo. Los temporales incompletos se eliminan al salir. Guardar el SHA-256 de la salida con los registros restringidos del scheduler y volver a calcularlo en destino para verificar la copia off-site.

### 3.4 Restauración en ocho pasos

Realizar la restauración primero en una instancia nueva y aislada, con la misma versión mayor de MySQL. No restaurar encima de producción durante el simulacro.

1. **Autorizar y aislar:** abrir registro de cambio/incidente, asignar responsable y crear MySQL limpio accesible solo desde la red de recuperación. Confirmar espacio libre suficiente.
2. **Seleccionar artefacto:** identificar el dump por timestamp y origen; comprobar permisos, tamaño y hash registrado en el almacenamiento. Para `.age`, recuperar la identidad privada del gestor seguro, nunca del mismo host del dump.
3. **Verificar archivo:** sin cifrado, ejecutar `gzip -t '<RUTA_DEL_DUMP>.sql.gz'`. Con `age`, descifrar a un pipe controlado y verificar la capa gzip; no guardar plaintext en un directorio compartido.
4. **Crear destino vacío:** crear una base de restauración nueva con `utf8mb4` y usuario temporal de mínimo privilegio. No reutilizar la base origen ni ejecutar `DROP DATABASE` como parte del procedimiento automático.
5. **Importar:** transmitir el dump descomprimido a `mysql` conectado al destino nuevo. Para archivo cifrado, `age -d` alimenta `gzip -dc`, y este alimenta `mysql`; usar un archivo de opciones MySQL con permisos `0600` o un gestor de secretos, no una contraseña en argumentos.
6. **Alinear versión:** desplegar en entorno aislado la versión de aplicación compatible con el respaldo y comprobar `alembic current`. No ejecutar `upgrade head` ni `downgrade` hasta comparar el revision guardado y aprobar el sentido del cambio.
7. **Validar y cronometrar:** contar tablas principales antes/después, sumar totales, comprobar FKs y muestras aleatorias; iniciar API y ejecutar smoke checks de salud/lectura. Registrar duración total y cualquier diferencia explicada.
8. **Aprobar recuperación:** documentar evidencia, actualizar RPO/RTO observado y obtener aprobación del responsable. Solo entonces planificar el cambio de conexión/tráfico; conservar el origen fallido aislado según la política de incidentes.

### 3.5 Evidencia de restauración real

No se ha ejecutado una restauración real en este artefacto; por tanto, **no se afirma que el respaldo sea restaurable aún**. Completar esta tabla durante el primer simulacro aislado y adjuntar consulta, hash del archivo, timestamp y aprobación. La aceptación requiere deltas cero o excepciones conciliadas y firmadas.

Consulta base para capturar conteos exactos en MySQL (ejecutar antes del respaldo y tras restaurar):

```sql
SELECT 'usuarios' AS tabla, COUNT(*) AS filas FROM usuarios
UNION ALL SELECT 'clientes', COUNT(*) FROM clientes
UNION ALL SELECT 'tecnicos', COUNT(*) FROM tecnicos
UNION ALL SELECT 'productos', COUNT(*) FROM productos
UNION ALL SELECT 'pedidos', COUNT(*) FROM pedidos
UNION ALL SELECT 'detalle_pedido', COUNT(*) FROM detalle_pedido
UNION ALL SELECT 'citas', COUNT(*) FROM citas
UNION ALL SELECT 'facturas', COUNT(*) FROM facturas;
```

| Tabla | Antes del respaldo | Después de restaurar | Delta | Estado de evidencia |
|---|---:|---:|---:|---|
| `usuarios` | Pendiente de simulacro | Pendiente de simulacro | Pendiente | No ejecutada |
| `clientes` | Pendiente de simulacro | Pendiente de simulacro | Pendiente | No ejecutada |
| `tecnicos` | Pendiente de simulacro | Pendiente de simulacro | Pendiente | No ejecutada |
| `productos` | Pendiente de simulacro | Pendiente de simulacro | Pendiente | No ejecutada |
| `pedidos` | Pendiente de simulacro | Pendiente de simulacro | Pendiente | No ejecutada |
| `detalle_pedido` | Pendiente de simulacro | Pendiente de simulacro | Pendiente | No ejecutada |
| `citas` | Pendiente de simulacro | Pendiente de simulacro | Pendiente | No ejecutada |
| `facturas` | Pendiente de simulacro | Pendiente de simulacro | Pendiente | No ejecutada |

---

## 4. Estrategia de Hosting y Dominio

### 4.1 Hosting seleccionado

El cliente aún no ha aprobado proveedor ni comprado dominio. La propuesta no afirma que exista infraestructura productiva.

| Componente | Recomendación de producción | Justificación |
|---|---|---|
| Frontend | VPS/VM Linux detrás de Caddy; PaaS estático como alternativa tras validar SPA | El build debe ser estático; no servir Vite dev en producción |
| API | Contenedor en VPS/VM; PaaS al requerir autoescalado | Conserva FastAPI y publica solo HTTPS |
| Base de datos | MySQL 8 administrado en red privada con PITR y SLA acordado | Reduce carga de parches; MySQL de Compose es desarrollo |
| Archivos | Object storage privado compatible con S3; MinIO propio solo con actualizaciones y respaldos probados | Aísla objetos y permite escalar capacidad |
| Proxy | Caddy o balanceador en el borde | Termina TLS y enruta por host; el Caddyfile aquí es local |
| App móvil | Canales de prueba y tiendas oficiales, consumiendo API HTTPS | La app móvil no se aloja como sitio web en el VPS |

### 4.2 Dominio y DNS

Dominio productivo pendiente de compra/aprobación. example.invalid es un marcador documental reservado, no registrar ni publicar. Las pruebas locales usan app.neodomus.local y api.neodomus.local. Sustituir placeholders solo en el DNS autorizado.

| Nombre | Tipo | Valor previsto | TTL recomendado | Uso/estado |
|---|---|---|---:|---|
| example.invalid | A | <VPS_IPV4> | 300 s en corte; 3600 s estable | No aprovisionado |
| example.invalid | AAAA | <VPS_IPV6> | 300/3600 s | Solo con IPv6 filtrado |
| app.example.invalid | CNAME | example.invalid | 300/3600 s | Frontend |
| api.example.invalid | CNAME | example.invalid | 300/3600 s | API en mismo borde |
| media.example.invalid | CNAME | <DNS_TARGET> | 300/3600 s | Solo si endpoint de objetos aprobado |
| example.invalid | CAA | CA autorizada | 3600 s | Restringir emisores TLS |
| example.invalid | TXT SPF | Valor emitido por proveedor de correo | 3600 s | Solo si se habilita correo |
| <selector>._domainkey.example.invalid | TXT DKIM | Clave pública del proveedor | 3600 s | Solo con correo contratado |
| _dmarc.example.invalid | TXT DMARC | Política acordada y buzón de informes | 3600 s | Empezar p=none; endurecer tras revisar informes |

No crear MX hasta elegir proveedor de correo. Evitar wildcard innecesario y comprobar resolución y TLS desde fuera antes del corte.

### 4.3 Camino de una petición

1. Navegador o móvil solicita el dominio HTTPS.
2. Resolver DNS obtiene A/AAAA del borde <VPS_IPV4>/<VPS_IPV6>.
3. Firewall acepta 443 y, si hace falta, 80 para redirección o ACME HTTP-01.
4. Caddy presenta certificado del host y termina TLS.
5. Caddy enruta por virtual host al frontend o API de la red privada de contenedores.
6. API consulta MySQL y almacenamiento por red privada, sin exponer esos puertos a Internet.

### 4.4 Puertos

| Puerto | Exposición | Control |
|---:|---|---|
| 80/TCP | Borde público solo para redirección HTTPS/ACME si se requiere | No servir datos en claro |
| 443/TCP | Borde público | Único punto de entrada de aplicación |
| 22/TCP | Restringido a redes administrativas aprobadas | Solo llaves, no contraseña ni root remoto |
| 443/UDP | Opcional | Solo al habilitar HTTP/3 |
| 3306/3307 | Bloqueado desde Internet | MySQL privado; 3307 es mapeo local, quitar en producción |
| 5173/8000 | Bloqueado desde Internet | Puertos de desarrollo frontend/API |
| 9000/9001 | Bloqueado desde Internet | MinIO y consola privados |
| 27017 | No usado/bloqueado | MongoDB no está configurado |

El Compose actual expone puertos para desarrollo; producción debe retirar los ports directos, limitar la red y filtrar también con firewall del proveedor.

### 4.5 Transferencia segura

Preferir CI/CD y registry con credenciales efímeras. Para transferencias manuales usar SFTP, scp o rsync sobre SSH con llaves, huella de host verificada, usuario restringido y rotación/revocación. Deshabilitar contraseña SSH donde la política lo permita. FTP plano está prohibido. No guardar claves privadas, tokens ni datos de clientes en Git o logs de CI.

## 5. Plan de Instalación v0

#### Prueba local del reverse proxy Caddy

En el archivo local .env configurar FRONTEND_URL=https://app.neodomus.local, VITE_API_URL=https://api.neodomus.local/api/v1 y CORS_ORIGINS=https://app.neodomus.local. No usar estos valores para producción.

~~~bash
docker compose up -d --build db minio api frontend caddy
docker compose cp caddy:/data/caddy/pki/authorities/local/root.crt ./caddy-root.crt
curl --resolve app.neodomus.local:443:127.0.0.1 --cacert ./caddy-root.crt https://app.neodomus.local/
curl --resolve api.neodomus.local:443:127.0.0.1 --cacert ./caddy-root.crt https://api.neodomus.local/health
~~~

El parámetro --resolve asocia el hostname de la URL con loopback para esa petición, conserva SNI y permite probar los virtual hosts sin DNS. La CA persiste en el volumen de Caddy. caddy-root.crt es un artefacto local, no una credencial ni un certificado público. Evitar -k salvo diagnóstico temporal de confianza TLS en esta prueba local.

### 5.1 Alcance de instalación

Este runbook permite a un tercero levantar una instalación local/de staging desde cero con Docker Compose. No es un runbook de producción aprobado. El Compose actual expone puertos, monta el código del host, usa servidores de desarrollo y tiene un seed activado por defecto; producción requiere una definición separada y revisión de seguridad.

Para desarrollo con Docker Desktop sobre Windows/WSL, el servicio API fuerza polling de Watchfiles para evitar errores de notificación del bind mount (como WatchfilesRustInternalError sobre /app). El intervalo por defecto es 500 ms y se puede ajustar con WATCHFILES_POLL_DELAY_MS. En producción no se debe ejecutar Uvicorn con --reload.

### 5.2 Requisitos previos de software y hardware

| Requisito | Mínimo v0 / verificación |
|---|---|
| Sistema operativo | Linux x86_64, macOS o Windows con WSL2 para Docker; shell Bash para `scripts/respaldar.sh`. |
| Git | Cliente Git compatible con `git clone`. |
| Docker | Docker Engine/Desktop con Docker Compose v2; validar con `docker --version` y `docker compose version`. |
| Red | Acceso al registro de imágenes y dependencias durante el primer build; puertos locales `3307`, `8000`, `5173`, `9000`, `9001` disponibles o ajustados coordinadamente. |
| Hardware | No existe baseline medido en el repo. Para staging, provisionar CPU/RAM/disco según ensayo de carga y tamaño de dumps; antes de instalar, comprobar espacio para MySQL, imágenes MinIO, logs y al menos dos copias de respaldo. |
| Herramientas de respaldo | Para Docker: Docker Compose v2, `gzip`, `find`, `mktemp`, `du`, `awk`; para modo local: `mysqldump`; opcionalmente `age` para cifrado. |

### 5.3 Clonación y preparación del entorno

1. Obtener la URL Git desde el administrador del repositorio (marcador: `<URL_DEL_REPOSITORIO>`); clonar y entrar a la raíz:

   ```bash
   git clone '<URL_DEL_REPOSITORIO>' neodomus
   cd neodomus
   ```

2. Confirmar rama/tag aprobado por el responsable de release y registrar su commit. No desplegar una rama de trabajo sin revisión.
3. Crear el archivo local de variables a partir de la plantilla versionada:

   ```bash
   cp .env.example .env
   chmod 600 .env
   ```

4. Completar `.env` por gestor de secretos. Valores requeridos incluyen `MYSQL_ROOT_PASSWORD`, `MYSQL_USER`, `MYSQL_PASSWORD`, `SECRET_KEY`, `MINIO_ROOT_PASSWORD`, `MYSQL_DATABASE=neodomus`, `ENVIRONMENT=staging`, `EJECUTAR_SEED_AL_ARRANCAR=false` y URLs locales válidas. SMTP/OAuth solo se configuran si se usan.
5. Generar `SECRET_KEY` fuera del repositorio (`openssl rand -hex 32`) y contraseñas aleatorias únicas para MySQL y MinIO. No usar contraseñas de ejemplos, no imprimir secretos en logs y no subir `.env`.
6. `PAYMENT_PROVIDER=simulator` es un simulador académico; no habilita procesamiento productivo. No introducir claves privadas ni datos reales en las variables públicas `VITE_*` o `EXPO_PUBLIC_*`.

La plantilla vigente está en [`.env.example`](../../.env.example); las variables y valores aplicados deben cotejarse con `docker-compose.yml` y `be/app/config.py` antes del despliegue.

### 5.4 Revisión de configuración y secretos

1. Ejecutar `docker compose config --quiet` desde la raíz; resolver cualquier variable requerida faltante sin mostrar la salida interpolada en un ticket público.
2. Verificar que `.env` no está versionado (`git check-ignore .env`) y que `EJECUTAR_SEED_AL_ARRANCAR=false` para staging/producción. El valor predeterminado actual del Compose puede sembrar usuarios si se omite.
3. Confirmar que `DATABASE_URL` interno usa el servicio Docker `db` y el puerto 3306; no usar `localhost` desde el contenedor API.
4. Confirmar que no se exponen puertos/servicios a redes no autorizadas. El Compose actual enlaza puertos del host y se considera solo desarrollo/staging aislado.
5. Revisar imagen/tag de MinIO (`latest` en el Compose actual) y fijar una versión aprobada antes de un entorno persistente. Separar volúmenes de base y objetos; probar respaldo de ambos.

### 5.5 Construcción y despliegue de contenedores

Desde la raíz, con `.env` listo:

```bash
docker compose build api frontend
docker compose up -d db minio
docker compose ps
```

Esperar a que MySQL indique estado `healthy` antes de continuar. El servicio MinIO no declara un healthcheck en la definición actual; validar su endpoint de readiness o sus logs. Para despliegue productivo, no ejecutar esta configuración tal cual: sustituir bind mounts, `--reload`, puertos públicos directos y tags flotantes por una composición de producción revisada.

El frontend se ejecuta como usuario sin privilegios y su caché de dependencias Vite se dirige a /tmp/neodomus-vite-cache dentro del contenedor, evitando escribir en el volumen node_modules. Al modificar esta configuración, recrear el servicio frontend para tomar el entorno actualizado.

### 5.6 Inicialización y migración del esquema

1. Verificar que el contenedor MySQL está saludable y que el respaldo preinstalación/previo al cambio está creado y verificado.
2. Aplicar migraciones Alembic una sola vez con la imagen aprobada:

   ```bash
   docker compose run --rm --no-deps api uv run alembic upgrade head
   ```

3. Consultar logs y estado de revisión antes de iniciar API; registrar la revisión actual. No usar `create_all` como sustituto de Alembic.
4. Revisar y aprobar migraciones antes de cualquier cambio en una base con datos. Ejecutar primero en staging restaurado; confirmar constraints y tiempos.
5. Iniciar API y web:

   ```bash
   docker compose up -d api frontend
   ```

6. No importar `scripts/init_db.sql` encima de una base existente sin revisión; es una referencia/seed y no reemplaza el historial Alembic.

### 5.7 Verificación de servicios y salud

| Servicio | Verificación v0 | Resultado esperado |
|---|---|---|
| MySQL | `docker compose ps db` y logs del servicio | Contenedor activo; healthcheck Compose `healthy`; no hay errores de inicialización. |
| API | `curl --fail http://127.0.0.1:8000/health` | HTTP 200; endpoint declarado por la API. |
| OpenAPI | `curl --fail http://127.0.0.1:8000/openapi.json` | HTTP 200 en entorno local/staging; restringir documentación en producción según política. |
| Web | `curl --fail http://127.0.0.1:5173/` | HTTP 200 y HTML de Vite (modo local/staging). |
| MinIO | `curl --fail http://127.0.0.1:9000/minio/health/ready` | HTTP 200 si ese endpoint está habilitado en la versión fijada; complementar con logs. |
| Migraciones | `docker compose run --rm --no-deps api uv run alembic current` | Revisión coincide con la release aprobada y migraciones no pendientes. |

También validar un flujo de login de prueba autorizado, lectura de catálogo, subida/lectura de objeto de prueba y conexión web-API. No usar datos personales reales en el smoke test. Registrar fecha, commit, imágenes, checks, errores y responsable.

### 5.8 Verificación de respaldo y capacidad

1. Ejecutar `BACKUP_SOURCE=docker bash ./scripts/respaldar.sh` desde la raíz.
2. Confirmar salida de éxito, tamaño mayor que cero, SHA-256 registrado, `gzip -t` satisfactorio (encriptado: descifrar con identidad autorizada en zona temporal controlada) y espacio libre suficiente.
3. Verificar permisos `0700` del directorio y `0600` de los archivos; transferir copia a ubicación off-site cifrada y separada.
4. Ejecutar el simulacro de restauración de la Sección 3.4 antes de declarar listo el ambiente. La ejecución de respaldo por sí sola no prueba restaurabilidad.

### 5.9 Seguridad, acceso y operación inicial

- Usar cuentas nominales y mínimo privilegio; separar credenciales de staging y producción.
- Mantener `.env`, claves privadas de `age` y datos de respaldo fuera de Git, imágenes, logs y tickets. Rotar secretos mediante el gestor aprobado.
- En producción terminar TLS en un proxy controlado; poner MySQL y MinIO en redes privadas; exponer solo rutas necesarias. Revisar especialmente la política de acceso público del bucket configurado en el código actual.
- Configurar scheduler, alertas de fallo/antigüedad, monitoreo de disco, logs centralizados y procedimiento de escalamiento antes de aceptar tráfico real.
- Documentar RPO/RTO medidos, inventario de versiones, propietarios y accesos de emergencia. Retirar credenciales temporales después del smoke test.

### 5.10 Criterios de aceptación y cierre

La instalación se acepta cuando: (a) se desplegó el commit/tag aprobado; (b) migraciones completaron sin errores; (c) todas las verificaciones de la Sección 5.7 pasan; (d) seed de prueba está apagado fuera de desarrollo; (e) se generó una copia válida y se restauró en base aislada; (f) se completó la conciliación de la Sección 3.5; (g) se registraron RPO/RTO reales, responsables, excepciones y aprobación del dueño de negocio. Hasta entonces, el estado es **pendiente de aceptación**.

---

## Apéndice A. Componentes de esta entrega

- scripts/verificar-requisitos.sh: comprueba Docker/Compose, acceso del usuario, memoria, disco, puertos y fallo simulado.
- Caddyfile y servicio caddy en docker-compose.yml: proxy TLS interno para pruebas locales del frontend y API.

- `scripts/respaldar.sh`: exporta MySQL del servicio Compose `db` o de una instancia local, comprime, verifica, opcionalmente cifra con `age`, aplica retención local e informa resultado.
- `docs/implantacion/plan-implantacion.md`: procedimientos v0 de migración, respaldo/restauración e instalación.
- `../../.env.example`: plantilla existente para variables de entorno; nunca colocar valores secretos reales en este documento.
