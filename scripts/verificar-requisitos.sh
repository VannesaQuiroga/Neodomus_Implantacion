#!/usr/bin/env bash
# NEODOMUS — Verificación de requisitos mínimos de hardware y software.
#
# PARA QUÉ SIRVE:
#   Antes de instalar NEODOMUS en un servidor Linux, este script responde
#   "CUMPLE / NO CUMPLE" por cada requisito de la matriz de la ficha técnica
#   (docs/plan-implantacion.md, sección 1.5). Es la evidencia práctica del
#   criterio CE-2 de la Semana 1 del bootcamp.
#
# USO:
#   bash scripts/verificar-requisitos.sh
#   MIN_RAM_MB=4096 bash scripts/verificar-requisitos.sh   # cambiar un umbral
#
# Se debe ejecutar desde la RAÍZ del repositorio (donde está docker-compose.yml
# y .env) para que los chequeos propios de NEODOMUS puedan validar el proyecto.
#
# Sale con código 0 si todo cumple y 1 si algún requisito falla.
# Umbrales por defecto = mínimos de la matriz de requisitos de NEODOMUS.

set -u

# ── Umbrales (sobreescribibles por variables de entorno) ─────────────────────
MIN_CPUS="${MIN_CPUS:-2}"
MIN_RAM_MB="${MIN_RAM_MB:-2048}"
MIN_DISK_GB="${MIN_DISK_GB:-20}"
DISK_PATH="${DISK_PATH:-/}"
OS_ID="${OS_ID:-ubuntu}"
MIN_OS_VERSION="${MIN_OS_VERSION:-22.04}"
ARCHS="${ARCHS:-x86_64 aarch64}"
MIN_DOCKER_VERSION="${MIN_DOCKER_VERSION:-24.0}"
MIN_COMPOSE_VERSION="${MIN_COMPOSE_VERSION:-2.0.0}"
# Puertos que NEODOMUS necesita mapear en el anfitrión (docker-compose.yml)
PORTS="${PORTS:-3307 8000 9000 9001 5173}"

fallos=0

resultado() { # $1 requisito, $2 esperado, $3 encontrado, $4 0=cumple
  local estado="CUMPLE"
  if [ "$4" -ne 0 ]; then estado="NO CUMPLE"; fallos=$((fallos + 1)); fi
  printf "%-24s %-30s %-24s %s\n" "$1" "$2" "$3" "$estado"
}

# version_ge A B -> verdadero si A >= B (compara versiones tipo 24.04 o 27.3.1)
version_ge() { [ "$(printf '%s\n%s\n' "$2" "$1" | sort -V | head -n1)" = "$2" ]; }

printf "%-24s %-30s %-24s %s\n" "REQUISITO" "ESPERADO" "ENCONTRADO" "ESTADO"
printf '%.0s-' {1..92}; echo

# ── Requisitos de plataforma (base) ──────────────────────────────────────────

cpus=$(nproc)
[ "$cpus" -ge "$MIN_CPUS" ]; resultado "Procesadores" ">= $MIN_CPUS" "$cpus" $?

ram_mb=$(awk '/MemTotal/ {print int($2 / 1024)}' /proc/meminfo)
[ "$ram_mb" -ge "$MIN_RAM_MB" ]; resultado "RAM (MB)" ">= $MIN_RAM_MB" "$ram_mb" $?

disk_gb=$(df -BG --output=avail "$DISK_PATH" | tail -n1 | tr -dc '0-9')
[ "$disk_gb" -ge "$MIN_DISK_GB" ]; resultado "Disco libre (GB)" ">= $MIN_DISK_GB en $DISK_PATH" "$disk_gb" $?

arch=$(uname -m)
[[ " $ARCHS " == *" $arch "* ]]; resultado "Arquitectura" "$ARCHS" "$arch" $?

# shellcheck disable=SC1091
os_id=$(. /etc/os-release && echo "$ID")
os_version=$(. /etc/os-release && echo "${VERSION_ID:-0}")
[ "$os_id" = "$OS_ID" ] && version_ge "$os_version" "$MIN_OS_VERSION"
resultado "Sistema operativo" "$OS_ID >= $MIN_OS_VERSION" "$os_id $os_version" $?

if command -v docker >/dev/null 2>&1; then
  docker_version=$(docker version --format '{{.Server.Version}}' 2>/dev/null \
    || docker --version | grep -oE '[0-9]+\.[0-9]+(\.[0-9]+)?' | head -n1)
  version_ge "$docker_version" "$MIN_DOCKER_VERSION"
  resultado "Docker Engine" ">= $MIN_DOCKER_VERSION" "$docker_version" $?
else
  resultado "Docker Engine" ">= $MIN_DOCKER_VERSION" "no instalado" 1
fi

# ── CHEQUEOS PROPIOS NEODOMUS ────────────────────────────────────────────────
# (la práctica 02 exige al menos un chequeo propio del proyecto real)

# 1) Docker Compose v2 (el stack se orquesta con `docker compose`)
if docker compose version >/dev/null 2>&1; then
  compose_version=$(docker compose version --short 2>/dev/null | tr -d 'v')
  version_ge "$compose_version" "$MIN_COMPOSE_VERSION"
  resultado "Docker Compose" ">= v$MIN_COMPOSE_VERSION" "v$compose_version" $?
else
  resultado "Docker Compose" ">= v$MIN_COMPOSE_VERSION" "no instalado" 1
fi

# 2) Puertos libres que NEODOMUS publica en el anfitrión
for port in $PORTS; do
  port_hex=$(printf '%04X' "$port")
  if awk 'FNR > 1 && $4 == "0A" {split($2, a, ":"); print a[2]}' /proc/net/tcp /proc/net/tcp6 2>/dev/null \
      | grep -qx "$port_hex"; then
    resultado "Puerto $port (NEODOMUS)" "libre" "en uso" 1
  else
    resultado "Puerto $port (NEODOMUS)" "libre" "libre" 0
  fi
done

# 3) Archivos de configuración del proyecto en el directorio de ejecución
if [ -f docker-compose.yml ]; then
  resultado "docker-compose.yml" "presente en la raíz" "presente" 0
else
  resultado "docker-compose.yml" "presente en la raíz" "no encontrado" 1
fi

# 4) .env con las variables críticas de NEODOMUS no vacías
#    (solo se reporta presencia/ausencia, jamás se imprimen valores)
claves_criticas="MYSQL_ROOT_PASSWORD SECRET_KEY MINIO_ROOT_PASSWORD"
if [ -f .env ]; then
  faltantes=""
  for clave in $claves_criticas; do
    valor=$(grep -E "^${clave}=" .env | head -n1 | cut -d= -f2- | tr -d '[:space:]')
    if [ -z "$valor" ]; then faltantes="$faltantes $clave"; fi
  done
  if [ -z "$faltantes" ]; then
    resultado ".env (claves críticas)" "no vacías: $claves_criticas" "todas presentes" 0
  else
    resultado ".env (claves críticas)" "no vacías: $claves_criticas" "vacías:$faltantes" 1
  fi
else
  resultado ".env (claves críticas)" "archivo .env presente" "no encontrado" 1
fi

echo
if [ "$fallos" -eq 0 ]; then
  echo "RESULTADO: el servidor cumple todos los requisitos mínimos de NEODOMUS."
else
  echo "RESULTADO: $fallos requisito(s) no se cumplen."
fi
[ "$fallos" -eq 0 ]
