#requires -Version 5.1
<#
.SYNOPSIS
  Punto de entrada principal de las pruebas de NeoDomus: backend + frontend
  (+ E2E opcional con -IncludeE2E), con preparacion de infraestructura SOLO
  si se solicita via -Setup.

.DESCRIPTION
  Suites (en orden): backend (unittest) -> frontend (vitest) -> E2E (solo con
  -IncludeE2E). Reutiliza los runners individuales existentes; no introduce
  frameworks nuevos y no duplica logica innecesaria.

  Backend (modo por defecto, via contenedor EFIMERO): la suite corre dentro
  de la imagen de pruebas con la app y dependencias (por defecto
  'neodomus_tests_tmp', construible con: docker build -t neodomus_tests_tmp be),
  conectada a la red 'neodomus_tests_net' junto al MySQL y MinIO de pruebas.
  Monta el codigo del repo en solo-lectura, anade httpx/pymupdf al venv por
  corrida (requiere acceso a PyPI) y ejecuta unittest discover. La base y los
  buckets SIEMPRE los de pruebas (TEST_DATABASE_URL/TEST_MINIO_*).

  Backend (-InDocker, modo HEREDADO del runner anterior): delega en
  run_backend_tests.ps1 -InDocker (corre dentro del contenedor 'api' del stack
  de desarrollo). Solo usar si tu stack dev comparte red con el MySQL de
  pruebas; con la infra dedicada de pruebas NO es aplicable.

  Frontend: delega en run_frontend_tests.ps1 (vitest run; sin red ni BD).

  E2E (-IncludeE2E): delega en run_e2e_tests.ps1 -All (orquestadores Python
  existentes). El runner valida SUS requisitos (TEST_DATABASE_URL alcanzable
  desde el host, paquetes Python, Chromium Playwright) ANTES de ejecutar; si
  faltan, la suite queda BLOQUEADA con su causa visible (codigo 2) y el
  resumen lo refleja; nunca se oculta el error.

  -Setup: prepara infraestructura de pruebas ANTES de correr las pruebas:
    [S1] Bootstrap MySQL (setup_test_db.ps1; idempotente, IF NOT EXISTS +
         Alembic head; NUNCA DROP, nunca la base 'neodomus').
    [S2] MinIO exclusivo de pruebas (setup_minio_test.ps1; idempotente;
         exige MINIO_TEST_ROOT_USER / MINIO_TEST_ROOT_PASSWORD via env).
    [S3] Comprueba ambos (contenedores corriendo en la red de pruebas,
         MinIO healthy); si algo falla DETIENE y no corre pruebas.
    [S4] Deriva TEST_MINIO_* si no existen (alias/puertos internos y buckets;
         los secretos SIEMPRE desde MINIO_TEST_ROOT_* de env; no se imprimen).
  Sin -Setup NO se crea, modifica ni levanta nada automaticamente (solo
  comprobaciones de solo lectura); si la configuracion esta incompleta el
  runner aborta ANTES de correr pruebas con mensaje claro (codigo 2).

  Variables de entorno de la sesion (los scripts jamas las persisten):
    TEST_DATABASE_URL  mysql+pymysql://usuario:pass@host:3306/neodomus_test
                       (host = contenedor de la red de pruebas; PROHIBIDO
                       apuntar a la base de desarrollo 'neodomus').
    TEST_MINIO_ENDPOINT, TEST_MINIO_ACCESS_KEY, TEST_MINIO_SECRET_KEY,
    TEST_MINIO_BUCKET, TEST_MINIO_PRIVATE_BUCKET, TEST_MINIO_PUBLIC_ENDPOINT
                       (Las 6; con -Setup se derivan solas si faltan).
    MINIO_TEST_ROOT_USER / MINIO_TEST_ROOT_PASSWORD (solo con -Setup).

  Credenciales: NUNCA con valores por defecto inseguros; nunca se imprimen.

  Resumen final: por suite imprime duracion, totales y aprobadas/fallidas/
  omitidas cuando el runner puede obtenerlos de forma fiable (unittest y
  vitest); para E2E muestra el codigo y los flujos que reporta su runner.
  Codigo de salida global: 0 = todo OK; el primer codigo no cero de una suite
  (1 = pruebas fallidas); 2 = requisitos/configuracion/uso insuficiente.

.EXAMPLE
  powershell -NoProfile -ExecutionPolicy Bypass -File tests\run_all_tests.ps1
  Backend + frontend con la infraestructura ya preparada (env fijadas).
.EXAMPLE
  powershell -NoProfile -ExecutionPolicy Bypass -File tests\run_all_tests.ps1 -Setup
  Igual, preparando ANTES MySQL y MinIO de pruebas (idempotente).
.EXAMPLE
  powershell -NoProfile -ExecutionPolicy Bypass -File tests\run_all_tests.ps1 -IncludeE2E
  Backend + frontend + E2E (valida requisitos E2E antes de correrlos).
.EXAMPLE
  powershell -NoProfile -ExecutionPolicy Bypass -File tests\run_all_tests.ps1 -Continue
  No se detiene en el primer fallo; reporta el resumen completo.
