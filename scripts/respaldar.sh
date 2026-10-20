#!/usr/bin/env bash
# =============================================================================
# respaldar.sh - Respaldo lógico comprimido de MySQL para Neodomus
# =============================================================================
# ¿Qué? Genera un respaldo .sql.gz de la base de datos MySQL, valida su
#        integridad, calcula SHA-256 y aplica una política de retención.
# ¿Para qué? Tener una copia recuperable antes de migraciones, despliegues o
#            cambios de datos, sin escribir credenciales en el repositorio.
# ¿Impacto? Sin respaldo verificado no se puede garantizar la recuperación
#           ante corrupción, borrado accidental o una migración fallida.
#
# Uso:
#   ./scripts/respaldar.sh
#   BACKUP_MODE=local MYSQL_HOST=127.0.0.1 MYSQL_PORT=3307 ./scripts/respaldar.sh
#   RETENTION_DAYS=14 BACKUP_DIR=/var/backups/neodomus ./scripts/respaldar.sh
#   ./scripts/respaldar.sh --help
#
# Variables principales (se pueden definir en el entorno o en .env):
#   BACKUP_DIR        Directorio destino. Por defecto: <repo>/backups
#   RETENTION_DAYS    Días de retención. Por defecto: 7
#   BACKUP_MODE       auto | docker | local. Por defecto: auto
#   DB_CONTAINER      Contenedor MySQL. Por defecto: neodomus_mysql
#   MYSQL_DATABASE    Base de datos. Por defecto: neodomus
#   MYSQL_USER        Usuario de respaldo. Por defecto: neodomus
#   MYSQL_PASSWORD    Contraseña. Obligatoria; nunca se imprime.
#   MYSQL_HOST        Host en modo local. Por defecto: 127.0.0.1
#   MYSQL_PORT        Puerto en modo local. Por defecto: 3307
#   DUMP_ROUTINES     true para incluir rutinas/eventos. Por defecto: false
#
# Seguridad:
#   - La contraseña se pasa mediante MYSQL_PWD, no como argumento -p.
#   - Los archivos se crean con permisos 600 y el directorio con 700.
#   - El .env se parsea sin ejecutar código y solo se cargan claves permitidas.
#   - Los respaldos NO se suben al repositorio; backups/ está en .gitignore.
# =============================================================================

set -Eeuo pipefail
umask 077

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
readonly SCRIPT_DIR
PROJECT_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd -P)"
readonly PROJECT_ROOT

# Valores que pueden venir del entorno o de .env. Los defaults se aplican
# después de cargar el archivo para no pisar la configuración del usuario.
ENV_FILE="${ENV_FILE:-${PROJECT_ROOT}/.env}"
BACKUP_DIR="${BACKUP_DIR:-}"
RETENTION_DAYS="${RETENTION_DAYS:-}"
BACKUP_MODE="${BACKUP_MODE:-}"
DB_CONTAINER="${DB_CONTAINER:-}"
MYSQL_DATABASE="${MYSQL_DATABASE:-}"
MYSQL_USER="${MYSQL_USER:-}"
MYSQL_PASSWORD="${MYSQL_PASSWORD:-}"
MYSQL_HOST="${MYSQL_HOST:-}"
MYSQL_PORT="${MYSQL_PORT:-}"
BACKUP_PREFIX="${BACKUP_PREFIX:-}"
DUMP_ROUTINES="${DUMP_ROUTINES:-}"

# Estado del respaldo. Se usa para limpiar archivos incompletos si algo falla.
MODE=""
BACKUP_FILE=""
TMP_FILE=""
CHECKSUM_FILE=""
BACKUP_COMPLETE="false"
BACKUP_BYTES="0"
BACKUP_SIZE_HUMAN=""
BACKUP_HASH=""
DELETED_COUNT="0"

# -----------------------------------------------------------------------------
# Logging
# -----------------------------------------------------------------------------

log_info() {
  printf '[INFO] %s\n' "$*"
}

log_ok() {
  printf '[ OK ] %s\n' "$*"
}

log_warn() {
  printf '[WARN] %s\n' "$*" >&2
}

log_error() {
  printf '[ERROR] %s\n' "$*" >&2
}

