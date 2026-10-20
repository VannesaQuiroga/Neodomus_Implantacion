#!/usr/bin/env bash
# =============================================================================
# verificar-requisitos.sh — Verificación de pre-requisitos de Neodomus
# -----------------------------------------------------------------------------
# ¿Qué?
#   Script Bash que audita, sin modificar el sistema, si un host Linux cumple
#   los requisitos mínimos para desplegar el stack Docker de Neodomus.
#
# ¿Para qué?
#   Obtener evidencia objetiva de la Semana 1 y detectar faltantes de sistema
#   operativo, permisos, Docker, memoria, disco o puertos antes de instalar.
#   Devuelve 0 si el entorno es APTO y 1 si hay algún fallo crítico.
#
# Comprobaciones:
#   - Sistema operativo y arquitectura
#   - Usuario y acceso al daemon de Docker
#   - Docker Engine y Docker Compose v2
#   - Memoria RAM total
#   - Espacio libre en disco
#   - Disponibilidad de los puertos del proyecto
#
# Mapa del script:
#   1. Constantes y estado global
#   2. Utilidades de salida y argumentos
#   3. Comprobaciones del host
#   4. Simulación de fallo y resumen
#   5. Flujo principal
#
# Uso:
#   ./scripts/verificar-requisitos.sh
#   ./scripts/verificar-requisitos.sh --simulate-fail
#   SIMULATE_FAIL=true ./scripts/verificar-requisitos.sh
#   PORTS_TO_CHECK="80 443 5173 8000" ./scripts/verificar-requisitos.sh
#
# Códigos de salida:
#   0  Todos los requisitos críticos se cumplen.
#   1  Algún requisito crítico falla, hay un error de uso o una excepción.
#
# Seguridad:
#   - No imprime credenciales. La validación de docker-compose.yml usa las
#     variables de entorno y .env, pero no muestra sus valores.
#   - No modifica archivos, servicios, puertos ni contenedores.
#   - No requiere root; basta con acceso al socket de Docker.
# =============================================================================

set -euo pipefail
set -E
IFS=$'\n\t'

# -----------------------------------------------------------------------------
# 1. Constantes y estado global
# ¿Qué? Rutas, umbrales, puertos, colores y contadores del script.
# ¿Para qué? Evitar valores mágicos dispersos y permitir ajustar la auditoría
#           con variables de entorno sin editar el código.
# -----------------------------------------------------------------------------

# ¿Qué? Nombre, carpeta del script y raíz del repositorio.
# ¿Para qué? Localizar docker-compose.yml sin depender del directorio actual.
readonly SCRIPT_NAME="${0##*/}"
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
readonly SCRIPT_DIR
PROJECT_ROOT="$(cd -- "${SCRIPT_DIR}/.." >/dev/null 2>&1 && pwd)"
readonly PROJECT_ROOT

# ¿Qué? Umbrales mínimos de RAM, disco y versiones de Docker/Compose.
# ¿Para qué? Comparar el host contra la Ficha Técnica de la Semana 1.
# Los valores por defecto son 4 GiB de RAM, 10 GiB libres, Docker 20+ y Compose 2+.
readonly MIN_RAM_GB="${MIN_RAM_GB:-4}"
readonly MIN_DISK_GB="${MIN_DISK_GB:-10}"
readonly DISK_PATH="${DISK_PATH:-/}"
readonly MIN_DOCKER_MAJOR="${MIN_DOCKER_MAJOR:-20}"
readonly MIN_COMPOSE_MAJOR="${MIN_COMPOSE_MAJOR:-2}"

# ¿Qué? Puertos TCP que usa el stack real de Neodomus.
# ¿Para qué? Detectar conflictos antes de levantar los contenedores.
#   80/443   -> proxy Nginx (producción)
#   5173     -> frontend Vite (desarrollo)
#   8000     -> API FastAPI/Uvicorn
#   3306     -> MySQL estándar (referencia)
#   3307     -> MySQL publicado por docker-compose.yml
#   9000     -> API S3 de MinIO
#   9001     -> consola web de MinIO
readonly DEFAULT_PORTS=(80 443 5173 8000 3306 3307 9000 9001)