#>
[CmdletBinding()]
param(
    [switch]$Setup,
    [switch]$IncludeE2E,
    [switch]$Continue,
    [switch]$Coverage,
    [switch]$Html,
    [switch]$Xml,
    [switch]$InDocker,
    [string]$DatabaseName = 'neodomus_test'
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$BeDir = Join-Path $Root 'be'
$StopwatchAll = [System.Diagnostics.Stopwatch]::StartNew()

$TestNetwork = 'neodomus_tests_net'
$TestImage   = 'neodomus_tests_tmp'
$MinioCtn    = 'neodomus_minio_test'
$BucketPublic   = 'neodomus-test-media'
$BucketPrivate  = 'neodomus-test-private'
$TestMinioVars  = @('TEST_MINIO_ENDPOINT','TEST_MINIO_ACCESS_KEY','TEST_MINIO_SECRET_KEY',
                    'TEST_MINIO_BUCKET','TEST_MINIO_PRIVATE_BUCKET','TEST_MINIO_PUBLIC_ENDPOINT')

function Write-Rule([string]$Text = '=') {
    Write-Host ($Text * 78) -ForegroundColor DarkGray
}
function Write-Er([string]$Msg) {
    Write-Host ("  ERROR: " + $Msg) -ForegroundColor Red
}
function Write-Av([string]$Msg) {
    Write-Host ("  AVISO: " + $Msg) -ForegroundColor Yellow
}
function Write-Ok([string]$Msg) {
    Write-Host ("  OK: " + $Msg) -ForegroundColor Green
}

function Get-DatabaseInfo([string]$Url) {
    if ($Url -match '@([^:/?]+)(?::(\d+))?/([^/?]+)') {
        $port = 3306
        if ($Matches[2]) { $port = [int]$Matches[2] }
        return [PSCustomObject]@{ HostName = $Matches[1]; Port = $port; Database = $Matches[3] }
    }
    return $null
}

# Ejecuta un script hijo SIN fusionar streams por pipeline (quirk de PS 5.1:
# al capturar con 2>&1, la primera linea de stderr de un nativo se convierte
# en NativeCommandError TERMINANTE con ErrorActionPreference=Stop y mata al
# runner). Aqui Start-Process manda stdout/stderr a ARCHIVOS y se leen luego:
# nada se oculta (se imprime todo) y el hijo corre igual que interactivo.
function Invoke-ChildScript([string]$ScriptName, [string[]]$ChildArgs) {
    $path = Join-Path $PSScriptRoot $ScriptName
    $stamp = ((Get-Date -Format 'yyyyMMdd_HHmmss') + '_' + $PID + '_' + ($ScriptName -replace '\.ps1$',''))
    $dir = Join-Path ([System.IO.Path]::GetTempPath()) ('neodomus_tests_logs\child_' + $stamp)
    New-Item -ItemType Directory -Path $dir -Force | Out-Null
    $outFile = Join-Path $dir 'out.log'
    $errFile = Join-Path $dir 'err.log'
    $argStr = '-NoProfile -ExecutionPolicy Bypass -File "' + $path + '"'
    foreach ($a in $ChildArgs) {
        if ($null -ne $a -and ([string]$a).Length -gt 0) { $argStr += (' "' + $a + '"') }
    }
    $proc = $null
    try {
        $proc = Start-Process -FilePath 'powershell.exe' -ArgumentList $argStr -NoNewWindow -Wait -PassThru -RedirectStandardOutput $outFile -RedirectStandardError $errFile
    } catch {
        Write-Er ("No se pudo lanzar '{0}': {1}" -f $ScriptName, $_.Exception.Message)
        return [PSCustomObject]@{ Code = 1; Text = ('[launch error] ' + $_.Exception.Message) }
    }
    $rc = $proc.ExitCode
    $txtOut = ''
    $txtErr = ''
    try { $txtOut = (Get-Content $outFile -Raw -ErrorAction SilentlyContinue) } catch { }
    try { $txtErr = (Get-Content $errFile -Raw -ErrorAction SilentlyContinue) } catch { }
    $lines = @()
    foreach ($chunk in @($txtOut, $txtErr)) {
        if ([string]::IsNullOrEmpty($chunk)) { continue }
        foreach ($l in ($chunk -split "`r?`n")) { $lines += $l }
    }
    foreach ($l in $lines) { Write-Host $l }
    return [PSCustomObject]@{ Code = [int]$rc; Text = ($lines -join "`n") }
}

# Parser de la salida de unittest: Totales / aprobadas / fallidas / errores / omitidas.
function Remove-Ansi([string]$Text) {
    # vitest imprime secuencias ANSI que rompen los regex de conteo.
    if ($null -eq $Text) { return '' }
    $esc = [string][char]27
    return (($Text -replace ($esc + '\[[?0-9;]*[A-Za-z]'), ''))
}

# Parser de la salida de unittest: Totales / aprobadas / fallidas / errores / omitidas.
function Parse-UnittestSummary([string]$Text) {
    $Text = Remove-Ansi -Text $Text
    $res = [PSCustomObject]@{ Total = $null; Passed = $null; Failed = $null; Skipped = $null; Reliable = $false }
    $ran = [regex]::Matches($Text, '(?m)Ran (\d+) tests') | Select-Object -Last 1
    if ($ran) { $res.Total = [int]($ran.Groups[1].Value) }
    $failLine = [regex]::Matches($Text, '(?m)^FAILED \((.*)\)') | Select-Object -Last 1
    if ($failLine) {
        foreach ($m in [regex]::Matches($failLine.Groups[1].Value, '(failures|errors|skipped)=(\d+)')) {
            switch ($m.Groups[1].Value) {
                'failures' { $res.Failed = [int]($m.Groups[2].Value) }
                'errors'   { if ($null -eq $res.Failed) { $res.Failed = [int]($m.Groups[2].Value) } else { $res.Failed = $res.Failed + [int]($m.Groups[2].Value) } }
                'skipped'  { $res.Skipped = [int]($m.Groups[2].Value) }
            }
        }
        if ($null -eq $res.Failed) { $res.Failed = 0 }
    } else {
        $okLine = [regex]::Matches($Text, '(?m)^OK') | Select-Object -Last 1
        if ($okLine) {
            $res.Failed = 0
            $sk = [regex]::Match($okLine.Value, 'skipped=(\d+)')
            if ($sk.Success) { $res.Skipped = [int]($sk.Groups[1].Value) } else { $res.Skipped = 0 }
        }
    }
    $known = 0
    foreach ($v in @($res.Total, $res.Failed, $res.Skipped)) { if ($null -ne $v) { $known = $known + 1 } }
    if ($known -gt 0 -and $null -ne $res.Total) {
        $bad = 0
        if ($null -ne $res.Failed)  { $bad = $bad + $res.Failed }
        if ($null -ne $res.Skipped) { $bad = $bad + $res.Skipped }
        $res.Passed = $res.Total - $bad
        $res.Reliable = $true
    }
    return $res
}

# Parser de la salida de vitest (lineas finales 'Tests ...' con conteos).
function Parse-VitestSummary([string]$Text) {
    $Text = Remove-Ansi -Text $Text
    $res = [PSCustomObject]@{ Total = $null; Passed = $null; Failed = $null; Skipped = $null; Reliable = $false }
    $line = [regex]::Matches($Text, '(?m)^\s*Tests\s+(.+)$') | Select-Object -Last 1
    if ($line) {
        foreach ($m in [regex]::Matches($line.Groups[1].Value, '(\d+)\s+(passed|failed|skipped)')) {
            switch ($m.Groups[2].Value) {
                'passed'  { $res.Passed  = [int]($m.Groups[1].Value) }
                'failed'  { if ($null -eq $res.Failed) { $res.Failed = [int]($m.Groups[1].Value) } else { $res.Failed = $res.Failed + [int]($m.Groups[1].Value) } }
                'skipped' { if ($null -eq $res.Skipped) { $res.Skipped = [int]($m.Groups[1].Value) } else { $res.Skipped = $res.Skipped + [int]($m.Groups[1].Value) } }
            }
        }
        if ($null -eq $res.Failed -and $null -ne $res.Passed) { $res.Failed = 0 }
        $tot = 0
        foreach ($v in @($res.Passed, $res.Failed, $res.Skipped)) { if ($null -ne $v) { $tot = $tot + $v } }
        if ($tot -gt 0) { $res.Total = $tot; $res.Reliable = $true }
    }
    return $res
}

function Get-ContainerState([string]$Name) {
    try {
        $st = & docker inspect $Name --format '{{.State.Status}}' 2>$null
        if ($LASTEXITCODE -eq 0 -and $st) { return ([string]$st).Trim() }
    } catch { }
    return $null
}

function Test-IsHealthy([string]$Name) {
    try {
        $h = & docker inspect $Name --format '{{if .State.Health}}{{.State.Health.Status}}{{end}}' 2>$null
        if ($LASTEXITCODE -eq 0) { return (([string]$h).Trim() -eq 'healthy') }
    } catch { }
    return $false
}

function Get-NetworkContainerNames([string]$NetName) {
    try {
        $raw = & docker network inspect $NetName --format '{{range .Containers}}{{.Name}} {{end}}' 2>$null
        if ($LASTEXITCODE -eq 0 -and $raw) { return @(([string]$raw).Trim() -split '\s+' | Where-Object { $_ }) }
    } catch { }
    return @()
}

# Deriva TEST_MINIO_* (solo las que faltan) desde el MinIO de pruebas y el env
# MINIO_TEST_ROOT_*. Los secretos NUNCA se imprimen ni viajan por comandos.
function Join-TestMinioFromContainer([string]$NetName) {
    $container = $MinioCtn
    if ((Get-ContainerState $container) -ne 'running') {
        # Busca un contenedor de MinIO en la red de pruebas (cualquier nombre).
        foreach ($name in (Get-NetworkContainerNames $NetName)) {
            $img = ''
            try { $img = (@(docker inspect $name --format '{{.Config.Image}}' 2>$null) -join '') } catch { }
            if ($img -match '(?i)minio') { $container = $name; break }
        }
    }
    if ((Get-ContainerState $container) -ne 'running') { return $null }

    # Alias DNS interno preferido (sin '_' porque MinIO rechaza ese Host); si
    # el contenedor no declara alias usable, usa el nombre del contenedor.
    $alias = ''
    try {
        $raw = & docker inspect $container --format '{{range $k, $v := .NetworkSettings.Networks}}{{range $v.Aliases}}{{.}} {{end}}{{end}}' 2>$null
        $cand = @(([string]$raw).Trim() -split '\s+' | Where-Object { $_ -and $_ -ne '.' })
        $pref = @($cand | Where-Object { $_ -notmatch '[._:]' })
        if ($pref.Count -gt 0) { $alias = $pref[0] } elseif ($cand.Count -gt 0) { $alias = $cand[0] }
    } catch { }
    if (-not $alias) { $alias = $container }

    if (-not $env:TEST_MINIO_ENDPOINT)        { $env:TEST_MINIO_ENDPOINT        = ('{0}:{1}' -f $alias, 9000) }
    if (-not $env:TEST_MINIO_PUBLIC_ENDPOINT) { $env:TEST_MINIO_PUBLIC_ENDPOINT = ('http://{0}:{1}' -f $alias, 9000) }
    if (-not $env:TEST_MINIO_BUCKET)          { $env:TEST_MINIO_BUCKET          = $BucketPublic }
    if (-not $env:TEST_MINIO_PRIVATE_BUCKET)  { $env:TEST_MINIO_PRIVATE_BUCKET  = $BucketPrivate }
    if (-not $env:TEST_MINIO_ACCESS_KEY)      { $env:TEST_MINIO_ACCESS_KEY      = $env:MINIO_TEST_ROOT_USER }
    if (-not $env:TEST_MINIO_SECRET_KEY)      { $env:TEST_MINIO_SECRET_KEY      = $env:MINIO_TEST_ROOT_PASSWORD }
    return [PSCustomObject]@{ Container = $container; Alias = $alias }
}

# ---------------------------------------------------------------- main ----
Write-Rule
Write-Host 'NEODOMUS - Suite completa de pruebas' -ForegroundColor Cyan
Write-Host ('Alcance          : backend + frontend{0}' -f $(if ($IncludeE2E) { ' + E2E (-IncludeE2E)' } else { '' }))
Write-Host ("Root             : " + $Root)
Write-Host ("Setup infra      : " + $(if ($Setup) { 'si (-Setup)' } else { 'no (solo comprobaciones de solo lectura)' }))
Write-Host ("Incluir E2E      : " + $(if ($IncludeE2E) { 'si' } else { 'no (usa -IncludeE2E)' }))
Write-Host ("Backend en Docker: " + $(if ($InDocker) { 'si (-InDocker, modo heredado del stack dev)' } else { 'contenedor efimero de pruebas' }))
Write-Host ("Continuar en fallo: " + $(if ($Continue) { 'si (-Continue)' } else { 'no (se detiene en el primer fallo)' }))
Write-Rule

# ── [0] Limpieza conservadora de logs temporales ANTES de correr ──────────
# Politica de retencion: los logs de la corrida ACTUAL SIEMPRE se conservan
# (out/err de contenedor efimero y de cada hijo en %TEMP%\neodemus_tests_logs).
# Solo se podan carpetas de corridas con MAS de 7 dias. Solo se toca esa
# carpeta de %TEMP%; jamas archivos del repo ni de otros programas.
$logsRoot = Join-Path ([System.IO.Path]::GetTempPath()) 'neodomus_tests_logs'
try {
    if (Test-Path $logsRoot) {
        $oldDirs = @(Get-ChildItem $logsRoot -Directory -ErrorAction SilentlyContinue | Where-Object { $_.CreationTime -lt (Get-Date).AddDays(-7) })
        foreach ($d in $oldDirs) { Remove-Item $d.FullName -Recurse -Force -ErrorAction SilentlyContinue }
        if ($oldDirs.Count -gt 0) { Write-Host ("  [0] Limpieza: {0} carpeta(s) de logs >= 7 dias eliminadas de {1}" -f $oldDirs.Count, $logsRoot) -ForegroundColor DarkGray }
    }
} catch { }

# ── [1] Docker disponible ────────────────────────────────────────────────
Write-Host '[1] Validando Docker...' -ForegroundColor Yellow
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Er 'docker no esta disponible en PATH (arranca Docker Desktop).'
    exit 2
}
$null = & docker version --format '{{.Server.Version}}' 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Er 'El demonio de Docker no responde (arranca Docker Desktop).'
    exit 2
}
Write-Ok 'Docker disponible.'

