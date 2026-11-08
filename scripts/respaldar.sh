#!/usr/bin/env bash
set -euo pipefail
set -E
umask 077

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"

# Configuración segura por defecto para la instalación Docker actual (MySQL 8).
BACKUP_DIR="${BACKUP_DIR:-${PROJECT_ROOT}/backups/mysql}"
BACKUP_PREFIX="${BACKUP_PREFIX:-neodomus_mysql}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"
BACKUP_SOURCE="${BACKUP_SOURCE:-docker}" # docker | local
COMPOSE_FILE="${COMPOSE_FILE:-${PROJECT_ROOT}/docker-compose.yml}"
DB_SERVICE="${BACKUP_DB_SERVICE:-db}"
DB_NAME="${MYSQL_DATABASE:-neodomus}"
DB_HOST="${MYSQL_HOST:-127.0.0.1}"
DB_PORT="${MYSQL_PORT:-3306}"
DB_USER="${MYSQL_USER:-neodomus}"
BACKUP_ENCRYPTION="${BACKUP_ENCRYPTION:-none}" # none | age
BACKUP_AGE_RECIPIENT="${BACKUP_AGE_RECIPIENT:-}"

TIMESTAMP="$(date -u '+%Y%m%d_%H%M%S')"
FINAL_SUFFIX='.sql.gz'
if [[ "${BACKUP_ENCRYPTION}" == 'age' ]]; then
  FINAL_SUFFIX+='.age'
fi
BACKUP_FILE="${BACKUP_DIR}/${BACKUP_PREFIX}_${TIMESTAMP}${FINAL_SUFFIX}"
TEMP_GZIP=''
TEMP_ENCRYPTED=''

log_info() {
  printf '[INFO] %s\n' "$*"
}

log_error() {
  printf '[ERROR] %s\n' "$*" >&2
}

cleanup() {
  local status=$?
  [[ -z "${TEMP_GZIP}" ]] || rm -f -- "${TEMP_GZIP}"
  [[ -z "${TEMP_ENCRYPTED}" ]] || rm -f -- "${TEMP_ENCRYPTED}"
  if (( status != 0 )); then
    log_error "Respaldo fallido. Se limpiaron los temporales incompletos."
  fi
}

on_signal() {
  exit 1
}

trap cleanup EXIT
trap on_signal HUP INT TERM
trap 'exit 1' ERR

validate_configuration() {
  [[ "${BACKUP_PREFIX}" =~ ^[A-Za-z0-9._-]+$ ]] || {
    log_error 'BACKUP_PREFIX solo puede contener letras, números, punto, guion y guion bajo.'
    return 1
  }
  [[ "${DB_NAME}" =~ ^[A-Za-z0-9_]+$ ]] || {
    log_error 'MYSQL_DATABASE debe ser un identificador MySQL simple.'
    return 1
  }
  [[ "${RETENTION_DAYS}" =~ ^[0-9]+$ ]] || {
    log_error 'BACKUP_RETENTION_DAYS debe ser un entero entre 1 y 3650.'
    return 1
  }
  RETENTION_DAYS=$((10#${RETENTION_DAYS}))
  (( RETENTION_DAYS >= 1 && RETENTION_DAYS <= 3650 )) || {
    log_error 'BACKUP_RETENTION_DAYS debe ser un entero entre 1 y 3650.'
    return 1
  }
  case "${BACKUP_SOURCE}" in
    docker|local) ;;
    *) log_error 'BACKUP_SOURCE debe ser docker o local.'; return 1 ;;
  esac
  case "${BACKUP_ENCRYPTION}" in
    none) ;;
    age)
      [[ -n "${BACKUP_AGE_RECIPIENT}" ]] || {
        log_error 'BACKUP_AGE_RECIPIENT es obligatorio cuando BACKUP_ENCRYPTION=age.'
        return 1
      }
      ;;
    *) log_error 'BACKUP_ENCRYPTION debe ser none o age.'; return 1 ;;
  esac
}

