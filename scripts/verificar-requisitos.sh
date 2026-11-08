#!/usr/bin/env bash
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m'
readonly RED GREEN YELLOW NC
readonly MIN_RAM_GB=4
readonly MIN_DISK_GB=10
readonly DEFAULT_PORTS='80 443 3307 5173 8000 9000 9001'
FAILURES=0
SIMULATE_FAIL="${SIMULATE_FAIL:-false}"
PORTS_TO_CHECK="${PORTS_TO_CHECK:-$DEFAULT_PORTS}"

log_success() { printf '%b[OK]%b %s\n' "$GREEN" "$NC" "$*"; }
log_error() { printf '%b[ERROR]%b %s\n' "$RED" "$NC" "$*" >&2; FAILURES=$((FAILURES + 1)); }
log_warning() { printf '%b[AVISO]%b %s\n' "$YELLOW" "$NC" "$*"; }

check_dependencies() {
  local missing=0 dependency
  for dependency in awk df id; do
    if ! command -v "$dependency" >/dev/null 2>&1; then
      log_error "Falta la dependencia requerida: $dependency"; missing=1
    fi
  done
  if ! command -v ss >/dev/null 2>&1 && ! command -v lsof >/dev/null 2>&1; then
    log_error 'Se requiere ss o lsof para comprobar los puertos.'; missing=1
  fi
  if (( missing == 0 )); then log_success 'Dependencias del sistema disponibles.'; fi
}

check_permissions() {
  if ! command -v docker >/dev/null 2>&1; then
    log_error 'Docker CLI no está instalado; no se puede verificar acceso al daemon.'; return
  fi
  if docker info >/dev/null 2>&1; then
    log_success "UID $(id -u) tiene acceso al daemon Docker; no se requiere root."
  else
    log_error 'Sin acceso al daemon Docker. Verifica que esté activo y que tu usuario tenga permisos.'
  fi
}

check_docker() {
  if ! command -v docker >/dev/null 2>&1; then log_error 'Docker no está instalado.'; return; fi
  if docker info >/dev/null 2>&1; then
    log_success "Docker está instalado y ejecutándose ($(docker --version))."
  else
    log_error 'Docker está instalado pero el daemon no responde.'
  fi
  if docker compose version >/dev/null 2>&1; then
    log_success "Docker Compose disponible ($(docker compose version --short))."
  else
    log_error 'Docker Compose v2 (plugin docker compose) no está disponible.'
  fi
}

check_memory() {
  local total_kb ram_gb
  if [[ ! -r /proc/meminfo ]]; then log_error 'No se puede leer /proc/meminfo; ejecuta en Linux.'; return; fi
  total_kb="$(awk '/^MemTotal:/ {print $2; exit}' /proc/meminfo)"
  if [[ ! "$total_kb" =~ ^[0-9]+$ ]]; then log_error 'No se pudo determinar la RAM total.'; return; fi
  ram_gb="$(awk -v kb="$total_kb" 'BEGIN {printf "%.1f", kb/1048576}')"
  if (( total_kb >= MIN_RAM_GB * 1024 * 1024 )); then
    log_success "RAM total: ${ram_gb} GiB (mínimo ${MIN_RAM_GB} GiB)."
  else
    log_error "RAM insuficiente: ${ram_gb} GiB; mínimo ${MIN_RAM_GB} GiB."
  fi
}

check_disk() {
  local available_kb disk_gb
  available_kb="$(df -Pk / | awk 'NR == 2 {print $4}')"
  if [[ ! "$available_kb" =~ ^[0-9]+$ ]]; then log_error 'No se pudo determinar espacio libre en /.'; return; fi
  disk_gb="$(awk -v kb="$available_kb" 'BEGIN {printf "%.1f", kb/1048576}')"
  if (( available_kb >= MIN_DISK_GB * 1024 * 1024 )); then
    log_success "Espacio libre: ${disk_gb} GiB (mínimo ${MIN_DISK_GB} GiB)."
  else
    log_error "Espacio libre insuficiente: ${disk_gb} GiB; mínimo ${MIN_DISK_GB} GiB."
  fi
}

port_is_listening() {
  local port="$1"
  if command -v ss >/dev/null 2>&1; then
    ss -H -ltn 2>/dev/null | awk -v port="$port" '$4 ~ (":" port "$") {found=1} END {exit found ? 0 : 1}'
  else
    lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1
  fi
}

check_ports() {
  local port
  local -a ports
  read -r -a ports <<< "$PORTS_TO_CHECK"
  for port in "${ports[@]}"; do
    if [[ ! "$port" =~ ^[0-9]+$ ]] || (( port < 1 || port > 65535 )); then
      log_error "Puerto inválido en PORTS_TO_CHECK: $port"
    elif port_is_listening "$port"; then
      log_error "Puerto TCP $port ocupado; libéralo o ajusta PORTS_TO_CHECK."
    else
      log_success "Puerto TCP $port disponible."
    fi
  done
}

main() {
  check_dependencies
  check_permissions
  check_docker
  check_memory
  check_disk
  check_ports
  case "$SIMULATE_FAIL" in
    true|1|yes) log_error 'Fallo forzado por SIMULATE_FAIL (prueba).' ;;
    false|0|no|'') : ;;
    *) log_error 'SIMULATE_FAIL acepta true/false (o 1/0).' ;;
  esac
  if (( FAILURES > 0 )); then
    printf '%b[RESULTADO]%b Verificación fallida: %d requisito(s).\n' "$RED" "$NC" "$FAILURES" >&2
    exit 1
  fi
  printf '%b[RESULTADO]%b Todos los requisitos se cumplen.\n' "$GREEN" "$NC"
  exit 0
}

main "$@"
