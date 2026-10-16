# 📘 Plan de Implantación — NEODOMUS

| Campo | Valor |
|---|---|
| Proyecto | NEODOMUS — Plataforma de servicios técnicos de domótica (venta, instalación y soporte) |
| Equipo | NEODOMUS (Vannesa Quiroga, Valery Angulo, Nicol Marino, Julian Carvajal) |
| Versión del plan | 1.0 |
| Fecha | 2026-10-16 |

---

## 1. Ficha técnica y requisitos mínimos — Semana 1 (CE-1, CE-2)

### 1.1 Descripción técnica

NEODOMUS es una plataforma web (y móvil vía Expo) para gestionar el ciclo completo de
servicios técnicos de domótica: catálogo de productos con venta por metros, checkout con
pasarela de pago (simulada en desarrollo), agenda de citas de instalación con asignación de
1 a 3 técnicos según especialización, seguimiento de entregas con evidencias fotográficas,
incidencias (novedades), devoluciones, reembolsos, calificaciones y facturación en PDF.

Arquitectura: **monolito modular desplegado como conjunto de microservicios en contenedores
Docker** — API REST (FastAPI + MySQL 8 + MinIO para objetos) y SPA (React + Vite) comunicados
por HTTP/JSON. Los usuarios son clientes (autoservicio web/móvil), técnicos (panel de campo)
y administradores (panel de gestión y reportes). Fase actual: desarrollo/aceptación; el
despliegue de producción se detalla en la sección 5 de este plan.

### 1.2 Inventario de software

| Componente | Función | Versión | Licencia | ¿Genera costo? |
|---|---|---|---|---|
| Ubuntu Server | Sistema operativo del servidor | 24.04 LTS | Términos de Ubuntu (FOSS) | No |
| Docker Engine | Runtime de contenedores | 29.5.2 | Apache-2.0 | No |
| Docker Compose | Orquestación del stack | v2.40.3 (plugin) / CLI anfitrión v5.1.4 | Apache-2.0 | No |
| MySQL Community Server | Base de datos relacional | 8.0.46 | GPL-2.0 con FOSS License Exception | No |
| Python | Runtime del backend | 3.12.15 | PSF License 2.0 | No |
| FastAPI | Framework web ASGI | 0.115.0 | MIT | No |
| Uvicorn | Servidor ASGI | 0.30.0 | BSD-3-Clause | No |
| SQLAlchemy | ORM | 2.0.30 | MIT | No |
| Alembic | Migraciones de esquema | 1.13.2 | MIT | No |
| PyMySQL | Driver MySQL (sync) | 1.1.0 | MIT | No |
| MinIO Server (CE) | Almacenamiento de objetos compatible S3 | RELEASE.2025-10-15T17-29-55Z | **AGPL-3.0** (restricción copyleft, ver nota) | No |
| MinIO Python SDK | Cliente S3 desde el backend | 7.2.20 | Apache-2.0 | No |
| Node.js | Runtime del frontend | 22.23.3 | MIT | No |
| React | Librería de interfaz | 18.3.1 | MIT | No |
| Vite | Bundler y dev server | 5.4.21 | MIT | No |
| uv | Gestor de dependencias Python | (imagen astral-sh/uv) | MIT | No |
| pnpm | Gestor de dependencias Node | 10.x | MIT | No |
| Expo SDK | App móvil | 57 | MIT | No |

**Nota de licencia (restricción identificada):** MinIO Server se distribuye bajo **AGPL-3.0**:
es la única licencia copyleft fuerte del stack. No genera costo económico, pero si se
modificara el binario y se ofreciera como servicio de red, la AGPL obliga a publicar el código
modificado. En NEODOMUS se usa el binario sin modificar (último release de la edición comunitaria,
construido por el mirror público `ghcr.io/coollabsio/minio` tras la retirada de las imágenes de
Docker Hub en septiembre de 2026), por lo que el uso es seguro; documentar este dato es
obligatorio en el plan. El resto de componentes son licencias permisivas (MIT/BSD/Apache) sin
obligaciones de divulgación. MySQL Community Server es GPL-2.0, pero el acceso es vía protocolo
de red (cliente/servidor), por lo que no afecta al código del backend.