die() {
  log_error "$*"
  exit 1
}

# -----------------------------------------------------------------------------
# Ayuda
# -----------------------------------------------------------------------------

usage() {
  cat <<'EOF'
Respaldo lógico de MySQL para Neodomus

Uso:
  ./scripts/respaldar.sh [opciones]

Opciones:
  --backup-dir DIR       Directorio destino del respaldo.
  --retention-days N     Elimina respaldos con más de N días (N >= 1).
  --mode auto|docker|local
                         auto detecta el contenedor; si no está disponible,
                         usa mysqldump local.
  -h, --help             Muestra esta ayuda.

Ejemplos:
  ./scripts/respaldar.sh
  BACKUP_MODE=local MYSQL_HOST=127.0.0.1 MYSQL_PORT=3307 ./scripts/respaldar.sh
  BACKUP_DIR=/var/backups/neodomus RETENTION_DAYS=30 ./scripts/respaldar.sh

Variables obligatorias:
  MYSQL_PASSWORD (o DB_PASSWORD)

Variables opcionales:
  MYSQL_DATABASE=neodomus
  MYSQL_USER=neodomus
  MYSQL_HOST=127.0.0.1
  MYSQL_PORT=3307
  DB_CONTAINER=neodomus_mysql
  BACKUP_DIR=<repo>/backups
  RETENTION_DAYS=7
  DUMP_ROUTINES=false

El archivo .env del proyecto se lee si existe. No se ejecuta: solo se aceptan
líneas KEY=VALUE de una lista blanca de variables. La contraseña no se imprime.
EOF
}

# -----------------------------------------------------------------------------
# Configuración
# -----------------------------------------------------------------------------