# ¿Qué? Códigos ANSI para INFO, OK, WARN y FAIL.
# ¿Para qué? Facilitar la lectura humana; se desactivan al redirigir la salida
#           o cuando NO_COLOR está definido.
if [[ -t 1 && -z "${NO_COLOR:-}" ]]; then
  readonly RED=$'\033[0;31m'
  readonly GREEN=$'\033[0;32m'
  readonly YELLOW=$'\033[0;33m'
  readonly BLUE=$'\033[0;34m'
  readonly NC=$'\033[0m'
else
  readonly RED=''
  readonly GREEN=''
  readonly YELLOW=''
  readonly BLUE=''
  readonly NC=''
fi

# ¿Qué? Contadores de resultados y configuración de la ejecución.
# ¿Para qué? Calcular el resumen final y permitir la simulación de fallo.
PASS_COUNT=0
WARN_COUNT=0
FAIL_COUNT=0
SIMULATE_FAIL="${SIMULATE_FAIL:-false}"
PORTS_TO_CHECK="${PORTS_TO_CHECK:-}"
PORTS=()

# -----------------------------------------------------------------------------
# 2. Utilidades de salida y argumentos
# ¿Qué? Funciones comunes para imprimir, contar, mostrar ayuda y leer opciones.
# ¿Para qué? Mantener un formato uniforme y evitar duplicar lógica.
# -----------------------------------------------------------------------------

# ¿Qué? Imprimen una línea con su prefijo y actualizan el contador respectivo.
# ¿Para qué? Que el resumen final refleje exactamente lo que vio el usuario.
log_info() {
  printf '%s[INFO]%s %s\n' "${BLUE}" "${NC}" "$*"
}

log_success() {
  printf '%s[ OK ]%s %s\n' "${GREEN}" "${NC}" "$*"
  PASS_COUNT=$((PASS_COUNT + 1))
}

log_warn() {
  printf '%s[WARN]%s %s\n' "${YELLOW}" "${NC}" "$*"
  WARN_COUNT=$((WARN_COUNT + 1))
}

log_error() {
  printf '%s[FAIL]%s %s\n' "${RED}" "${NC}" "$*"
  FAIL_COUNT=$((FAIL_COUNT + 1))
}

section() {
  printf '\n%s[INFO] %s%s\n' "${BLUE}" "$1" "${NC}"
}

# ¿Qué? Manejador del trap ERR.
# ¿Para qué? Convertir un error inesperado en un mensaje claro y salida 1.
# ShellCheck no deduce que la función se invoca desde el trap.
# shellcheck disable=SC2329
on_error() {
  local line="$1"
  printf '%s[FAIL]%s Error inesperado en la línea %s. Ejecute con "bash -x" para diagnosticar.\n' \
    "${RED}" "${NC}" "${line}" >&2
  exit 1
}

trap 'on_error "${LINENO}"' ERR

# ¿Qué? Ayuda de uso, opciones y variables de entorno.
# ¿Para qué? Documentar el contrato del script sin necesidad de leer el código.
usage() {
  cat <<EOF
Uso: ${SCRIPT_NAME} [opciones]

Opciones:
  --simulate-fail        Fuerza un fallo intencional al final de la verificación.
  --ports "80 443 ..."   Sustituye la lista de puertos a comprobar.
  -h, --help             Muestra esta ayuda.

Variables de entorno:
  SIMULATE_FAIL=true     Equivale a --simulate-fail.
  MIN_RAM_GB=4           RAM mínima requerida, en GiB (entero).
  MIN_DISK_GB=10         Espacio libre mínimo en DISK_PATH, en GiB (entero).
  DISK_PATH=/            Ruta cuyo espacio libre se valida.
  PORTS_TO_CHECK="..."   Lista de puertos separada por espacios o comas.
  NO_COLOR=1             Desactiva los colores ANSI.

Ejemplos:
  ${SCRIPT_NAME}
  SIMULATE_FAIL=true ${SCRIPT_NAME}
  PORTS_TO_CHECK="80 443 5173 8000 9000 9001" ${SCRIPT_NAME}

El script no imprime credenciales ni modifica el sistema. La validación de
docker-compose.yml resuelve variables de entorno/.env sin mostrar sus valores.
EOF
}