check_dependencies() {
  local dependency
  for dependency in date find gzip mktemp du awk stat; do
    command -v "${dependency}" >/dev/null 2>&1 || {
      log_error "No se encontró la dependencia requerida: ${dependency}."
      return 1
    }
  done

  if [[ "${BACKUP_SOURCE}" == 'docker' ]]; then
    command -v docker >/dev/null 2>&1 || {
      log_error 'Docker no está instalado o no está disponible en PATH.'
      return 1
    }
    docker compose version >/dev/null 2>&1 || {
      log_error 'Se requiere el complemento Docker Compose v2.'
      return 1
    }
    [[ -f "${COMPOSE_FILE}" ]] || {
      log_error "No existe el archivo Compose: ${COMPOSE_FILE}."
      return 1
    }
  else
    command -v mysqldump >/dev/null 2>&1 || {
      log_error 'No se encontró mysqldump para BACKUP_SOURCE=local.'
      return 1
    }
    [[ -n "${MYSQL_PASSWORD:-}" ]] || {
      log_error 'Define MYSQL_PASSWORD en el entorno para BACKUP_SOURCE=local.'
      return 1
    }
  fi

  if [[ "${BACKUP_ENCRYPTION}" == 'age' ]]; then
    command -v age >/dev/null 2>&1 || {
      log_error 'No se encontró age; instálalo o usa BACKUP_ENCRYPTION=none en un entorno local protegido.'
      return 1
    }
  fi
}

dump_database() {
  if [[ "${BACKUP_SOURCE}" == 'docker' ]]; then
    (
      cd -- "${PROJECT_ROOT}"
      docker compose -f "${COMPOSE_FILE}" exec -T "${DB_SERVICE}" sh -c '
        set -eu
        export MYSQL_PWD="${MYSQL_ROOT_PASSWORD:?MYSQL_ROOT_PASSWORD no está configurada en el servicio MySQL}"
        exec mysqldump --user=root --single-transaction --routines --triggers --events --hex-blob --no-tablespaces "${MYSQL_DATABASE:?MYSQL_DATABASE no está configurada}"
      '
    )
  else
    MYSQL_PWD="${MYSQL_PASSWORD}" mysqldump \
      --host="${DB_HOST}" \
      --port="${DB_PORT}" \
      --user="${DB_USER}" \
      --single-transaction \
      --routines \
      --triggers \
      --events \
      --hex-blob \
      --no-tablespaces \
      "${DB_NAME}"
  fi
}