# ── [2] TEST_DATABASE_URL (obligatoria; guardas anti-desarrollo) ─────────
Write-Host '[2] Validando TEST_DATABASE_URL...' -ForegroundColor Yellow
if ([string]::IsNullOrWhiteSpace($env:TEST_DATABASE_URL)) {
    Write-Er 'TEST_DATABASE_URL no esta definida en esta sesion.'
    Write-Host '    Es la URL de la base de PRUEBAS (el frontend no la usa; el backend SI).' -ForegroundColor Yellow
    Write-Host '    Definela en tu sesion (ver tests\README.md seccion 7):' -ForegroundColor Yellow
    Write-Host '        $env:TEST_DATABASE_URL = "mysql+pymysql://neodomus:<password>@neodomus_mysql_test:3306/neodomus_test?charset=utf8mb4"' -ForegroundColor Green
    exit 2
}
$dbInfo = Get-DatabaseInfo -Url $env:TEST_DATABASE_URL
if (-not $dbInfo) {
    Write-Er 'Formato de TEST_DATABASE_URL no reconocible (mysql+pymysql://usuario:pass@host:puerto/base).'
    exit 2
}
if ($dbInfo.Database -ceq 'neodomus') {
    Write-Er ("CRITICO: la URL apunta a la base de DESARROLLO '{0}'. Nunca se corren pruebas ahi." -f $dbInfo.Database)
    exit 2
}
if ($dbInfo.Database -cne $DatabaseName) {
    Write-Er ("La base '{0}' no es la de pruebas exigida ('{1}')." -f $dbInfo.Database, $DatabaseName)
    exit 2
}
Write-Ok ("Base de pruebas '{0}' en {1}:{2} (modo backend: contenedor '{3}')." -f $dbInfo.Database, $dbInfo.HostName, $dbInfo.Port, $dbInfo.HostName)

