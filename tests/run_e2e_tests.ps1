#requires -Version 5.1
<#
.SYNOPSIS
  Ejecuta las pruebas E2E de NeoDomus (Playwright) mediante los orquestadores
  existentes de scripts/e2e_*.py.

.DESCRIPTION
  Los orquestadores exigen TEST_DATABASE_URL con la base de pruebas aislada,
  levantan su propia API efimera (DISABLE_SCHEDULER=1, pagos simulados) y un
  Vite efimero, y validan el resultado en la base de datos al terminar.

  Seguridad:
    - Exige TEST_DATABASE_URL apuntando a 'neodomus_test' (nunca 'neodomus').
    - No crea/migra bases de datos, no instala dependencias, no inicia Docker.
    - No modifica archivos del proyecto (los orquestadores siembran SOLO
      fixtures propias en la base de pruebas).

  Nota: los specs 'metros' y 'chatbot' NO tienen orquestador y se ejecutan
  manualmente (ver mensajes); este script los informa y omite.

.EXAMPLE
  powershell -NoProfile -ExecutionPolicy Bypass -File tests\run_e2e_tests.ps1 -List
.EXAMPLE
  powershell -NoProfile -ExecutionPolicy Bypass -File tests\run_e2e_tests.ps1 -Name cart-checkout
.EXAMPLE
  powershell -NoProfile -ExecutionPolicy Bypass -File tests\run_e2e_tests.ps1 -All
.EXAMPLE
  powershell -NoProfile -ExecutionPolicy Bypass -File tests\run_e2e_tests.ps1 -Name register,session -Continue
#>
[CmdletBinding()]
param(
    [string]$Name = '',
    [switch]$All,
    [switch]$List,
    [switch]$Continue,
    [string]$DatabaseName = 'neodomus_test'
)

$ErrorActionPreference = 'Stop'
$Root  = Split-Path -Parent $PSScriptRoot
$FeDir = Join-Path $Root 'fe'
$Stopwatch = [System.Diagnostics.Stopwatch]::StartNew()

function Write-Rule([string]$Text = '=') {
    Write-Host ($Text * 78) -ForegroundColor DarkGray
}

function Test-TcpPort {
    param([string]$TargetHost, [int]$TargetPort, [int]$TimeoutMs = 3000)
    $client = New-Object System.Net.Sockets.TcpClient
    try {
        $async = $client.ConnectAsync($TargetHost, $TargetPort)
        return ($async.Wait($TimeoutMs) -and $client.Connected)
    } catch {
        return $false
    } finally {
        $client.Close()
    }
}

function Get-DatabaseInfo {
    param([string]$Url)
    if ($Url -match '@([^:/?]+)(?::(\d+))?/([^/?]+)') {
        $port = 3306
        if ($Matches[2]) { $port = [int]$Matches[2] }
        return [PSCustomObject]@{
            HostName = $Matches[1]
            Port     = $port
            Database = $Matches[3]
        }
    }
    return $null
}