# ¿Qué? Normaliza un valor booleano de variable de entorno.
# ¿Para qué? Aceptar true/1/yes/si sin distinguir mayúsculas y minúsculas.
is_true() {
  case "${1,,}" in
    true|1|yes|si) return 0 ;;
    *) return 1 ;;
  esac
}

# -----------------------------------------------------------------------------
# Argumentos y configuración
# ¿Qué? Lee opciones, valida umbrales, construye la lista de puertos y muestra
#       el contexto de la ejecución.
# ¿Para qué? Permitir pruebas controladas y adaptar el script sin editarlo.
# -----------------------------------------------------------------------------

# ¿Qué? Lee --simulate-fail, --ports y --help.
# ¿Para qué? Configurar la ejecución desde la línea de comandos.
parse_args() {
  while (($# > 0)); do
    case "$1" in
      --simulate-fail)
        SIMULATE_FAIL="true"
        shift
        ;;
      --ports)
        if (($# < 2)); then
          printf 'Falta la lista de puertos después de --ports.\n' >&2
          usage >&2
          exit 1
        fi
        PORTS_TO_CHECK="$2"
        shift 2
        ;;
      -h|--help)
        usage
        exit 0
        ;;
      *)
        printf 'Opción no reconocida: %s\n' "$1" >&2
        usage >&2
        exit 1
        ;;
    esac
  done
}

# ¿Qué? Valida que los umbrales sean enteros no negativos y que RAM/disco sean > 0.
# ¿Para qué? Evitar comparaciones inválidas y mensajes confusos.
validate_thresholds() {
  local value
  for value in "${MIN_RAM_GB}" "${MIN_DISK_GB}" "${MIN_DOCKER_MAJOR}" "${MIN_COMPOSE_MAJOR}"; do
    if ! [[ "${value}" =~ ^[0-9]+$ ]]; then
      printf 'Umbral inválido: "%s". Use un número entero no negativo.\n' "${value}" >&2
      exit 1
    fi
  done

  if ((MIN_RAM_GB < 1 || MIN_DISK_GB < 1)); then
    printf 'Los umbrales de RAM y disco deben ser mayores que cero.\n' >&2
    exit 1
  fi
}

# ¿Qué? Construye el arreglo PORTS desde PORTS_TO_CHECK o los valores por defecto.
# ¿Para qué? Aceptar puertos separados por espacios o comas.
configure_ports() {
  if [[ -n "${PORTS_TO_CHECK}" ]]; then
    IFS=$' ,\n\t' read -r -a PORTS <<< "${PORTS_TO_CHECK}"
  else
    PORTS=("${DEFAULT_PORTS[@]}")
  fi
}

# ¿Qué? Muestra host, usuario, fecha, umbrales, puertos y modo de simulación.
# ¿Para qué? Dejar evidencia del contexto en el que se ejecutó la auditoría.
print_banner() {
  local ports_label

  ports_label="$(IFS=' '; printf '%s' "${PORTS[*]}")"

  printf '%s\n' "=============================================================="
  printf '%s\n' "  Neodomus — Verificación de requisitos de implantación"
  printf '%s\n' "  Semana 1 · Ficha técnica y matriz de requisitos"
  printf '%s\n' "=============================================================="
  printf '\n'
  log_info "Host: $(hostname 2>/dev/null || printf 'localhost') | Usuario: ${USER:-$(id -un)} | Fecha: $(date '+%Y-%m-%d %H:%M:%S %Z')"
  log_info "Umbrales: RAM >= ${MIN_RAM_GB} GiB · Disco libre >= ${MIN_DISK_GB} GiB en ${DISK_PATH} · Puertos: ${ports_label}"
  log_info "SIMULATE_FAIL=${SIMULATE_FAIL} · NO_COLOR=$([[ -z "${NO_COLOR:-}" ]] && printf 'false' || printf 'true')"
}

