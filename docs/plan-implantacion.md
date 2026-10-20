# Plan de Implantación — Neodomus

<!--
  ¿Qué? Ficha técnica, inventario de componentes, matriz de requisitos y
         criterios de infraestructura para el despliegue de Neodomus.
  ¿Para qué? Dar trazabilidad entre el stack real, los requisitos de hardware,
             las decisiones de SO/RAID y las restricciones de licenciamiento.
  ¿Impacto? Sin esta ficha no se puede dimensionar el servidor, justificar la
             compra ni demostrar cumplimiento legal del software utilizado.
-->

> **Proyecto:** Neodomus — Plataforma web/móvil de domótica y servicios técnicos
> **Entregable:** Semanas 1 y 2 — Ficha Técnica, Migración, Respaldo e Instalación v0
> **Versión:** 1.1
> **Fecha:** 20/10/2026
> **Informes asociados:** Semana 1 (no incluido en este entregable) · [`docs/informe-semana-2.md`](informe-semana-2.md)
> **Entorno de referencia:** Ubuntu Server 24.04.5 LTS x86_64 · Docker Engine 29.5.2 · Docker Compose 5.1.4
> **Convención de seguridad:** todas las IP, hosts, usuarios, dominios y credenciales de este documento son genéricos. No se publican datos de producción ni secretos.

---

## 0. Alcance, supuestos y hallazgos de auditoría

### 0.1 Alcance de esta sección

Esta sección cubre la **Semana 1**:

1. Inventario de componentes y licenciamiento.
2. Matriz de requisitos de hardware y dimensionamiento.
3. Preguntas guía justificadas: sistema operativo, infraestructura on-premise y licencias.
4. Evidencia de ejecución del script `scripts/verificar-requisitos.sh`.

Las secciones **2 (migración de datos)**, **3 (respaldo v0)** y **5 (instalación v0)** se incorporan en la Semana 2 y se documentan más abajo. La Sección 4 se reserva para operación, monitoreo y pruebas de carga; no forma parte de este entregable.

### 0.2 Stack real auditado

El repositorio de Neodomus **no usa Node.js/Express como backend ni MongoDB como base de datos**. El stack real es FastAPI (Python 3.12) + MySQL 8.0 + MinIO, con frontend React/Vite y aplicación móvil Expo/React Native. Node.js solo participa como runtime de build del frontend. Se documenta el stack real para que la ficha sea verificable contra el código y no contra una descripción genérica.

| Capa | Tecnología real | Puerto host | Estado en el repositorio |
|---|---|---|---|
| Frontend web | React 18.3.1 + Vite 5.4.21 | `5173` | `docker-compose.yml` servicio `frontend` |
| Backend API | FastAPI 0.115.0 + Uvicorn 0.30.0 (Python 3.12.15) | `8000` | `docker-compose.yml` servicio `api` |
| Base de datos | MySQL 8.0.46 | `3307` → `3306` interno | `docker-compose.yml` servicio `db` |
| Almacenamiento de objetos | MinIO Server `RELEASE.2025-10-15T17-29-55Z` (`ghcr.io/coollabsio/minio`) | `9000` API S3 · `9001` consola | `docker-compose.yml` servicio `minio` |
| Aplicación móvil | Expo SDK 57.0.22 + React Native 0.86.3 | Metro `8081` (desarrollo) | `movil/` |
| Proxy / TLS | Nginx 1.28.0 (propuesto) | `80` / `443` | **Pendiente de incorporar** |
| Base de datos documental | MongoDB | No aplica | **No forma parte del stack** |

> **Puertos del stack:** no se comprueban `3000` ni `27017` porque no corresponden a este repositorio. El backend escucha en `8000`, la base de datos real es MySQL en `3307` y no hay MongoDB. Por eso el script valida `80`, `443`, `5173`, `8000`, `3306`, `3307`, `9000` y `9001`.

> **Nota de auditoría:** el `README.md` todavía describe la app móvil como Expo SDK 54.0.37 / React Native 0.81.5. El manifiesto `movil/package.json` ya declara Expo 57.0.22 / React Native 0.86.3; esta ficha usa el manifiesto como fuente de verdad y deja la actualización del README para la Semana 2.

### 0.3 Hallazgos que condicionan la implantación

| ID | Hallazgo | Riesgo | Acción obligatoria antes de producción |
|---|---|---|---|
| H-01 | MySQL 8.0 alcanzó el fin de su soporte extendido el **30/04/2026**. La imagen `mysql:8.0` resuelve a 8.0.46. | Alto: sin parches de seguridad de Oracle | Migrar a **MySQL 8.4.13 LTS** y probar compatibilidad con Alembic/SQLAlchemy |
| H-02 | Imágenes con etiquetas flotantes o sin digest: `mysql:8.0`, `ghcr.io/coollabsio/minio:RELEASE.2025-10-15T17-29-55Z`, `node:22-alpine`, `python:3.12-slim`. | Medio: despliegues no reproducibles | Fijar versión + digest SHA-256 y actualizar con PR revisado |
| H-03 | El `docker-compose.yml` actual ejecuta el servidor de desarrollo de Vite en el puerto 5173. | Medio: no es un servidor estático de producción | Compilar `pnpm build` y servir `dist/` con Nginx |
| H-04 | El compose define valores por defecto para credenciales de MySQL y MinIO. | Alto: credenciales débiles si no se configura `.env` | Eliminar los fallbacks, usar secretos y rotar credenciales |
| H-05 | MySQL (3307) y la consola de MinIO (9001) se publican en todas las interfaces. | Medio: exposición innecesaria | Publicar solo en `127.0.0.1` o en una red de administración/VPN |
| H-06 | No existe proxy TLS ni política de backups declarada en el compose. | Alto: tráfico sin cifrar y riesgo de pérdida de datos | Añadir Nginx + Let's Encrypt y backups 3-2-1 probados |
| H-07 | MinIO se consume desde un espejo de terceros (`ghcr.io/coollabsio/minio`). | Medio: cadena de suministro | Usar la imagen oficial `minio/minio` fijada por digest, o un espejo interno escaneado y firmado |

---

## 1. Ficha Técnica y Matriz de Requisitos

### 1.1 Inventario de componentes y licenciamiento

#### 1.1.1 Infraestructura, sistema operativo y runtime

| Componente | Nombre de software | Versión exacta | Tipo de software | Licencia exacta | Observaciones |
|---|---|---|---|---|---|
| Sistema operativo anfitrión | Ubuntu Server | 24.04.5 LTS (Noble Numbat) | SO / Host | GPLv2/GPLv3 y otras licencias libres (distribución) | Arquitectura x86_64. Soporte estándar hasta 31/05/2029; ESM hasta 25/04/2034 |
| Runtime de contenedores | Docker Engine | 29.5.2 | Contenedor | Apache-2.0 | Se usa Docker Engine, no Docker Desktop |
| Orquestación local | Docker Compose | 5.1.4 | Contenedor | Apache-2.0 | Plugin oficial `docker compose` |
| Proxy inverso / TLS | Nginx | 1.28.0 | Proxy / Web | BSD-2-Clause | Propuesto para producción; sirve el build estático y termina TLS |
| Runtime de backend | Python | 3.12.15 | API runtime | PSF-2.0 | Imagen base `python:3.12-slim` |
| Runtime de build web | Node.js | 22.23.3 | Build / Toolchain | MIT | Solo build del frontend; no es servidor de producción |
| Gestor de paquetes web | pnpm | 10.34.7 | Build / Toolchain | MIT | Usado por `fe/Dockerfile` |
| Runtime móvil | Node.js + Expo CLI | Node.js 22.23.3 · Expo 57.0.22 | Build / Mobile | MIT | La app móvil no se ejecuta en el servidor |

#### 1.1.2 Aplicación: frontend web, API, base de datos y almacenamiento

| Componente | Nombre de software | Versión exacta | Tipo de software | Licencia exacta | Observaciones |
|---|---|---|---|---|---|
| Frontend web | React | 18.3.1 | Web | MIT | SPA servida por Vite en desarrollo; Nginx en producción |
| Frontend build | Vite | 5.4.21 | Web | MIT | `pnpm build` genera `dist/` |
| Lenguaje frontend | TypeScript | 5.9.3 | Web | Apache-2.0 | Tipado estático del frontend |
| Ruteo frontend | React Router DOM | 7.18.0 | Web | MIT | Rutas públicas y por rol |
| Cliente HTTP | Axios | 1.8.4 | Web | MIT | Interceptores JWT y refresh |
| Framework API | FastAPI | 0.115.0 | API | MIT | API REST versionada en `/api/v1` |
| Servidor ASGI | Uvicorn | 0.30.0 | API | BSD-3-Clause | Ejecuta FastAPI |
| ORM | SQLAlchemy | 2.0.30 | API / Acceso a datos | MIT | Modelos y sesiones |
| Migraciones | Alembic | 1.13.2 | DB / Migraciones | MIT | Head de migraciones del proyecto |
| Validación de datos | Pydantic | 2.7.0 | API | MIT | Schemas de entrada/salida |
| Driver de base de datos | PyMySQL | 1.1.0 | DB Driver | MIT | Conexión MySQL desde SQLAlchemy |
| Base de datos | MySQL Community Server | 8.0.46 actual / 8.4.13 LTS objetivo | DB | GPL-2.0-only con FOSS Exception | 8.0 sin soporte desde 30/04/2026; migración obligatoria |
| Almacenamiento de objetos | MinIO Server | `RELEASE.2025-10-15T17-29-55Z` | Almacenamiento S3 | AGPL-3.0-only | Imagen actual `ghcr.io/coollabsio/minio`; fijar digest y evaluar imagen oficial |
| SDK de objetos | MinIO Python SDK | 7.2.20 | API / Cliente S3 | Apache-2.0 | Subida de imágenes y evidencias |
| Aplicación móvil | Expo SDK | 57.0.22 | Mobile | MIT | Cliente Android/iOS |
| Framework móvil | React Native | 0.86.3 | Mobile | MIT | Runtime de la app móvil |
| UI móvil | React | 19.2.3 | Mobile | MIT | Componentes de la app |
| Lenguaje móvil | TypeScript | 6.0.3 | Mobile | Apache-2.0 | Tipado de la app móvil |

#### 1.1.3 Librerías de soporte y activos

| Componente | Nombre de software | Versión exacta | Tipo de software | Licencia exacta | Observaciones |
|---|---|---|---|---|---|
| Generación de PDF | ReportLab | 4.2.0 | API / Reporting | BSD-3-Clause | Facturas y reportes PDF |
| Generación de Excel | openpyxl | 3.1.5 | API / Reporting | MIT | Exportación de reportes |
| Tareas programadas | APScheduler | 3.11.3 | API / Scheduler | MIT | Recordatorios y cierres automáticos |
| Rate limiting | SlowAPI | 0.1.9 | API / Seguridad | MIT | Protección de endpoints sensibles |
| JWT | python-jose | 3.3.0 | API / Seguridad | MIT | Firma y verificación de tokens |
| Hash de contraseñas | passlib | 1.7.4 | API / Seguridad | BSD-3-Clause | Esquema de hashing |
| Backend de hashing | bcrypt (Python) | 4.0.1 | API / Seguridad | Apache-2.0 | Implementación bcrypt |
| Tipografías web | Inter / Montserrat | Servidas desde Google Fonts | Activo web | SIL OFL-1.1 | Conservar aviso OFL si se autoalojan |
| Certificado TLS | Let's Encrypt | Certificado de 90 días | Servicio / TLS | No aplica (CA pública) | Renovación automática con ACME |

> **Nota sobre versiones:** las versiones de Python, Node.js, Docker y Compose corresponden a la imagen/entorno de referencia medido. Las etiquetas `latest` y `8.0` del compose no son reproducibles por sí solas; en producción se debe fijar la versión y el digest.

#### 1.1.4 Regla de versionado y reproducibilidad

1. Toda imagen de contenedor debe declararse con versión y digest:
   ```yaml
   # Ejemplo genérico; sustituir <DIGEST> por el valor real verificado.
   image: mysql:8.4.13@sha256:<DIGEST>
   image: ghcr.io/coollabsio/minio:RELEASE.2025-10-15T17-29-55Z@sha256:<DIGEST>
   image: node:22.23.3-alpine3.22@sha256:<DIGEST>
   image: python:3.12.15-slim-bookworm@sha256:<DIGEST>
   ```
2. Prohibido usar `latest` en producción.
3. Renovación mensual de dependencias mediante PR revisado, con análisis de vulnerabilidades (Trivy/Grype) y SBOM (Syft).
4. Revisión trimestral del calendario EOL de Ubuntu, MySQL, Python, Node.js, Nginx y MinIO.
5. `docker compose config --quiet` debe pasar antes de cada despliegue.

---

### 1.2 Matriz de requisitos hardware y dimensionamiento

#### 1.2.1 Escenario y método de medición

Los valores de consumo de esta ficha son una **línea base de laboratorio** para dimensionar el servidor. Deben repetirse en el hardware definitivo antes de la compra.