# ── [3] -Setup: preparar infraestructura (SOLO si se pide) ───────────────
if ($Setup) {
    Write-Host '[3] -Setup: preparando infraestructura de PRUEBAS (idempotente)...' -ForegroundColor Yellow
    if ([string]::IsNullOrWhiteSpace($env:MINIO_TEST_ROOT_USER) -or [string]::IsNullOrWhiteSpace($env:MINIO_TEST_ROOT_PASSWORD)) {
        Write-Er 'Para -Setup se requieren las credenciales EXCLUSIVAS de pruebas via env (abortando sin tocar nada).'
        Write-Host '        $env:MINIO_TEST_ROOT_USER     = "<usuario-de-pruebas>"' -ForegroundColor Green
        Write-Host '        $env:MINIO_TEST_ROOT_PASSWORD = "<contrasena-unica-de-pruebas>"' -ForegroundColor Green
        Write-Host '    (Los tests las usan como TEST_MINIO_ACCESS_KEY / TEST_MINIO_SECRET_KEY.)' -ForegroundColor Yellow
        exit 2
    }

    Write-Host '  [S1] Bootstrap MySQL (setup_test_db.ps1 via imagen-docker aislada)...' -ForegroundColor Cyan
    # Ruta aislada aprobada (Bloque 1) y params REALES de setup_test_db.ps1:
    # -Image/-Network/-MysqlContainer evitan que su autodeteccion escoja la
    # ruta compose-api (contenedor 'api' del stack dev, sin resolucion DNS del
    # MySQL de pruebas cuando el stack dev esta arrancado).
    $s1 = Invoke-ChildScript -ScriptName 'setup_test_db.ps1' -ChildArgs @(
        '-Image', $TestImage, '-Network', $TestNetwork, '-MysqlContainer', $dbInfo.HostName
    )
    if ($s1.Code -ne 0) {
        Write-Er ("El bootstrap MySQL fallo con codigo {0}; NO se corre ninguna suite." -f $s1.Code)
        exit $s1.Code
    }

    Write-Host '  [S2] MinIO de pruebas (setup_minio_test.ps1)...' -ForegroundColor Cyan
    $s2 = Invoke-ChildScript -ScriptName 'setup_minio_test.ps1' -ChildArgs @()
    if ($s2.Code -ne 0) {
        Write-Er ("El setup MinIO fallo con codigo {0}; NO se corre ninguna suite." -f $s2.Code)
        exit $s2.Code
    }

    Write-Host '  [S3] Comprobando ambas infraestructuras...' -ForegroundColor Cyan
    $mysqlState = Get-ContainerState $dbInfo.HostName
    if ($mysqlState -ne 'running') {
        Write-Er ("El contenedor MySQL de pruebas '{0}' no esta corriendo (estado: {1})." -f $dbInfo.HostName, $(if ($mysqlState) { $mysqlState } else { 'no existe' }))
        exit 2
    }
    $netNames = Get-NetworkContainerNames $TestNetwork
    if ($netNames -notcontains $dbInfo.HostName) {
        Write-Er ("El contenedor MySQL '{0}' NO esta en la red '{1}' (aislamiento incorrecto)." -f $dbInfo.HostName, $TestNetwork)
        exit 2
    }
    Write-Ok ("MySQL de pruebas corriendo y en la red {0}." -f $TestNetwork)

    $minioInfo = Join-TestMinioFromContainer -NetName $TestNetwork
    if (-not $minioInfo) {
        Write-Er ("No se encuentra el contenedor del MinIO de pruebas en la red '{0}'." -f $TestNetwork)
        exit 2
    }
    if (-not (Test-IsHealthy $minioInfo.Container)) {
        Write-Er ("El MinIO de pruebas ('{0}') no esta healthy aun." -f $minioInfo.Container)
        exit 2
    }
    Write-Ok ("MinIO de pruebas '{0}' healthy; alias interno '{1}' (S3 interno en 9000)." -f $minioInfo.Container, $minioInfo.Alias)

    Write-Host '  [S4] Derivando TEST_MINIO_* (solo si faltan; secretos via env)...' -ForegroundColor Cyan
    if ($env:MINIO_TEST_ROOT_USER -and $env:TEST_MINIO_ACCESS_KEY -and ($env:TEST_MINIO_ACCESS_KEY -cne $env:MINIO_TEST_ROOT_USER)) {
        Write-Av 'TEST_MINIO_ACCESS_KEY ya definida y NO coincide con MINIO_TEST_ROOT_USER (se respeta la primera; valores no impresos).'
    }
    $missingEnv = @($TestMinioVars | Where-Object { [string]::IsNullOrWhiteSpace([System.Environment]::GetEnvironmentVariable($_)) })
    if ($missingEnv.Count -gt 0) {
        Write-Er ("Faltan variables TEST_MINIO_* tras -Setup: {0}" -f ($missingEnv -join ', '))
        exit 2
    }
    Write-Ok ('TEST_MINIO_* listas (valores ya en env de este proceso; nunca se imprimen).')
} else {
    Write-Host '[3] -Setup NO solicitado: no se crea/modifica/levanta nada (solo lecturas).' -ForegroundColor Yellow
}

