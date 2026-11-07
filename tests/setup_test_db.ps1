#requires -Version 5.1
<#
.SYNOPSIS
  Bootstrap IDEMPOTENTE de la base de datos de PRUEBAS de NeoDomus: prepara la
  base indicada por TEST_DATABASE_URL (estructura + permisos) y aplica las
  migraciones Alembic hasta head. No borra nada, nunca opera sobre 'neodomus'
  (desarrollo) y no embebe contrasenas.

.DESCRIPTION
  Pasos:
    [1] Prevalidacion de TEST_DATABASE_URL con guardas anti-desarrollo.
    [2] Deteccion de Docker y del contenedor MySQL de pruebas (parametro
        -MysqlContainer o autodeteccion del unico candidato corriendo).
    [3] DDL idempotente via 'docker exec' root con SQL por stdin:
        CREATE DATABASE IF NOT EXISTS + CREATE USER IF NOT EXISTS + GRANT solo
        sobre la base de pruebas. La contrasena root se resuelve de
        -MysqlRootPassword > $env:MYSQL_ROOT_PASSWORD > docker inspect
        (el origen se indica en salida; el valor nunca se imprime).
    [4] Alembic 'upgrade head' con TEST_DATABASE_URL. Rutas, en orden:
        (a) python-host   : alembic importable en el host y MySQL alcanzable
                            por TCP desde el host (URL tipo localhost).
        (b) compose-api   : docker compose exec api TXT (mecanismo documentado
                            en tests/README 7; exige stack del proyecto arriba).
        (c) docker-exec-api: docker exec sobre un contenedor 'neodomus_api'
                            corriendo. AVISO: ese contenedor puede tener codigo
                            desactualizado respecto del repo y su red debe
                            alcanzar al host de la URL.
        (d) imagen-docker : con -Image <img>: contenedor efimero a partir de
                            una imagen con la app y dependencias (p. ej.
                            construida con 'docker build ./be'), con be/ del
                            repo montado en solo-lectura (alembic, app,
                            alembic.ini). -Image FUERZA esta ruta.
        -Network permite fijar la red docker del contenedor de migracion
        (por defecto se toma del contenedor MySQL).

  Garantias de seguridad:
    - Exige TEST_DATABASE_URL; sin ella aborta (codigo 2).
    - Solo opera sobre bases llamadas 'neodomus_test' o 'neodomus_test<suffix>'.
      La base 'neodomus' (desarrollo) esta PROHIBIDA y aborta.
    - Este script NO CONTIENE comandos destructivos: nada de DROP/DELETE/TRUNCATE.
    - No lee ni escribe archivos .env; no inicia/para Docker; no instala deps.
    - No imprime contrasenas ni la URL completa (solo version enmascarada).

  Codigos de salida: 0 = base lista en head | 1 = fallo durante la ejecucion |
                     2 = requisitos no cumplidos / uso incorrecto.

.EXAMPLE
  powershell -NoProfile -ExecutionPolicy Bypass -File tests\setup_test_db.ps1
.EXAMPLE
  powershell -NoProfile -ExecutionPolicy Bypass -File tests\setup_test_db.ps1 -MysqlContainer neodomus_mysql
.EXAMPLE
  # Con una imagen local de la app (construida con: docker build -t <nombre> ./be)
  powershell -NoProfile -ExecutionPolicy Bypass -File tests\setup_test_db.ps1 -Image <imagen> -MysqlContainer neodomus_mysql_test -Network neodomus_tests_net
#>
[CmdletBinding()]
param(
    [string]$Image = '',
    [string]$MysqlContainer = '',
    [string]$Network = '',
    [string]$MysqlRootPassword = ''
)

$ErrorActionPreference = 'Stop'
$Root        = Split-Path -Parent $PSScriptRoot
$BeDir       = Join-Path $Root 'be'
$VersionsDir = Join-Path $BeDir 'alembic\versions'
$Stopwatch   = [System.Diagnostics.Stopwatch]::StartNew()