| Parámetro | Valor del banco de pruebas |
|---|---|
| Host de referencia | 4 vCPU · 8 GiB RAM · SSD SATA/NVMe · Ubuntu Server 24.04.5 LTS |
| Motor de contenedores | Docker Engine 29.5.2 · Docker Compose 5.1.4 |
| Carga simulada | 50 usuarios virtuales · rampa de 2 min · 10 min de meseta |
| Mezcla de tráfico | 70 % catálogo (GET), 20 % checkout (POST), 10 % login (POST) |
| Datos de prueba | 1.000 productos · 500 usuarios · 1.000 pedidos |
| Herramienta de carga | k6 o Artillery (fuera de los contenedores) |
| Criterio de aceptación | p95 API < 500 ms · tasa de error < 1 % |
| Muestreo | `docker stats --no-stream` cada 5 s durante 10 min |

Comando de captura usado:

```bash
# Ejecutar desde la raíz del repositorio, con el stack levantado.
docker stats --no-stream --format \
  'table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}\t{{.NetIO}}\t{{.BlockIO}}' \
  $(docker compose ps -q)
```

> `docker stats` expresa la CPU como porcentaje de **un núcleo**. Por eso la suma de varios contenedores puede superar el 100 % en un host multinúcleo. El dimensionamiento usa la suma como “vCPU equivalentes”.

#### 1.2.2 Consumo por servicio: reposo vs. carga simulada

| Servicio | Contenedor | CPU reposo | CPU bajo carga | RAM reposo | RAM bajo carga | Pico de RAM | Observaciones |
|---|---|---:|---:|---:|---:|---:|---|
| MySQL 8.0 | `neodomus_mysql` | 0,20 % | 35,00 % | 210 MiB | 480 MiB | 512 MiB | InnoDB, 120 QPS, escrituras de pedidos y citas |
| API FastAPI | `neodomus_api` | 0,30 % | 45,00 % | 115 MiB | 235 MiB | 256 MiB | 1 worker Uvicorn; endpoints de catálogo y checkout |
| MinIO | `neodomus_minio` | 0,10 % | 12,00 % | 95 MiB | 150 MiB | 160 MiB | Lectura/escritura de imágenes y evidencias |
| Frontend Vite (desarrollo) | `neodomus_frontend` | 0,20 % | 8,00 % | 175 MiB | 215 MiB | 224 MiB | Solo perfil de desarrollo; no usar en producción |
| Nginx (producción) | `neodomus_proxy` | 0,00 % | 5,00 % | 12 MiB | 20 MiB | 24 MiB | Reemplaza a Vite en producción y sirve `dist/` |
| **Total perfil desarrollo (Vite, sin Nginx)** | — | **0,80 %** | **100,00 %** | **595 MiB** | **1.080 MiB** | **1.152 MiB** | 1,00 vCPU equivalente en carga |
| **Total perfil producción (Nginx, sin Vite)** | — | **0,60 %** | **97,00 %** | **432 MiB** | **885 MiB** | **952 MiB** | 0,97 vCPU equivalente en carga |
| **Envelope de dimensionamiento** | — | **0,80 %** | **100,00 %** | **595 MiB** | **1.080 MiB** | **1.152 MiB** | Se toma el máximo entre ambos perfiles |

**Overhead del sistema operativo y del daemon de Docker:**

| Concepto | CPU | RAM | Nota |
|---|---:|---:|---|
| Ubuntu Server + Docker Engine + logs + agentes | 0,10 vCPU | 650 MiB | Medido fuera de los contenedores |
| **Demanda total de la plataforma** | **1,10 vCPU** | **1,76 GiB** | 1,00 vCPU + 0,10 vCPU; 1,125 GiB + 0,635 GiB |

#### 1.2.3 Composición del disco para el dimensionamiento

| Concepto | Tamaño estimado | Comentario |
|---|---:|---|
| Ubuntu Server + paquetes base | 6 GB | Sistema mínimo, sin escritorio |
| Imágenes Docker | 4 GB | API, frontend, MySQL, MinIO y Nginx |
| Datos MySQL (12 meses) | 2 GB | Crecimiento previsto de pedidos, citas y auditoría |
| Objetos MinIO (imágenes/evidencias, 12 meses) | 3 GB | Productos, perfiles y evidencias |
| Logs y archivos temporales | 1 GB | Rotación semanal |
| Backups locales (7 días) | 2 GB | Copia comprimida; no sustituye la copia externa |
| **Total usado estimado** | **18 GB** | Con 20 % de espacio libre operativo se requieren ≥ 22 GB |

> El script valida un **mínimo operativo de 10 GiB libres** (umbral de seguridad para que el host no se sature). El dimensionamiento de la ficha es mayor: **40 GB mínimos y 80 GB recomendados** de capacidad usable. Los 40 GB parten de los 22 GB calculados y añaden margen para capas temporales de Docker, actualizaciones y crecimiento; los 80 GB cubren el horizonte de 12 meses.

#### 1.2.4 Requisitos mínimos vs. recomendados

| Recurso | Mínimo | Recomendado | Justificación |
|---|---:|---:|---|
| CPU | 2 vCPU | 4 vCPU | El mínimo cubre el pico con holgura; el recomendado absorbe picos, backups y actualizaciones sin degradar la API |
| RAM | 4 GiB | 8 GiB | MySQL y MinIO crecen en caché; 8 GiB evita swap bajo carga |
| Disco usable | 40 GB SSD | 80 GB SSD | 22 GB calculados + margen para crecimiento, capas temporales y actualizaciones |
| IOPS (4K, mixto 70/30) | 500 IOPS | 1.500 IOPS | MySQL random writes y MinIO; el disco mecánico no es aceptable |
| Swap | 2 GiB | 4 GiB | Amortiguación ante picos; no sustituye RAM |
| Red | 100 Mbps | 1 Gbps | Descarga de imágenes, backups y atención concurrente |
| Retención de backup | 7 días local | 30 días local + copia externa | Ransomware, error humano y recuperación ante desastre |
| Disponibilidad objetivo | 99,5 % | 99,9 % | Un solo host no ofrece alta disponibilidad real; el 99,9 % requiere redundancia externa |

#### 1.2.5 Cálculo explícito del margen de seguridad (headroom)

Fórmulas aplicadas:

```text
Headroom (%) = ((Capacidad - Demanda pico) / Demanda pico) × 100
Incremento mínimo→recomendado (%) = ((Recomendado - Mínimo) / Mínimo) × 100
```

La demanda de IOPS se estima con 120 QPS de MySQL y un promedio de 3 operaciones de disco por transacción: `120 × 3 ≈ 360`, redondeado a **350 IOPS** para el cálculo conservador.

| Recurso | Demanda pico medida | Mínimo | Headroom mínimo | Recomendado | Headroom recomendado | Incremento mínimo→recomendado |
|---|---:|---:|---:|---:|---:|---:|
| CPU | 1,10 vCPU | 2 vCPU | 81,8 % | 4 vCPU | 263,6 % | +100 % |
| RAM | 1,76 GiB | 4 GiB | 127,3 % | 8 GiB | 354,5 % | +100 % |
| Disco usable | 18 GB | 40 GB | 122,2 % | 80 GB | 344,4 % | +100 % |
| IOPS | 350 IOPS | 500 IOPS | 42,9 % | 1.500 IOPS | 328,6 % | +200 % |

**Lectura del margen:**

- Se exige un **headroom mínimo ≥ 40 %** sobre el pico medido para CPU, RAM e IOPS. El mínimo de 2 vCPU/4 GiB/500 IOPS cumple: 81,8 %, 127,3 % y 42,9 %.
- El **recomendado** mantiene más de 3× la demanda pico en CPU, RAM, disco e IOPS. Ese colchón cubre:
  - crecimiento de tráfico del 50 % en 12 meses;
  - crecimiento de datos del 30 % en 12 meses;
  - ventanas de backup, migraciones Alembic y actualizaciones de imágenes;
  - pérdida temporal de un disco o de un nodo de aplicación.
- El incremento entre mínimo y recomendado es del **+100 % en CPU, RAM y disco** y del **+200 % en IOPS**. No es “el doble por duplicar”: responde a una regla de capacidad (3× pico) y a la criticidad de MySQL.
- Con la proyección a 12 meses (CPU 1,65 vCPU, RAM 2,29 GiB, disco 23,4 GB, IOPS 525), el servidor recomendado conserva más del **140 % de headroom** en todos los recursos.

#### 1.2.6 Resultado del dimensionamiento

| Escenario | Especificación |
|---|---|
| **Mínimo de laboratorio** | 2 vCPU · 4 GiB RAM · 40 GB SSD usable · 500 IOPS · red 100 Mbps |
| **Recomendado de producción** | 4 vCPU · 8 GiB RAM · 80 GB SSD usable · 1.500 IOPS · red 1 Gbps · doble NIC |
| **Almacenamiento físico propuesto** | 2× 480 GB SSD SATA/NVMe en RAID 1 para SO + 4× 480 GB SSD en RAID 10 para datos (Docker, MySQL y MinIO) |
| **Protección eléctrica** | UPS 1500 VA con apagado ordenado · doble fuente en el servidor |
| **Backup** | Local 7 días + copia externa cifrada 30 días · prueba de restauración trimestral |

> El RAID no es un backup. La copia externa debe estar en otra ubicación física o en almacenamiento de objetos con versionado, y debe probarse la restauración, no solo la copia.

---

### 1.3 Preguntas guía justificadas

#### 1.3.1 Sistema operativo, arquitectura y fin de soporte

| Criterio | Decisión |
|---|---|
| Sistema operativo | **Ubuntu Server 24.04.5 LTS (Noble Numbat)** |
| Arquitectura | **x86_64 / amd64** |
| Kernel | Serie GA 6.8 de Ubuntu 24.04 (HWE opcional para hardware nuevo) |
| Fecha de instalación de referencia | 20/10/2026 |
| Fin de soporte estándar | **31/05/2029** |
| Fin de ESM con Ubuntu Pro | **25/04/2034** (Canonical lo publica como mayo de 2034) |
| Ciclo de actualización | Parches de seguridad automáticos; reinicio programado mensual |
| Perfil de instalación | Servidor mínimo, sin escritorio, OpenSSH, UFW, AppArmor, `unattended-upgrades` |

**Justificación:**

1. **LTS con ciclo predecible:** 5 años de soporte estándar y 5 adicionales con ESM. Cubre el horizonte académico y permite planificar la actualización a Ubuntu 26.04 LTS sin urgencias.
2. **Compatibilidad con el stack:** Docker Engine, MySQL, MinIO, Python 3.12 y Nginx tienen soporte oficial y documentación para Ubuntu 24.04 x86_64.
3. **Seguridad por defecto:** AppArmor, UFW, actualizaciones de seguridad y soporte de CIS/DISA-STIG con Ubuntu Pro.
4. **Operación:** `cloud-init`, Netplan, systemd, `journald` y herramientas de diagnóstico estándar; el equipo ya está familiarizado con Debian/Ubuntu.
5. **Costo:** no hay licencia de SO. El costo aparece solo si se requiere ESM después de 2029 o soporte empresarial.

**Alternativas evaluadas:**

| Alternativa | Ventaja | Motivo para no elegirla como estándar |
|---|---|---|
| Ubuntu 26.04 LTS | Soporte hasta 2031/2036 | Lanzada en abril de 2026; 24.04.5 lleva más tiempo de madurez y pruebas del stack |
| Debian 13 (Trixie) | Estabilidad y philosophia libre | Ciclo de soporte y ecosistema de ESM menos alineado con el equipo; menor soporte comercial directo |
| RHEL 10 | Soporte empresarial fuerte | Suscripción por servidor y curva de aprendizaje; sobredimensionado para el proyecto |
| Windows Server | Integración con Active Directory | Licencias, mayor superficie de ataque y contenedores Linux en una capa extra |
| Ubuntu Desktop | Facilidad de uso | No es un SO de servidor; servicios y escritorio compiten por recursos |

**Checklist de hardening del SO:**

- [ ] SSH solo con claves; `PermitRootLogin no`; usuario administrador con `sudo`.
- [ ] UFW: permitir 22/tcp solo desde la red de administración, 80/443 desde Internet; denegar el resto.
- [ ] Publicar MySQL (3307) y MinIO (9001) solo en `127.0.0.1` o VPN.
- [ ] AppArmor activo; `unattended-upgrades` para parches de seguridad.
- [ ] NTP/chrony sincronizado; logs centralizados o retenidos 30 días.
- [ ] `/var/lib/docker` y `/srv/neodomus` en el volumen de datos, no en el disco de SO.
- [ ] Monitoreo de disco, RAM, carga y salud de los contenedores.

#### 1.3.2 Infraestructura on-premise: Rack vs. Torre vs. Blade y RAID

**Comparación de formato:**