# -----------------------------------------------------------------------------
# 3. Comprobaciones del host
# ¿Qué? Cada función audita un requisito y registra PASS, WARN o FAIL.
# ¿Para qué? Aislar responsabilidades y poder explicar cada validación por separado.
# -----------------------------------------------------------------------------

# ¿Qué? Verifica awk, df, id y uname.
# ¿Para qué? Evitar fallos opacos si falta una utilidad base del sistema.
check_required_commands() {
  local cmd missing=0

  for cmd in awk df id uname; do
    if ! command -v "${cmd}" >/dev/null 2>&1; then
      log_error "Comando requerido no encontrado: ${cmd}."
      missing=1
    fi
  done

  if ((missing > 0)); then
    log_warn "Instale las utilidades faltantes antes de confiar en el resultado."
  fi
}

# ¿Qué? Detecta kernel, arquitectura y distribución.
# ¿Para qué? Confirmar Linux x86_64 y Ubuntu Server 24.04 LTS.
check_os() {
  section "1. Sistema operativo y arquitectura"

  local kernel arch os_id os_version os_pretty

  if [[ "$(uname -s 2>/dev/null || true)" == "Linux" ]]; then
    kernel="$(uname -r 2>/dev/null || printf 'desconocido')"
    log_success "Sistema Linux detectado (kernel ${kernel})."
  else
    log_error "Este script requiere Linux. Sistema detectado: $(uname -s 2>/dev/null || printf 'desconocido')."
  fi

  arch="$(uname -m 2>/dev/null || true)"
  if [[ "${arch}" == "x86_64" || "${arch}" == "amd64" ]]; then
    log_success "Arquitectura ${arch} compatible con las imágenes del stack."
  else
    log_warn "Arquitectura ${arch:-desconocida}; el estándar homologado es x86_64/amd64."
  fi

  # /etc/os-release es la fuente estándar para identificar la distribución.
  os_id=""
  os_version=""
  os_pretty=""
  if [[ -r /etc/os-release ]]; then
    # shellcheck source=/dev/null
    os_id="$(. /etc/os-release 2>/dev/null && printf '%s' "${ID:-}")"
    # shellcheck source=/dev/null
    os_version="$(. /etc/os-release 2>/dev/null && printf '%s' "${VERSION_ID:-}")"
    # shellcheck source=/dev/null
    os_pretty="$(. /etc/os-release 2>/dev/null && printf '%s' "${PRETTY_NAME:-}")"
  fi

  if [[ "${os_id}" == "ubuntu" && "${os_version}" == "24.04" ]]; then
    log_success "Distribución homologada: ${os_pretty:-Ubuntu 24.04 LTS}."
  elif [[ "${os_id}" == "ubuntu" ]]; then
    log_warn "Ubuntu ${os_version:-desconocida} detectado; la versión homologada es Ubuntu Server 24.04 LTS."
  else
    log_warn "Distribución no homologada (${os_pretty:-desconocida}); se recomienda Ubuntu Server 24.04 LTS."
  fi
}

# ¿Qué? Revisa el UID efectivo y los grupos del usuario.
# ¿Para qué? Confirmar que puede usar Docker sin root y avisar si no.
check_permissions() {
  section "2. Usuario y permisos"

  local current_user uid groups

  current_user="${USER:-$(id -un)}"
  uid="$(id -u)"

  if ((uid == 0)); then
    log_warn "Ejecución como root. Se recomienda un usuario sin privilegios con acceso al grupo docker."
  else
    log_success "Ejecución con usuario sin privilegios (uid=${uid})."
  fi

  groups="$(id -nG "${current_user}" 2>/dev/null || true)"
  if [[ " ${groups} " == *" docker "* ]]; then
    log_success "El usuario '${current_user}' pertenece al grupo docker."
  else
    log_warn "El usuario '${current_user}' no pertenece al grupo docker; se validará el acceso efectivo al daemon en el paso 3."
  fi
}