# ── [4] Puertas finales de configuracion/infra (sin tocar nada) ──────────
Write-Host '[4] Comprobaciones finales de configuracion e infraestructura...' -ForegroundColor Yellow

# 4.a TEST_MINIO_* completas: la suite COMPLETA del backend exige el MinIO de
# pruebas (sin ellas quedarian ~15 omitidas honestas y una corrida parcial);
# se aborta con instruccion clara ANTES de correr nada.
$missingEnv = @($TestMinioVars | Where-Object { [string]::IsNullOrWhiteSpace([System.Environment]::GetEnvironmentVariable($_)) })
if ($missingEnv.Count -gt 0) {
    Write-Er ("Faltan variables TEST_MINIO_* (backend necesita el MinIO de pruebas para la suite COMPLETA): {0}" -f ($missingEnv -join ', '))
    Write-Host '    Opciones: (a) usa -Setup tras definir MINIO_TEST_ROOT_USER/PASSWORD (deriva solo), o' -ForegroundColor Yellow
    Write-Host '    (b) fijalas manualmente como muestra tests\setup_minio_test.ps1 (seccion [8], sin secretos impresos).' -ForegroundColor Yellow
    exit 2
}
$ep = [string]$env:TEST_MINIO_ENDPOINT
if ($ep -match '^(localhost|127\.)') {
    Write-Er ("TEST_MINIO_ENDPOINT='{0}' usa localhost: el backend corre DENTRO de un contenedor de la red '{1}' y no alcanzaria el host." -f $ep, $TestNetwork)
    Write-Host '    Usa el alias interno del MinIO de pruebas (ej. neodomus-minio-test:9000); -Setup lo deriva solo.' -ForegroundColor Yellow
    exit 2
}
Write-Ok ('TEST_MINIO_* completas (endpoint contenedor: ' + $ep + '; secretos nunca impresos).')

