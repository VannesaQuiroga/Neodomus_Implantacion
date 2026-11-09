# PEN-06 — Runbook: rotación de `SMTP_PASSWORD` y saneamiento del historial de Git

| | |
|---|---|
| **Clasificación** | Interno — contiene referencias a un secreto filtrado (sin revelar el valor) |
| **Fecha de creación** | 2026-11-09 |
| **Alcance** | Repositorio `neodomus_actualizaciones` (remoto `origin` en GitHub) |
| **Audiencia** | Equipo de desarrollo y mantenimiento |
| **Estado de ejecución** | ⏳ Pendiente de ejecutar por el operador |

> **Este documento no contiene contraseñas, tokens ni valores de secretos.**

---

## 0. Contexto (auditoría PEN-06)

Durante la confirmación de la creación de cuentas del equipo (técnico `julian.carvajal@gmail.com`,
verificada ✅), el análisis del historial detectó:

- El commit `c0cc374` **añadió el archivo `.env` al historial** con las claves:
  - `SMTP_PASSWORD` (secreto real — **requiere rotación inmediata**),
  - `GOOGLE_SIGNIN_CLIENT_ID` y `VITE_GOOGLE_CLIENT_ID` (públicos por diseño, riesgo bajo).
- `commit a0216fb` lo eliminó del árbol de trabajo, pero **los datos permanecen en el historial**.
- El remoto `origin` está publicado en GitHub, por lo que el histórico filtrado es accesible
  para quien clone el repo completo.
- El commit `65a6c3e` incluye un script personal one-off revisionado: **sin secretos**.
- El valor filtrado **no aparece** en ningún archivo del árbol actual ni de otros commits
  (verificado vía *pickaxe* `git log -S`).

**Orden de ejecución obligatorio:** FASE 1 (rotación) → FASE 2 (purga del historial) →
FASE 3 (prevención). La rotación anula el valor expuesto aunque la purga tarde en ejecutarse.

---

## FASE 1 — Rotación de `SMTP_PASSWORD` (operador)

Prerrequisitos: acceso de administrador a la cuenta de correo del `SMTP_USERNAME` configurado.

```powershell
# 1. Generar la nueva contraseña de aplicación
#    myaccount.google.com → Seguridad → Verificación en dos pasos → Contraseñas de aplicación
#    Nombre: "neodomus-api". Copiar los 16 caracteres (se muestran una sola vez).

# 2. REVOCAR la contraseña antigua (botón "Eliminar") — no esperar a la purga.

# 3. Editar .env (no rastreado por Git) en un editor local; reemplazar SOLO
#    el valor de SMTP_PASSWORD, pegándola completa y sin espacios.
notepad .env

# 4. Recrear la API (cambios en env_file: de compose requieren recreate):
docker compose up -d --force-recreate api

# 5. Validar SIN exponer la clave (imprime PASS/FAIL y la causa; nunca la contraseña):
docker exec neodomus_api sh -c "cd /app && uv run python scripts/check_smtp.py"
#    Esperado: "PASS conexión+TLS ..." y "PASS login ..."

# 6. Si la clave antigua estaba en otros servicios, rotar también allí.
```

**Criterio de cierre FASE 1:** salida `PASS login` en check_smtp.py.

---

## FASE 2 — Purga del historial con `git filter-repo`

> ⚠️ **Reescribe TODOS los SHAs** (ramas y tags). Ejecutar en un **clon espejo fresco**,
> nunca en el working copy de desarrollo (puede tener cambios sin commit).

> ⚠️ Tras publicar, **todo el equipo debe re-clonar** los repos locales; los PR abiertos
> seguirán referenciando SHAs antiguos (posible limpieza vía GitHub Support, opcional).

### Paso 1 — Preservar el trabajo local pendiente

Estado de referencia donde **empezó esta purga** (capturado antes de ejecutarla):
rama `main` @ `362c7fe`. Cambios sin commit: `scripts/crear_admin.py` y `scripts/init_db.sql`.
Stash local identificado: `stash@{0}: On main: init_db local (seed regen)`.

```powershell
# 1a. Guardar los cambios pendientes (dos archivos, sin secretos).
#     IMPORTANTE: con `cmd /c` porque PowerShell redirige con encodings UTF-16/BOM
#     y, si el diff tuviera que re-aplicarse con `git apply`, fallaría.
cmd /c "git diff > C:\Users\valet\cambios_locales_pen06.diff"

# 1b. Verificar que el diff es no-vacío y coincide con lo esperado:
git diff --stat
#    Esperado: scripts/crear_admin.py y scripts/init_db.sql

# 1c. Archivar también el contenido del stash (por si se necesita después):
cmd /c "git stash show -p > C:\Users\valet\rescate_stash_init_db.diff"
```

### Paso 2 — Respaldo completo (antes de tocar nada)

```powershell
git bundle create C:\Users\valet\respaldo_neodomus.bundle --all
```

> El bundle contiene el `.env` histórico → **mantener en local** hasta cerrar el runbook
> (Paso 5 de esta fase) y **no publicarlo nunca**.