| Criterio | Rack 1U/2U | Torre | Blade |
|---|---|---|---|
| Densidad | Alta: varias unidades en un gabinete | Baja: una unidad por equipo | Muy alta: chasis compartido |
| Redundancia | Fuentes redundantes, NIC duales, IPMI/BMC | Limitada; fuentes y NIC según modelo | Fuentes y ventiladores compartidos, alta disponibilidad |
| Mantenimiento | Extracción frontal, cables ordenados, acceso remoto | Acceso local; más difícil en gabinete | Gestión centralizada, pero dependencia del chasis |
| Costo inicial | Medio | Bajo | Alto (chasis, módulos, licencias) |
| Consumo y ruido | Medio; requiere ventilación | Bajo/medio; apto para oficina | Alto; requiere sala técnica |
| Escalabilidad | Buena, añadiendo unidades | Limitada | Excelente, pero con vendor lock-in |
| Recomendación | **Sí, para producción** | Solo laboratorio/oficina pequeña | No para esta escala |

**Decisión:** servidor **rack 1U o 2U** con 8 bahías para discos 2.5", doble fuente, IPMI/BMC, RAM ECC y dos NIC. Un rack de 12U con UPS, PDU y ventilación es suficiente para el servidor, el switch y el equipo de backup. Torre solo se justifica si no existe gabinete ni sala técnica; Blade no se justifica para un único host y añade costo y complejidad.

**Comparación de RAID:**

| Nivel | Tolerancia a fallos | Capacidad usable | Rendimiento | Uso recomendado |
|---|---|---|---|---|
| RAID 0 | Ninguna | 100 % | Máximo | No usar para datos |
| RAID 1 | 1 disco por espejo | 50 % | Lectura alta; escritura media | **SO y arranque** |
| RAID 5 | 1 disco | (N-1)/N | Penalización de escritura; rebuild lento | No recomendado para MySQL |
| RAID 6 | 2 discos | (N-2)/N | Mayor penalización | Archivo, no base de datos |
| RAID 10 | 1 disco por espejo | 50 % | Muy alto en lectura y escritura | **Datos de MySQL, MinIO y Docker** |

**Decisión de RAID:**

- **RAID 1** con 2× 480 GB SSD para el sistema operativo: simplicidad, arranque redundante y recuperación rápida.
- **RAID 10** con 4× 480 GB SSD para `/var/lib/docker`, MySQL y MinIO: mejor equilibrio entre IOPS, latencia de escritura y tolerancia a fallos. El rebuild es más rápido que RAID 5/6 y no tiene el “write hole” clásico.
- **Hot spare** si el chasis lo permite; controladora con caché protegida (BBU/capacitor) y monitorización SMART.
- **Backup 3-2-1:** copia local, copia externa cifrada y una copia offline/inmutable. Probar restauración trimestral.

**Si el presupuesto solo permite un arreglo:** 2× 480 GB SSD en RAID 1 para todo el sistema es aceptable para el laboratorio, pero el rendimiento de escritura y la capacidad no cumplen el escenario recomendado. Documentar la limitación y no prometer alta disponibilidad.

#### 1.3.3 Restricciones de licencias y costos implícitos

| Componente / servicio | Licencia o modelo | Obligación o restricción clave | Costo implícito | Mitigación |
|---|---|---|---|---|
| MySQL Community 8.0/8.4 | GPL-2.0-only con FOSS Exception | Copyleft: distribuir una versión modificada del servidor exige liberar el código; el uso interno como SaaS no obliga a publicar la aplicación | Soporte Oracle opcional; migración y pruebas | Migrar a 8.4 LTS; no distribuir un appliance cerrado con MySQL sin revisión legal |
| MinIO Server | AGPL-3.0-only | Si se modifica y se ofrece como servicio de red, hay que ofrecer el código correspondiente a los usuarios; usar sin modificar reduce el riesgo | Licencia comercial si se requiere soporte o uso embebido | No modificar MinIO; aislar el servicio; no exponer la consola 9001; conservar avisos |
| Docker Engine / Compose | Apache-2.0 | Permisiva; conservar NOTICE y avisos; no hay obligación de abrir el código propio | Docker Desktop no es gratis para grandes organizaciones; el servidor usa Engine | No instalar Docker Desktop en el servidor; usar Engine + Compose |
| Ubuntu Server 24.04 | GPLv3 y otras licencias libres | El SO es libre; ESM después de 2029 requiere Ubuntu Pro | Ubuntu Pro gratuito hasta 5 máquinas personales; suscripción empresarial si aplica | Planificar ESM o migración a 26.04 LTS antes de 2029 |
| Nginx | BSD-2-Clause | Conservar copyright/licencia; no usar el nombre del proyecto para promocionar derivados | NGINX Plus es comercial y opcional | Nginx open source es suficiente |
| FastAPI / Uvicorn / SQLAlchemy / Pydantic / React / Vite / Expo | MIT / BSD-3 / Apache-2.0 | Conservar avisos de copyright y licencia; Apache-2.0 incluye concesión de patentes | Ninguno | Generar `THIRD_PARTY_LICENSES` y revisar en cada release |
| ReportLab | BSD-3-Clause (open source) | La versión open source es permisiva; ReportLab PLUS es comercial | ReportLab PLUS solo si se necesitan funciones avanzadas | Verificar que el código no importe módulos exclusivos de PLUS |
| Tipografías Inter / Montserrat | SIL OFL-1.1 | Se pueden usar y redistribuir con la licencia; no se pueden vender por separado | Ninguno | Incluir el texto OFL si se autoalojan |
| Google OAuth | Términos de servicio de Google | Cuotas, políticas de privacidad y disponibilidad del proveedor | Gratuito con límites; costos si se superan cuotas | Tener login local como fallback; revisar scopes |
| SMTP / Resend | Servicio de terceros | Límites de envío, reputación y tratamiento de datos | Gratuito con límites; plan pago desde cierto volumen | Usar dominio propio, SPF/DKIM/DMARC y proveedor transaccional |
| Pasarela de pagos (futuro) | Contrato del proveedor | Comisión por transacción, PCI-DSS y conciliación | Porcentaje por venta + costos de integración | En la entrega académica se usa el simulador; en producción cotizar |
| Let's Encrypt | CA pública | Certificados de 90 días; automatizar renovación | Gratuito | `certbot` + renovación automática + monitoreo |
| Dominio y DNS | Registro | Renovación anual y protección de la cuenta | USD 10–25/año | Registrar con MFA y bloqueo de transferencia |

**Costos implícitos de infraestructura (orden de magnitud, no cotización):**

| Concepto | Modelo | Rango estimado | Nota |
|---|---|---:|---|
| Servidor rack 1U/2U, 4 vCPU, 8 GiB, 8 bahías | CAPEX | USD 1.500–3.000 | Depende de marca, CPU, RAM y garantía |
| 6 SSD 480 GB (2 SO + 4 datos) | CAPEX | USD 300–700 | Preferir SSD con TBW y garantía |
| UPS 1500 VA + PDU | CAPEX | USD 300–600 | Apagado ordenado y protección de picos |
| Gabinete 12U, bandejas y cables | CAPEX | USD 200–600 | Ventilación y acceso |
| Ubuntu Pro / soporte | OPEX | USD 0–variable | Gratis para uso personal hasta 5 máquinas |
| MySQL / MinIO / Nginx / Docker | OPEX | USD 0 | Código abierto; soporte comercial opcional |
| Dominio + DNS | OPEX | USD 10–25/año | Renovación y privacidad WHOIS |
| Correo transaccional | OPEX | USD 0–20/mes | Según volumen |
| Backup externo | OPEX | USD 5–30/mes | 100 GB cifrados, fuera del sitio |
| Pasarela de pagos | Variable | % por transacción | No aplica con el simulador académico |
| Operación y mantenimiento | OPEX | 8–16 h/mes | Parches, backups, monitoreo y incidentes |

> Los precios son referencias de orden de magnitud para la sustentación; no constituyen una cotización. Deben validarse con proveedores locales y con IVA/impuestos aplicables.

**Checklist de cumplimiento de licencias:**

- [ ] Generar SBOM (Syft) y escanear vulnerabilidades (Trivy/Grype) en cada build.
- [ ] Publicar `THIRD_PARTY_LICENSES` con MIT, BSD, Apache-2.0 y OFL.
- [ ] Revisar obligaciones AGPL de MinIO antes de modificar o redistribution.
- [ ] No distribuir MySQL dentro de un appliance propietario sin revisión legal.
- [ ] Confirmar que ReportLab usado es la versión BSD, no módulos PLUS.
- [ ] No instalar Docker Desktop en el servidor Linux.
- [ ] Decidir y documentar Ubuntu Pro antes del 31/05/2029.
- [ ] Revisar tratamiento de datos personales (Ley 1581 de 2012 en Colombia) y política de privacidad.

---

### 1.4 Salida real del script `verificar-requisitos.sh`

#### 1.4.1 Ejecución

```bash
# Desde la raíz del repositorio
chmod +x scripts/verificar-requisitos.sh
./scripts/verificar-requisitos.sh

# Prueba de fallo controlado para la sustentación
SIMULATE_FAIL=true ./scripts/verificar-requisitos.sh
# Equivalente:
./scripts/verificar-requisitos.sh --simulate-fail
```

El script no requiere root si el usuario pertenece al grupo `docker`, no imprime credenciales y no modifica el sistema. La validación de `docker-compose.yml` ejecuta `docker compose config --quiet`, que resuelve variables de entorno y `.env` sin mostrar sus valores.

El código se organiza en funciones independientes: `check_os`, `check_permissions`, `check_docker`, `check_memory`, `check_disk` y `check_ports`. Los umbrales se ajustan con `MIN_RAM_GB`, `MIN_DISK_GB`, `DISK_PATH` y `PORTS_TO_CHECK`. La función `print_summary` devuelve `0` solo cuando `FAIL_COUNT` es cero; cualquier fallo crítico o la simulación terminan con código `1`.

#### 1.4.2 Salida de referencia — entorno conforme

> Captura de referencia en Ubuntu Server 24.04.5 LTS. El host y el usuario se han genericado por seguridad; los valores de RAM, disco y puertos son los del servidor de laboratorio.

```text
$ ./scripts/verificar-requisitos.sh

==============================================================
  Neodomus — Verificación de requisitos de implantación
  Semana 1 · Ficha técnica y matriz de requisitos
==============================================================

[INFO] Host: servidor-ejemplo | Usuario: usuario-ejemplo | Fecha: 2026-10-20 10:15:42 -05
[INFO] Umbrales: RAM >= 4 GiB · Disco libre >= 10 GiB en / · Puertos: 80 443 5173 8000 3306 3307 9000 9001
[INFO] SIMULATE_FAIL=false · NO_COLOR=false

[INFO] 1. Sistema operativo y arquitectura
[ OK ] Sistema Linux detectado (kernel 6.8.0-xx-generic).
[ OK ] Arquitectura x86_64 compatible con las imágenes del stack.
[ OK ] Distribución homologada: Ubuntu 24.04.5 LTS.

[INFO] 2. Usuario y permisos
[ OK ] Ejecución con usuario sin privilegios (uid=1000).
[ OK ] El usuario 'usuario-ejemplo' pertenece al grupo docker.

[INFO] 3. Docker Engine y Docker Compose
[ OK ] Docker Engine instalado (29.5.2).
[ OK ] Daemon de Docker operativo (29.5.2).
[ OK ] Versión de Docker Engine >= 20.
[ OK ] Docker Compose v2+ disponible (5.1.4).
[ OK ] docker-compose.yml válido y resoluble.

[INFO] 4. Memoria RAM
[ OK ] RAM total: 7.76 GiB (mínimo requerido: 4 GiB).
[INFO] RAM disponible en el momento de la prueba: 6.42 GiB.

[INFO] 5. Espacio en disco
[ OK ] Espacio libre en /: 74.31 GiB de 80.00 GiB (mínimo requerido: 10 GiB).

[INFO] 6. Disponibilidad de puertos
[ OK ] Puerto 80/tcp libre.
[ OK ] Puerto 443/tcp libre.
[ OK ] Puerto 5173/tcp libre.
[ OK ] Puerto 8000/tcp libre.
[ OK ] Puerto 3306/tcp libre.
[ OK ] Puerto 3307/tcp libre.
[ OK ] Puerto 9000/tcp libre.
[ OK ] Puerto 9001/tcp libre.

[INFO] Resumen: 20 aprobadas, 0 advertencias, 0 fallidas.
[ OK ] Entorno APTO para el despliegue de Neodomus.
```

**Código de salida:** `0`.

#### 1.4.3 Salida de referencia — fallo simulado

```text
$ SIMULATE_FAIL=true ./scripts/verificar-requisitos.sh

==============================================================
  Neodomus — Verificación de requisitos de implantación
  Semana 1 · Ficha técnica y matriz de requisitos
==============================================================

[INFO] Host: servidor-ejemplo | Usuario: usuario-ejemplo | Fecha: 2026-10-20 10:18:07 -05
[INFO] Umbrales: RAM >= 4 GiB · Disco libre >= 10 GiB en / · Puertos: 80 443 5173 8000 3306 3307 9000 9001
[INFO] SIMULATE_FAIL=true · NO_COLOR=false

[... misma salida de las secciones 1 a 6 ...]

[INFO] 7. Simulación de fallo
[FAIL] Fallo simulado activado (SIMULATE_FAIL=true). Se fuerza el resultado global a NO APTO.

[INFO] Resumen: 20 aprobadas, 0 advertencias, 1 fallida.
[FAIL] Entorno NO APTO. Corrija los requisitos marcados como [FAIL] y vuelva a ejecutar.
```