### 1.3 Sistema operativo del servidor

| Campo | Valor |
|---|---|
| Distribución y versión | Ubuntu Server 24.04 LTS (Noble Numbat) |
| Arquitectura | x86_64 (amd64) |
| Fin de soporte estándar | Abril de 2029 (5 años); ESM hasta abril de 2036 |
| Licencia | FOSS (términos de licencia de Ubuntu) |
| Requisitos mínimos oficiales (enlace) | https://ubuntu.com/server/docs/install/requirements — 1 GHz, 1 GB RAM (2 GB recomendado), 2.5 GB de disco |

Justificación de la selección: versión LTS (soporte largo para un sistema en producción),
repositorio estable, compatibilidad total con Docker Engine y Compose, y coincidencia con el
sistema bajo el cual se midió el consumo de esta ficha (contenedor Ubuntu 24.04 sobre
Docker Desktop/WSL2). Se acepta 22.04 LTS como mínimo porque el stack no depende de paquetes
del sistema más allá de Docker.

### 1.4 Medición de consumo

Entorno medido: stack completo de NEODOMUS levantado con `docker compose up -d` sobre
Docker Desktop (WSL2), 4 servicios. Medición con `docker stats --no-stream` en dos escenarios.

| Servicio | RAM reposo | RAM pico | CPU reposo | CPU pico |
|---|---|---|---|---|
| neodomus_mysql | 400,6 MiB | 403,8 MiB | 0,29 % | 17,15 % |
| neodomus_minio | 73,3 MiB | 69,2 MiB | 0,03 % | 0,03 % |
| neodomus_api (FastAPI) | 163,9 MiB | 168,1 MiB | 5,93 % | 132,65 % (≈1,33 núcleos) |
| neodomus_frontend (Vite dev) | 172,9 MiB | 173,8 MiB | 21,18 % | 27,44 % |
| **Total** | **810,7 MiB (0,79 GiB)** | **814,9 MiB (0,80 GiB)** | — | **≈1,77 núcleos** |

Carga simulada con: 4 contenedores generadores de carga (Alpine + wget) ejecutando 6.000
peticiones `GET /api/v1/productos/` cada uno (24.000 peticiones totales) contra la API, en
la red interna de Docker Compose, durante 40 segundos con muestreo cada 3 segundos.

Advertencia metodológica: estas cifras corresponden al **despliegue de desarrollo**
(`uvicorn --reload` con recarga de archivos montados por bind mount, y dev server de Vite con
`usePolling: true` necesario para Docker en Windows). En producción (uvicorn sin `--reload`,
frontend compilado servido por nginx) el consumo de CPU en reposo de api y frontend baja
notablemente; los mínimos de la matriz 1.5 ya incorporan ese margen. La fila de RAM es
representativa en ambos casos porque la carga de trabajo no cambia.

### 1.5 Matriz de requisitos

Cálculo del margen: recomendado = total medido + margen 30–50 %, más el consumo del
sistema operativo y del motor de contenedores (no incluido en `docker stats` de los
servicios). CPU pico medida: 1,77 núcleos; RAM pico medida: 0,80 GiB.

| Requisito | Mínimo | Recomendado | Justificación |
|---|---|---|---|
| CPU | 2 vCPU | 4 vCPU | Pico medido ≈1,77 núcleos + margen 30 % ≈ 2,30 → mínimo 2 vCPU (plan comercial siguiente); 4 vCPU absorben picos de generación de facturas PDF y reportes |
| RAM | 2 GiB | 4 GiB | Pico medido 0,80 GiB + ~0,5 GiB de SO/Docker + margen 30 % ≈ 2 GiB; 4 GiB da holgura para crecimiento de conexiones MySQL |
| Disco | 20 GB | 50 GB SSD | Datos actuales: 2,34 MB (MySQL) + 24 KB (MinIO) + ~5 GB de imágenes Docker y sistema; proyección ≈6 GB/año (ver crecimiento) |
| Tipo de disco / IOPS | SSD SATA (≥3.000 IOPS escritura) | SSD NVMe | MySQL con bloqueo pesimista (`SELECT ... FOR UPDATE`) y subidas de evidencias; el HDD estanca el checkout |
| Red | 100 Mbps | 1 Gbps | Upload de evidencias fotográficas (≤5 MB por imagen) y API JSON (~10 KB por listado) |
| Arquitectura | x86_64 | x86_64 | Imágenes Docker y binario de MinIO disponibles para amd64 |
| Sistema operativo | Ubuntu Server 22.04 LTS | Ubuntu Server 24.04 LTS | LTS con soporte hasta 2029 (24.04) o 2027 (22.04) |
| Docker / runtime | Docker Engine 24.0+ y Compose v2.0+ | Engine 27+ y Compose v2.29+ | Versiones mínimas con healthchecks estables y `depends_on: condition: service_healthy` |
| Puertos (host) | 3307, 8000, 9000, 9001 | + 5173 (solo desarrollo) | 3307 MySQL, 8000 API, 9000 API S3 de MinIO, 9001 consola MinIO; 5173 es el dev server de Vite, en producción no se expone |