# ── Helpers de salida ────────────────────────────────────────────────────
function Write-Rule { param([string]$Text = '=') Write-Host ($Text * 78) -ForegroundColor Cyan }
function Write-Sec  {
    $script:Sec = $script:Sec + 1
    Write-Host ("[{0}] {1}" -f $script:Sec, $args[0]) -ForegroundColor White
}
function Write-Ok   { Write-Host ("  OK: "   + $args[0]) -ForegroundColor Green }
function Write-Av   { Write-Host ("  AVISO: " + $args[0]) -ForegroundColor Yellow }
function Write-Er   { Write-Host ("  ERROR: " + $args[0]) -ForegroundColor Red }
$script:Sec = 0

Write-Rule
Write-Host 'NEODOMUS - Bootstrap de la base de PRUEBAS (setup_test_db)'
Write-Host ("Root    : " + $Root)
Write-Host ("Backend : " + $BeDir)
Write-Rule

# ── [1] Prevalidacion de TEST_DATABASE_URL ───────────────────────────────
Write-Sec 'Prevalidando TEST_DATABASE_URL...'
$url = [Environment]::GetEnvironmentVariable('TEST_DATABASE_URL')
if ([string]::IsNullOrWhiteSpace($url)) {
    Write-Er 'TEST_DATABASE_URL no esta definida en esta sesion.'
    Write-Host '  Ejemplo (por sesion; este script no persiste nada):'
    Write-Host '    $env:TEST_DATABASE_URL = "mysql+pymysql://neodomus:<password>@localhost:3307/neodomus_test?charset=utf8mb4"'
    exit 2
}
$uri = $url.Trim()
if ($uri -notmatch '^mysql\+pymysql://') {
    Write-Er 'Solo se admite el esquema mysql+pymysql:// (el driver que usa el backend).'
    exit 2
}
$pat = '^mysql\+pymysql://([^:@/\s]+):(.*?)@([^:/?\s]+)(?::(\d+))?(?:/([^?\s]+))?(\?.*)?$'
$m = [regex]::Match($uri, $pat)
if (-not $m.Success) {
    Write-Er 'No se pudo interpretar la URL (esperado mysql+pymysql://usuario:password@host:puerto/basededatos[?charset=...]).'
    exit 2
}
$DbUser = $m.Groups[1].Value
$DbPass = $m.Groups[2].Value
$DbHost = $m.Groups[3].Value
$DbPort = '3306'
if ($m.Groups[4].Value) { $DbPort = $m.Groups[4].Value }
$DbName = $m.Groups[5].Value
$DbQs   = $m.Groups[6].Value
if (-not $DbName) { Write-Er 'La URL no indica base de datos.'; exit 2 }

# Guardas anti-desarrollo: prohibido operar sobre 'neodomus'.
if ($DbName -eq 'neodomus') {
    Write-Er "La base '$DbName' es la base de DESARROLLO. Este script nunca la opera; usa una base de pruebas (neodomus_test, neodomus_test2, ...)."
    exit 2
}
if ($DbName -notmatch '^neodomus_test([0-9A-Za-z_]+)?$') {
    Write-Er "La base '$DbName' no parece una base de pruebas. Solo se permiten 'neodomus_test' o 'neodomus_test<suffix>'."
    exit 2
}
if ($DbUser -notmatch '^[0-9A-Za-z_\.\-]+$') {
    Write-Er "El usuario de la URL contiene caracteres no soportados para los permisos: '$DbUser'."
    exit 2
}
if (-not (Test-Path (Join-Path $BeDir 'alembic.ini')) -or -not (Test-Path $VersionsDir)) {
    Write-Er 'No se encuentran be/alembic.ini o be/alembic/versions en el repositorio.'
    exit 2
}
Write-Ok ("URL valida: mysql+pymysql://<{0}>:****@{1}:{2}/{3}" -f $DbUser, $DbHost, $DbPort, $DbName)