**Código de salida:** `1`.

#### 1.4.4 Interpretación de resultados

| Código | Significado | Acción |
|---:|---|---|
| `0` | Todos los requisitos críticos se cumplen | Continuar con la instalación |
| `1` | Falla un requisito crítico, un umbral o la simulación | Corregir y volver a ejecutar |
| `[WARN]` | Requisito no bloqueante (por ejemplo, distribución no homologada o usuario sin grupo docker) | Revisar antes de producción; no impide la ejecución |
| `[FAIL]` | Requisito bloqueante (Docker, RAM, disco, puerto ocupado o simulación) | No continuar hasta resolverlo |

> La salida completa con colores ANSI se muestra solo en terminal interactiva. Si se redirige a un archivo, el script desactiva los colores y conserva los prefijos `[INFO]`, `[ OK ]`, `[WARN]` y `[FAIL]`.

---

### 1.5 Criterios de aceptación de la Semana 1

| Criterio | Evidencia | Estado |
|---|---|---|
| Inventario completo con versión y licencia | Tablas 1.1.1 a 1.1.3 | ✅ |
| Matriz de consumo en reposo y bajo carga | Tabla 1.2.2 y método 1.2.1 | ✅ |
| Requisitos mínimos vs. recomendados | Tabla 1.2.4 | ✅ |
| Cálculo explícito de headroom | Tabla 1.2.5 y fórmulas | ✅ |
| SO, arquitectura y EOL justificados | Sección 1.3.1 | ✅ |
| Rack vs. torre vs. blade y RAID | Sección 1.3.2 | ✅ |
| Restricciones y costos de licencias | Sección 1.3.3 | ✅ |
| Script ejecutable, seguro y con salida 0/1 | `scripts/verificar-requisitos.sh` y sección 1.4 | ✅ |
| Prueba de fallo controlado | `SIMULATE_FAIL=true` y sección 1.4.3 | ✅ |

**Acciones que pasan a la Semana 2:** migrar MySQL a 8.4 LTS, fijar imágenes por digest, incorporar Nginx/TLS, eliminar credenciales por defecto y definir el plan de backups.

---

## 2. Plan de Migración de Datos

> **Adaptación al stack real.** El enunciado genérico de la actividad menciona Node.js/Express y PostgreSQL/MongoDB. Neodomus usa **FastAPI + MySQL 8.0/8.4 + MinIO**; por tanto, la migración se diseña para MySQL y objetos S3, no para PostgreSQL ni MongoDB. No se inventan motores que no existen en el repositorio.

### 2.1 Objetivo y alcance

Migrar los datos iniciales o legados hacia una base MySQL limpia y consistente, con trazabilidad, validaciones y reversión. El alcance incluye:

| Incluido | Excluido |
|---|---|
| Catálogo: categorías, productos, variantes, proveedores, precios y stock. | Cambios de código o de reglas de negocio no aprobados. |
| Identidad: clientes, usuarios, roles, técnicos y credenciales ya hasheadas. | Contraseñas en texto plano o secretos de producción. |
| Operación: pedidos, detalle, pagos, facturas, citas, entregas, devoluciones y novedades. | Datos de terceros sin autorización ni base legal. |
| Objetos de MinIO: imágenes de productos, perfiles y evidencias. | Copias de seguridad históricas fuera del alcance del proyecto. |
| Metadatos de migración: mapa de IDs, rechazos y conciliación. | Migración de la base documental MongoDB (no existe en el stack). |

**Principio rector:** primero se respalda, después se migra; nunca se sobrescribe producción sin una copia verificada y una prueba en staging.

### 2.2 Origen y estado de los datos

| Fuente real | Formato | Ubicación | Volumen de referencia | Propietario | Estado |
|---|---|---|---|---|---|
| Esquema y datos iniciales | SQL | `scripts/init_db.sql` (≈66 KB) | Catálogo base y usuarios de prueba | Equipo backend / DBA | Versionado en el repositorio; no es un dump de producción |
| Exportación de seeds | SQL generado por Python | `scripts/export_seed.py` → `scripts/init_db.sql` | Clientes, usuarios y técnicos existentes | Equipo backend | Idempotente; se regenera desde la BD local |
| Esquema versionado | Migraciones Alembic | `be/alembic/versions/` | 60 revisiones (`0001` a `0060`) | DBA / backend | Fuente de verdad del esquema |
| Base MySQL local/staging | Tablas InnoDB | Contenedor `neodomus_mysql`, puerto host `3307` | ≈1.000 productos, 500 usuarios y 1.000 pedidos como referencia de laboratorio | DBA designado | Medir el volumen real antes de producción |
| Objetos multimedia | Binarios S3 | Bucket `neodomus-media` / `minio_data` | Imágenes y evidencias; depende del catálogo | Responsable de almacenamiento | Verificar conteo y checksums antes de migrar |
| CSV/Excel legado | CSV/XLSX | No existe en el repositorio; si aparece, se deposita en `data/legacy/` | A confirmar con el área dueña | Área dueña del dato | **No inventar**; solicitar diccionario de datos y autorización |

**Volumen y dimensionamiento:** el volumen de referencia permite ensayar la migración, pero no sustituye la medición real. Antes de la ventana de migración se ejecuta:

```sql
SELECT table_name, table_rows
FROM information_schema.tables
WHERE table_schema = DATABASE()
ORDER BY table_rows DESC;
```

La cifra oficial se obtiene con `COUNT(*)` por tabla, no con `table_rows` (que es una estimación del optimizador). El crecimiento esperado y la ventana de migración se registran en el informe de la Semana 2.

**Propietario del dato:** el líder técnico/DBA designado aprueba el diccionario, las reglas de rechazo y la conciliación. Si hay datos personales, el responsable de tratamiento valida finalidad, base legal, retención y minimización antes de copiarlos a staging.

**Hallazgo de consistencia detectado:** la base local estaba en la revisión `0060`, mientras la rama de entrega solo contenía migraciones hasta `0057`. Alembic fallaba con `Can't locate revision identified by '0060'`. Se incorporaron `0058_novedades_mensaje_cliente.py`, `0059_pedidos_confirmacion_completa.py` y `0060_stock_y_metros_decimal.py`, y se verificó `alembic current = 0060 (head)`. **Nunca se debe resolver este error borrando `alembic_version` o ejecutando `alembic stamp` sin respaldo.**

### 2.3 Reglas transversales de transformación

1. **Codificación:** todo texto se convierte a UTF-8 y se almacena en tablas `utf8mb4`/`utf8mb4_unicode_ci`. Los caracteres inválidos se rechazan, no se reemplazan silenciosamente.
2. **Fechas y horas:** se normalizan a UTC para `DATETIME`; las fechas sin hora se conservan como `DATE`. Se aceptan formatos `YYYY-MM-DD`, `DD/MM/YYYY` y `YYYY-MM-DD HH:MM:SS`, con rechazo si son ambiguos.
3. **Dinero:** se usa `DECIMAL(12,2)` en staging y en las columnas monetarias que ya son decimales; se prohíbe `float` para cálculos de conciliación. Tolerancia de comparación: ±0,01.
4. **Stock y metros:** `stock_producto` y `stock` de variantes son `DECIMAL(12,2)`; `cantidad_metros` es `DECIMAL(10,2)`. No se redondea ni se trunca una longitud solicitada.
5. **Booleanos:** `1/0`, `true/false`, `Sí/No` se convierten a `TINYINT(1)`. Un valor desconocido se rechaza.
6. **Identificadores:** se conserva el ID actual cuando ya es el ID destino; para orígenes externos se genera un ID sustituto y se registra la relación en `stg_id_map`. No se confía en que un ID legado sea único entre tablas.
7. **Contraseñas:** solo se migran hashes bcrypt/argon2 válidos. Si el origen trae texto plano, se genera un hash y se marca `password_reset_required = 1`; nunca se guarda ni se registra la clave original.
8. **Idempotencia:** cada lote se puede repetir en staging. En producción se ejecuta una sola vez, dentro de una ventana aprobada y con respaldo previo.
9. **Orden de carga:** catálogos → identidades → productos → pedidos → detalle → pagos/facturas → citas/entregas → devoluciones/novedades → objetos MinIO.
10. **Trazabilidad:** cada fila conserva `lote_id`, `archivo_origen`, `fila_origen` y `hash_origen` en staging; en producción solo quedan las claves de negocio y el mapa de IDs.

### 2.4 Tabla de mapeo y transformación campo por campo

La tabla usa nombres genéricos de origen (`nombre_completo`, `correo`, `precio`) porque el origen actual es SQL y un futuro CSV puede variar. El destino es el modelo real de `be/app/models/`.

| Entidad | Campo origen | Campo destino | Tipo origen → destino | Regla de conversión |
|---|---|---|---|---|
| `clientes` | `nombre_completo` | `first_name` + `last_name` | `VARCHAR` → `VARCHAR(100)` ×2 | `TRIM`; dividir por el primer espacio; si falta apellido, rechazar con `E-NULL` salvo aprobación. |
| `clientes` | `correo` | `email` | `VARCHAR` → `VARCHAR(100)` | `TRIM`, minúsculas, validar formato y unicidad; duplicado = rechazo. |
| `clientes` | `telefono` | `telefono_cliente` | `VARCHAR` → `BIGINT` | Quitar espacios, `+`, guiones y prefijo país; aceptar 7–15 dígitos. |
| `clientes` | `documento` | `documento_cliente` | `VARCHAR` → `INT` | Solo dígitos; único; si es nulo se permite, si es inválido se rechaza. |
| `clientes` | `direccion` | `address` | `TEXT` → `VARCHAR(150)` | `TRIM`; truncar solo con registro de advertencia, nunca silenciosamente. |
| `clientes` | `activo` | `is_active` | `VARCHAR/INT` → `TINYINT(1)` | Mapear `1/Sí/true/activo` a `1`; `0/No/false/inactivo` a `0`. |
| `clientes` | `password_hash` | `password_hash` | `VARCHAR` → `VARCHAR(255)` | Copiar solo hashes reconocidos; si es plano, hashear y forzar reset. |
| `usuarios` | `correo` | `email` | `VARCHAR` → `VARCHAR(100)` | Igual que clientes; el email es único en `usuarios`. |
| `usuarios` | `clave_plana` | `password_hash` | `VARCHAR` → `VARCHAR(255)` | **No copiar**: generar bcrypt y `password_reset_required=1`. |
| `usuarios` | `rol` | `id_rol_u` | `VARCHAR` → `INT` FK | Lookup en `roles_usuario.nombre_rol`; rol desconocido = rechazo. |
| `usuarios` | `activo` | `is_active` | `VARCHAR/INT` → `TINYINT(1)` | Misma tabla de verdad que clientes. |
| `categorias` | `nombre` | `nombre_categoria` | `VARCHAR` → `VARCHAR(50)` | `TRIM`, colapsar espacios; única por nombre normalizado. |
| `productos` | `referencia` | `referencia_producto` | `VARCHAR` → `VARCHAR(50)` | Mayúsculas, `TRIM`; única; duplicado = rechazo. |
| `productos` | `nombre` | `nombre_producto` | `VARCHAR` → `VARCHAR(100)` | `TRIM`; no vacío. |
| `productos` | `categoria` | `id_cate_pr` | `VARCHAR` → `INT` FK | Lookup por nombre de categoría; crear catálogo faltante solo con aprobación. |
| `productos` | `precio_venta` | `precio_venta_producto` | `DECIMAL/STRING` → `DECIMAL(12,2)` | Quitar separadores de miles; punto decimal; ≥ 0. |
| `productos` | `precio_compra` | `precio_compra_producto` | `DECIMAL/STRING` → `DECIMAL(12,2)` | Igual; puede ser nulo. |
| `productos` | `stock` | `stock_producto` | `DECIMAL/INT` → `DECIMAL(12,2)` | ≥ 0; conservar decimales de metros (ej. `10.50`). |
| `productos` | `estado` | `estado_producto` | `VARCHAR` → `VARCHAR(20)` | Mapear a `activo/inactivo/agotado`; valor desconocido = rechazo. |
| `productos` | `imagen` | `imagen_url` | `VARCHAR` → `VARCHAR(255)` | Ruta relativa o URL válida; conservar minúsculas y extensión. |
| `pedidos` | `id_legado` | `id_pedido` | `VARCHAR` → `INT` | Generar ID sustituto y registrar en `stg_id_map`; no reutilizar IDs de otra entidad. |
| `pedidos` | `cliente` | `id_cliente_pe` | `VARCHAR` → `INT` FK | Lookup por documento/email; si no existe, rechazo `E-FK`. |
| `pedidos` | `fecha` | `fecha_peedido` | `DATE/DATETIME` → `DATETIME` | Normalizar a UTC; conservar el nombre real de la columna (incluido el typo) por compatibilidad. |
| `pedidos` | `total` | `total_pedido` | `DECIMAL` → `DECIMAL(12,2)` | Recalcular desde detalle; comparar con tolerancia ±0,01. |
| `pedidos` | `estado` | `estado_pedido` | `VARCHAR` → `VARCHAR(50)` | Mapear estados legados a `Pendiente/Pagado/Enviado/Entregado/Cancelado`; desconocido = rechazo. |
| `detalle_pedido` | `pedido` | `id_pedido_d` | `VARCHAR` → `INT` FK | Lookup en `stg_id_map`; padre debe existir. |
| `detalle_pedido` | `producto` | `id_producto_d` | `VARCHAR` → `INT` FK | Lookup por referencia; si no existe, rechazo. |
| `detalle_pedido` | `cantidad` | `cantidad_detalle` | `INT` → `INT` | ≥ 1 para productos unitarios. |
| `detalle_pedido` | `metros` | `cantidad_metros` | `DECIMAL` → `DECIMAL(10,2)` | > 0 y máximo 2 decimales; aplica a productos por metros. |
| `detalle_pedido` | `precio_unitario` | `precio_unitario_detalle` | `DECIMAL` → `DECIMAL(12,2)` | ≥ 0; no recalcular con el precio actual del producto. |
| `detalle_pedido` | `subtotal` | `subtotal_detalle` | `DECIMAL` → `DECIMAL(12,2)` | Recalcular `cantidad × precio` o `metros × precio`; comparar y rechazar diferencias > 0,01. |
| `pagos` | `pedido` | `id_pedido` | `VARCHAR` → `INT` FK | Lookup; el pedido debe existir. |
| `pagos` | `metodo` | `metodo_pago` | `VARCHAR` → `VARCHAR(30)` | Mapear a `tarjeta/PSE/PayPal/punto_pago`; desconocido = rechazo. |
| `pagos` | `estado` | `estado` | `VARCHAR` → `VARCHAR(20)` | Mapear a `aprobado/rechazado/pendiente`; conservar `numero_transaccion` si existe. |
| `pagos` | `monto` | `monto` | `DECIMAL` → `DECIMAL(12,2)` | ≥ 0; sumar por pedido y comparar con `total_pedido`. |
| `citas` | `cliente` | `id_cliente` | `VARCHAR` → `INT` FK | Lookup; no crear clientes implícitamente. |
| `citas` | `tipo` | `tipo_servicio` | `VARCHAR` → `VARCHAR(30)` | Catálogo permitido; `TRIM`. |
| `citas` | `fecha` + `hora` | `fecha` + `hora` | `DATE` + `VARCHAR` → `DATE` + `VARCHAR(10)` | Validar fecha real y hora `HH:MM`; no agendar en el pasado sin marca histórica. |
| `citas` | `estado` | `estado` | `VARCHAR` → `VARCHAR(20)` | Mapear a `Pendiente/Confirmada/Completada/Cancelada`. |
| `citas` | `costo` | `costo_cita` | `DECIMAL` → `DECIMAL(12,2)` | ≥ 0; nulo permitido. |
| MinIO | `object_key` | bucket/key | `VARCHAR` → objeto S3 | Conservar ruta, `Content-Type`, tamaño y SHA-256; no renombrar sin actualizar la URL en MySQL. |

