#requires -Version 5.1
<#
.SYNOPSIS
  Prepara la infraestructura MinIO EXCLUSIVA de pruebas de NeoDomus
  (docker-compose.test.yml): levanta el contenedor, espera el healthcheck,
  crea los buckets que esperan los tests y muestra las variables TEST_MINIO_*.

.DESCRIPTION
  Pasos:
    [1] Prevalidaciones: Docker disponible + docker compose + archivo compose.
    [2] Puertos host 9100/9101 LIBRES (aborta si estan ocupados; no toca servicios).
    [3] Nombres no ocupados por infraestructura ajena (contenedor/volumen/red).
    [4] docker compose -f docker-compose.test.yml up -d minio-test (SOLO este
        servicio; jamas 'down -v'; no toca el compose ni el MinIO de desarrollo).
    [5] Espera salud: health HTTP del host (http://localhost:9100/minio/health/live)
        + estado del healthcheck del contenedor.
    [6] Crea buckets de pruebas con el cliente Python 'minio' (>=7.2.20, el mismo
        que usan los tests) dentro de un contenedor EFIMERO de la imagen de
        pruebas: make_bucket SOLO si no existe; NUNCA borra buckets ni objetos.
        La politica de lectura publica del bucket publico la aplica el servicio
        de la app (minio_service) en su primer uso, como en produccion.
    [7] Comprueba lectura que ambos buckets existen.
    [8] Imprime las TEST_MINIO_* (credenciales NUNCA imprimidas).

  Seguridad / garantias:
    - No elimina contenedores/volumenes/buckets ni datos de nadie.
    - No llena .env, no toca credenciales ni infra de desarrollo.
    - No instala herramientas globales (todo dentro de contenedores efimeros).
    - Idempotente: correrlo varias veces no duplica infra ni destruye datos
      (contenedor compose existente se reutiliza; buckets 'ya existian').

  Credenciales de pruebas (EXCLUSIVAS; OBLIGATORIAS via env; SIN defaults):
    - $env:MINIO_TEST_ROOT_USER       (usuario de pruebas, >= 3 caracteres)
    - $env:MINIO_TEST_ROOT_PASSWORD   (contrasena de pruebas, >= 8 caracteres,
                                       no predecible)
  Si faltan, el script ABORTA (exit 2) ANTES de crear o modificar cualquier
  infraestructura. Nunca se imprimen en consola/log/errores, no se reutilizan
  las credenciales de desarrollo y no se versionan secretos. Los tests las
  usan como TEST_MINIO_ACCESS_KEY / TEST_MINIO_SECRET_KEY (compatibilidad con
  las variables del proyecto).

  Codigos de salida: 0 = MinIO de pruebas listo | 1 = fallo durante la
  ejecucion (salud/buckets) | 2 = requisitos no cumplidos / uso.

.EXAMPLE
  powershell -NoProfile -ExecutionPolicy Bypass -File tests\setup_minio_test.ps1
#>
[CmdletBinding()]
param(
    [int]$HealthTimeoutSeconds = 90
)

$ErrorActionPreference = 'Stop'
$Root    = Split-Path -Parent $PSScriptRoot
$Compose = Join-Path $Root 'docker-compose.test.yml'
$BeDir   = Join-Path $Root 'be'
$ImagePy = 'neodomus_tests_tmp'          # imagen local con la app y deps (cliente minio)
$NetTest = 'neodomus_tests_net'
$CtnName = 'neodomus_minio_test'
$S3Host  = 'neodomus-minio-test'         # alias DNS de red (SIN guion bajo): lo usado como host S3
$VolName = 'neodomus_minio_test_data'
$ProjName = 'neodomus-tests'             # project id de compose (name: en el yml)
$PortApi = 9100
$PortCons = 9101
$Stopwatch = [System.Diagnostics.Stopwatch]::StartNew()

$script:Sec = 0
function Write-Rule { param([string]$Text = '=') Write-Host ($Text * 78) -ForegroundColor Cyan }
function Write-Sec  {
    $script:Sec = $script:Sec + 1
    Write-Host ("[{0}] {1}" -f $script:Sec, $args[0]) -ForegroundColor White
}
function Write-Ok   { Write-Host ("  OK: "    + $args[0]) -ForegroundColor Green }
function Write-Av   { Write-Host ("  AVISO: " + $args[0]) -ForegroundColor Yellow }
function Write-Er   { Write-Host ("  ERROR: " + $args[0]) -ForegroundColor Red }

# ── Credenciales EXCLUSIVAS de pruebas: OBLIGATORIAS via env, SIN defaults ────
# Solo se acepta configuracion EXPLICITA del operador; si falta, se ABORTA
# antes de crear/modificar cualquier infraestructura. Nunca se imprimen.
if ([string]::IsNullOrWhiteSpace($env:MINIO_TEST_ROOT_USER) -or [string]::IsNullOrWhiteSpace($env:MINIO_TEST_ROOT_PASSWORD)) {
    Write-Er 'Faltan las credenciales EXCLUSIVAS del MinIO de pruebas (abortando sin modificar nada).'
    Write-Host '    Credenciales requeridas EXCLUSIVAMENTE via variables de entorno (no hay valores por defecto):'
    Write-Host '        MINIO_TEST_ROOT_USER     (usuario de pruebas, >= 3 caracteres)'
    Write-Host '        MINIO_TEST_ROOT_PASSWORD (contrasena de pruebas, >= 8 caracteres, no predecible)'
    Write-Host '    Ejemplos (ejecutar en esta misma sesion, ANTES de este script):'
    Write-Host '        $env:MINIO_TEST_ROOT_USER     = "<usuario-de-pruebas>"'
    Write-Host '        $env:MINIO_TEST_ROOT_PASSWORD = "<contrasena-larga-y-unica-de-pruebas>"'
    Write-Host '    Los tests las usan como TEST_MINIO_ACCESS_KEY / TEST_MINIO_SECRET_KEY.'
    Write-Host '    Nada fue modificado.'
    exit 2
}
$MinioUser = $env:MINIO_TEST_ROOT_USER.Trim()
$MinioPass = $env:MINIO_TEST_ROOT_PASSWORD.Trim()
if ($MinioUser.Length -lt 3 -or $MinioPass.Length -lt 8) {
    Write-Er 'Credenciales de pruebas con longitud insuficiente: MinIO exige usuario >= 3 y contrasena >= 8 caracteres.'
    exit 2
}
if (($MinioPass -ceq $MinioUser) -or ($MinioPass -ceq 'minio-test-1234')) {
    Write-Er 'La contrasena de pruebas es predecible (identica al usuario o la default historica): elige una exclusiva y no predecible.'
    exit 2
}
# Prohibido reutilizar credenciales de desarrollo: comparacion EN MEMORIA con el
# env del MinIO de desarrollo (solo lectura, si existe). Los valores jamas se
# imprimen; si Docker no esta disponible se omite la comparacion (el caso
# 'Docker ausente' se aborta en [1]).
$devSkipped = $false
try {
    docker ps -a --format '{{.Names}}' 2>$null | Out-Null
    if ($LASTEXITCODE -eq 0) {
        $devNames = (docker ps -a --format '{{.Names}}' 2>$null | Where-Object { $_ -eq 'neodomus_minio' })
        if ($devNames) {
            $devEnvLines = @(docker inspect neodomus_minio --format '{{range .Config.Env}}{{println .}}{{end}}' 2>$null)
            $devUser = (($devEnvLines | Where-Object { $_ -match '^MINIO_ROOT_USER=' }) -replace '^MINIO_ROOT_USER=','')
            $devPass = (($devEnvLines | Where-Object { $_ -match '^MINIO_ROOT_PASSWORD=' }) -replace '^MINIO_ROOT_PASSWORD=','')
            if (($devUser -and ([string]::CompareOrdinal($devUser, $MinioUser) -eq 0)) -or
                ($devPass -and ([string]::CompareOrdinal($devPass, $MinioPass) -eq 0))) {
                Write-Er 'Las credenciales de pruebas coinciden con las de DESARROLLO: abortando (no se reutilizan credenciales de desarrollo).'
                exit 2
            }
        }
    } else { $devSkipped = $true }
} catch { $devSkipped = $true }
# Dejar las credenciales disponibles para los pasos internos (sin imprimirlas
# ni pasarlas por la linea de comandos: los docker run heredan con -e bare).
$env:CB_USER = $MinioUser
$env:CB_PASS = $MinioPass

# Buckets de PRUEBAS (derivados de los nombres reales del proyecto, con el
# sufijo exigido por testdb.py: ambos deben contener la palabra 'test'):
$BucketPublic  = 'neodomus-test-media'    # paralelo de MINIO_BUCKET (dev: neodomus-media)
$BucketPrivate = 'neodomus-test-private'  # paralelo de MINIO_PRIVATE_BUCKET (dev: neodomus-private)

Write-Rule
Write-Host 'NEODOMUS - Setup del MinIO EXCLUSIVO de pruebas (setup_minio_test)'
Write-Host ("Root    : " + $Root)
Write-Host ("Compose : " + $Compose)
Write-Rule

# ── [1] Prevalidaciones ─────────────────────────────────────────────────
Write-Sec 'Prevalidando entorno (Docker + compose + archivo)...'
$dockerOk = $false
try { $null = docker version --format '{{.Server.Version}}' 2>$null; $dockerOk = ($LASTEXITCODE -eq 0) } catch { $dockerOk = $false }
if (-not $dockerOk) {
    Write-Er 'Docker no esta disponible en esta sesion.'
    Write-Host '    Inicia Docker Desktop e intenta de nuevo. Nada fue modificado.'
    exit 2
}
if (-not (Test-Path $Compose)) {
    Write-Er "No se encontro el archivo 'docker-compose.test.yml' en la raiz del repo."
    exit 2
}
$composeOk = $false
try { $null = docker compose version 2>$null; $composeOk = ($LASTEXITCODE -eq 0) } catch { $composeOk = $false }
if (-not $composeOk) {
    Write-Er "'docker compose' (v2) no esta disponible."
    exit 2
}
$pyImgOk = (docker image inspect $ImagePy --format 'ok' 2>$null)
if (-not $pyImgOk) {
    Write-Er ("La imagen '{0}' no existe: se usa para crear los buckets sin instalar nada." -f $ImagePy)
    Write-Host '    Construye una con la app si aun no existe (docker build -t <nombre> ./be).'
    exit 2
}
Write-Ok 'Docker, compose y artefactos requeridos disponibles.'

# ── [2] Puertos host libres (nunca los de desarrollo 9000/9001) ────────
Write-Sec ("Verificando puertos host {0}/{1} (los de desarrollo 9000/9001 NO se tocan)..." -f $PortApi, $PortCons)
foreach ($p in $PortApi, $PortCons) {
    # Idempotencia: si el propio MinIO de pruebas (este compose) esta corriendo
    # y publica este puerto, el listener de loopback es de nuestras pruebas y
    # NO es una colision (con publicacion solo-localhost Docker Desktop deja
    # un listener real de Windows en 127.0.0.1).
    $publicadoPorNuestro = $false
    try {
        $insp = (docker inspect $CtnName 2>$null | ConvertFrom-Json)[0]
        if ($insp.State.Status -eq 'running') {
            # NetworkSettings.Ports usa el puerto INTERNO como clave; se busca
            # la publicacion cuyo HostPort (puerto del host) sea $p.
            foreach ($prop2 in @($insp.NetworkSettings.Ports.PSObject.Properties)) {
                foreach ($b in @($prop2.Value)) {
                    if ($b.HostPort -eq ([string]$p)) { $publicadoPorNuestro = $true }
                }
            }
        }
    } catch { $publicadoPorNuestro = $false }
    if ($publicadoPorNuestro) {
        Write-Ok ("Puerto {0}: publicado por el MinIO de pruebas ya en marcha (idempotente, sin colision)." -f $p)
        continue
    }
    # Sonda autoritativa por DIRECCION: Windows permite coexistir wildcard
    # (0.0.0.0) con bind especifico (127.0.0.1) en el mismo puerto; se prueba
    # AMBOS bind de forma excluyente para no dejar pasar ocupaciones reales.
    foreach ($addr in 'Any', 'Loopback') {
        $vinculo = if ($addr -eq 'Any') { [System.Net.IPAddress]::Any } else { [System.Net.IPAddress]::Loopback }
        $probe = $null
        try {
            $probe = [System.Net.Sockets.TcpListener]::new($vinculo, $p)
            $probe.Start()
        } catch {
            $who = ''
            try {
                $l = Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
                if ($l) { $who = try { (' (proceso: ' + (Get-Process -Id $l.OwningProcess -ErrorAction Stop).ProcessName + ')') } catch { '' } }
            } catch { }
            Write-Er ("El puerto {0} esta OCUPADO en {1}{2}." -f $p, $addr, $who)
            Write-Host '    No se toco ningun servicio. Libera el puerto o cambia el mapeo del compose de pruebas.'
            exit 2
        } finally {
            if ($probe) { $probe.Stop() }
            Start-Sleep -Milliseconds 50
        }
    }
}
Write-Ok ("Puertos {0} y {1} libres; MinIO de desarrollo en 9000/9001 sin afectar." -f $PortApi, $PortCons)

# ── [3] Nombres (contenedor/volumen/red) sin infraestructura ajena ─────
Write-Sec 'Verificando nombres de contenedor, volumen y red...'
$existingCtn = (docker ps -a --format '{{.Names}}' 2>$null | Where-Object { $_ -eq $CtnName })
if ($existingCtn) {
    $ownProj = ''
    try {
        $insp = (docker inspect $CtnName 2>$null | ConvertFrom-Json)[0]
        $ownProj = $insp.Config.Labels.PSObject.Properties['com.docker.compose.project'].Value
    } catch { $ownProj = '' }
    if ($ownProj -eq $ProjName) {
        Write-Ok ("Contenedor {0} ya existe y es de ESTE compose de pruebas (idempotente)." -f $CtnName)
    } else {
        Write-Er ("El nombre de contenedor '{0}' esta ocupado por infraestructura ajena (project={1})." -f $CtnName, $ownProj)
        Write-Host '    Abortando: no se toca nada. Revisa nombres de docker en este equipo.'
        exit 2
    }
} else {
    Write-Ok ('Nombre {0} libre.' -f $CtnName)
}
$existingVol = (docker volume ls --format '{{.Name}}' 2>$null | Where-Object { $_ -eq $VolName })
if ($existingVol) { Write-Ok ("Volumen {0} ya existe (sera reutilizado; datos de pruebas preservados)." -f $VolName) }
else { Write-Ok ("Volumen {0} libre (se creara)." -f $VolName) }
$existingNet = (docker network ls --format '{{.Name}}' 2>$null | Where-Object { $_ -eq $NetTest })
if ($existingNet) { Write-Ok ("Red {0} ya existe (dedicada a pruebas; reutilizada)." -f $NetTest) }
else {
    docker network create $NetTest 2>$null | Out-Null
    if ($LASTEXITCODE -ne 0) { Write-Er ("No se pudo crear la red de pruebas '{0}'." -f $NetTest); exit 1 }
    Write-Ok ("Red {0} creada (dedicada a pruebas)." -f $NetTest)
}

# ── [4] Levantar SOLO el servicio MinIO de pruebas ─────────────────────
Write-Sec ('Levantando servicio minio-test ({0} en red {1})...' -f $CtnName, $NetTest)
Push-Location $Root
try { & docker compose -f $Compose up -d minio-test | ForEach-Object { Write-Host ("    " + $_) } }
finally { Pop-Location }
if ($LASTEXITCODE -ne 0) {
    Write-Er ("El compose de pruebas fallo con codigo {0}." -f $LASTEXITCODE)
    exit 1
}
Write-Ok ("Contenedor {0} en ejecucion." -f $CtnName)

# ── [5] Esperar salud (health HTTP del host + healthcheck del contenedor) ─
Write-Sec ('Esperando salud del MinIO de pruebas (http://localhost:{0}/minio/health/live)...' -f $PortApi)
$healthy = $false
$deadline = [DateTime]::UtcNow.AddSeconds($HealthTimeoutSeconds)
while ([DateTime]::UtcNow -lt $deadline) {
    $ctnHealth = ''
    try { $ctnHealth = (docker inspect $CtnName --format '{{if .State.Health}}{{.State.Health.Status}}{{end}}') } catch { $ctnHealth = '' }
    $apiUp = $false
    try {
        $resp = Invoke-WebRequest -Uri ("http://localhost:{0}/minio/health/live" -f $PortApi) -UseBasicParsing -TimeoutSec 3
        $apiUp = ($resp.StatusCode -eq 200)
    } catch { $apiUp = $false }
    if ($apiUp -and ($ctnHealth -eq 'healthy' -or -not $ctnHealth)) { $healthy = $true; break }
    Start-Sleep -Seconds 2
}
if (-not $healthy) {
    Write-Er ("El MinIO de pruebas no quedo saludable en {0} s." -f $HealthTimeoutSeconds)
    Write-Host '    Diagnosticar: docker logs ' + $CtnName + ' (no se toca infra de desarrollo).'
    exit 1
}
Write-Ok ("MinIO de pruebas SALUDABLE ({0} s)." -f $Stopwatch.Elapsed.TotalSeconds.ToString('0.0'))

# ── [6] Crear buckets de pruebas (cliente minio en contenedor efimero) ─
Write-Sec ("Creando buckets de pruebas (solo si no existen; NUNCA se borra nada)...")
$py = @'
import os
from minio import Minio

client = Minio(
    os.environ["CB_ENDPOINT"],
    access_key=os.environ["CB_USER"],
    secret_key=os.environ["CB_PASS"],
    secure=False,
)
objetivo = [os.environ["CB_BUCKET_PUBLIC"], os.environ["CB_BUCKET_PRIVATE"]]
for name in objetivo:
    if client.bucket_exists(name):
        print("YA_EXISTIA|" + name)
    else:
        client.make_bucket(name)
        print("CREADO     |" + name)
print("BUCKETS    |" + ",".join(sorted(b.name for b in client.list_buckets())))
'@
$TempPy = Join-Path ([System.IO.Path]::GetTempPath()) ("nd_minio_buckets_" + $PID + ".py")
try {
    [System.IO.File]::WriteAllText($TempPy, $py, (New-Object System.Text.UTF8Encoding($false)))
    & docker run --rm --network $NetTest `
        -v "$($TempPy):/cb.py:rw" `
        -e ('CB_ENDPOINT={0}:9000' -f $S3Host) `
        -e 'CB_USER' `
        -e 'CB_PASS' `
        -e ("CB_BUCKET_PUBLIC={0}" -f $BucketPublic) `
        -e ("CB_BUCKET_PRIVATE={0}" -f $BucketPrivate) `
        --entrypoint /app/.venv/bin/python $ImagePy /cb.py
    if ($LASTEXITCODE -ne 0) {
        Write-Er 'La creacion de buckets fallo (credenciales o conectividad del MinIO de pruebas).'
        exit 1
    }
} finally {
    Remove-Item $TempPy -Force -ErrorAction SilentlyContinue
}

# ── [7] Comprobar buckets disponibles (lectura directa) ────────────────
Write-Sec 'Comprobando que los buckets de pruebas estan disponibles...'
$verif = @'
import os
from minio import Minio
client = Minio(os.environ["CB_ENDPOINT"], access_key=os.environ["CB_USER"], secret_key=os.environ["CB_PASS"], secure=False)
for name in [os.environ["CB_BUCKET_PUBLIC"], os.environ["CB_BUCKET_PRIVATE"]]:
    print(("EXISTE|OK|" if client.bucket_exists(name) else "EXISTE|FALTA|") + name)
'@
$TempPy2 = Join-Path ([System.IO.Path]::GetTempPath()) ("nd_minio_verif_" + $PID + ".py")
try {
    [System.IO.File]::WriteAllText($TempPy2, $verif, (New-Object System.Text.UTF8Encoding($false)))
    & docker run --rm --network $NetTest `
        -v "$($TempPy2):/cb.py:rw" `
        -e ('CB_ENDPOINT={0}:9000' -f $S3Host) `
        -e 'CB_USER' `
        -e 'CB_PASS' `
        -e ("CB_BUCKET_PUBLIC={0}" -f $BucketPublic) `
        -e ("CB_BUCKET_PRIVATE={0}" -f $BucketPrivate) `
        --entrypoint /app/.venv/bin/python $ImagePy /cb.py
    if ($LASTEXITCODE -ne 0) { Write-Er 'La verificacion de buckets fallo.'; exit 1 }
} finally {
    Remove-Item $TempPy2 -Force -ErrorAction SilentlyContinue
}

# ── [8] Variables TEST_MINIO_* para los tests (credenciales NUNCA imprimidas) ─
Write-Sec 'Variables TEST_MINIO_* para ejecutar las pruebas (credenciales via env):'
Write-Host ''
Write-Host '    # Credenciales (via variables de entorno; NUNCA se imprimen en consola/log/errores):'
Write-Host '    $env:TEST_MINIO_ACCESS_KEY      = $env:MINIO_TEST_ROOT_USER      # mismo usuario del MinIO de pruebas'
Write-Host '    $env:TEST_MINIO_SECRET_KEY      = $env:MINIO_TEST_ROOT_PASSWORD  # misma contrasena del MinIO de pruebas'
Write-Host ''
Write-Host '    # Modo HOST (python local en el anfitrion; publicacion solo en 127.0.0.1):'
Write-Host ('    $env:TEST_MINIO_ENDPOINT        = "localhost:{0}"' -f $PortApi)
Write-Host ('    $env:TEST_MINIO_PUBLIC_ENDPOINT = "http://localhost:{0}"' -f $PortApi)
Write-Host ('    # Modo CONTENEDOR (pruebas dentro de docker en la red {0}; SIEMPRE alias interno + puerto interno):' -f $NetTest)
Write-Host ('    $env:TEST_MINIO_ENDPOINT        = "{0}:9000"' -f $S3Host)
Write-Host ('    $env:TEST_MINIO_PUBLIC_ENDPOINT = "http://{0}:9000"    # alias interno: no depende del puerto publicado' -f $S3Host)
Write-Host ('    $env:TEST_MINIO_BUCKET          = "{0}"' -f $BucketPublic)
Write-Host ('    $env:TEST_MINIO_PRIVATE_BUCKET  = "{0}"' -f $BucketPrivate)
Write-Host ''

# ── Res final ──────────────────────────────────────────────────────────
Write-Rule
Write-Host ("RESULTADO: MINIO DE PRUEBAS LISTO - {0} | puertos {1}/{2} | volumen {3} ({4} s). El MinIO de desarrollo NO fue tocado." -f $CtnName, $PortApi, $PortCons, $VolName, $Stopwatch.Elapsed.TotalSeconds.ToString('0.0')) -ForegroundColor Green
Write-Rule
exit 0