Crecimiento estimado de datos (año 1): ~2.000 clientes × 200 KB de foto de perfil (10 % de
ellos con foto) ≈ 40 MB; ~10.000 evidencias fotográficas × 500 KB ≈ 5 GB; crecimiento
transaccional de MySQL ≈ 200 MB/año. Total ≈ 5,5–6 GB el primer año; el mínimo de 20 GB
cubre el sistema + Docker + datos con holgura, y 50 GB cubre 2–3 años sin reciclaje.

### 1.6 Plataforma física recomendada

Aplica si el cliente alojara NEODOMUS en sus instalaciones (on-premise).

| Decisión | Elección | Justificación |
|---|---|---|
| Formato (torre / rack / blade) | **Torre** (1 servidor) | Un solo servidor para el stack completo, sitio único (sede del cliente), bajo ruido y costo; el rack se justifica solo si ya existe cuarto técnico con más equipos, y el blade exige densidad que este proyecto no necesita |
| Nivel RAID del servidor de base de datos | **RAID 10** (4 discos) | MySQL sufre escrituras en cada transacción (checkout con bloqueo de stock); RAID 10 replica y distribuye paridades sin la penalización de escritura de RAID 5/6. Con 4 discos de 1 TB: 2 TB útiles, tolerancia a 1 fallo por par. MinIO (diseñado para JBOD) puede compartir el mismo volumen lógico o usar disco directo. **RAID no sustituye un respaldo**: protege contra fallo de disco, no contra borrado lógico, robo o desastre (plan de respaldo en la semana 2) |
| Plataforma de ejecución | **Contenedores (Docker Compose)** | Es la arquitectura ya implementada y medida: aislamiento por servicio, reproducibilidad idéntica entre desarrollo y producción, despliegue ligero (~1 minuto con imágenes pre-construidas). Una VM por servicio solo se justificaría si el cliente exige separación de kernel o hardware compartido con otras apps; bare metal no aporta ventajas de gestión frente a Compose en este tamaño |

### 1.7 Verificación de requisitos

Script: [`scripts/verificar-requisitos.sh`](../scripts/verificar-requisitos.sh) de este
repositorio (adaptado de la práctica 02 con los umbrales de la matriz 1.5 y 4 chequeos
propios de NEODOMUS: Docker Compose v2, puertos del stack, presencia de `docker-compose.yml`
y `.env` con claves críticas no vacías).

Servidor donde se ejecutó: **contenedor Ubuntu 24.04 limpio sobre Docker Desktop (WSL2)**,
montando este repositorio y el socket de Docker del anfitrión — simula el servidor destino
antes de la instalación.