**Regla de oro:** el mapeo se valida contra el esquema real con `alembic current` y con una consulta a `information_schema.columns`; si una columna destino no existe, la migración se detiene antes de cargar datos.

### 2.5 Estrategia de staging y reglas de rechazo

**Ambiente intermedio:** base `neodomus_staging` o esquema `stg_*` en el mismo MySQL de staging. Nunca se escribe directamente en producción.

Flujo por lote:

1. **Extraer** el origen sin transformarlo y calcular `sha256` del archivo/lote.
2. **Cargar crudo** en tablas `stg_*_raw` (todas las columnas como texto, más metadatos).
3. **Normalizar** a tablas `stg_*` con tipos definitivos y claves naturales.
4. **Validar** duplicados, nulos, FKs, rangos, totales y encoding.
5. **Rechazar** filas inválidas en `stg_rechazos` con motivo y severidad.
6. **Conciliar** contra el origen y generar el acta de migración.
7. **Promover** a producción solo si las cuatro validaciones obligatorias pasan.

Tabla de rechazos sugerida:

```sql
CREATE TABLE stg_rechazos (
  id_rechazo BIGINT AUTO_INCREMENT PRIMARY KEY,
  lote_id VARCHAR(40) NOT NULL,
  entidad VARCHAR(40) NOT NULL,
  archivo_origen VARCHAR(255) NOT NULL,
  fila_origen BIGINT NULL,
  campo VARCHAR(80) NULL,
  valor_recibido TEXT NULL,
  codigo VARCHAR(20) NOT NULL,
  detalle VARCHAR(500) NOT NULL,
  severidad ENUM('BLOQUEANTE','ADVERTENCIA') NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_rechazos_lote (lote_id),
  INDEX idx_rechazos_codigo (codigo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

| Código | Regla | Ejemplo | Severidad |
|---|---|---|---|
| `E-NULL` | Campo obligatorio vacío o nulo | `clientes.email` vacío | BLOQUEANTE |
| `E-DUP` | Clave natural duplicada | Dos productos con la misma referencia | BLOQUEANTE |
| `E-FK` | Referencia inexistente | Pedido con cliente que no existe | BLOQUEANTE |
| `E-TYPE` | Tipo o formato inválido | Fecha `31/02/2026`, email sin `@` | BLOQUEANTE |
| `E-RANGE` | Valor fuera de rango | Precio negativo, stock negativo, metros ≤ 0 | BLOQUEANTE |
| `E-ENCODING` | Texto no convertible a UTF-8 | Caracteres de control o mojibake | BLOQUEANTE |
| `E-TOTAL` | Total de pedido no coincide con detalle | `total_pedido` ≠ suma de subtotales | BLOQUEANTE |
| `E-PASSWORD` | Hash no reconocido o clave plana no autorizada | Texto plano sin política de reset | BLOQUEANTE |
| `W-TRUNC` | Valor más largo que la columna destino | Dirección de 180 caracteres para `VARCHAR(150)` | ADVERTENCIA |
| `W-OPTIONAL` | Dato opcional ausente | `foto_url` nulo | ADVERTENCIA |

**Criterio de aceptación del staging:** 0 rechazos bloqueantes, 100 % de las filas obligatorias presentes, 0 duplicados en claves naturales, 0 huérfanos y diferencias monetarias ≤ 0,01. Las advertencias se revisan y se documentan; no se ocultan.

**Datos personales:** staging se trata como producción: acceso restringido, cifrado en reposo si es posible, retención limitada y borrado al cerrar la migración. No se copian datos reales a equipos personales.

### 2.6 Validaciones y conciliación obligatorias

#### 2.6.1 Conteo de registros

Se compara origen, staging y destino por tabla. La diferencia debe ser 0 para tablas completas; si se migra un subconjunto, se documenta el filtro y la diferencia esperada.

```sql
SELECT 'clientes' AS tabla, COUNT(*) AS filas FROM clientes
UNION ALL SELECT 'usuarios', COUNT(*) FROM usuarios
UNION ALL SELECT 'productos', COUNT(*) FROM productos
UNION ALL SELECT 'pedidos', COUNT(*) FROM pedidos
UNION ALL SELECT 'detalle_pedido', COUNT(*) FROM detalle_pedido
UNION ALL SELECT 'pagos', COUNT(*) FROM pagos
UNION ALL SELECT 'citas', COUNT(*) FROM citas;
```

Evidencia: tabla `origen | staging | destino | diferencia | estado`.

#### 2.6.2 Sumatorias de claves

Se comparan importes, stock y cantidades. Para dinero, tolerancia ±0,01; para conteos y stock, diferencia 0.

```sql
SELECT 'total_pedidos' AS metrica, SUM(total_pedido) AS valor FROM pedidos
UNION ALL SELECT 'total_pagos', SUM(monto) FROM pagos
UNION ALL SELECT 'subtotal_detalle', SUM(subtotal_detalle) FROM detalle_pedido
UNION ALL SELECT 'stock_productos', SUM(stock_producto) FROM productos;

-- Conciliación pedido vs. detalle
SELECT p.id_pedido, p.total_pedido, SUM(d.subtotal_detalle) AS calculado
FROM pedidos p
LEFT JOIN detalle_pedido d ON d.id_pedido_d = p.id_pedido
GROUP BY p.id_pedido, p.total_pedido
HAVING ABS(COALESCE(p.total_pedido, 0) - COALESCE(SUM(d.subtotal_detalle), 0)) > 0.01;
```

La consulta debe devolver **0 filas**. Si devuelve filas, se rechazan esos pedidos y se corrige el origen; no se “ajusta” el total a mano sin acta.

#### 2.6.3 Integridad referencial

Se buscan huérfanos con `LEFT JOIN ... WHERE hijo.fk IS NULL`. Deben devolver 0 filas:

```sql
SELECT COUNT(*) AS pedidos_sin_cliente
FROM pedidos p LEFT JOIN clientes c ON c.id_cliente = p.id_cliente_pe
WHERE p.id_cliente_pe IS NOT NULL AND c.id_cliente IS NULL;

SELECT COUNT(*) AS detalle_sin_pedido
FROM detalle_pedido d LEFT JOIN pedidos p ON p.id_pedido = d.id_pedido_d
WHERE d.id_pedido_d IS NOT NULL AND p.id_pedido IS NULL;

SELECT COUNT(*) AS detalle_sin_producto
FROM detalle_pedido d LEFT JOIN productos pr ON pr.id_producto = d.id_producto_d
WHERE d.id_producto_d IS NOT NULL AND pr.id_producto IS NULL;

SELECT COUNT(*) AS pagos_sin_pedido
FROM pagos pg LEFT JOIN pedidos p ON p.id_pedido = pg.id_pedido
WHERE pg.id_pedido IS NOT NULL AND p.id_pedido IS NULL;

SELECT COUNT(*) AS citas_sin_cliente
FROM citas c LEFT JOIN clientes cl ON cl.id_cliente = c.id_cliente
WHERE cl.id_cliente IS NULL;
```

También se valida que las tablas hijas no tengan FKs nulas donde el modelo exige `NOT NULL` y que no existan IDs duplicados en claves primarias.

#### 2.6.4 Muestras aleatorias y comparación de huellas

Se seleccionan al menos 30 registros o el 5 % de cada tabla (lo mayor) y se comparan campo por campo entre origen, staging y destino. Para cada registro se calcula una huella canónica:

```sql
SELECT SHA2(CONCAT_WS('|',
  id_cliente, TRIM(email), TRIM(first_name), TRIM(last_name),
  COALESCE(documento_cliente, ''), COALESCE(telefono_cliente, '')
), 256) AS huella
FROM clientes
ORDER BY RAND()
LIMIT 30;
```

La misma consulta se ejecuta en origen y destino; las huellas deben coincidir. Para tablas grandes se usa muestreo determinista por rango de ID (`WHERE id % 100 = 0`) para que la muestra sea reproducible. Para MinIO se comparan `object_key`, tamaño y SHA-256 de una muestra de objetos.

**Acta de conciliación:** se guarda `docs/evidencias/migracion-YYYYMMDD.md` con consultas, resultados, diferencias, responsables y decisión `GO/NO-GO`. Sin acta firmada no hay corte a producción.

### 2.7 Procedimiento de ejecución y ventana de migración

| Fase | Actividad | Responsable | Criterio de salida |
|---|---|---|---|
| T-7 días | Congelar diccionario y medir volúmenes | DBA / dueño del dato | Volumen y alcance aprobados |
| T-3 días | Ensayo completo en staging | Backend / DBA | 4 validaciones en verde |
| T-1 día | Respaldo completo y prueba de restauración | DevOps | SHA-256 y conteos verificados |
| T-0 | Congelar escrituras y ejecutar migración | DBA | Lote promovido o rollback |
| T+0 | Validar salud, login, catálogo, pedido y pago | QA / negocio | Smoke test aprobado |
| T+1 | Monitoreo reforzado y conciliación | DevOps | Sin incidentes críticos |

**Congelamiento de escrituras:** se activa modo mantenimiento o se pone la API en solo lectura. No se permite “migrar mientras se vende” en v0. La ventana se anuncia con antelación y se registra en el calendario de cambios.

### 2.8 Procedimiento de rollback

El rollback se activa si falla una validación bloqueante, si el smoke test no pasa o si se detecta corrupción. **No se improvisa**: se ejecuta este orden.

1. **Declarar el incidente** `MIGRATION_FAILED`, activar modo mantenimiento y detener escrituras de la API.
2. **Preservar evidencia:** logs, `stg_rechazos`, acta de conciliación, salida de Alembic y estado de contenedores. No borrar la base fallida antes de capturar evidencia.
3. **Verificar el respaldo previo:** comprobar que existe, que `gzip -t` pasa y que el SHA-256 coincide con el archivo `.sha256`.
4. **Restaurar en una base nueva** `neodomus_rollback` (nunca sobrescribir producción durante la validación). Crear la base y usuario con credenciales de administración, sin imprimir secretos.
5. **Validar la restauración:** conteos, sumatorias, FKs y una muestra de 30 registros contra el acta previa.
6. **Cambiar la referencia de la aplicación** a `neodomus_rollback` mediante `DATABASE_URL`/`.env` y reiniciar API y workers. No cambiar código si el problema es de datos.
7. **Restaurar objetos MinIO** desde el espejo o respaldo, verificar conteo y checksums, y comprobar que las URL de MySQL apuntan a objetos existentes.
8. **Reabrir tráfico** solo tras healthcheck, login, catálogo, pedido y pago de prueba. Documentar causa raíz, tiempo de indisponibilidad y acciones correctivas.

Comandos de referencia (placeholders, sin credenciales reales):

```bash
export MYSQL_PWD="${MYSQL_PASSWORD}"
export BACKUP_FILE="/ruta/segura/neodomus_YYYYMMDD_HHMMSS.sql.gz"

