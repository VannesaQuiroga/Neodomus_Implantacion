#requires -Version 5.1
<#
.SYNOPSIS
  Ejecuta UNA prueba especifica (de backend, de frontend o E2E).

.DESCRIPTION
  Delega en los scripts centralizados para reutilizar todas las validaciones
  (base de pruebas obligatoria, dependencias, etc.). Se debe indicar
  EXACTAMENTE una de las tres opciones: -Backend, -Frontend o -E2E.

.PARAMETER Backend
  Modulo unittest del backend. Valores validos:
    test_auth | test_auth.TestClase.TestMetodo | test_bloque_2 | t1...
  (acepta tambien 'test_auth.py' o la ruta 'app/tests/test_auth.py' o 'be/app/tests/test_auth.py')

.PARAMETER Frontend
  Ruta relativa a fe/ del archivo de prueba, p.ej. 'src/utils/metros.test.ts'.

.PARAMETER E2E
  Nombre del flujo E2E con orquestador, p.ej. cart-checkout, register, session,
  admin-paginacion, foto-tecnico, reporte-ventas.

.EXAMPLE
  powershell -NoProfile -ExecutionPolicy Bypass -File tests\run_one.ps1 -Backend test_auth
.EXAMPLE
  powershell -NoProfile -ExecutionPolicy Bypass -File tests\run_one.ps1 -Frontend src/utils/metros.test.ts
.EXAMPLE
  powershell -NoProfile -ExecutionPolicy Bypass -File tests\run_one.ps1 -E2E cart-checkout
#>
[CmdletBinding()]
param(
    [string]$Backend = '',
    [string]$Frontend = '',
    [string]$E2E = '',
    [switch]$Coverage,
    [switch]$InDocker,
    [string]$DatabaseName = 'neodomus_test'
)

$ErrorActionPreference = 'Stop'

function Write-Rule([string]$Text = '=') {
    Write-Host ($Text * 78) -ForegroundColor DarkGray
}

function Invoke-ChildScript {
    param([string]$ScriptName, [string[]]$ChildArgs)
    $path = Join-Path $PSScriptRoot $ScriptName
    $output = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $path @ChildArgs 2>&1
    $rc = $LASTEXITCODE
    if ($output) { $output | ForEach-Object { Write-Host $_ } }
    return [int]$rc
}

# ---------------------------------------------------------------- main ----
Write-Rule
Write-Host 'NEODOMUS - Ejecucion de una prueba especifica' -ForegroundColor Cyan
Write-Rule

$seleccionadas = @()
if (-not [string]::IsNullOrWhiteSpace($Backend))  { $seleccionadas += 'Backend' }
if (-not [string]::IsNullOrWhiteSpace($Frontend)) { $seleccionadas += 'Frontend' }
if (-not [string]::IsNullOrWhiteSpace($E2E))      { $seleccionadas += 'E2E' }

if ($seleccionadas.Count -ne 1) {
    Write-Host 'ERROR: has de indicar EXACTAMENTE una opcion: -Backend <modulo> | -Frontend <archivo> | -E2E <flujo>.' -ForegroundColor Red
    Write-Host 'Ejemplos:'
    Write-Host '  tests\run_one.ps1 -Backend test_auth' -ForegroundColor Green
    Write-Host '  tests\run_one.ps1 -Frontend src/utils/metros.test.ts' -ForegroundColor Green
    Write-Host '  tests\run_one.ps1 -E2E cart-checkout' -ForegroundColor Green
    exit 2
}

switch ($seleccionadas[0]) {
    'Backend' {
        $modName = ($Backend -replace '\.py$', '') -replace '^(be[\\/])?(app[\\/]tests[\\/])?', '' -replace '[\\/]', '.'
        Write-Host ("Prueba de backend: {0}" -f $modName) -ForegroundColor Cyan
        $childArgs = @('-Module', $modName, '-DatabaseName', $DatabaseName)
        if ($Coverage) { $childArgs += '-Coverage' }
        if ($InDocker) { $childArgs += '-InDocker' }
        $code = Invoke-ChildScript -ScriptName 'run_backend_tests.ps1' -ChildArgs $childArgs
    }
    'Frontend' {
        Write-Host ("Prueba de frontend: {0}" -f $Frontend) -ForegroundColor Cyan
        $childArgs = @('-File', $Frontend)
        if ($Coverage) { $childArgs += '-Coverage' }
        $code = Invoke-ChildScript -ScriptName 'run_frontend_tests.ps1' -ChildArgs $childArgs
    }
    'E2E' {
        Write-Host ("Prueba E2E: {0}" -f $E2E) -ForegroundColor Cyan
        $childArgs = @('-Name', $E2E, '-DatabaseName', $DatabaseName)
        $code = Invoke-ChildScript -ScriptName 'run_e2e_tests.ps1' -ChildArgs $childArgs
    }
}

if ($null -eq $code) { $code = 1 }

if ($code -eq 0) {
    Write-Host "[run_one] Prueba terminada con EXITO (codigo 0)." -ForegroundColor Green
} else {
    Write-Host ("[run_one] Prueba terminada con codigo {0}." -f $code) -ForegroundColor $(if ($code -eq 1) { 'Red' } else { 'Yellow' })
}

exit $code