# ¿Qué? Comprueba cliente, daemon, Compose y el docker-compose.yml del proyecto.
# ¿Para qué? Asegurar que el stack puede ejecutarse y que el YAML es resoluble.
check_docker() {
  section "3. Docker Engine y Docker Compose"

  local docker_version engine_version engine_major compose_version compose_major

  if ! command -v docker >/dev/null 2>&1; then
    log_error "Docker Engine no está instalado o no se encuentra en PATH."
    return 0
  fi

  # `docker --version` solo confirma el cliente; `docker info` confirma el daemon.
  docker_version="$(docker --version 2>/dev/null | awk '{gsub(/,/, "", $3); print $3; exit}' || true)"
  log_success "Docker Engine instalado (${docker_version:-versión desconocida})."

  if ! docker info >/dev/null 2>&1; then
    log_error "El daemon de Docker no responde. Inicie el servicio o revise los permisos del socket."
    return 0
  fi

  engine_version="$(docker info --format '{{.ServerVersion}}' 2>/dev/null || true)"
  log_success "Daemon de Docker operativo (${engine_version:-versión desconocida})."

  engine_major="${engine_version%%.*}"
  if [[ "${engine_major}" =~ ^[0-9]+$ ]] && ((engine_major >= MIN_DOCKER_MAJOR)); then
    log_success "Versión de Docker Engine >= ${MIN_DOCKER_MAJOR}."
  else
    log_error "Docker Engine ${engine_version:-desconocido} es anterior al mínimo ${MIN_DOCKER_MAJOR}."
  fi

  if docker compose version >/dev/null 2>&1; then
    compose_version="$(docker compose version --short 2>/dev/null || true)"
    if [[ -z "${compose_version}" ]]; then
      compose_version="$(docker compose version 2>/dev/null | awk '{print $NF; exit}')"
    fi
    compose_version="${compose_version#v}"
    compose_major="${compose_version%%.*}"
    if [[ "${compose_major}" =~ ^[0-9]+$ ]] && ((compose_major >= MIN_COMPOSE_MAJOR)); then
      log_success "Docker Compose v${MIN_COMPOSE_MAJOR}+ disponible (${compose_version})."
    else
      log_error "Docker Compose ${compose_version:-desconocido} no cumple el mínimo v${MIN_COMPOSE_MAJOR}."
    fi
  elif command -v docker-compose >/dev/null 2>&1; then
    log_warn "Se detectó docker-compose standalone; se recomienda el plugin oficial 'docker compose' v2+."
  else
    log_error "Docker Compose no está instalado. Instale el plugin oficial v2+."
  fi

  # `config --quiet` resuelve variables de entorno y .env, pero no imprime valores.
  if [[ -f "${PROJECT_ROOT}/docker-compose.yml" ]]; then
    if (cd "${PROJECT_ROOT}" && docker compose config --quiet >/dev/null 2>&1); then
      log_success "docker-compose.yml válido y resoluble."
    else
      log_warn "docker-compose.yml no pudo validarse; revise el archivo y las variables de .env."
    fi
  else
    log_warn "No se encontró docker-compose.yml en ${PROJECT_ROOT}."
  fi
}

# ¿Qué? Lee /proc/meminfo y compara MemTotal con MIN_RAM_GB.
# ¿Para qué? Evitar que MySQL, MinIO y la API se queden sin memoria.
check_memory() {
  section "4. Memoria RAM"

  local mem_total_kb mem_available_kb mem_total_gib mem_available_gib required_kb

  if [[ ! -r /proc/meminfo ]]; then
    log_error "No se pudo leer /proc/meminfo; no es posible validar la RAM."
    return 0
  fi

  # MemTotal es la RAM instalada; MemAvailable es solo informativa para el reporte.
  mem_total_kb="$(awk '/^MemTotal:/ {print $2; exit}' /proc/meminfo 2>/dev/null || true)"
  mem_available_kb="$(awk '/^MemAvailable:/ {print $2; exit}' /proc/meminfo 2>/dev/null || true)"

  if [[ ! "${mem_total_kb}" =~ ^[0-9]+$ ]]; then
    log_error "No se pudo determinar la memoria total del sistema."
    return 0
  fi

  required_kb=$((MIN_RAM_GB * 1024 * 1024))
  mem_total_gib="$(awk -v kb="${mem_total_kb}" 'BEGIN { printf "%.2f", kb / 1048576 }')"

  if ((mem_total_kb >= required_kb)); then
    log_success "RAM total: ${mem_total_gib} GiB (mínimo requerido: ${MIN_RAM_GB} GiB)."
  else
    log_error "RAM insuficiente: ${mem_total_gib} GiB < ${MIN_RAM_GB} GiB requeridos."
  fi

  if [[ "${mem_available_kb}" =~ ^[0-9]+$ ]]; then
    mem_available_gib="$(awk -v kb="${mem_available_kb}" 'BEGIN { printf "%.2f", kb / 1048576 }')"
    log_info "RAM disponible en el momento de la prueba: ${mem_available_gib} GiB."
  fi
}