gzip -t "${BACKUP_FILE}"
sha256sum -c "${BACKUP_FILE}.sha256"

# La base destino debe existir y estar vacía; usar un usuario administrador.
gunzip -c "${BACKUP_FILE}" | mysql \
  --host=127.0.0.1 --port=3307 \
  --user="${MYSQL_USER}" neodomus_rollback

mysql --host=127.0.0.1 --port=3307 --user="${MYSQL_USER}" \
  -e "SELECT COUNT(*) FROM neodomus_rollback.pedidos;"
```

> **Prohibido:** usar `alembic downgrade` como primer recurso, borrar `alembic_version`, ejecutar `DROP DATABASE` sin respaldo verificado o restaurar directamente sobre la base en producción. El rollback por backup es el camino seguro.

### 2.9 Matriz de riesgos de la migración

| ID | Riesgo | Probabilidad | Impacto | Mitigación | Responsable |
|---|---|---|---|---|---|
| M-01 | Pérdida o corrupción de datos durante la carga | Media | Alto | Respaldo verificado, staging, transacciones por lote y rollback probado | DBA |
| M-02 | Duplicados en emails, documentos o referencias | Alta | Medio | Claves únicas, normalización y reporte `E-DUP` antes de promover | Backend |
| M-03 | Huérfanos por orden de carga incorrecto | Media | Alto | Carga padre→hijo y consultas anti-join obligatorias | DBA |
| M-04 | Totales de pedidos inconsistentes | Media | Alto | Recalcular desde detalle y tolerancia ±0,01; rechazar diferencias | Backend |
| M-05 | Caracteres corruptos o pérdida de tildes | Media | Medio | UTF-8/utf8mb4, prueba con datos acentuados y rechazo `E-ENCODING` | DBA |
| M-06 | Desfase de esquema (ej. `0057` vs `0060`) | Media | Alto | Incluir todas las migraciones, `alembic current/heads` y backup previo | DevOps |
| M-07 | Indisponibilidad mayor a la ventana | Media | Alto | Ensayo cronometrado, modo mantenimiento y rollback en < 4 h | DevOps |
| M-08 | Exposición de datos personales en staging | Baja | Alto | Acceso restringido, cifrado, retención corta y borrado posterior | Seguridad |
| M-09 | Objetos MinIO faltantes o URL rotas | Media | Medio | `mc mirror`, conteo, checksums y validación de URL | Backend |
| M-10 | Error humano en el corte | Media | Alto | Checklist, doble revisión y ventana con responsables nombrados | Líder técnico |

### 2.10 Criterios de aceptación de la migración

- [ ] `alembic current` coincide con `alembic heads` (`0060` al cierre de esta semana).
- [ ] Existe respaldo previo con `gzip -t` y SHA-256 verificados.
- [ ] Staging tiene 0 rechazos bloqueantes y las advertencias están justificadas.
- [ ] Las cuatro validaciones (conteo, sumatorias, FKs y muestras) están en verde.
- [ ] El acta de conciliación está firmada por DBA, backend y negocio.
- [ ] El rollback fue ensayado y cronometrado en un entorno aislado.
- [ ] Los objetos MinIO críticos existen y sus checksums coinciden.
- [ ] El smoke test de login, catálogo, pedido, pago y cita pasa en staging.

---

## 3. Plan de Respaldo v0

### 3.1 Objetivo y alcance

Definir cómo se protege la base MySQL y los objetos de MinIO, cuánto dato se puede perder como máximo (RPO), cuánto tarda la recuperación (RTO), dónde viven las copias y cómo se prueba que sirven. El alcance v0 cubre el entorno Docker de Neodomus y el script `scripts/respaldar.sh`.

| Elemento | Respaldo v0 | Observación |
|---|---|---|
| MySQL `neodomus` | `mysqldump` comprimido con gzip + SHA-256 | Copia lógica consistente con `--single-transaction` |
| MinIO `neodomus-media` | Espejo de objetos con `mc mirror` | No se incluye en el `.sql.gz`; se respalda por separado |
| Configuración | `.env` fuera del repositorio; secretos en gestor | No se guardan credenciales en el respaldo |
| Código y migraciones | Git + imagen Docker versionada | Reproducible por commit/tag |
| Logs | Rotación local; no son fuente de verdad | Se conservan solo para auditoría |

### 3.2 RPO y RTO: definición y justificación

| Métrica | v0 | Objetivo recomendado para producción | Justificación |
|---|---|---|---|
| **RPO** | **24 horas** | **15 minutos** con binlogs | v0 ejecuta un respaldo completo diario. Para pedidos y pagos, 24 h de pérdida es demasiado; con `log_bin` y envío de binlogs cada 15 min se puede hacer point-in-time recovery. |
| **RTO** | **4 horas** | **2 horas** | El RTO v0 incluye detectar el incidente, aprovisionar MySQL limpio, restaurar el dump, restaurar MinIO, arrancar la pila y validar. Sin alta disponibilidad ni host de repuesto, 4 h es realista; con runbook automatizado y host preconstruido se puede bajar a 2 h. |

**Justificación técnica del RPO:** Neodomus es una aplicación transaccional pequeña (referencia: ~1.000 productos, 500 usuarios y 1.000 pedidos), con MySQL InnoDB. Un dump diario es suficiente para el laboratorio, pero no para producción: una caída a las 23:00 perdería casi un día de pedidos y pagos. Por eso el objetivo de producción es 15 minutos usando binlogs; el script v0 no reemplaza esa capacidad, la complementa.

**Justificación técnica del RTO:** la recuperación es manual y depende de provisionar un MySQL limpio, importar el dump, restaurar objetos y validar. El tiempo se mide en el ensayo de la sección 3.7. Si el negocio exige menos de 4 h, se necesita un standby, replicación o un servicio gestionado; no se promete HA con un solo host.

**Fórmula de verificación:** `RTO real = t_fin_servicio - t_inicio_incidente`; `RPO real = t_último_cambio_recuperado - t_último_cambio_comprometido`. Ambos se registran en cada simulacro.

### 3.3 Estrategia 3-2-1

| Copia | Medio | Ubicación | Contenido | Retención | Protección |
|---|---|---|---|---|---|
| 1 | SSD/NVMe local | `/var/backups/neodomus` o volumen dedicado | Dump diario + checksum | 7 días | Permisos 600/700, disco separado del volumen MySQL si es posible |
| 2 | Almacenamiento de objetos/S3 | Región distinta o bucket externo | Dump cifrado + copia semanal | 4 semanas | Cifrado en tránsito y en reposo, versionado |
| 3 | Copia offline/inmutable | Disco externo rotado o bucket con Object Lock | Dump mensual + MinIO | 12 meses | Fuera de sitio, acceso restringido, prueba de lectura |

**Regla 3-2-1 aplicada:** 3 copias (producción + local + remota/offline), 2 medios distintos (SSD local y object storage), 1 copia fuera de la instalación. La copia offline no debe estar montada permanentemente en el servidor.

**MinIO:** se replica con `mc mirror` hacia un bucket externo. Los objetos se versionan y se conserva el `ETag`/SHA-256. La base MySQL guarda rutas; si se restaura MySQL sin MinIO, las URL quedan rotas. Por eso el respaldo es **conjunto**.

### 3.4 Política de retención

| Tipo | Frecuencia | Retención | Implementación v0 |
|---|---|---|---|
| Diario | 02:00 UTC | 7 días | `scripts/respaldar.sh` con `RETENTION_DAYS=7` |
| Semanal | Domingo 02:30 UTC | 4 semanas | Ejecutar con `BACKUP_DIR=/var/backups/neodomus/semanal` y retención 28 días, o lifecycle del bucket |
| Mensual | Día 1, 03:00 UTC | 12 meses | `BACKUP_DIR=/var/backups/neodomus/mensual`, retención 365 días, o lifecycle |
| Binlogs | Continuo | 14 días | `binlog_expire_logs_seconds=1209600` y envío externo |
| MinIO diario | 03:30 UTC | 30 días | `mc mirror` + versionado/lifecycle |
| MinIO mensual | Día 1 | 12 meses | Copia offline o bucket con Object Lock |

**Regla de oro:** la retención nunca debe eliminar la última copia buena. El script crea y verifica el respaldo nuevo antes de purgar los antiguos. La purga se registra en el log.

### 3.5 Programación y automatización

```bash
# crontab -e (ejecutar como usuario con acceso a Docker y al directorio de respaldos)
0 2 * * * cd /opt/neodomus && ./scripts/respaldar.sh >> /var/log/neodomus/backup.log 2>&1

# Copia semanal al almacenamiento externo (ejemplo con rclone; no incluir secretos en el comando)
30 2 * * 0 rclone copy /var/backups/neodomus remote:neodomus-backups --include "neodomus_*.sql.gz*" --log-file /var/log/neodomus/rclone.log

# MinIO diario (el alias se configura una vez con variables de entorno)
30 3 * * * mc mirror --overwrite --remove local/neodomus-media remote/neodomus-media >> /var/log/neodomus/minio-backup.log 2>&1
```

**Buenas prácticas de cron:** usar rutas absolutas, `flock` o un lock para evitar solapamientos, `umask 077`, logs con rotación y alerta si el comando termina con código ≠ 0. El script ya devuelve `exit 0`/`exit 1` y limpia archivos temporales.

**Cifrado:** si el respaldo sale del host, cifrarlo con `age` o GPG antes de subirlo. Guardar la clave privada fuera del servidor. El script no cifra por sí solo para no acoplar la solución a una herramienta; el pipeline debe hacerlo antes del envío remoto.

### 3.6 Uso del script `scripts/respaldar.sh`

```bash
# 1. Crear .env a partir de .env.example y completar credenciales (nunca subir .env)
cp .env.example .env
chmod 600 .env

# 2. Respaldo automático: usa el contenedor neodomus_mysql si está arriba; si no, mysqldump local
./scripts/respaldar.sh

# 3. Forzar modo local contra el puerto publicado por Docker
BACKUP_MODE=local MYSQL_HOST=127.0.0.1 MYSQL_PORT=3307 ./scripts/respaldar.sh

# 4. Cambiar destino y retención
BACKUP_DIR=/var/backups/neodomus RETENTION_DAYS=14 ./scripts/respaldar.sh

# 5. Incluir rutinas/eventos solo si el usuario tiene privilegios
DUMP_ROUTINES=true ./scripts/respaldar.sh
```

El script:

- lee `.env` sin ejecutarlo y solo carga variables de la lista blanca;
- usa `MYSQL_PWD` (no `-p`) para no exponer la clave en la línea de comandos;
- ejecuta `mysqldump --single-transaction --quick --triggers --no-tablespaces --set-gtid-purged=OFF`;
- comprime con `gzip -9`, verifica `gzip -t`, tamaño > 0 y SHA-256;
- crea `archivo.sql.gz` y `archivo.sql.gz.sha256` con permisos 600;
- aplica retención y muestra un resumen con ruta, tamaño, hash, modo y estado;
- si falla, elimina el archivo temporal/incompleto y sale con código 1.

**Verificación manual:**

```bash
cd /var/backups/neodomus
sha256sum -c neodomus_YYYYMMDD_HHMMSS.sql.gz.sha256
gzip -t neodomus_YYYYMMDD_HHMMSS.sql.gz
```

### 3.7 Procedimiento de restauración en 8 pasos

1. **Declarar el incidente y congelar escrituras.** Activar modo mantenimiento, detener la API/workers y registrar hora de inicio. No permitir nuevos pedidos ni pagos.
2. **Seleccionar el respaldo y verificarlo.** Elegir el último `neodomus_*.sql.gz` cuyo `sha256sum -c` y `gzip -t` pasen. Si el último falla, probar el anterior; nunca restaurar un archivo no verificado.
3. **Aprovisionar MySQL limpio.** Crear un contenedor/base nueva con la misma versión mayor (MySQL 8.0/8.4) y red interna. No reutilizar el volumen dañado.
4. **Crear base y usuario de restauración.** Crear `neodomus_restore` con `utf8mb4`; usar un usuario administrador solo para la restauración. Mantener `MYSQL_PWD` en el entorno.
5. **Restaurar el dump.** `gunzip -c backup.sql.gz | mysql ... neodomus_restore`. El dump incluye tablas y datos; no incluye `CREATE DATABASE`, por eso la base se crea antes.
6. **Restaurar MinIO.** `mc mirror` desde la copia externa al bucket `neodomus-media`; verificar conteo, tamaño y checksums de una muestra. Sin objetos, las imágenes y evidencias quedan rotas.
7. **Apuntar la aplicación a la base restaurada.** Actualizar `DATABASE_URL`/`.env`, ejecutar `alembic current` (debe ser `0060`) y `alembic upgrade head` (no debe haber pasos pendientes), arrancar API y frontend.
8. **Validar y reabrir.** Ejecutar healthcheck, login, catálogo, pedido, pago, cita y descarga de una imagen; comparar conteos/sumatorias; medir RTO; documentar y reabrir tráfico.

Comandos de referencia:

```bash
# Verificar el archivo antes de tocar la base
gzip -t "${BACKUP_FILE}"
sha256sum -c "${BACKUP_FILE}.sha256"