# 4.b Modo backend: contenedor efimero de pruebas, o delegacion heredada.
if ($Coverage -or $Html -or $Xml) {
    if ($InDocker) {
        Write-Av '-Coverage/-Html/-Xml: se delegan al modo -InDocker (run_backend_tests.ps1).'
    } else {
        Write-Er '-Coverage/-Html/-Xml NO estan soportados en el modo contenedor efimero (el venv no incluye coverage).'
        Write-Host '    Alternativa: tests\run_backend_tests.ps1 -InDocker -Coverage (modo heredado del stack dev) con autorizacion del equipo.' -ForegroundColor Yellow
        exit 2
    }
}

if (-not $InDocker) {
    try { $imgOk = (@(docker image inspect $TestImage --format 'ok' 2>$null) -join '').Trim() } catch { $imgOk = '' }
    if ($imgOk -ne 'ok') {
        Write-Er ("La imagen de pruebas '{0}' no existe en este Docker." -f $TestImage)
        Write-Host ('    Construyela una vez con el Dockerfile del backend: docker build -t {0} be' -f $TestImage) -ForegroundColor Green
        Write-Host '    (Contiene la app y sus deps; el runner anade httpx/pymupdf por corrida con uv y acceso a PyPI.)' -ForegroundColor Yellow
        exit 2
    }
    $netExists = $false
    try { $null = & docker network inspect $TestNetwork --format '{{.Name}}' 2>$null; $netExists = ($LASTEXITCODE -eq 0) } catch { $netExists = $false }
    if (-not $netExists) {
        Write-Er ("La red de pruebas '{0}' no existe." -f $TestNetwork)
        Write-Host '    Crea la infra de pruebas con: tests\run_all_tests.ps1 -Setup (o el setup individual).' -ForegroundColor Green
        exit 2
    }
    if ((Get-ContainerState $dbInfo.HostName) -ne 'running') {
        Write-Er ("El contenedor MySQL de pruebas '{0}' no esta corriendo." -f $dbInfo.HostName)
        Write-Host '    Prepara la infra con: tests\run_all_tests.ps1 -Setup' -ForegroundColor Green
        exit 2
    }
    Write-Ok ("Imagen '{0}' + red '{1}' + MySQL '{2}' corriendo." -f $TestImage, $TestNetwork, $dbInfo.HostName)
} else {
    Write-Av 'Modo -InDocker: el backend corre en el contenedor api del stack dev (usa su red/DNS).'
}