```
REQUISITO                ESPERADO                       ENCONTRADO               ESTADO
--------------------------------------------------------------------------------------------
Procesadores             >= 2                           28                       CUMPLE
RAM (MB)                 >= 2048                        15824                    CUMPLE
Disco libre (GB)         >= 20 en /                     950                      CUMPLE
Arquitectura             x86_64 aarch64                 x86_64                   CUMPLE
Sistema operativo        ubuntu >= 22.04                ubuntu 24.04             CUMPLE
Docker Engine            >= 24.0                        29.5.2                   CUMPLE
Docker Compose           >= v2.0.0                      v2.40.3+ds1-0ubuntu1~24.04.1 CUMPLE
Puerto 3307 (NEODOMUS)   libre                          libre                    CUMPLE
Puerto 8000 (NEODOMUS)   libre                          libre                    CUMPLE
Puerto 9000 (NEODOMUS)   libre                          libre                    CUMPLE
Puerto 9001 (NEODOMUS)   libre                          libre                    CUMPLE
Puerto 5173 (NEODOMUS)   libre                          libre                    CUMPLE
docker-compose.yml       presente en la raíz           presente                 CUMPLE
.env (claves críticas)  no vacías: MYSQL_ROOT_PASSWORD SECRET_KEY MINIO_ROOT_PASSWORD todas presentes          CUMPLE

RESULTADO: el servidor cumple todos los requisitos mínimos de NEODOMUS.
```

Prueba de detección de fallos (umbrales provocados a propósito con
`MIN_RAM_MB=999999 OS_ID=debian MIN_CPUS=64`): el script marcó **NO CUMPLE** en Procesadores,
RAM, Sistema operativo, Docker Engine y Docker Compose, terminó con
`RESULTADO: 5 requisito(s) no se cumplen.` y código de salida 1 — confirma que el script
detecta incumplimientos reales.

Resultado: **cumple todos los requisitos mínimos** en el entorno de medición. En el servidor
destino definitivo se debe re-ejecutar desde la raíz del repositorio
(`bash scripts/verificar-requisitos.sh`) antes de `docker compose up -d`. Si alguna fila
falla, corregir el prerrequisito (instalar Docker, liberar el puerto, ampliar disco/RAM)
antes de instalar; el script es idempotente y no modifica el sistema.

---

## 2. Plan de migración de datos — Semanas 2 y 5 (CE-3)

<!-- Objetivos, origen/destino, mapeo, etapas, riesgos, validación (conteos, checksums),
rollback. En la semana 5 se agrega la evidencia de la migración ejecutada. -->

*Pendiente — Semana 2.*

## 3. Plan de respaldo — Semanas 2 y 6 (CE-4)

<!-- Qué se respalda, frecuencia, RPO/RTO, regla 3-2-1, herramienta, cifrado, retención,
procedimiento de restauración probado. -->

*Pendiente — Semana 2.*

## 4. Hosting y dominio — Semana 3 (CE-1)

<!-- Tipo de hosting elegido y justificación, dominio, registros DNS, reverse proxy, HTTPS,
método de transferencia de archivos. -->

*Pendiente — Semana 3.*

## 5. Plan de instalación y despliegue — Semanas 2 y 4 (CE-1, CE-5)

<!-- Prerrequisitos, pasos numerados y verificables para instalar en servidor local y en la
nube, versión liberada, costos estimados. Semana 10 (opcional): subsección 5.10 con la
instalación automatizada (cloud-init + Ansible). -->

*Pendiente — Semana 2.*

## 6. Configuración y verificación — Semana 5 (CE-1)

<!-- Variables de entorno por ambiente (sin valores reales), servicios, healthchecks,
smoke tests. -->

*Pendiente — Semana 5.*

## 7. Seguridad, usuarios y permisos — Semana 6 (CE-1)

<!-- Matriz de usuarios/roles (sistema operativo y base de datos), políticas de acceso,
firewall, manejo de secretos, resultados de pruebas de privilegios. -->

*Pendiente — Semana 6.*

## 8. Pipeline de despliegue y monitoreo — Semana 7 (CE-1, CE-5)

<!-- Diagrama del pipeline, procedimiento de rollback, monitores configurados. -->

*Pendiente — Semana 7.*

## 9. Mantenimiento, soporte y capacitación — Semana 8 (CE-5)

<!-- Plan de mantenimiento, niveles de soporte, plan de capacitación, enlaces a ayudas en
línea. -->

*Pendiente — Semana 8.*

## 10. Aceptación y entrega — Semana 9 (CE-1 a CE-5)

<!-- Resultado de pruebas de aceptación, resultado del simulacro cruzado, acta de entrega
con niveles de servicio acordados. -->

*Pendiente — Semana 9.*