# ¿Qué? Consulta la capacidad total y el espacio libre de DISK_PATH con df.
# ¿Para qué? Garantizar espacio para imágenes, MySQL, MinIO y registros.
check_disk() {
  section "5. Espacio en disco"

  local df_output total_kb avail_kb total_gib avail_gib required_kb

  if ! df_output="$(df -Pk -- "${DISK_PATH}" 2>/dev/null | awk 'NR == 2 {print $2, $4}')"; then
    log_error "No se pudo consultar el espacio libre de ${DISK_PATH}."
    return 0
  fi

  if [[ -z "${df_output}" ]]; then
    log_error "Ruta de disco inválida o inaccesible: ${DISK_PATH}."
    return 0
  fi

  IFS=' ' read -r total_kb avail_kb <<< "${df_output}"
  if [[ ! "${avail_kb}" =~ ^[0-9]+$ ]]; then
    log_error "No se pudo interpretar la salida de df para ${DISK_PATH}."
    return 0
  fi

  required_kb=$((MIN_DISK_GB * 1024 * 1024))
  total_gib="$(awk -v kb="${total_kb}" 'BEGIN { printf "%.2f", kb / 1048576 }')"
  avail_gib="$(awk -v kb="${avail_kb}" 'BEGIN { printf "%.2f", kb / 1048576 }')"

  if ((avail_kb >= required_kb)); then
    log_success "Espacio libre en ${DISK_PATH}: ${avail_gib} GiB de ${total_gib} GiB (mínimo requerido: ${MIN_DISK_GB} GiB)."
  else
    log_error "Espacio insuficiente en ${DISK_PATH}: ${avail_gib} GiB libres < ${MIN_DISK_GB} GiB requeridos."
  fi
}