function Assert-TestDatabaseUrl {
    Write-Host '[1] Validando TEST_DATABASE_URL...' -ForegroundColor Yellow
    $url = $env:TEST_DATABASE_URL
    if ([string]::IsNullOrWhiteSpace($url)) {
        Write-Host '  ERROR: TEST_DATABASE_URL no esta definida en esta sesion.' -ForegroundColor Red
        Write-Host '  $env:TEST_DATABASE_URL = "mysql+pymysql://neodomus:<password>@localhost:3307/neodomus_test?charset=utf8mb4"' -ForegroundColor Green
        return $null
    }
    $info = Get-DatabaseInfo -Url $url
    if (-not $info) {
        Write-Host '  ERROR: formato de URL no reconocible.' -ForegroundColor Red
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

function Get-MissingPythonPackages {
    param([string[]]$Required)
    $installed = @()
    # Quirk de PS 5.1: el redirect 2>$null sobre un nativo convierte cualquier
    # artefacto de stderr en ErrorRecord; con ErrorActionPreference=Stop es
    # terminante y mata al runner. Captura protegida con restauracion SIEMPRE
    # (finally), conservando la logica y los codigos de salida.
    $prevEap = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        $raw = & python -m pip list 2>$null
    } finally {
        $ErrorActionPreference = $prevEap
    }
    foreach ($line in $raw) {
        if ([string]::IsNullOrWhiteSpace($line)) { continue }
        $name = (($line -split '\s+')[0]).ToLower().Replace('_', '-')
        $installed += $name
    }
    return @($Required | Where-Object { $_ -notin $installed })
}

# Flujos con orquestador (mapa nombre -> script python en scripts/)
$Flows = [ordered]@{
    'cart-checkout'    = 'e2e_cart_checkout.py'
    'register'         = 'e2e_register.py'
    'session'          = 'e2e_session.py'
    'admin-paginacion' = 'e2e_admin_paginacion.py'
    'foto-tecnico'     = 'e2e_foto_tecnico.py'
    'reporte-ventas'   = 'e2e_reporte_ventas.py'
}

$ManualFlows = [ordered]@{
    'metros'  = 'Sin orquestador: requiere stack local arriba (API de pruebas + FE), productos sembrados con scripts/e2e_seed.py, variables E2E_METROS_ID/E2E_UNIDAD_ID y validacion final con scripts/e2e_verify.py (el spec usa fallbacks con IDs concretos 139/140).'
    'chatbot' = 'Sin orquestador: requiere FE corriendo en la baseURL del playwright.config (por defecto http://localhost:5174) y API real; se lanza a mano con: cd fe; npx playwright test chatbot.e2e.spec.ts'
}

# ---------------------------------------------------------------- main ----
Write-Rule
Write-Host 'NEODOMUS - Suite E2E (Playwright via orquestadores Python)' -ForegroundColor Cyan
Write-Host ("Root    : " + $Root)
Write-Rule

if ($List) {
    Write-Host 'Flujos con orquestador (ejecutables por este script):' -ForegroundColor Cyan
    foreach ($k in $Flows.Keys) { Write-Host ("  - {0,-18} scripts/{1}" -f $k, $Flows[$k]) }
    Write-Host 'Flujos MANUALES (sin orquestador; este script NO los ejecuta):' -ForegroundColor Yellow
    foreach ($k in $ManualFlows.Keys) { Write-Host ("  - {0,-18} {1}" -f $k, $ManualFlows[$k]) }
    exit 0
}

# --- seleccion de flujos ---
$selection = @()
if ($All) {
    $selection = @($Flows.Keys)
} elseif (-not [string]::IsNullOrWhiteSpace($Name)) {
    $requested = $Name.Split(',') | ForEach-Object { $_.Trim().ToLower() } | Where-Object { $_ }
    foreach ($r in $requested) {
        if (-not ($Flows.Contains($r) -or $ManualFlows.Contains($r))) {
            Write-Host ("ERROR: flujo desconocido '{0}'. VALIDOS: {1}" -f $r, (($Flows.Keys + $ManualFlows.Keys) -join ', ')) -ForegroundColor Red
            exit 2
        }
        if (-not $selection.Contains($r)) { $selection += $r }
    }
} else {
    Write-Host 'ERROR: no se selecciono ningun flujo. Usa -Name <flujo[,flujo2]> o -All (o -List para ver disponible).' -ForegroundColor Red
    exit 2
}

$manuals   = @($selection | Where-Object { $ManualFlows.Contains($_) })
$automated = @($selection | Where-Object { $Flows.Contains($_) })

if ($manuals.Count -gt 0) {
    Write-Rule
    Write-Host 'Flujos manuales solicitados (se omiten; sin orquestador):' -ForegroundColor Yellow
    foreach ($m in $manuals) {
        Write-Host ("  {0}:" -f $m)
        Write-Host ("    {0}" -f $ManualFlows[$m])
    }
}

if ($automated.Count -eq 0) {
    Write-Rule
    Write-Host 'No hay flujos automatizados para ejecutar.' -ForegroundColor Red
    exit 2
}

# --- validaciones previas ---
Write-Rule
$info = Assert-TestDatabaseUrl
if ($null -eq $info) { exit 2 }

if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
    Write-Host 'ERROR: python no esta disponible en PATH.' -ForegroundColor Red
    exit 2
}
Write-Host '[2] Verificando dependencias Python de los orquestadores...' -ForegroundColor Yellow
$required = @(
    'fastapi', 'uvicorn', 'sqlalchemy', 'pymysql', 'pydantic', 'pydantic-settings',
    'python-jose', 'passlib', 'bcrypt', 'python-multipart', 'slowapi',
    'email-validator', 'reportlab', 'openpyxl', 'pillow', 'minio',
    'apscheduler', 'tzdata', 'httpx', 'google-auth', 'pymupdf'
)
$missing = Get-MissingPythonPackages -Required $required
if ($missing.Count -gt 0) {
    Write-Host ("  FALTAN paquetes Python: " + ($missing -join ', ')) -ForegroundColor Red
    Write-Host '  (instalacion manual con autorizacion; este script NO instala dependencias)' -ForegroundColor Yellow
    exit 2
}
Write-Host '  OK: dependencias presentes.' -ForegroundColor Green