### Paso 3 — Purga en clon espejo

```powershell
# Instalar la herramienta (Python 3.11 presente en el host):
python -m pip install git-filter-repo

# Clon espejo (bare) desde el repo local: incluye TODAS las ramas y tags:
git clone --mirror C:\Users\valet\neodomus_actualizaciones-main C:\Users\valet\purga-neodomus.git
cd C:\Users\valet\purga-neodomus.git

# Eliminar .env de TODO el historial (todas las refs):
git filter-repo --path .env --invert-paths --force

# Verificación 1: el archivo ya no existe en el historial (salida vacía):
git log --all --oneline -- .env

# Re-asignar el remoto (filter-repo lo retira por seguridad) y publicar:
git remote add origin https://github.com/nicolmarinoromero-bit/neodomus_actualizaciones.git
git push --force origin --all
git push --force origin --tags
```

Ruta alternativa sin instalar Python: ejecutar filter-repo en contenedor:

```powershell
docker run --rm -it -v C:\Users\valet\purga-neodomus.git:/repo python:3.12-slim bash -lc "pip install git-filter-repo && cd /repo && git filter-repo --path .env --invert-paths --force"
```

### Paso 4 — Sincronizar el working copy local al historial nuevo

```powershell
cd C:\Users\valet\neodomus_actualizaciones-main
git fetch --prune origin
git reset --hard origin/main
# Reaplicar el trabajo pendiente y el fix de portabilidad:
git apply C:\Users\valet\cambios_locales_pen06.diff
git status --short
#    Esperado: scripts/crear_admin.py y scripts/init_db.sql modificados de nuevo.

# Limpieza de objetos con el secreto en el repo local:
git reflog expire --expire=now --all
git gc --prune=now --aggressive
```

El stash sobrevive a `reset --hard` (vive en `refs/stash`); si tras revisar el diff del
Paso 1c se decide que no aporta nada, descartarlo consciente:
```powershell
git stash drop stash@{0}
```

### Paso 5 — Cierre y limpieza

```powershell
# Cachés de GitHub (commits huérfanos en PRs): opcional via GitHub Support.
# Una vez verificada la purga en GitHub, borrar el respaldo que contiene el .env viejo:
RM C:\Users\valet\respaldo_neodomus.bundle
RM C:\Users\valet\purga-neodomus.git -Recurse -Force
# Conservar (opcional): cambios_locales_pen06.diff y rescate_stash_init_db.diff
```

**Criterio de cierre FASE 2:** `git log --all --oneline -- .env` vacío en el remoto
(y en el repo local tras el Paso 4).

---

## FASE 3 — Prevención (después de purgar, para que el escáner arranque limpio)

### 3.1 Escaneo de secretos en CI — `.github/workflows/gitleaks.yml` (nuevo)

> No agregarlo ANTES de la purga: el primer barrido marcaría el `.env` histórico.

```yaml
name: Secret Scan (gitleaks)

on:
  push:
  pull_request:
  workflow_dispatch:

permissions:
  contents: read

jobs:
  gitleaks:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0          # escanea TODO el historial
      - uses: gitleaks/gitleaks-action@v2
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

### 3.2 Hook local (opcional) — `.pre-commit-config.yaml` (nuevo)

```yaml
repos:
  - repo: https://github.com/gitleaks/gitleaks
    rev: v8.24.3
    hooks:
      - id: gitleaks
```

```powershell
python -m pip install pre-commit
pre-commit install
```

### 3.3 Hardening de `.gitignore` (añadir 2 líneas en la sección "local env files")

```
.env.*
!.env.example
```

### 3.4 Repositorio GitHub → Settings → Code security

- Activa **Secret scanning** y **Push protection** (bloquea pushes con secretos detectados).

### 3.5 Reglas de equipo

- Secretos solo en `.env` local y en el gestor de secrets correspondiente.
- Nunca commits de archivos de configuración sensibles (ni "temporales").
- Rotación inmediata ante cualquier sospecha — la rotación es el kill-switch; la purga es higiene.

---

## Registro de ejecución

| Paso | Ejecutado por | Fecha | Resultado / Evidencia |
|---|---|---|---|
| FASE 1 (rotación + check_smtp) | | | |
| FASE 2 Paso 1 (diff + rescate stash) | | | |
| FASE 2 Paso 2 (bundle) | | | |
| FASE 2 Paso 3 (filter-repo + push) | | | |
| FASE 2 Paso 4 (fetch/reset/apply/diff/gc) | | | |
| FASE 2 Paso 5 (limpieza respaldo) | | | |
| FASE 3 (gitleaks + settings + gitignore) | | | |

---

## Referencias de auditoría (historial ANTIGUO; SHAs dejarán de existir tras la purga)

- Commits que filtraron `.env`: `c0cc374` (añade), `a0216fb` (elimina).
- Commit con script one-off revisado, sin secretos: `65a6c3e`.
- Reporte complementario de la ejecución de verificación: eliminado del repo (temp),
  este runbook es el registro permanente.