# ¿Qué? Busca un puerto TCP en estado LISTEN dentro de /proc/net/tcp y tcp6.
# ¿Para qué? Es la fuente primaria y no depende de utilidades externas.
# El estado 0A significa LISTEN y el puerto se compara en hexadecimal.
port_in_use_proc() {
  local port="$1"
  local hex_port
  local -a proc_files=()

  printf -v hex_port '%04X' "${port}"

  if [[ -r /proc/net/tcp ]]; then
    proc_files+=(/proc/net/tcp)
  fi
  if [[ -r /proc/net/tcp6 ]]; then
    proc_files+=(/proc/net/tcp6)
  fi
  if ((${#proc_files[@]} == 0)); then
    return 1
  fi

  awk -v suffix=":${hex_port}" '
    BEGIN { found = 0 }
    NR > 1 && $4 == "0A" && index($2, suffix) == length($2) - length(suffix) + 1 {
      found = 1
    }
    END { exit(found ? 0 : 1) }
  ' "${proc_files[@]}" 2>/dev/null
}

# ¿Qué? Determina si un puerto está ocupado usando una cadena de respaldo.
# ¿Para qué? Ser portable entre distribuciones: /proc, luego ss y por último /dev/tcp.
port_in_use() {
  local port="$1"

  if port_in_use_proc "${port}"; then
    return 0
  fi

  if command -v ss >/dev/null 2>&1; then
    if ss -H -ltn 2>/dev/null | awk -v suffix=":${port}" '
      index($4, suffix) == length($4) - length(suffix) + 1 { found = 1 }
      END { exit(found ? 0 : 1) }
    '; then
      return 0
    fi
  fi

  # Último recurso: /dev/tcp de Bash. Solo detecta sockets accesibles en loopback.
  # No se usa lsof ni nc: algunas implementaciones (BusyBox) ignoran sus
  # opciones y devuelven éxito aunque el puerto esté libre.
  if (exec 3<>"/dev/tcp/127.0.0.1/${port}") 2>/dev/null; then
    return 0
  fi

  return 1
}

# ¿Qué? Recorre PORTS, valida cada número y comprueba si está libre.
# ¿Para qué? Evitar conflictos con Nginx, Vite, FastAPI, MySQL y MinIO.
check_ports() {
  section "6. Disponibilidad de puertos"

  local port

  if ((${#PORTS[@]} == 0)); then
    log_warn "No se configuraron puertos para comprobar."
    return 0
  fi

  for port in "${PORTS[@]}"; do
    if ! [[ "${port}" =~ ^[0-9]+$ ]] || ((${#port} > 5)); then
      log_warn "Puerto inválido ignorado: '${port}'."
      continue
    fi

    # Normaliza ceros a la izquierda para evitar interpretaciones octales.
    port=$((10#${port}))

    if ((port < 1 || port > 65535)); then
      log_warn "Puerto inválido ignorado: '${port}'."
      continue
    fi

    if port_in_use "${port}"; then
      log_error "Puerto ${port}/tcp ocupado; libérelo o cámbielo en docker-compose.yml/.env."
    else
      log_success "Puerto ${port}/tcp libre."
    fi
  done
}

# -----------------------------------------------------------------------------
# 4. Simulación de fallo y resumen
# ¿Qué? Convierte la opción de simulación en un FAIL y calcula el veredicto.
# ¿Para qué? Probar la ruta de error y presentar un resultado final inequívoco.
# -----------------------------------------------------------------------------

# ¿Qué? Añade un FAIL intencional cuando SIMULATE_FAIL está activo.
# ¿Para qué? Demostrar y probar la ruta de error y el código de salida 1.
check_simulated_failure() {
  if is_true "${SIMULATE_FAIL}"; then
    section "7. Simulación de fallo"
    log_error "Fallo simulado activado (SIMULATE_FAIL=${SIMULATE_FAIL}). Se fuerza el resultado global a NO APTO."
  fi
}

# ¿Qué? Imprime los contadores y el veredicto final APTO/NO APTO.
# ¿Para qué? Traducir los resultados a una decisión clara y devolver 0 o 1.
print_summary() {
  local pass_label="aprobadas"
  local warn_label="advertencias"
  local fail_label="fallidas"

  if ((PASS_COUNT == 1)); then
    pass_label="aprobada"
  fi
  if ((WARN_COUNT == 1)); then
    warn_label="advertencia"
  fi
  if ((FAIL_COUNT == 1)); then
    fail_label="fallida"
  fi

  printf '\n'
  log_info "Resumen: ${PASS_COUNT} ${pass_label}, ${WARN_COUNT} ${warn_label}, ${FAIL_COUNT} ${fail_label}."

  if ((FAIL_COUNT == 0)); then
    printf '%s[ OK ] Entorno APTO para el despliegue de Neodomus.%s\n' "${GREEN}" "${NC}"
    return 0
  fi

  printf '%s[FAIL] Entorno NO APTO. Corrija los requisitos marcados como [FAIL] y vuelva a ejecutar.%s\n' \
    "${RED}" "${NC}"
  return 1
}

# -----------------------------------------------------------------------------
# 5. Flujo principal
# ¿Qué? Orquesta argumentos, configuración, comprobaciones y resumen.
# ¿Para qué? Mantener una secuencia única y reproducible de ejecución.
# -----------------------------------------------------------------------------
main() {
  parse_args "$@"
  validate_thresholds
  configure_ports

  print_banner

  check_required_commands
  check_os
  check_permissions
  check_docker
  check_memory
  check_disk
  check_ports
  check_simulated_failure

  if print_summary; then
    return 0
  fi
  return 1
}

# ¿Qué? Ejecuta main y traduce su resultado a un código de salida explícito.
# ¿Para qué? Permitir que CI/CD u otro script distingan APTO (0) de NO APTO (1).
if main "$@"; then
  exit 0
fi
exit 1
