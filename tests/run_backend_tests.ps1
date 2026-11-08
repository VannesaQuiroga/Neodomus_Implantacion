#requires -Version 5.1
<#
.SYNOPSIS
  Ejecuta las pruebas del BACKEND de NeoDomus (unittest) sobre la base de
  pruebas aislada 'neodomus_test'.

.DESCRIPTION
  Modos:
    - HOST (por defecto): usa el Python local. El script verifica dependencias
      con 'pip list' (no instala nada) y la conectividad MySQL (TCP).
    - -InDocker: ejecuta dentro del contenedor 'api' via 'uv' (docker compose
      exec). Exige que el contenedor este corriendo; NO lo inicia.

  Seguridad:
    - Exige TEST_DATABASE_URL apuntando EXCLUSIVAMENTE a la base de pruebas
      'neodomus_test' (o a la indicada con -DatabaseName). Nunca usa la base de
      desarrollo 'neodomus'.
    - No crea, elimina ni migra bases de datos. No instala dependencias.
      No inicia/termina Docker. No modifica archivos .env ni tests existentes.

  Codigos de salida: 0 = OK | 1 = pruebas fallidas | 2 = requisitos no cumplidos / uso.

.EXAMPLE
  powershell -NoProfile -ExecutionPolicy Bypass -File tests\run_backend_tests.ps1
.EXAMPLE
  powershell -NoProfile -ExecutionPolicy Bypass -File tests\run_backend_tests.ps1 -Module test_auth
.EXAMPLE
  powershell -NoProfile -ExecutionPolicy Bypass -File tests\run_backend_tests.ps1 -InDocker -Coverage
#>
[CmdletBinding()]
param(
    [string]$Module = '',
    [switch]$Coverage,
    [switch]$Html,
    [switch]$Xml,
    [switch]$InDocker,
    [string]$DatabaseName = 'neodomus_test'
)

$ErrorActionPreference = 'Stop'
$Root      = Split-Path -Parent $PSScriptRoot
$BeDir     = Join-Path $Root 'be'
$Stopwatch = [System.Diagnostics.Stopwatch]::StartNew()
. (Join-Path $PSScriptRoot 'TestRunner.Common.ps1')

function Assert-TestDatabaseUrl {
    Write-Host '[1] Validando TEST_DATABASE_URL...' -ForegroundColor Yellow
    $url = $env:TEST_DATABASE_URL
    if ([string]::IsNullOrWhiteSpace($url)) {
        Write-Host '  ERROR: TEST_DATABASE_URL no esta definida en esta sesion.' -ForegroundColor Red
        Write-Host '  Fija la variable (ajusta usuario/contrasena/port a tu entorno):' -ForegroundColor Yellow
        Write-Host '  $env:TEST_DATABASE_URL = "mysql+pymysql://neodomus:<password>@localhost:3307/neodomus_test?charset=utf8mb4"' -ForegroundColor Green
        return $null
    }
    $info = Get-DatabaseInfo -Url $url
    if (-not $info) {
        Write-Host '  ERROR: TEST_DATABASE_URL no tiene un formato reconocible.' -ForegroundColor Red
        Write-Host '  Formato esperado: mysql+pymysql://usuario:contrasena@host:puerto/nombre_base?charset=utf8mb4' -ForegroundColor Yellow
        return $null
    }
    if ($info.Database -ceq 'neodomus') {
        Write-Host ("  ERROR CRITICO: la URL apunta a la base de DESARROLLO '{0}'. Nunca se ejecutan pruebas ahi." -f $info.Database) -ForegroundColor Red
        return $null
    }
    if ($info.Database -cne $DatabaseName) {
        Write-Host ("  ERROR: la base '{0}' no es la base de pruebas exigida ('{1}')." -f $info.Database, $DatabaseName) -ForegroundColor Red
        Write-Host ("  Si es una base alternativa de pruebas, reintenta con -DatabaseName '{0}'." -f $info.Database) -ForegroundColor Yellow
        return $null
    }
    Write-Host ("  OK: base de pruebas validada '{0}' en {1}:{2}." -f $info.Database, $info.HostName, $info.Port) -ForegroundColor Green
    return $info
}