load_env_file() {
  local file="$1"
  local line key value

  [[ -f "$file" ]] || return 0
  [[ -r "$file" ]] || {
    log_warn "No se puede leer ${file}; se usarán solo variables del entorno."
    return 0
  }

  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line%$'\r'}"
    [[ "$line" =~ ^[[:space:]]*$ ]] && continue
    [[ "$line" =~ ^[[:space:]]*# ]] && continue
    [[ "$line" =~ ^[[:space:]]*([A-Za-z_][A-Za-z0-9_]*)[[:space:]]*=[[:space:]]*(.*)$ ]] || continue

    key="${BASH_REMATCH[1]}"
    value="${BASH_REMATCH[2]}"

    # Solo se cargan variables relevantes para el respaldo. Así no se
    # exportan secretos de SMTP, OAuth o pagos a los procesos hijos.
    case "$key" in
      MYSQL_DATABASE|MYSQL_USER|MYSQL_PASSWORD|MYSQL_HOST|MYSQL_PORT|\
      DB_PASSWORD|BACKUP_DIR|RETENTION_DAYS|BACKUP_MODE|DB_CONTAINER|\
      BACKUP_PREFIX|DUMP_ROUTINES)
        ;;
      *)
        continue
        ;;
    esac

    # Quita comillas simples o dobles que envuelvan todo el valor.
    if [[ "$value" == \"*\" && "$value" == *\" && ${#value} -ge 2 ]]; then
      value="${value:1:${#value}-2}"
    elif [[ "$value" == \'*\' && "$value" == *\' && ${#value} -ge 2 ]]; then
      value="${value:1:${#value}-2}"
    fi

    # Respeta un valor no vacío ya definido en el entorno; si está vacío o
    # ausente, lo toma del archivo. Así funciona el flujo normal con .env.
    if [[ -z "${!key:-}" ]]; then
      export "${key}=${value}"
    fi
  done < "$file"
}

load_configuration() {
  load_env_file "$ENV_FILE"

  BACKUP_DIR="${BACKUP_DIR:-${PROJECT_ROOT}/backups}"
  RETENTION_DAYS="${RETENTION_DAYS:-7}"
  BACKUP_MODE="${BACKUP_MODE:-auto}"
  DB_CONTAINER="${DB_CONTAINER:-neodomus_mysql}"
  MYSQL_DATABASE="${MYSQL_DATABASE:-neodomus}"
  MYSQL_USER="${MYSQL_USER:-neodomus}"
  MYSQL_PASSWORD="${MYSQL_PASSWORD:-${DB_PASSWORD:-}}"
  MYSQL_HOST="${MYSQL_HOST:-127.0.0.1}"
  MYSQL_PORT="${MYSQL_PORT:-3307}"
  BACKUP_PREFIX="${BACKUP_PREFIX:-neodomus}"
  DUMP_ROUTINES="${DUMP_ROUTINES:-false}"
}

validate_configuration() {
  [[ -n "$MYSQL_PASSWORD" ]] || die "MYSQL_PASSWORD no está definido. Configure .env o exporte la variable antes de ejecutar el script."
  [[ -n "$MYSQL_DATABASE" ]] || die "MYSQL_DATABASE no puede estar vacío."
  [[ -n "$MYSQL_USER" ]] || die "MYSQL_USER no puede estar vacío."

  [[ "$MYSQL_DATABASE" =~ ^[A-Za-z0-9_]+$ ]] || die "MYSQL_DATABASE contiene caracteres no permitidos."
  [[ "$MYSQL_USER" =~ ^[A-Za-z0-9_.-]+$ ]] || die "MYSQL_USER contiene caracteres no permitidos."
  [[ "$RETENTION_DAYS" =~ ^[0-9]+$ ]] || die "RETENTION_DAYS debe ser un entero positivo."
  (( RETENTION_DAYS >= 1 )) || die "RETENTION_DAYS debe ser mayor o igual a 1."
  [[ "$MYSQL_PORT" =~ ^[0-9]+$ ]] || die "MYSQL_PORT debe ser numérico."
  (( MYSQL_PORT >= 1 && MYSQL_PORT <= 65535 )) || die "MYSQL_PORT debe estar entre 1 y 65535."
  [[ "$DUMP_ROUTINES" == "true" || "$DUMP_ROUTINES" == "false" ]] || die "DUMP_ROUTINES debe ser true o false."
  [[ -n "$BACKUP_PREFIX" ]] || die "BACKUP_PREFIX no puede estar vacío."
}

# -----------------------------------------------------------------------------
# Dependencias y modo de ejecución
# -----------------------------------------------------------------------------

detect_mode() {
  case "$BACKUP_MODE" in
    docker)
      MODE="docker"
      ;;
    local)
      MODE="local"
      ;;
    auto)
      if command -v docker >/dev/null 2>&1; then
        local running=""
        running="$(docker inspect -f '{{.State.Running}}' "$DB_CONTAINER" 2>/dev/null || true)"
        if [[ "$running" == "true" ]]; then
          MODE="docker"
        else
          MODE="local"
        fi
      else
        MODE="local"
      fi
      ;;
    *)
      die "BACKUP_MODE inválido: ${BACKUP_MODE}. Use auto, docker o local."
      ;;
  esac

  log_info "Modo de respaldo: ${MODE}"
}

