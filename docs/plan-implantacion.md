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
> **Entregable:** Semana 1 — Ficha Técnica y Matriz de Requisitos
> **Versión:** 1.0
> **Fecha:** 20/10/2026
> **Informe ejecutivo asociado:** [`docs/informe-semana-1.md`](informe-semana-1.md)
> **Entorno de referencia:** Ubuntu Server 24.04.5 LTS x86_64 · Docker Engine 29.5.2 · Docker Compose 5.1.4
> **Convención de seguridad:** todas las IP, hosts, usuarios, dominios y credenciales de este documento son genéricos. No se publican datos de producción ni secretos.

---

## 0. Alcance, supuestos y hallazgos de auditoría

### 0.1 Alcance de esta sección

Esta sección cubre exclusivamente la **Semana 1**:

1. Inventario de componentes y licenciamiento.
2. Matriz de requisitos de hardware y dimensionamiento.
3. Preguntas guía justificadas: sistema operativo, infraestructura on-premise y licencias.
4. Evidencia de ejecución del script `scripts/verificar-requisitos.sh`.

Las secciones de instalación, despliegue, operación y plan de pruebas se documentan en entregables posteriores.

### 0.2 Stack real auditado

El repositorio de Neodomus **no usa Node.js/Express como backend ni MongoDB como base de datos**. El stack real es FastAPI (Python 3.12) + MySQL 8.0 + MinIO, con frontend React/Vite y aplicación móvil Expo/React Native. Node.js solo participa como runtime de build del frontend. Se documenta el stack real para que la ficha sea verificable contra el código y no contra una descripción genérica.

| Capa | Tecnología real | Puerto host | Estado en el repositorio |
|---|---|---|---|
| Frontend web | React 18.3.1 + Vite 5.4.21 | `5173` | `docker-compose.yml` servicio `frontend` |
| Backend API | FastAPI 0.115.0 + Uvicorn 0.30.0 (Python 3.12.15) | `8000` | `docker-compose.yml` servicio `api` |
| Base de datos | MySQL 8.0.46 | `3307` → `3306` interno | `docker-compose.yml` servicio `db` |
| Almacenamiento de objetos | MinIO Server `RELEASE.2025-09-07T16-13-09Z` | `9000` API S3 · `9001` consola | `docker-compose.yml` servicio `minio` |
| Aplicación móvil | Expo SDK 57.0.22 + React Native 0.86.3 | Metro `8081` (desarrollo) | `movil/` |
| Proxy / TLS | Nginx 1.28.0 (propuesto) | `80` / `443` | **Pendiente de incorporar** |
| Base de datos documental | MongoDB | No aplica | **No forma parte del stack** |

> **Puertos del stack:** no se comprueban `3000` ni `27017` porque no corresponden a este repositorio. El backend escucha en `8000`, la base de datos real es MySQL en `3307` y no hay MongoDB. Por eso el script valida `80`, `443`, `5173`, `8000`, `3306`, `3307`, `9000` y `9001`.

> **Nota de auditoría:** el `README.md` todavía describe la app móvil como Expo SDK 54.0.37 / React Native 0.81.5. El manifiesto `movil/package.json` ya declara Expo 57.0.22 / React Native 0.86.3; esta ficha usa el manifiesto como fuente de verdad y deja la actualización del README para la Semana 2.

### 0.3 Hallazgos que condicionan la implantación

| ID | Hallazgo | Riesgo | Acción obligatoria antes de producción |
|---|---|---|---|
| H-01 | MySQL 8.0 alcanzó el fin de su soporte extendido el **30/04/2026**. La imagen `mysql:8.0` resuelve a 8.0.46. | Alto: sin parches de seguridad de Oracle | Migrar a **MySQL 8.4.13 LTS** y probar compatibilidad con Alembic/SQLAlchemy |
| H-02 | Imágenes con etiquetas flotantes: `mysql:8.0`, `elestio/minio:latest`, `node:22-alpine`, `python:3.12-slim`. | Medio: despliegues no reproducibles | Fijar versión + digest SHA-256 y actualizar con PR revisado |
| H-03 | El `docker-compose.yml` actual ejecuta el servidor de desarrollo de Vite en el puerto 5173. | Medio: no es un servidor estático de producción | Compilar `pnpm build` y servir `dist/` con Nginx |
| H-04 | El compose define valores por defecto para credenciales de MySQL y MinIO. | Alto: credenciales débiles si no se configura `.env` | Eliminar los fallbacks, usar secretos y rotar credenciales |
| H-05 | MySQL (3307) y la consola de MinIO (9001) se publican en todas las interfaces. | Medio: exposición innecesaria | Publicar solo en `127.0.0.1` o en una red de administración/VPN |
| H-06 | No existe proxy TLS ni política de backups declarada en el compose. | Alto: tráfico sin cifrar y riesgo de pérdida de datos | Añadir Nginx + Let's Encrypt y backups 3-2-1 probados |
| H-07 | MinIO se consume desde una imagen de terceros (`elestio/minio`). | Medio: cadena de suministro | Usar la imagen oficial `minio/minio` fijada por digest, o un espejo interno escaneado |

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
| Almacenamiento de objetos | MinIO Server | `RELEASE.2025-09-07T16-13-09Z` | Almacenamiento S3 | AGPL-3.0-only | Imagen actual `elestio/minio`; fijar imagen oficial |
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
   image: minio/minio:RELEASE.2025-09-07T16-13-09Z@sha256:<DIGEST>
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

---

> **Fin de la Sección 1.** Las secciones 2 a 5 (instalación, configuración, operación y pruebas) se completarán en las siguientes semanas.