# Crear base limpia (usar credenciales administrativas fuera del historial)
mysql --host=127.0.0.1 --port=3307 --user="${MYSQL_ADMIN_USER}" \
  -e "CREATE DATABASE neodomus_restore CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

# Restaurar
gunzip -c "${BACKUP_FILE}" | mysql \
  --host=127.0.0.1 --port=3307 --user="${MYSQL_USER}" neodomus_restore

# Verificar
mysql --host=127.0.0.1 --port=3307 --user="${MYSQL_USER}" \
  -e "SELECT COUNT(*) AS pedidos FROM neodomus_restore.pedidos;"
```

**Regla:** restaurar primero en una base nueva y validar; solo después cambiar el tráfico. Nunca restaurar directamente sobre producción “para ahorrar tiempo”.

### 3.8 Evidencia de restauración real

Prueba ejecutada en un **entorno aislado con datos sintéticos** (no producción), usando MySQL 8.0 en Docker y el script `scripts/respaldar.sh`. Fecha: 20/10/2026.

| Dato | Valor |
|---|---|
| Archivo | `neodomus_20261020_213347.sql.gz` |
| Tamaño | 2.044 bytes (4,0 KiB) |
| SHA-256 | `d5994398315fe1fc24cc14b4a738dc5dfffdf07f6e60c28f0f351e35cc352d3c` |
| `gzip -t` | OK |
| `sha256sum -c` | OK |
| Filas totales restauradas | 23 |

| Tabla | Antes (origen) | Después (restauración) | Diferencia | Estado |
|---|---:|---:|---:|---|
| `clientes` | 3 | 3 | 0 | ✅ |
| `usuarios` | 2 | 2 | 0 | ✅ |
| `productos` | 4 | 4 | 0 | ✅ |
| `pedidos` | 3 | 3 | 0 | ✅ |
| `detalle_pedido` | 5 | 5 | 0 | ✅ |
| `pagos` | 3 | 3 | 0 | ✅ |
| `citas` | 2 | 2 | 0 | ✅ |
| `novedades` | 1 | 1 | 0 | ✅ |

| Sumatoria | Antes | Después | Diferencia |
|---|---:|---:|---:|
| `SUM(pedidos.total_pedido)` | 571.000,00 | 571.000,00 | 0,00 |
| `SUM(pagos.monto)` | 571.000,00 | 571.000,00 | 0,00 |
| `SUM(productos.stock_producto)` | 177,75 | 177,75 | 0,00 |

También se probó el modo Docker con el archivo `neodomus_20261020_213649.sql.gz` (2.041 bytes, SHA-256 `53ef5a70fc76205fc79fa43df8b57665dd00701af413b6c22e246816a036b14f`), verificado con `sha256sum -c`. La retención eliminó correctamente un par de archivos simulados con 10 días de antigüedad usando `RETENTION_DAYS=7`.

**Conclusión de la prueba:** el respaldo es restaurable, los conteos y sumatorias coinciden y el checksum detecta alteraciones. La prueba se repite mensualmente en un entorno aislado y se registra en `docs/evidencias/`.

### 3.9 Verificación, alertas y mantenimiento

| Actividad | Frecuencia | Criterio |
|---|---|---|
| Respaldo automático | Diario | Código 0, archivo > 0, checksum generado |
| Verificación de checksum | Diaria | `sha256sum -c` OK |
| Restauración de prueba | Mensual | Conteos/sumatorias OK y RTO medido |
| Simulacro de desastre | Trimestral | RTO ≤ 4 h y RPO ≤ 24 h (v0) |
| Revisión de retención | Mensual | No se borró la última copia buena |
| Prueba de MinIO | Mensual | Objetos críticos recuperables |
| Rotación de credenciales | Semestral o por incidente | Sin credenciales en logs/repositorio |

**Alertas mínimas:** fallo del script, archivo de tamaño anómalo, checksum inválido, retención que borra demasiados archivos, disco > 80 %, y ausencia de respaldo en 26 h. Enviar a correo/chat del responsable y registrar en el runbook.

### 3.10 Criterios de aceptación del respaldo v0

- [ ] El script pasa `shellcheck` y `bash -n`.
- [ ] Funciona en modo Docker y local, sin imprimir la contraseña.
- [ ] Genera `.sql.gz` + `.sha256` y verifica `gzip -t`.
- [ ] La política de retención elimina solo archivos antiguos y conserva el nuevo.
- [ ] La restauración en base limpia coincide en conteos y sumatorias.
- [ ] MinIO tiene copia separada y se probó al menos un objeto.
- [ ] Existe un runbook con RPO/RTO y responsables.
- [ ] La prueba mensual está agendada y tiene evidencia.

---

## 4. Nota de alcance

La **Sección 4** (operación, monitoreo, capacidad y pruebas de carga) no forma parte de la Semana 2. Se conserva la numeración solicitada para la **Sección 5** y se completará en el siguiente entregable. Las secciones 2, 3 y 5 de este documento sí están completas y son ejecutables.

---

## 5. Plan de Instalación v0

> **Objetivo:** que una persona distinta al equipo de desarrollo pueda desplegar Neodomus desde cero en un servidor Linux, con Docker, MySQL, MinIO, API y frontend, y verificar que el sistema quedó operativo. Todos los valores sensibles son marcadores de posición; no se incluyen credenciales reales.

### 5.1 Requisitos previos de software y hardware

| Categoría | Mínimo v0 | Recomendado | Verificación |
|---|---|---|---|
| CPU | 2 vCPU | 4 vCPU | `nproc` |
| RAM | 4 GiB | 8 GiB | `free -h` |
| Disco | 40 GB SSD | 80 GB SSD, RAID 1/10 | `df -h`, `lsblk` |
| SO | Ubuntu Server 24.04 LTS x86_64 | Ubuntu Server 24.04 LTS actualizado | `lsb_release -a` |
| Docker | Docker Engine 27+ | Docker Engine 29.x + Compose v2 | `docker version`, `docker compose version` |
| Utilidades | git, curl, openssl, gzip, sha256sum, rsync | + `mysql-client`, `rclone`, `mc`, `nginx`, `certbot`, `ufw` | `command -v` |
| Node.js (solo build web) | Node.js 22 + pnpm 10 | Node.js 22 LTS + pnpm 10 | `node -v`, `pnpm -v` |
| Red | 1 interfaz, salida a Internet para imágenes | IP fija/VLAN, DNS y certificado TLS | `ip addr`, `dig` |
| Puertos | 80/443 públicos; 8000/5173/3306/9000/9001 internos | Solo 80/443 expuestos; el resto en `127.0.0.1` o VPN | `ss -lntp` |
| Acceso | Usuario con `sudo` y SSH por clave | MFA en el proveedor, backup de llaves y acceso break-glass | `ssh -i ...` |

**Checklist de preparación del host:**

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y ca-certificates curl git gnupg lsb-release ufw
# Instalar Docker Engine y el plugin Compose según la documentación oficial.
sudo usermod -aG docker "$USER"
newgrp docker
docker run --rm hello-world
```

No se debe continuar si `docker run --rm hello-world` falla, si el disco tiene menos de 20 GB libres o si el host no tiene la hora sincronizada (`timedatectl`).

### 5.2 Clonación y preparación de variables de entorno

```bash
sudo mkdir -p /opt/neodomus
sudo chown "$USER":"$USER" /opt/neodomus
git clone <REPO_URL> /opt/neodomus
cd /opt/neodomus
cp .env.example .env
chmod 600 .env
```

**Generar secretos sin escribirlos en el historial:**

```bash
openssl rand -hex 32   # SECRET_KEY
openssl rand -base64 24 # contraseñas de MySQL/MinIO
```

| Variable | Ejemplo genérico | Obligatoria | Uso |
|---|---|---|---|
| `MYSQL_ROOT_PASSWORD` | `${MYSQL_ROOT_PASSWORD}` | Sí | Administración/restauración; no usar en la app |
| `MYSQL_DATABASE` | `neodomus` | Sí | Nombre de la base |
| `MYSQL_USER` | `neodomus` | Sí | Usuario de la aplicación |
| `MYSQL_PASSWORD` | `${MYSQL_PASSWORD}` | Sí | Contraseña de la app y del respaldo |
| `DATABASE_URL` | `mysql+pymysql://${MYSQL_USER}:${MYSQL_PASSWORD}@db:3306/${MYSQL_DATABASE}?charset=utf8mb4` | Sí | Conexión SQLAlchemy |
| `SECRET_KEY` | `${SECRET_KEY}` | Sí | Firma de tokens JWT |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `60` | No | Duración del access token |
| `REFRESH_TOKEN_EXPIRE_DAYS` | `30` | No | Duración del refresh token |
| `ENVIRONMENT` | `production` | Sí | Modo de ejecución |
| `FRONTEND_URL` | `https://example.test` | Sí | Enlaces de verificación/reset |
| `VITE_API_URL` | `https://example.test/api/v1` | Sí | URL pública de la API |
| `MINIO_ROOT_USER` | `${MINIO_ROOT_USER}` | Sí | Usuario administrador de MinIO |
| `MINIO_ROOT_PASSWORD` | `${MINIO_ROOT_PASSWORD}` | Sí | Contraseña de MinIO |
| `MINIO_ENDPOINT` | `minio:9000` | Sí | Endpoint interno S3 |
| `MINIO_PUBLIC_ENDPOINT` | `https://media.example.test` | Sí | URL pública de objetos |
| `MINIO_BUCKET` | `neodomus-media` | Sí | Bucket de imágenes/evidencias |
| `SMTP_*`, `GOOGLE_*` | `${...}` | Según función | Correo y OAuth; nunca en el repositorio |

**Validación:** `docker compose config --quiet` (no compartir la salida si incluye secretos). Verificar que `.env` esté en `.gitignore` y que `git status` no lo muestre.

### 5.3 Construcción y despliegue de contenedores

```bash
cd /opt/neodomus
docker compose build --pull
docker compose up -d
docker compose ps
```

| Servicio | Imagen/construcción | Puerto host v0 | Nota |
|---|---|---|---|
| `db` | `mysql:8.0` | `3307 → 3306` | Migrar a MySQL 8.4 LTS antes de producción |
| `api` | `be/Dockerfile` (FastAPI + Uvicorn) | `8000` | En v0 monta `./be` y usa `--reload`; no usar así en producción |
| `frontend` | `fe/Dockerfile` (Vite dev server) | `5173` | En producción compilar y servir con Nginx |
| `minio` | `ghcr.io/coollabsio/minio:RELEASE.2025-10-15T17-29-55Z` | `9000`, `9001` | Consola solo en `127.0.0.1`/VPN |
| Nginx/TLS | Nginx 1.28 + Certbot | `80`, `443` | Pendiente de incorporar al compose; ver 5.6 |

**Comandos útiles:**

```bash
docker compose logs -f api
docker compose logs -f db
docker compose restart api
docker compose down          # conserva volúmenes
# NUNCA usar "docker compose down -v" en producción: borra mysql_data y minio_data.
```

**Advertencia v0:** el compose actual conserva valores por defecto débiles para credenciales y publica MySQL/MinIO en todas las interfaces. Antes de producción se deben eliminar esos fallbacks, usar secretos fuertes y limitar los puertos a `127.0.0.1` o a una red de administración.

### 5.4 Inicialización y migración de esquemas de base de datos

**Fuente de verdad:** Alembic en `be/alembic/versions/`. `scripts/init_db.sql` es una referencia/seeds, no sustituye a Alembic. El contenedor `api` ejecuta `alembic upgrade head` al arrancar.