check_dependencies() {
  local -a missing=()
  local cmd

  for cmd in date gzip find du cut wc sha256sum mktemp; do
    command -v "$cmd" >/dev/null 2>&1 || missing+=("$cmd")
  done

  if ((${#missing[@]} > 0)); then
    die "Faltan dependencias: ${missing[*]}. Instálelas antes de continuar."
  fi

  if [[ "$MODE" == "docker" ]]; then
    command -v docker >/dev/null 2>&1 || die "Docker no está instalado o no está en PATH."
    local running=""
    running="$(docker inspect -f '{{.State.Running}}' "$DB_CONTAINER" 2>/dev/null || true)"
    [[ "$running" == "true" ]] || die "El contenedor ${DB_CONTAINER} no existe o no está en ejecución."
  else
    command -v mysqldump >/dev/null 2>&1 || die "mysqldump no está instalado o no está en PATH."
    command -v mysql >/dev/null 2>&1 || die "El cliente mysql no está instalado o no está en PATH."
  fi
}

check_database_access() {
  log_info "Verificando acceso a la base de datos ${MYSQL_DATABASE}..."

  if [[ "$MODE" == "docker" ]]; then
    if ! docker exec -e "MYSQL_PWD=${MYSQL_PASSWORD}" "$DB_CONTAINER" \
      mysql --connect-timeout=10 -u "$MYSQL_USER" -N -e "SELECT 1" "$MYSQL_DATABASE" >/dev/null 2>&1; then
      die "No se pudo conectar a MySQL en el contenedor ${DB_CONTAINER}. Revise MYSQL_USER, MYSQL_PASSWORD y MYSQL_DATABASE."
    fi
  else
    if ! MYSQL_PWD="$MYSQL_PASSWORD" mysql --protocol=TCP \
      --host="$MYSQL_HOST" --port="$MYSQL_PORT" --connect-timeout=10 \
      -u "$MYSQL_USER" -N -e "SELECT 1" "$MYSQL_DATABASE" >/dev/null 2>&1; then
      die "No se pudo conectar a MySQL en ${MYSQL_HOST}:${MYSQL_PORT}. Revise MYSQL_USER, MYSQL_PASSWORD y MYSQL_DATABASE."
    fi
  fi

  log_ok "Conexión verificada."
}

prepare_backup_dir() {
  if ! mkdir -p -- "$BACKUP_DIR"; then
    die "No se pudo crear el directorio de respaldos: ${BACKUP_DIR}"
  fi
  chmod 700 -- "$BACKUP_DIR" 2>/dev/null || log_warn "No se pudo ajustar el permiso 700 en ${BACKUP_DIR}."
}

# -----------------------------------------------------------------------------
# Respaldo
# -----------------------------------------------------------------------------

run_mysqldump() {
  local -a dump_args=(
    --single-transaction
    --quick
    --triggers
    --default-character-set=utf8mb4
    --set-gtid-purged=OFF
    --no-tablespaces
  )

  if [[ "$DUMP_ROUTINES" == "true" ]]; then
    dump_args+=(--routines --events)
  fi

  if [[ "$MODE" == "docker" ]]; then
    docker exec -e "MYSQL_PWD=${MYSQL_PASSWORD}" "$DB_CONTAINER" \
      mysqldump "${dump_args[@]}" -u "$MYSQL_USER" "$MYSQL_DATABASE"
  else
    MYSQL_PWD="$MYSQL_PASSWORD" mysqldump --protocol=TCP \
      --host="$MYSQL_HOST" --port="$MYSQL_PORT" \
      "${dump_args[@]}" -u "$MYSQL_USER" "$MYSQL_DATABASE"
  fi
}

create_backup() {
  local timestamp
  timestamp="$(date -u +'%Y%m%d_%H%M%S')"
  BACKUP_FILE="${BACKUP_DIR}/${BACKUP_PREFIX}_${timestamp}.sql.gz"
  TMP_FILE="${BACKUP_FILE}.tmp"
  CHECKSUM_FILE="${BACKUP_FILE}.sha256"

  log_info "Generando respaldo comprimido de ${MYSQL_DATABASE}..."

  # pipefail garantiza que un fallo de mysqldump no se oculte detrás de gzip.
  if ! run_mysqldump | gzip -9 > "$TMP_FILE"; then
    die "Falló mysqldump o gzip. No se conservará un archivo incompleto."
  fi

  if [[ ! -s "$TMP_FILE" ]]; then
    die "El archivo temporal está vacío: ${TMP_FILE}"
  fi

  if ! gzip -t "$TMP_FILE" 2>/dev/null; then
    die "La verificación gzip falló: el archivo no es un .gz válido."
  fi

  BACKUP_BYTES="$(wc -c < "$TMP_FILE")"
  BACKUP_BYTES="${BACKUP_BYTES//[[:space:]]/}"
  if [[ ! "$BACKUP_BYTES" =~ ^[0-9]+$ ]] || (( BACKUP_BYTES <= 0 )); then
    die "El tamaño del respaldo no es válido."
  fi

  BACKUP_HASH="$(sha256sum "$TMP_FILE" | cut -d' ' -f1)"
  [[ "$BACKUP_HASH" =~ ^[0-9a-f]{64}$ ]] || die "No se pudo calcular un SHA-256 válido."

  mv -- "$TMP_FILE" "$BACKUP_FILE"
  TMP_FILE=""
  chmod 600 -- "$BACKUP_FILE"
  BACKUP_SIZE_HUMAN="$(du -h "$BACKUP_FILE" | cut -f1)"

  printf '%s  %s\n' "$BACKUP_HASH" "$(basename -- "$BACKUP_FILE")" > "$CHECKSUM_FILE"
  chmod 600 -- "$CHECKSUM_FILE"

  BACKUP_COMPLETE="true"
  log_ok "Respaldo creado y verificado: $(basename -- "$BACKUP_FILE")"
}

apply_retention_policy() {
  local file
  DELETED_COUNT="0"

  log_info "Aplicando retención de ${RETENTION_DAYS} días en ${BACKUP_DIR}..."

  while IFS= read -r -d '' file; do
    rm -f -- "$file"
    DELETED_COUNT=$((DELETED_COUNT + 1))
    log_info "Eliminado por retención: $(basename -- "$file")"
  done < <(
    find "$BACKUP_DIR" -maxdepth 1 -type f \
      \( -name "${BACKUP_PREFIX}_*.sql.gz" -o -name "${BACKUP_PREFIX}_*.sql.gz.sha256" \) \
      -mtime +"${RETENTION_DAYS}" -print0
  )

  log_ok "Retención aplicada. Archivos eliminados: ${DELETED_COUNT}."
}

# -----------------------------------------------------------------------------
# Resumen y limpieza
# -----------------------------------------------------------------------------

print_summary() {
  printf '\n'
  printf '============================================================\n'
  printf ' RESPALDO COMPLETADO - NEODOMUS\n'
  printf '============================================================\n'
  printf ' Archivo    : %s\n' "$BACKUP_FILE"
  printf ' Checksum   : %s\n' "$CHECKSUM_FILE"
  printf ' Tamaño     : %s (%s bytes)\n' "$BACKUP_SIZE_HUMAN" "$BACKUP_BYTES"
  printf ' SHA-256    : %s\n' "$BACKUP_HASH"
  printf ' Base datos : %s\n' "$MYSQL_DATABASE"
  printf ' Modo       : %s\n' "$MODE"
  printf ' Retención  : %s días\n' "$RETENTION_DAYS"
  printf ' Purgados   : %s archivo(s)\n' "$DELETED_COUNT"
  printf ' Estado     : OK\n'
  printf '============================================================\n'
  printf ' Para verificar: cd %s && sha256sum -c %s\n' \
    "$BACKUP_DIR" "$(basename -- "$CHECKSUM_FILE")"
  printf ' Para restaurar: ver Sección 3 de docs/plan-implantacion.md\n'
}

# shellcheck disable=SC2329  # Se invoca indirectamente mediante trap EXIT.
cleanup() {
  local status=$?

  if [[ -n "$TMP_FILE" && -f "$TMP_FILE" ]]; then
    rm -f -- "$TMP_FILE" || true
    log_warn "Se eliminó el archivo temporal incompleto: ${TMP_FILE}"
  fi

  if [[ "$BACKUP_COMPLETE" != "true" && -n "$BACKUP_FILE" && -f "$BACKUP_FILE" ]]; then
    rm -f -- "$BACKUP_FILE" "$CHECKSUM_FILE" || true
    log_warn "Se eliminó el respaldo incompleto: ${BACKUP_FILE}"
  fi

  return "$status"
}

# -----------------------------------------------------------------------------
# Punto de entrada
# -----------------------------------------------------------------------------

main() {
  while (($# > 0)); do
    case "$1" in
      -h|--help)
        usage
        return 0
        ;;
      --backup-dir)
        (($# >= 2)) || die "Falta el valor de --backup-dir."
        BACKUP_DIR="$2"
        shift 2
        ;;
      --retention-days)
        (($# >= 2)) || die "Falta el valor de --retention-days."
        RETENTION_DAYS="$2"
        shift 2
        ;;
      --mode)
        (($# >= 2)) || die "Falta el valor de --mode."
        BACKUP_MODE="$2"
        shift 2
        ;;
      *)
        die "Opción no reconocida: $1. Use --help para ver las opciones."
        ;;
    esac
  done

  load_configuration
  validate_configuration
  detect_mode
  check_dependencies
  check_database_access
  prepare_backup_dir

  trap cleanup EXIT

  create_backup
  apply_retention_policy
  print_summary

  log_ok "Proceso finalizado correctamente."
}

if main "$@"; then
  exit 0
else
  exit 1
fi