# ── definiciones de suites ────────────────────────────────────────────────
$rows = @()
$firstFailCode = 0
$failedSuite = ''

function Add-SummaryRow([string]$Suite, [double]$Dur, $Counts, [string]$Estado, [int]$Codigo) {
    # $Counts: PSCustomObject con Total/Passed/Failed/Skipped o $null.
    $tot = '-'; $ok = '-'; $bad = '-'; $skip = '-'
    if ($Counts -and $Counts.Reliable) {
        $tot = $Counts.Total
        if ($null -ne $Counts.Passed)  { $ok = $Counts.Passed }
        if ($null -ne $Counts.Failed)  { $bad = $Counts.Failed }
        if ($null -ne $Counts.Skipped) { $skip = $Counts.Skipped }
    }
    $script:rows += [PSCustomObject]@{
        Suite    = $Suite
        Duracion = ('{0:n1}s' -f $Dur)
        Total    = $tot
        Aprob    = $ok
        Fallid   = $bad
        Omitid   = $skip
        Estado   = $Estado
        Codigo   = $Codigo
    }
}

# ── [5] BACKEND ────────────────────────────────────────────────────────────
Write-Rule
Write-Host 'PASO 1/3: BACKEND (unittest)' -ForegroundColor Cyan
$swBe = [System.Diagnostics.Stopwatch]::StartNew()
if ($InDocker) {
    $beArgs = @('-DatabaseName', $DatabaseName)
    if ($Coverage) { $beArgs += '-Coverage' }
    if ($Html)     { $beArgs += '-Html' }
    if ($Xml)      { $beArgs += '-Xml' }
    $beArgs += '-InDocker'
    $be = Invoke-ChildScript -ScriptName 'run_backend_tests.ps1' -ChildArgs $beArgs
    $beCode = $be.Code
    $beCounts = Parse-UnittestSummary -Text $be.Text
} else {
    # Via probada: contenedor efimero en la red de pruebas; codigo del repo
    # montado /src:ro; httpx+pymupdf anadidos por corrida (PyPI); unittest.
    $LogsDir = Join-Path ([System.IO.Path]::GetTempPath()) ('neodomus_tests_logs\run_' + (Get-Date -Format 'yyyyMMdd_HHmmss'))
    New-Item -ItemType Directory -Path $LogsDir -Force | Out-Null
    $beSh = 'cp -r /src/app /app/ 2>/dev/null; ' +
            'uv pip install --python /app/.venv/bin/python httpx==0.28.1 pymupdf==1.28.2 >/dev/null 2>&1; ' +
            "cd /app && ./.venv/bin/python -m unittest discover -s app/tests -t . -p 'test_*.py' -v >/logs/be_out.log 2>/logs/be_err.log; " +
            'rc=$?; echo ---BE_TAIL---; tail -n 40 /logs/be_err.log 2>/dev/null; echo ---; tail -n 5 /logs/be_out.log 2>/dev/null; echo RC=$rc; exit $rc'
    Write-Host ("  (contenedor efimero en '{0}'; sin salida incremental: ~2 min; logs en {1})" -f $TestNetwork, $LogsDir) -ForegroundColor DarkGray
    $runArgs = @(
        'run', '--rm', '--network', $TestNetwork,
        ('-v', ('{0}:/src:ro' -f $BeDir)),
        ('-v', ('{0}:/logs' -f $LogsDir)),
        '-e', 'TEST_DATABASE_URL',
        '-e', 'TEST_MINIO_ENDPOINT', '-e', 'TEST_MINIO_ACCESS_KEY', '-e', 'TEST_MINIO_SECRET_KEY',
        '-e', 'TEST_MINIO_BUCKET', '-e', 'TEST_MINIO_PRIVATE_BUCKET', '-e', 'TEST_MINIO_PUBLIC_ENDPOINT',
        '--entrypoint', '/bin/sh', $TestImage, '-c', $beSh
    )
    # Captura SIN 2>&1 (quirk PS 5.1 NativeCommandError): el stdout va a la
    # variable; cualquier stderr de docker se imprime directo (nunca oculto).
    $prevEap = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    $beRaw = & docker @runArgs
    $ErrorActionPreference = $prevEap
    $beCode = $LASTEXITCODE
    $lines = @()
    foreach ($item in @($beRaw)) {
        if ($null -eq $item) { continue }
        if ($item -is [System.Management.Automation.ErrorRecord]) { $lines += $item.ToString() }
        else { $lines += [string]$item }
    }
    foreach ($l in $lines) { Write-Host $l }
    $beText = ($lines -join "`n")
    if ($beCode -ne 0) {
        Write-Host ("  ERROR: el backend fallo (codigo {0}). Log completo: {1}" -f $beCode, (Join-Path $LogsDir 'be_err.log')) -ForegroundColor Red
    }
    $beCounts = Parse-UnittestSummary -Text $beText
}
$swBe.Stop()
$beEstado = 'PASS'
if ($beCode -ne 0) {
    $beEstado = 'FAIL'
    $firstFailCode = $beCode
    $failedSuite = 'Backend (unittest)'
}
Add-SummaryRow -Suite 'Backend (unittest)' -Dur $swBe.Elapsed.TotalSeconds -Counts $beCounts -Estado $beEstado -Codigo $beCode
if ($beCode -ne 0 -and -not $Continue) {
    Write-Rule
    Write-Host 'El backend ha fallado: se detiene la ejecucion completa (usa -Continue para seguir).' -ForegroundColor Red
    Write-Rule
    # resumen igualmente impreso antes de salir
    Write-Host 'RESUMEN GENERAL (parcial)' -ForegroundColor Cyan
    $script:rows | Format-Table -AutoSize | Out-String -Width 200 | ForEach-Object { Write-Host $_ }
    exit $firstFailCode
}