create_backup() {
  mkdir -p -- "${BACKUP_DIR}"
  [[ ! -L "${BACKUP_DIR}" ]] || {
    log_error 'BACKUP_DIR no puede ser un enlace simbólico.'
    return 1
  }
  BACKUP_DIR="$(cd -- "${BACKUP_DIR}" && pwd)"
  [[ "${BACKUP_DIR}" != '/' ]] || {
    log_error 'BACKUP_DIR no puede ser la raíz del sistema.'
    return 1
  }
  local directory_mode
  directory_mode="$(stat -c '%a' "${BACKUP_DIR}" 2>/dev/null || stat -f '%Lp' "${BACKUP_DIR}")"
  [[ "${directory_mode}" =~ ^[0-7]{3,4}$ ]] || {
    log_error 'No se pudo comprobar los permisos del directorio de respaldos.'
    return 1
  }
  (( (8#${directory_mode} & 077) == 0 )) || {
    log_error 'BACKUP_DIR debe tener permisos privados (0700 o más restrictivos).'
    return 1
  }

  BACKUP_FILE="${BACKUP_DIR}/${BACKUP_PREFIX}_${TIMESTAMP}${FINAL_SUFFIX}"

  TEMP_GZIP="$(mktemp "${BACKUP_DIR}/.${BACKUP_PREFIX}_${TIMESTAMP}.XXXXXX")"
  if ! dump_database | gzip -c >"${TEMP_GZIP}"; then
    log_error 'Falló la exportación o compresión de la base de datos.'
    return 1
  fi
  [[ -s "${TEMP_GZIP}" ]] || {
    log_error 'El archivo temporal está vacío.'
    return 1
  }
  gzip -t -- "${TEMP_GZIP}" || {
    log_error 'El archivo comprimido no pasó la prueba de integridad gzip.'
    return 1
  }

  if [[ "${BACKUP_ENCRYPTION}" == 'age' ]]; then
    TEMP_ENCRYPTED="$(mktemp "${BACKUP_DIR}/.${BACKUP_PREFIX}_${TIMESTAMP}.XXXXXX")"
    age --encrypt --recipient "${BACKUP_AGE_RECIPIENT}" "${TEMP_GZIP}" >"${TEMP_ENCRYPTED}"
    [[ -s "${TEMP_ENCRYPTED}" ]] || {
      log_error 'El archivo cifrado está vacío.'
      return 1
    }
    rm -f -- "${TEMP_GZIP}"
    TEMP_GZIP=''
    [[ ! -e "${BACKUP_FILE}" ]] || {
      log_error "Ya existe un respaldo con ese timestamp: ${BACKUP_FILE}."
      return 1
    }
    mv -- "${TEMP_ENCRYPTED}" "${BACKUP_FILE}"
    TEMP_ENCRYPTED=''
  else
    [[ ! -e "${BACKUP_FILE}" ]] || {
      log_error "Ya existe un respaldo con ese timestamp: ${BACKUP_FILE}."
      return 1
    }
    mv -- "${TEMP_GZIP}" "${BACKUP_FILE}"
    TEMP_GZIP=''
  fi

  [[ -s "${BACKUP_FILE}" ]] || {
    rm -f -- "${BACKUP_FILE}"
    log_error 'El archivo de respaldo final no existe o está vacío.'
    return 1
  }
}

apply_retention_policy() {
  local age_minutes=$((RETENTION_DAYS * 1440))
  local file
  local -a backups
  shopt -s nullglob
  backups=("${BACKUP_DIR}/${BACKUP_PREFIX}_"*.sql.gz*)
  shopt -u nullglob

  log_info "Eliminando respaldos ${BACKUP_PREFIX}_* con más de ${RETENTION_DAYS} días."
  for file in "${backups[@]}"; do
    [[ -f "${file}" ]] || continue
    find "${file}" -type f -mmin "+${age_minutes}" -print -delete
  done
}

print_summary() {
  local size
  local checksum
  size="$(du -h "${BACKUP_FILE}" | awk '{print $1}')"
  if command -v sha256sum >/dev/null 2>&1; then
    checksum="$(sha256sum "${BACKUP_FILE}" | awk '{print $1}')"
  elif command -v shasum >/dev/null 2>&1; then
    checksum="$(shasum -a 256 "${BACKUP_FILE}" | awk '{print $1}')"
  else
    log_error 'Se requiere sha256sum o shasum para registrar la integridad del respaldo.'
    return 1
  fi
  printf '\nResumen de respaldo\n'
  printf '  Archivo: %s\n' "${BACKUP_FILE}"
  printf '  Tamaño:  %s\n' "${size}"
  printf '  SHA-256: %s\n' "${checksum}"
  printf '  Estado:  ÉXITO\n'
}

main() {
  if (( $# > 0 )); then
    log_error 'Este script se configura mediante variables de entorno y no acepta argumentos posicionales.'
    return 1
  fi
  cd -- "${PROJECT_ROOT}"
  validate_configuration
  check_dependencies
  log_info "Iniciando respaldo MySQL (${BACKUP_SOURCE}; servicio ${DB_SERVICE})."
  create_backup
  apply_retention_policy
  print_summary
}

main "$@"
exit 0