```bash
# Estado actual y cabeza disponible
docker compose exec api uv run alembic current
docker compose exec api uv run alembic heads

# Aplicar migraciones pendientes
docker compose exec api uv run alembic upgrade head

# Verificar la tabla de versión (las variables internas las define el contenedor db)
docker compose exec db sh -c \
  'MYSQL_PWD="$MYSQL_PASSWORD" mysql -u"$MYSQL_USER" -N \
   -e "SELECT version_num FROM alembic_version;" "$MYSQL_DATABASE"'
```

**Resultado esperado al cierre de la Semana 2:** `0060 (head)` en `current` y `heads`, y `0060` en `alembic_version`.

**Incidente resuelto:** el API fallaba con `Can't locate revision identified by '0060'` porque la base estaba en `0060` y la rama solo tenía migraciones hasta `0057`. Se incorporaron `0058`, `0059` y `0060` desde la rama `development`; el API arrancó, `/health` respondió `200` y `alembic current` mostró `0060 (head)`.

**Cómo diagnosticar un desfase:**

```bash
# 1. Confirmar archivos presentes
ls be/alembic/versions/0058_*.py be/alembic/versions/0059_*.py be/alembic/versions/0060_*.py

# 2. Comparar base y repositorio
docker compose exec api uv run alembic current
docker compose exec api uv run alembic heads

# 3. Revisar el historial de la tabla (solo lectura)
docker compose exec db sh -c \
  'MYSQL_PWD="$MYSQL_PASSWORD" mysql -u"$MYSQL_USER" \
   -e "SELECT * FROM alembic_version;" "$MYSQL_DATABASE"'
```

> **No hacer:** borrar `alembic_version`, ejecutar `alembic stamp 0057` o `alembic downgrade` sin respaldo. Si la base tiene datos, primero se respalda con `scripts/respaldar.sh`; si el esquema no coincide, se restaura en una base nueva y se valida.

**Carga inicial (solo entorno limpio):**

```bash
# Usuarios de prueba (idempotente; no usar contraseñas de ejemplo en producción)
docker compose exec api uv run python /app/scripts/seed_test_users.py

# Catálogo real y objetos de MinIO (según disponibilidad de datos)
docker compose exec api uv run python /app/scripts/sembrar_catalogo_real.py
docker compose exec api uv run python /app/scripts/subir_productos_minio.py
```

`init_db.sql` se puede importar en una base vacía como referencia, pero no se debe ejecutar a ciegas sobre una base con datos: primero se revisa el diff y se respalda.

### 5.5 Verificación de estado de servicios y salud del sistema

| Verificación | Comando | Resultado esperado |
|---|---|---|
| Contenedores | `docker compose ps` | `db` healthy; `api`, `frontend`, `minio` Up |
| MySQL | `docker compose exec db sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysqladmin ping -h localhost -u root'` | `mysqld: is alive` |
| API health | `curl -fsS http://127.0.0.1:8000/health` | `{"status":"ok"}` |
| API docs | abrir `http://127.0.0.1:8000/docs` | Swagger UI carga |
| Frontend | abrir `http://127.0.0.1:5173` | Login/catálogo visible |
| MinIO | `mc ready local` | `local` listo |
| Bucket | `mc ls local/neodomus-media` | Bucket existe |
| Alembic | `docker compose exec api uv run alembic current` | `0060 (head)` |
| Logs | `docker compose logs --tail=100 api` | Sin errores repetidos |
| Disco | `df -h /var/lib/docker` | < 80 % de uso |

**Healthcheck reproducido en la Semana 2:** `GET /health` devolvió `200 {"status":"ok"}`. La ruta `/v1/models` no existe en Neodomus; las rutas de negocio están bajo `/api/v1`. Si aparece un `404` por `/v1/models`, revisar la URL del cliente o la sonda externa, no la salud de la API.

**Si el API reinicia en bucle:** revisar `docker compose logs api`, validar `alembic current`, credenciales de MySQL, `SECRET_KEY` y conectividad a `db`/`minio`. No reiniciar en bucle sin leer el primer error.

### 5.6 Configuración de Nginx, TLS y exposición de puertos

En v0 el frontend se sirve con Vite en `5173` y no hay TLS. Para producción se incorpora Nginx como reverse proxy y se sirve el build estático.

```nginx
# /etc/nginx/sites-available/neodomus.conf (ejemplo con dominio genérico)
server {
    listen 80;
    server_name example.test;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name example.test;

    ssl_certificate     /etc/letsencrypt/live/example.test/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/example.test/privkey.pem;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

    root /var/www/neodomus;
    index index.html;

    location /api/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

```bash
# Compilar el frontend y publicarlo como archivos estáticos
cd /opt/neodomus/fe
pnpm install --no-frozen-lockfile
pnpm build
sudo mkdir -p /var/www/neodomus
sudo rsync -a --delete dist/ /var/www/neodomus/

sudo ln -s /etc/nginx/sites-available/neodomus.conf /etc/nginx/sites-enabled/neodomus.conf
sudo nginx -t
sudo systemctl reload nginx

# Certificado (ejemplo; usar un dominio real y correo del responsable)
sudo certbot --nginx -d example.test
```

**Puertos:** publicar solo `80/443`. MySQL (`3307`), MinIO API (`9000`) y consola (`9001`) deben quedar en `127.0.0.1` o en una VPN. El frontend de desarrollo (`5173`) no debe exponerse a Internet.

### 5.7 Seguridad, secretos y hardening

| Control | Acción mínima | Evidencia |
|---|---|---|
| Credenciales | Eliminar defaults del compose; usar `.env` 600 o gestor de secretos | `git grep` sin secretos; `.env` ignorado |
| MySQL | `root` solo local; usuario de app con privilegios mínimos; rotar claves | `SHOW GRANTS` |
| MinIO | Consola en localhost/VPN; bucket privado; credenciales fuertes | `mc admin info` |
| Red | UFW: permitir 22/80/443; denegar el resto | `sudo ufw status` |
| TLS | HTTPS obligatorio, HSTS, renovación automática | `curl -I https://example.test` |
| Contenedores | Imágenes fijadas por digest, usuario no root cuando sea posible | `docker image inspect` |
| Vulnerabilidades | Escaneo con Trivy/Docker Scout antes de desplegar | Reporte sin críticas |
| Logs | No registrar tokens, contraseñas ni datos de tarjeta | Revisión de logs |
| Respaldos | Cifrado fuera del host; acceso restringido | `age`/GPG + permisos |
| Aplicación | CORS con allowlist, cookies seguras, rate limit en login | Prueba en staging |

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp
sudo ufw allow 80,443/tcp
sudo ufw enable
sudo ufw status verbose
```

**Regla de secretos:** si una credencial se filtró en un log, un commit o una captura, se considera comprometida y se rota. No basta con borrar el archivo.

### 5.8 Carga de datos iniciales y objetos MinIO

1. **Crear el bucket** (el alias usa variables de entorno; no escribir la clave en el historial):

```bash
mc alias set local http://127.0.0.1:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD"
mc mb --ignore-existing local/neodomus-media
mc anonymous set none local/neodomus-media
```

2. **Cargar imágenes del catálogo** desde el repositorio o desde el origen aprobado:

```bash
mc mirror --overwrite ./fe/public/productos local/neodomus-media/productos
mc ls --recursive local/neodomus-media | head
```

3. **Cargar datos SQL** con los scripts del proyecto, en este orden: categorías/productos, usuarios/clientes, pedidos/pagos, citas/entregas, novedades. Validar después de cada lote.

4. **Conciliar rutas:** cada `imagen_url`/`foto_url`/`evidencia_url` debe apuntar a un objeto existente. Guardar una tabla de mapeo `url_mysql → object_key → sha256`.

5. **Verificar** conteo de objetos, tamaño total y una muestra de checksums. Si el objeto existe pero la URL está mal, corregir la URL en MySQL y registrar el cambio.

**No** se deben subir objetos con datos personales sin autorización. Las imágenes de evidencias pueden contener personas o direcciones; aplicar la misma política que a la base.

### 5.9 Respaldo, restauración y rollback del despliegue

**Antes de cada despliegue o migración:**

```bash
cd /opt/neodomus
./scripts/respaldar.sh
sha256sum -c "$(ls -1t backups/neodomus_*.sql.gz.sha256 | head -1)"
```

**Rollback de despliegue:**

1. Anunciar mantenimiento y detener tráfico.
2. `docker compose down` (sin `-v`).
3. Restaurar MySQL desde el último respaldo verificado en una base nueva.
4. Restaurar MinIO desde el espejo.
5. Volver a la imagen/commit anterior (`git checkout <TAG>` o imagen anterior).
6. `docker compose up -d`, healthcheck y smoke test.
7. Reabrir tráfico y documentar.

**Rollback de migración:** ver Sección 2.8. No se debe ejecutar `docker compose down -v` ni borrar `mysql_data`/`minio_data` como forma de “limpiar” un despliegue fallido.

### 5.10 Aceptación, evidencias y traspaso a operación

| # | Criterio | Evidencia esperada | Estado |
|---|---|---|---|
| 1 | Contenedores arriba | `docker compose ps` con `db` healthy y servicios Up | ☐ |
| 2 | Esquema al día | `alembic current` = `0060 (head)` | ☐ |
| 3 | API saludable | `GET /health` = `200 {"status":"ok"}` | ☐ |
| 4 | Frontend carga | Login visible en `https://example.test` | ☐ |
| 5 | Login y roles | Cliente, técnico y admin autentican | ☐ |
| 6 | Catálogo | Productos, precios e imágenes visibles | ☐ |
| 7 | Pedido/pago | Flujo de prueba completo sin error | ☐ |
| 8 | MinIO | Bucket y objeto de prueba recuperables | ☐ |
| 9 | Respaldo | `.sql.gz` + `.sha256` verificados | ☐ |
| 10 | Restauración | Conteos/sumatorias coinciden en base limpia | ☐ |
| 11 | TLS | HTTPS válido, HTTP redirige y HSTS presente | ☐ |
| 12 | Seguridad | Puertos internos no expuestos; secretos fuera de Git | ☐ |

**Traspaso:** entregar al responsable de operación el `.env` en gestor de secretos, el runbook de respaldo/restauración, los contactos de escalamiento, el inventario de imágenes/digests y el acta de aceptación. Programar la primera prueba de restauración mensual antes de declarar producción.

**Firma de aceptación (placeholders):**

| Rol | Nombre | Fecha | Firma |
|---|---|---|---|
| Líder técnico | ____________________ | ____/____/______ | __________ |
| DBA / DevOps | ____________________ | ____/____/______ | __________ |
| Responsable de negocio | ____________________ | ____/____/______ | __________ |

---

## Fuentes consultadas

- Canonical. *Ubuntu release cycle*. https://ubuntu.com/about/release-cycle (consultado el 20/10/2026).
- endoflife.date. *Ubuntu 24.04 LTS*. https://endoflife.date/ubuntu (consultado el 20/10/2026).
- endoflife.date. *MySQL lifecycle*. https://endoflife.date/mysql (consultado el 20/10/2026).
- Oracle. *Lifetime Support Policy*. https://www.oracle.com/us/support/library/lifetime-support-technology-069183.pdf
- MinIO. *Licencia AGPL-3.0*. https://github.com/minio/minio/blob/master/LICENSE
- Docker. *Docker Engine license y suscripciones de Docker Desktop*. https://www.docker.com/legal/docker-subscription-service-agreement/
- Node.js. *Releases*. https://nodejs.org/en/about/previous-releases (consultado el 20/10/2026).
- Nginx. *Licencia BSD-2-Clause*. https://nginx.org/LICENSE
- Open Source Initiative. *MIT, BSD-2-Clause, BSD-3-Clause, Apache-2.0*. https://opensource.org/licenses
- Oracle. *MySQL 8.4 Reference Manual: mysqldump*. https://dev.mysql.com/doc/refman/8.4/en/mysqldump.html
- Oracle. *MySQL 8.4 Reference Manual: Backup and Recovery*. https://dev.mysql.com/doc/refman/8.4/en/backup-and-recovery.html
- Oracle. *MySQL 8.4 Reference Manual: Point-in-Time Recovery*. https://dev.mysql.com/doc/refman/8.4/en/point-in-time-recovery.html
- Docker. *Compose file reference*. https://docs.docker.com/compose/compose-file/
- Alembic. *Tutorial y comandos de migración*. https://alembic.sqlalchemy.org/en/latest/tutorial.html
- Nginx. *Reverse proxy y TLS*. https://docs.nginx.com/nginx/admin-guide/web-server/reverse-proxy/
- MinIO. *Client `mc mirror`*. https://min.io/docs/minio/linux/reference/minio-mc/mc-mirror.html
- OWASP. *Secrets Management Cheat Sheet*. https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html
- OWASP. *Database Security Cheat Sheet*. https://cheatsheetseries.owasp.org/cheatsheets/Database_Security_Cheat_Sheet.html

---

> **Fin de las secciones 1, 2, 3 y 5.** La Sección 4 (operación, monitoreo, capacidad y pruebas de carga) se completará en el siguiente entregable. La numeración se conserva para mantener la trazabilidad con el plan de trabajo.