Write-Host '[3] Verificando MySQL...' -ForegroundColor Yellow
if (-not (Test-TcpPort -TargetHost $info.HostName -TargetPort $info.Port)) {
    Write-Host ("  ERROR: no se alcanza MySQL en {0}:{1}." -f $info.HostName, $info.Port) -ForegroundColor Red
    Write-Host '  Arranca Docker Desktop y ejecuta MANUALMENTE: docker compose up -d db' -ForegroundColor Green
    exit 2
}
Write-Host '  OK: MySQL alcanzable.' -ForegroundColor Green

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host 'ERROR: node no esta disponible en PATH (los orquestadores levantan Vite con node).' -ForegroundColor Red
    exit 2
}
Write-Host '[4] Validando Frontend (node_modules y Chromium de Playwright)...' -ForegroundColor Yellow
if (-not (Test-Path (Join-Path $FeDir 'node_modules'))) {
    Write-Host '  ERROR: fe/node_modules no existe (los orquestadores usan vite y playwright desde ahi).' -ForegroundColor Red
    Write-Host '  Ejecuta manualmente (requiere instalacion): cd fe; pnpm install' -ForegroundColor Green
    exit 2
}
$pwCache = Join-Path $env:LOCALAPPDATA 'ms-playwright'
$chromium = @(Get-ChildItem $pwCache -Filter 'chromium-*' -Directory -ErrorAction SilentlyContinue)
if ($chromium.Count -eq 0) {
    Write-Host '  ERROR: no se encontro Chromium de Playwright en %LOCALAPPDATA%\ms-playwright.' -ForegroundColor Red
    Write-Host '  Ejecuta manualmente (descarga de navegador, con autorizacion): cd fe; npx playwright install chromium' -ForegroundColor Green
    exit 2
}
Write-Host '  OK: node_modules y Chromium listos.' -ForegroundColor Green

# ---------------------------------------------------------- ejecucion -----
$rutas = @()
$fallo = $false
foreach ($flow in $automated) {
    Write-Rule
    Write-Host ("E2E '{0}' -> scripts/{1}" -f $flow, $Flows[$flow]) -ForegroundColor Cyan
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    Push-Location $Root
    try {
        & python (Join-Path $Root ('scripts\' + $Flows[$flow]))
        $code = $LASTEXITCODE
    } finally {
        Pop-Location
    }
    if ($null -eq $code -or $code -ne 0) {
        $res = 'FALLIDO'
        $fallo = $true
        Write-Host ("  Fin '{0}': FALLIDO (codigo {1})" -f $flow, $code) -ForegroundColor Red
        if (-not $Continue) {
            $rutas += [PSCustomObject]@{ Flujo = $flow; Resultado = $res; Codigo = [int]$code; Duracion = [math]::Round($sw.Elapsed.TotalSeconds, 1) }
            break
        }
    } else {
        $res = 'PASADO'
        Write-Host ("  Fin '{0}': PASADO" -f $flow) -ForegroundColor Green
    }
    $rutas += [PSCustomObject]@{ Flujo = $flow; Resultado = $res; Codigo = [int]$code; Duracion = [math]::Round($sw.Elapsed.TotalSeconds, 1) }
}

# -------------------------------------------------------------- resumen ---
Write-Rule
Write-Host 'RESUMEN E2E' -ForegroundColor Cyan
$rutas | Format-Table -AutoSize | Out-String | Write-Host
if ($manuals.Count -gt 0) {
    Write-Host ("Omitidos (manuales): {0}" -f ($manuals -join ', ')) -ForegroundColor Yellow
}
$final = 0
if ($fallo) { $final = 1 }
Write-Host ("[e2e/playwright]     Resultado: {0}    Duracion total: {1:n1}s" -f ($(if ($fallo) { 'FALLIDO' } else { 'PASADO' })), $Stopwatch.Elapsed.TotalSeconds) -ForegroundColor $(if ($fallo) { 'Red' } else { 'Green' })
Write-Rule

exit $final