# ── [6] FRONTEND ───────────────────────────────────────────────────────────
Write-Rule
Write-Host 'PASO 2/3: FRONTEND (vitest)' -ForegroundColor Cyan
$swFe = [System.Diagnostics.Stopwatch]::StartNew()
$feArgs = @()
if ($Coverage) { $feArgs += '-Coverage' }
$fe = Invoke-ChildScript -ScriptName 'run_frontend_tests.ps1' -ChildArgs $feArgs
$swFe.Stop()
$feCode = $fe.Code
$feCounts = Parse-VitestSummary -Text $fe.Text
$feEstado = 'PASS'
if ($feCode -ne 0) {
    $feEstado = 'FAIL'
    if ($firstFailCode -eq 0) { $firstFailCode = $feCode; $failedSuite = 'Frontend (vitest)' }
}
Add-SummaryRow -Suite 'Frontend (vitest)' -Dur $swFe.Elapsed.TotalSeconds -Counts $feCounts -Estado $feEstado -Codigo $feCode
if ($feCode -ne 0 -and -not $Continue) {
    Write-Rule
    Write-Host 'El frontend ha fallado: se detiene la ejecucion completa (usa -Continue para seguir).' -ForegroundColor Red
    Write-Rule
    Write-Host 'RESUMEN GENERAL (parcial)' -ForegroundColor Cyan
    $script:rows | Format-Table -AutoSize | Out-String -Width 200 | ForEach-Object { Write-Host $_ }
    exit $firstFailCode
}

# ── [7] E2E (OPCIONAL) ─────────────────────────────────────────────────────
if ($IncludeE2E) {
    Write-Rule
    Write-Host 'PASO 3/3: E2E (playwright via orquestadores)' -ForegroundColor Cyan
    $swE2 = [System.Diagnostics.Stopwatch]::StartNew()
    $e2eArgs = @('-All', '-DatabaseName', $DatabaseName)
    if ($Continue) { $e2eArgs += '-Continue' }
    $e2e = Invoke-ChildScript -ScriptName 'run_e2e_tests.ps1' -ChildArgs $e2eArgs
    $swE2.Stop()
    $e2eCode = $e2e.Code
    $e2eEstado = 'PASS'
    if ($e2eCode -ne 0) {
        $e2eEstado = 'FAIL'
        if ($firstFailCode -eq 0) { $firstFailCode = $e2eCode; $failedSuite = 'E2E (playwright)' }
    }
    # Los conteos de E2E los imprime su propio runner (flujos); aqui no hay
    # parse fiable => '-' (honesto, nunca se inventan totales).
    Add-SummaryRow -Suite 'E2E (playwright)' -Dur $swE2.Elapsed.TotalSeconds -Counts $null -Estado $e2eEstado -Codigo $e2eCode
} else {
    Write-Rule
    Write-Host '(E2E omitida: usa -IncludeE2E para incluirla)' -ForegroundColor DarkGray
}

# ── [8] RESUMEN FINAL ──────────────────────────────────────────────────────
Write-Rule
Write-Host 'RESUMEN GENERAL' -ForegroundColor Cyan
$script:rows | Format-Table -AutoSize | Out-String -Width 200 | ForEach-Object { Write-Host $_ }
$allOk = ($firstFailCode -eq 0)
$finalText = 'PASADO'
if (-not $allOk) { $finalText = 'CON FALLOS'; if ($failedSuite) { Write-Host ("  Primera suite en fallar: {0} (codigo {1})." -f $failedSuite, $firstFailCode) -ForegroundColor Red } }
Write-Host ('[suite completa] Resultado: {0}    Duracion: {1:n1}s' -f $finalText, $StopwatchAll.Elapsed.TotalSeconds) -ForegroundColor $(if ($allOk) { 'Green' } else { 'Red' })
Write-Rule

exit ([int]$firstFailCode)