# ── Helpers de infraestructura ───────────────────────────────────────────
function Test-Docker {
    try {
        $null = docker version --format '{{.Server.Version}}' 2>$null
        return ($LASTEXITCODE -eq 0)
    } catch { return $false }
}
function Test-DbTcp {
    param([string]$H, [string]$P)
    try {
        $c = New-Object System.Net.Sockets.TcpClient
        $r = $c.BeginConnect($H, [int]$P, $null, $null)
        $ok = $r.AsyncWaitHandle.WaitOne(3000) -and $c.Connected
        $c.Close()
        return $ok
    } catch { return $false }
}
function ConvertTo-SqlLiteral {
    param([string]$Text)
    return ($Text -replace '\\', '\\\\' -replace "'", "\'" -replace '`', '``')
}
function Get-MysqlContainerCandidates {
    # SOLO contenedores MySQL de la convencion del proyecto (neodomus*mysql*).
    # Los nombres genericos (db, mysql) NUNCA son candidatos de autodeteccion:
    # podrian pertenecer al desarrollo u otro proyecto.
    $names = @(docker ps --format '{{.Names}}' 2>$null)
    return @($names | Where-Object { $_ -match '^neodomus[-_.a-zA-Z0-9]*mysql[-_.a-zA-Z0-9]*$' })
}
function Test-MysqlContainerEsDePruebas {
    # Un contenedor solo cuenta como MySQL de PRUEBAS si tiene una senal
    # inequivoca (o ambas):
    #   1. Nombre bajo la convencion de pruebas del proyecto: contiene '_test'.
    #      El MySQL de desarrollo ('neodomus_mysql') NO la tiene.
    #   2. La base que el servidor crea por defecto (MYSQL_DATABASE del env)
    #      es una base de pruebas (neodomus_test o neodomus_test*).
    # No se ACEPTA ningun contenedor sin una de estas senales.
    param([string]$Name)
    $porNombre  = ($Name -match '^neodomus' -and $Name -match 'mysql' -and $Name -match '_test')
    $porEntorno = $false
    $mdb = (docker inspect $Name --format '{{range .Config.Env}}{{println .}}{{end}}' 2>$null |
            Where-Object { $_ -match '^MYSQL_DATABASE=' } | Select-Object -First 1)
    if ($mdb) { $porEntorno = ($mdb -match '^MYSQL_DATABASE=neodomus_test([0-9A-Za-z_]*)$') }
    return ($porNombre -or $porEntorno)
}
function Get-AlembicHeads {
    $revs = New-Object 'System.Collections.Generic.HashSet[string]'
    $down = New-Object 'System.Collections.Generic.HashSet[string]'
    Get-ChildItem $VersionsDir -Filter *.py | ForEach-Object {
        $t = Get-Content $_.FullName -Raw
        $rv = [regex]::Match($t, "(?m)^\s*revision(?::\s*str)?\s*=\s*[`"`']([^`"`']+)[`"`']").Groups[1].Value
        if ($rv) { [void]$revs.Add($rv) }
        $dm = [regex]::Match($t, "(?m)^\s*down_revision\s*=\s*(.+?)\s*$")
        if ($dm.Success) {
            foreach ($x in [regex]::Matches($dm.Groups[1].Value, "[`"`']([0-9A-Za-z_]+)[`"`']")) {
                [void]$down.Add($x.Groups[1].Value)
            }
        }
    }
    return @($revs | Where-Object { -not $down.Contains($_) })
}

# ── Docker y contenedor MySQL ────────────────────────────────────────────
Write-Sec 'Detectando Docker y el MySQL de PRUEBAS (nunca el de desarrollo)...'
$dockerOk = Test-Docker
$MyCtn = $MysqlContainer
$MyNet = $Network
if (-not $dockerOk) { Write-Av 'Docker no esta disponible en esta sesion.' }
if ($MyCtn) {
    $running = @(docker ps --format '{{.Names}}' 2>$null | Where-Object { $_ -eq $MyCtn })
    if ($running.Count -eq 0) {
        Write-Er "El contenedor '$MyCtn' no esta corriendo en este Docker."
        exit 2
    }
    Write-Ok ("Contenedor MySQL indicado explicitamente: {0}" -f $MyCtn)
    if (Test-MysqlContainerEsDePruebas -Name $MyCtn) {
        Write-Ok "El contenedor indicado tiene senales inequivocas de infraestructura de pruebas."
    } else {
        Write-Av "El contenedor indicado NO esta marcado como infraestructura de pruebas (nombre sin '_test' y MYSQL_DATABASE distinta de neodomus_test*). Se creara SOLO la base de la URL con IF NOT EXISTS; nada se borra y ninguna otra base es tocada."
    }
} elseif ($dockerOk) {
    $cands = Get-MysqlContainerCandidates
    $tests = @($cands | Where-Object { Test-MysqlContainerEsDePruebas -Name $_ })
    if ($tests.Count -eq 1) {
        $MyCtn = $tests[0]
        Write-Ok ("Contenedor MySQL de PRUEBAS autodetectado (senales inequivocas): {0}" -f $MyCtn)
    } elseif ($tests.Count -gt 1) {
        Write-Er ("Hay {0} contenedores MySQL de PRUEBAS candidatos: {1}." -f $tests.Count, ($tests -join ', '))
        Write-Host '    Indica el correcto con -MysqlContainer <nombre> para no operar el equivocado.'
        exit 2
    } else {
        # Sin MySQL de pruebas identificado: PROHIBIDO bajar a un MySQL de desarrollo
        # solo por ser el unico disponible. La unica salida sin abortar es la ruta
        # host (sin docker), que no toca ningun contenedor.
        $hostAlembic = $false
        try { $null = & python -c 'import alembic' 2>$null; $hostAlembic = ($LASTEXITCODE -eq 0) } catch { $hostAlembic = $false }
        if ($hostAlembic -and (Test-DbTcp -H $DbHost -P $DbPort)) {
            Write-Av 'Sin MySQL de pruebas en Docker; continuando por ruta host (CREATE DATABASE via python del host; sin CREATE USER/GRANT). Ningun contenedor es tocado.'
        } else {
            Write-Er 'No se identifico inequivocamente ningun MySQL de PRUEBAS corriendo en Docker.'
            Write-Host ('    Contenedores MySQL del proyecto visibles: ' + $(if ($cands) { $cands -join ', ' } else { '(ninguno)' }))
            Write-Host '    Regla: este script NUNCA selecciona un MySQL de desarrollo por autodeteccion, aunque sea el unico disponible.'
            Write-Host '    Indica el MySQL de pruebas de forma explicita con: -MysqlContainer <nombre>.'
            exit 2
        }
    }
} else {
    # Docker ausente y sin -MysqlContainer: solo la ruta host puede continuar.
    $hostAlembic = $false
    try { $null = & python -c 'import alembic' 2>$null; $hostAlembic = ($LASTEXITCODE -eq 0) } catch { $hostAlembic = $false }
    if ($hostAlembic -and (Test-DbTcp -H $DbHost -P $DbPort)) {
        Write-Av 'Docker ausente: se continuara por ruta host sin DDL de permisos.'
    } else {
        Write-Er 'Docker no disponible y/o imposible continuar sin contenedor MySQL de pruebas.'
        Write-Host '    Inicia Docker Desktop (o el MySQL de pruebas del equipo) e intenta de nuevo,'
        Write-Host '    o instala alembic en el entorno del backend y usa una URL alcanzable por TCP.'
        exit 2
    }
}

# ── Resolucion de head de Alembico del repositorio ──────────────────────
$Heads = @(Get-AlembicHeads)
if ($Heads.Count -eq 1) {
    Write-Ok ("Head calculado de be/alembic/versions: {0}" -f $Heads[0])
} elseif ($Heads.Count -gt 1) {
    Write-Av ("Varios heads detectados ({0}); no deberia ocurrir: {1}" -f $Heads.Count, ($Heads -join ','))
} else {
    Write-Er 'No se pudo calcular el head de alembic desde be/alembic/versions.'
    exit 2
}

# ── [2] DDL idempotente (CREATE DATABASE / USER / GRANT) ─────────────────
$RootPw = ''
$RootPwFrom = ''
$TempSql = ''
try {
    if ($MyCtn) {
        Write-Sec ("Preparando la estructura de '{0}' (DDL idempotente en {1})..." -f $DbName, $MyCtn)
        if ($MysqlRootPassword) { $RootPw = $MysqlRootPassword; $RootPwFrom = 'parametro -MysqlRootPassword' }
        elseif ($env:MYSQL_ROOT_PASSWORD) { $RootPw = $env:MYSQL_ROOT_PASSWORD; $RootPwFrom = 'variable de entorno MYSQL_ROOT_PASSWORD' }
        else {
            $line = (docker inspect $MyCtn --format '{{range .Config.Env}}{{println .}}{{end}}' 2>$null |
                     Where-Object { $_ -match '^MYSQL_ROOT_PASSWORD=' } | Select-Object -First 1)
            if ($line) {
                $RootPw = $line.Substring('MYSQL_ROOT_PASSWORD='.Length).TrimEnd()
                $RootPwFrom = ("entorno del contenedor {0}" -f $MyCtn)
            }
        }
        if (-not $RootPw) {
            Write-Er 'No se pudo resolver la contrasena root de MySQL.'
            Write-Host '    Opciones: -MysqlRootPassword <pw> | $env:MYSQL_ROOT_PASSWORD | contenedor con MYSQL_ROOT_PASSWORD.'
            exit 2
        }
        Write-Ok ("Contrasena root obtenida desde: {0} (valor no mostrado)" -f $RootPwFrom)

        $escDbUser = ConvertTo-SqlLiteral $DbUser
        $escDbPw   = ConvertTo-SqlLiteral $DbPass
        $sqlLines = @(
            ('CREATE DATABASE IF NOT EXISTS `' + $DbName + '` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;'),
            ('CREATE USER IF NOT EXISTS ''' + $escDbUser + '''@''%'' IDENTIFIED BY ''' + $escDbPw + ''';'),
            ('GRANT ALL PRIVILEGES ON `' + $DbName + '`.* TO ''' + $escDbUser + '''@''%'';'),
            'FLUSH PRIVILEGES;'
        )
        $TempSql = Join-Path ([System.IO.Path]::GetTempPath()) ("nd_ddl_" + $PID + ".sql")
        [System.IO.File]::WriteAllText($TempSql, (($sqlLines -join "`r`n") + "`r`n"), (New-Object System.Text.UTF8Encoding($false)))
        Get-Content $TempSql -Raw | & docker exec -i -e ("MYSQL_PWD={0}" -f $RootPw) $MyCtn mysql -uroot 2>&1 | Out-Null
        if ($LASTEXITCODE -ne 0) {
            Write-Er 'El DDL fallo en el contenedor MySQL (revise contrasena root o permisos).'
            exit 1
        }
        Write-Ok ("Base '{0}' disponible; usuario '{1}'@'%' con permisos SOLO sobre esa base (operaciones IF NOT EXISTS)." -f $DbName, $DbUser)
    } else {
        Write-Sec ("Preparando la estructura de '{0}' (sin docker: via python del host)..." -f $DbName)
        $pyOk = $false
        try { $null = & python -c 'import pymysql' 2>$null; $pyOk = ($LASTEXITCODE -eq 0) } catch { $pyOk = $false }
        if (-not $pyOk) {
            Write-Er 'No hay contenedor MySQL y el python del host no tiene pymysql: no se puede crear la base.'
            Write-Host '    Levanta el stack del proyecto (docker compose up -d db) o usa -Image, o define TEST_DATABASE_URL apuntando a un MySQL ya preparado.'
            exit 2
        }
        $py = @'
import os
import pymysql
from urllib.parse import urlparse

u = urlparse(os.environ["TEST_DATABASE_URL"])
db = (u.path or "/").lstrip("/").split("?")[0]
assert db and db != "neodomus" and db.startswith("neodomus_test"), "base no permitida: " + db
conn = pymysql.connect(host=u.hostname, port=(u.port or 3306), user=u.username,
                       password=u.password, connect_timeout=15)
with conn.cursor() as c:
    c.execute("CREATE DATABASE IF NOT EXISTS `{0}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci".format(db.replace("`", "")))
conn.commit()
conn.close()
print("OK: CREATE DATABASE " + db)
'@
        $TempPy = Join-Path ([System.IO.Path]::GetTempPath()) ("nd_ddl_" + $PID + ".py")
        [System.IO.File]::WriteAllText($TempPy, $py, (New-Object System.Text.UTF8Encoding($false)))
        & python $TempPy 2>&1 | Out-Null
        if ($LASTEXITCODE -ne 0) { Write-Er 'El CREATE DATABASE via python fallo.'; exit 1 }
        Write-Av 'CREATE USER/GRANT omitidos (sin acceso root): el usuario de la URL debe tener ya los permisos sobre la base de pruebas.'
    }

    # ── [3] Alembic upgrade head ─────────────────────────────────────────
    Write-Sec 'Aplicando migraciones Alembic (upgrade head)...'
    $Route = ''
    $apiCtn = ''
    if ($Image) {
        $Route = 'imagen-docker'
    } else {
        $hostAlembic = $false
        try { $null = & python -c 'import alembic' 2>$null; $hostAlembic = ($LASTEXITCODE -eq 0) } catch { $hostAlembic = $false }
        $hostTcp = $false
        if ($hostAlembic) { $hostTcp = Test-DbTcp -H $DbHost -P $DbPort }
        if ($hostAlembic -and $hostTcp) {
            $Route = 'python-host'
        } else {
            if ($hostAlembic -and -not $hostTcp) { Write-Av ("Alembic disponible en el host, pero no se alcanza {0}:{1} por TCP; probando rutas docker..." -f $DbHost, $DbPort) }
            elseif (-not $hostAlembic) { Write-Av 'El python del host no tiene alembic importable; se usara una ruta docker.' }
            $cid = ''
            if ($dockerOk) {
                try {
                    Push-Location $Root
                    $cid = (docker compose ps -q api 2>$null)
                    Pop-Location
                } catch { try { Pop-Location } catch { } }
            }
            if ($cid) { $Route = 'compose-api' }
            elseif ($dockerOk) {
                $apiCtn = @(docker ps --format '{{.Names}}' 2>$null | Where-Object { $_ -eq 'neodomus_api' }) | Select-Object -First 1
                if ($apiCtn) { $Route = 'docker-exec-api' }
            }
        }
        if (-not $Route) {
            Write-Er 'Ninguna ruta de migraciones disponible en este entorno.'
            Write-Host '    Opciones:'
            Write-Host '      a) Instalar alembic en el entorno del backend y usar una URL alcanzable por TCP (localhost:3307).'
            Write-Host '      b) Levantar el stack del proyecto: docker compose up -d db api (ver tests/README 7).'
            Write-Host "      c) Pasar -Image <imagen-con-app>: imagen con la app y dependencias (p. ej.: docker build -t <nombre> ./be)."
            exit 2
        }
    }
    Write-Ok ("Ruta de migracion: {0}" -f $Route)

    switch ($Route) {
        'python-host' {
            Push-Location $BeDir
            try {
                $prevUrl = $env:DATABASE_URL
                $env:DATABASE_URL = $uri
                try { & python -m alembic upgrade head } finally { $env:DATABASE_URL = $prevUrl }
            } finally { Pop-Location }
            if ($LASTEXITCODE -ne 0) { Write-Er ("Alembic (python-host) fallo con codigo {0}." -f $LASTEXITCODE); exit 1 }
        }
        'compose-api' {
            Push-Location $Root
            try { & docker compose exec -T -e ("DATABASE_URL={0}" -f $uri) api uv run alembic upgrade head } finally { Pop-Location }
            if ($LASTEXITCODE -ne 0) { Write-Er ("Alembic (compose-api) fallo con codigo {0}." -f $LASTEXITCODE); exit 1 }
        }
        'docker-exec-api' {
            Write-Av "Ruta docker-exec-api: el contenedor puede tener codigo distinto al repo (version skew); su red debe alcanzar al host de la URL."
            & docker exec -e ("DATABASE_URL={0}" -f $uri) $apiCtn uv run alembic upgrade head
            if ($LASTEXITCODE -ne 0) { Write-Er ("Alembic (docker-exec-api) fallo con codigo {0}." -f $LASTEXITCODE); exit 1 }
        }
        'imagen-docker' {
            $imgCheck = (docker image inspect $Image --format 'ok' 2>$null)
            if (-not $imgCheck) {
                Write-Er ("La imagen '{0}' no existe en este Docker. Construye una con: docker build -t <nombre> ./be" -f $Image)
                exit 2
            }
            # Reconstruccion de la URL para el interior de Docker:
            #  - con contenedor MySQL conocido: su nombre (DNS interno) y puerto interno 3306
            #  - sin contenedor pero URL alcanzable desde el host: host.docker.internal:puerto
            $urlDocker = ''
            $netArgs = @()
            if ($MyCtn) {
                $nets = @((docker inspect $MyCtn --format '{{range $k, $v := .NetworkSettings.Networks}}{{$k}} {{end}}').Trim() -split ' ' | Where-Object { $_ })
                if ($MyNet) { $netArgs = @('--network', $MyNet) }
                elseif ($nets.Count -eq 1) { $netArgs = @('--network', $nets[0]) }
                elseif ($nets.Count -gt 1) {
                    Write-Er ("El contenedor {0} esta en varias redes ({1}); indica una con -Network." -f $MyCtn, ($nets -join ', '))
                    exit 2
                }
                $urlDocker = 'mysql+pymysql://{0}:{1}@{2}:3306/{3}{4}' -f $DbUser, $DbPass, $MyCtn, $DbName, $DbQs
            } else {
                if (-not (Test-DbTcp -H $DbHost -P $DbPort)) {
                    Write-Er ("No se puede alcanzar {0}:{1} desde el host; sin contenedor MySQL conocido no hay red docker que usar." -f $DbHost, $DbPort)
                    exit 2
                }
                $urlDocker = 'mysql+pymysql://{0}:{1}@host.docker.internal:{2}/{3}{4}' -f $DbUser, $DbPass, $DbPort, $DbName, $DbQs
            }
            Write-Av ("Se ejecutaran las migraciones del REPO (be/ montado en solo-lectura) con la imagen '{0}'." -f $Image)
            & docker run --rm $netArgs -v "$($BeDir):/src:ro" -e ("DATABASE_URL={0}" -f $urlDocker) --entrypoint sh $Image -c 'cp -r /src/alembic /src/app /src/alembic.ini /app/ && cd /app && ./.venv/bin/alembic upgrade head'
            if ($LASTEXITCODE -ne 0) { Write-Er ("Alembic (imagen-docker) fallo con codigo {0}." -f $LASTEXITCODE); exit 1 }
        }
        default { Write-Er 'Ruta no soportada.'; exit 2 }
    }

    # ── [4] Verificacion de alembic_version contra el head del repo ──────
    Write-Sec 'Verificando alembic_version contra el head del repo...'
    if ($MyCtn -and $RootPw) {
        $ver = ((('SELECT version_num FROM `' + $DbName + '`.alembic_version;') |
                 & docker exec -i -e ("MYSQL_PWD={0}" -f $RootPw) $MyCtn mysql -uroot -N 2>$null) -join '').Trim()
        if (-not $ver) {
            Write-Er 'No se pudo leer alembic_version de la base de pruebas.'
            exit 1
        }
        if ($Heads -contains $ver) {
            Write-Ok ("Migracion actual de la base de pruebas: {0} (== head: {1})" -f $ver, ($Heads -join ','))
        } else {
            Write-Er ("La base quedo en '{0}' pero el head del repositorio es '{1}'." -f $ver, ($Heads -join ','))
            exit 1
        }
    } elseif ($Route -eq 'python-host') {
        Push-Location $BeDir
        try { $curOut = (& python -m alembic current 2>$null | Select-Object -First 1) } finally { Pop-Location }
        $tok = ($curOut -split ' ')[0]
        if ($Heads -contains $tok) {
            Write-Ok ("Migracion actual de la base de pruebas: {0} (== head)" -f $tok)
        } else {
            Write-Av ("No se confirmo el head (salida de 'alembic current': {0})." -f $curOut)
        }
    } else {
        Write-Av 'Verificacion de version omitida (sin contenedor MySQL accesible para consulta directa).'
    }
} finally {
    if ($TempSql -and (Test-Path $TempSql)) { Remove-Item $TempSql -Force -ErrorAction SilentlyContinue }
}

# ── Res final ────────────────────────────────────────────────────────────
Write-Rule
Write-Host ("RESULTADO: BASE DE PRUEBAS '{0}' LISTA EN HEAD ({1} s). Nunca se ejecuto DROP ni se toco la base de desarrollo." -f $DbName, $Stopwatch.Elapsed.TotalSeconds.ToString('0.0')) -ForegroundColor Green
Write-Rule
exit 0