function Test-DockerReady {
    Write-Host '[2] Validando Docker y contenedor api...' -ForegroundColor Yellow
    if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
        Write-Host '  ERROR: docker no esta disponible en PATH (instala/arranca Docker Desktop).' -ForegroundColor Red
        return $false
    }
    $cid = ''
    Push-Location $Root
    try {
        $cid = (& docker compose ps -q api 2>$null | Out-String).Trim()
    } finally {
        Pop-Location
    }
    if ([string]::IsNullOrWhiteSpace($cid)) {
        Write-Host "  ERROR: el contenedor 'api' no esta corriendo." -ForegroundColor Red
        Write-Host '  Arranca Docker Desktop y ejecuta MANUALMENTE: docker compose up -d db api' -ForegroundColor Green
        return $false
    }
    Write-Host '  OK: contenedor api corriendo.' -ForegroundColor Green
    return $true
}

function Invoke-Py {
    param([string[]]$PyArgs)
    $output = & python @PyArgs 2>&1
    $rc = $LASTEXITCODE
    if ($output) { $output | ForEach-Object { Write-Host $_ } }
    return [int]$rc
}

# ---------------------------------------------------------------- main ----
Write-Rule
Write-Host 'NEODOMUS - Suite backend (unittest)' -ForegroundColor Cyan
Write-Host ("Root      : " + $Root)
Write-Host ("Modo      : " + ($(if ($InDocker) { 'contenedor api (uv)' } else { 'host (python local)' })))
Write-Host ("Alcance   : " + ($(if ([string]::IsNullOrWhiteSpace($Module)) { 'suite completa (unittest discover)' } else { ('modulo ' + $Module) })))
Write-Host ("Cobertura : " + ($(if ($Coverage) { 'si (lineas+ramas)' } else { 'no' })))
Write-Rule

$info = Assert-TestDatabaseUrl
if ($null -eq $info) { exit 2 }

if ($InDocker) {
    if (-not (Test-DockerReady)) { exit 2 }
    if ($info.HostName -in @('localhost', '127.0.0.1')) {
        Write-Host ("  ERROR: TEST_DATABASE_URL usa host '{0}', pero -InDocker corre DENTRO del contenedor api." -f $info.HostName) -ForegroundColor Red
        Write-Host "  Dentro del contenedor el host de MySQL es 'db' (ej: mysql+pymysql://neodomus:<password>@db:3306/neodomus_test?charset=utf8mb4)." -ForegroundColor Green
        exit 2
    }
} else {
    if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
        Write-Host '  ERROR: python no esta disponible en PATH.' -ForegroundColor Red
        exit 2
    }
    $required = @(
        'fastapi', 'uvicorn', 'sqlalchemy', 'pymysql', 'pydantic', 'pydantic-settings',
        'python-jose', 'passlib', 'bcrypt', 'python-multipart', 'slowapi',
        'email-validator', 'reportlab', 'openpyxl', 'pillow', 'minio',
        'apscheduler', 'tzdata', 'httpx', 'google-auth', 'pymupdf'
    )
    if ($Coverage) { $required += 'coverage' }
    Write-Host '[2] Verificando dependencias Python (pip list, solo lectura)...' -ForegroundColor Yellow
    $missing = Get-MissingPythonPackages -Required $required
    if ($missing.Count -gt 0) {
        Write-Host ("  FALTAN paquetes Python: " + ($missing -join ', ')) -ForegroundColor Red
        Write-Host '  Opciones: (a) usar -InDocker (el contenedor ya los incluye), o (b) instalarlos manualmente con autorizacion del equipo:' -ForegroundColor Yellow
        Write-Host ("    cd be; python -m pip install " + ($missing -join ' ')) -ForegroundColor Green
        Write-Host '  (Este script NO instala dependencias.)' -ForegroundColor Yellow
        exit 2
    }
    Write-Host '  OK: dependencias presentes.' -ForegroundColor Green
    Write-Host '[3] Verificando alcance de MySQL...' -ForegroundColor Yellow
    if (-not (Test-TcpPort -TargetHost $info.HostName -TargetPort $info.Port)) {
        Write-Host ("  ERROR: no se alcanza MySQL en {0}:{1}." -f $info.HostName, $info.Port) -ForegroundColor Red
        Write-Host '  Arranca Docker Desktop y ejecuta MANUALMENTE: docker compose up -d db' -ForegroundColor Green
        exit 2
    }
    Write-Host '  OK: MySQL alcanzable.' -ForegroundColor Green
}

