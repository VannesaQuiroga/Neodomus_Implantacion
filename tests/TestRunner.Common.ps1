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

function Get-MissingPythonPackages {
    param([string[]]$Required)
    $installed = @()
    # En PowerShell 5.1, los errores redirigidos de un proceso nativo pueden
    # terminar el script cuando ErrorActionPreference es Stop. Restaurarlo
    # siempre conserva el comportamiento del runner.
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