# ------------------------------------------------------------ ejecucion ---
Write-Rule
Write-Host 'Ejecutando pruebas...' -ForegroundColor Cyan

$code = 0

if ($InDocker) {
    $envPair = "TEST_DATABASE_URL=$env:TEST_DATABASE_URL"
    $modName = ''
    if (-not [string]::IsNullOrWhiteSpace($Module)) {
        $modName = ($Module -replace '\.py$', '') -replace '^(be[\\/])?(app[\\/]tests[\\/])?', '' -replace '[\\/]', '.'
    }
    Push-Location $Root
    try {
        if ($Coverage) {
            $inner = 'uv run coverage erase && uv run coverage run --source=app --branch -m unittest '
            if ($modName) { $inner += ('app.tests.' + $modName + ' -v') } else { $inner += "discover -s app/tests -p 'test_*.py'" }
            & docker compose exec -T -e $envPair api sh -c $inner
            $code = $LASTEXITCODE
            if ($code -eq 0) {
                & docker compose exec -T -e $envPair api uv run coverage report
                $code = $LASTEXITCODE
                if ($code -eq 0 -and $Html) {
                    & docker compose exec -T -e $envPair api uv run coverage html
                    $code = $LASTEXITCODE
                }
                if ($code -eq 0 -and $Xml) {
                    & docker compose exec -T -e $envPair api uv run coverage xml
                    $code = $LASTEXITCODE
                }
            }
        } else {
            if ($modName) {
                & docker compose exec -T -e $envPair api uv run python -m unittest ('app.tests.' + $modName) -v
            } else {
                & docker compose exec -T -e $envPair api uv run python -m unittest discover -s app/tests -p 'test_*.py'
            }
            $code = $LASTEXITCODE
        }
    } finally {
        Pop-Location
    }
} else {
    Push-Location $BeDir
    try {
        $modName = ''
        if (-not [string]::IsNullOrWhiteSpace($Module)) {
            $modName = ($Module -replace '\.py$', '') -replace '^(be[\\/])?(app[\\/]tests[\\/])?', '' -replace '[\\/]', '.'
        }
        if ($Coverage) {
            $code = Invoke-Py -PyArgs @('-m', 'coverage', 'erase')
            if ($code -eq 0) {
                $covArgs = @('-m', 'coverage', 'run', '--source=app', '--branch', '-m', 'unittest')
                if ($modName) {
                    $covArgs += (@('app.tests.' + $modName, '-v'))
                } else {
                    $covArgs += @('discover', '-s', 'app/tests', '-p', 'test_*.py')
                }
                $code = Invoke-Py -PyArgs $covArgs
            }
        } else {
            if ($modName) {
                $code = Invoke-Py -PyArgs @('-m', 'unittest', ('app.tests.' + $modName), '-v')
            } else {
                $code = Invoke-Py -PyArgs @('-m', 'unittest', 'discover', '-s', 'app/tests', '-p', 'test_*.py')
            }
        }
        if ($code -eq 0 -and $Coverage) {
            $code = Invoke-Py -PyArgs @('-m', 'coverage', 'report')
            if ($code -eq 0 -and $Html) { $code = Invoke-Py -PyArgs @('-m', 'coverage', 'html') }
            if ($code -eq 0 -and $Xml)  { $code = Invoke-Py -PyArgs @('-m', 'coverage', 'xml') }
        }
    } finally {
        Pop-Location
    }
}

if ($null -eq $code) { $code = 1 }

# -------------------------------------------------------------- resumen ---
Write-Rule
$resultText = 'PASADO'
$foreColor  = 'Green'
if ($code -ne 0) { $resultText = 'FALLIDO'; $foreColor = 'Red' }
Write-Host ("[{0}] Suite: backend/unittest    Resultado: {1}    Codigo: {2}    Duracion: {3:n1}s" -f $env:USERNAME, $resultText, $code, $Stopwatch.Elapsed.TotalSeconds) -ForegroundColor $foreColor
Write-Host ("     Base validada: {0}  |  Host: {1}:{2}  |  Modo: {3}" -f $info.Database, $info.HostName, $info.Port, $(if ($InDocker) { 'docker' } else { 'host' }))
Write-Host ("     Comando: " + $(if ($InDocker) { 'docker compose exec api uv run python -m unittest ...' } else { 'python -m unittest (desde be/)' }))
Write-Rule

exit $code
