#Requires -Version 5.1
<#
.SYNOPSIS
    BIO-STOCK LIMS — Monitor de estado del sistema

.DESCRIPTION
    Muestra el estado en tiempo real de todos los componentes del sistema:
    servicios Windows, API health, DB, backups, recursos del sistema.
    Puede ejecutarse manualmente o como dashboard de monitoreo continuo.

.PARAMETER Watch
    Modo continuo: actualiza el estado cada N segundos.

.PARAMETER IntervalSeconds
    Intervalo de actualización en modo Watch. Por defecto: 10

.PARAMETER AlertOnly
    Solo mostrar problemas (para uso en scripts de monitoreo automatizado).

.EXAMPLE
    .\Get-BioStockStatus.ps1
    Estado instantáneo del sistema.

.EXAMPLE
    .\Get-BioStockStatus.ps1 -Watch -IntervalSeconds 5
    Dashboard continuo actualizado cada 5 segundos.
#>

[CmdletBinding()]
param(
    [switch]$Watch,
    [int]   $IntervalSeconds = 10,
    [switch]$AlertOnly
)

. (Join-Path $PSScriptRoot 'BioStockConfig.ps1')

function Get-ServiceStatus ([string]$serviceName) {
    $svc = Get-Service -Name $serviceName -ErrorAction SilentlyContinue
    if (-not $svc) { return @{ Status='NOT_INSTALLED'; Color='Red'; Icon='✗' } }
    $color = switch ($svc.Status) {
        'Running' { 'Green' }
        'Stopped' { 'Red' }
        default   { 'Yellow' }
    }
    $icon = if ($svc.Status -eq 'Running') {'✓'} else {'✗'}
    return @{ Status=$svc.Status; Color=$color; Icon=$icon }
}

function Get-DbInfo {
    if (-not (Test-Path $script:BioStock.DbFile)) {
        return @{ Exists=$false; SizeMB=0; Modified='N/A' }
    }
    $db = Get-Item $script:BioStock.DbFile
    return @{
        Exists   = $true
        SizeMB   = [Math]::Round($db.Length / 1MB, 2)
        Modified = $db.LastWriteTime.ToString('dd/MM/yyyy HH:mm:ss')
    }
}

function Get-BackupInfo {
    if (-not (Test-Path $script:BioStock.Backups)) {
        return @{ Count=0; LastBackup='Sin backups'; LastSize='N/A' }
    }
    $backups = Get-ChildItem $script:BioStock.Backups -Filter 'biostock_*.zip' |
               Sort-Object LastWriteTime -Descending
    if ($backups.Count -eq 0) {
        return @{ Count=0; LastBackup='Sin backups'; LastSize='N/A' }
    }
    $last = $backups[0]
    $age  = ((Get-Date) - $last.LastWriteTime).TotalHours
    $ageStr = if ($age -lt 1) { "hace $([int]($age*60)) min" }
              elseif ($age -lt 24) { "hace $([int]$age) h" }
              else { "hace $([int]($age/24)) días" }
    return @{
        Count      = $backups.Count
        LastBackup = "$($last.Name) ($ageStr)"
        LastSize   = "$([Math]::Round($last.Length/1KB))  KB"
        IsOld      = $age -gt 26  # Más de 26h sin backup = problema
    }
}

function Get-SystemResources {
    $cpu   = [Math]::Round((Get-Counter '\Processor(_Total)\% Processor Time').CounterSamples.CookedValue, 1)
    $os    = Get-CimInstance Win32_OperatingSystem
    $memFreeGB = [Math]::Round($os.FreePhysicalMemory / 1MB, 2)
    $memTotalGB= [Math]::Round($os.TotalVisibleMemorySize / 1MB, 2)
    $memUsedPct= [Math]::Round((1 - $os.FreePhysicalMemory/$os.TotalVisibleMemorySize)*100, 1)

    $disk  = Get-PSDrive C -ErrorAction SilentlyContinue
    $diskFreeGB  = if ($disk) { [Math]::Round($disk.Free/1GB, 1) } else { 'N/A' }
    $diskUsedPct = if ($disk) { [Math]::Round((1-$disk.Free/($disk.Used+$disk.Free))*100, 1) } else { 'N/A' }

    return @{
        CpuPct     = $cpu
        MemFreeGB  = $memFreeGB
        MemTotalGB = $memTotalGB
        MemUsedPct = $memUsedPct
        DiskFreeGB = $diskFreeGB
        DiskUsedPct= $diskUsedPct
    }
}

function Show-Status {
    if (-not $AlertOnly) {
        Clear-Host
        Show-Banner "Monitor BIO-STOCK LIMS — $(Get-Date -Format 'dd/MM/yyyy HH:mm:ss')"
    }

    $apiSvc   = Get-ServiceStatus $script:BioStock.ServiceApi
    $nginxSvc = Get-ServiceStatus $script:BioStock.ServiceNginx
    $apiUp    = Test-ApiHealth
    $db       = Get-DbInfo
    $bkp      = Get-BackupInfo
    $res      = Get-SystemResources
    $serverIp = Get-ServerIP

    $hasAlert = $false

    if (-not $AlertOnly) {
        # ── Servicios Windows ────────────────────────────────────────────────
        Write-Host '  SERVICIOS WINDOWS' -ForegroundColor DarkGray
        Write-Host "  $($apiSvc.Icon) $($script:BioStock.ServiceApi.PadRight(25)) $($apiSvc.Status)" -ForegroundColor $apiSvc.Color
        Write-Host "  $($nginxSvc.Icon) $($script:BioStock.ServiceNginx.PadRight(25)) $($nginxSvc.Status)" -ForegroundColor $nginxSvc.Color
        Write-Host ''

        # ── API Health ────────────────────────────────────────────────────────
        Write-Host '  CONECTIVIDAD' -ForegroundColor DarkGray
        $apiColor = if ($apiUp) {'Green'} else {'Red'}
        $apiIcon  = if ($apiUp) {'✓'} else {'✗'}
        Write-Host "  $apiIcon API Health Check".PadRight(30) $(if ($apiUp) {'Respondiendo'} else {'Sin respuesta'}) -ForegroundColor $apiColor
        Write-Host "  ► Acceso web: http://$serverIp$(if($script:BioStock.WebPort -ne 80){":$($script:BioStock.WebPort)"})" -ForegroundColor Cyan
        Write-Host ''

        # ── Base de datos ─────────────────────────────────────────────────────
        Write-Host '  BASE DE DATOS' -ForegroundColor DarkGray
        if ($db.Exists) {
            Write-Host "  ✓ SQLite".PadRight(30) "$($db.SizeMB) MB — Modificado: $($db.Modified)" -ForegroundColor Green
        } else {
            Write-Host '  ✗ SQLite'.PadRight(30) 'Archivo no encontrado' -ForegroundColor Red
            $hasAlert = $true
        }
        Write-Host ''

        # ── Backups ───────────────────────────────────────────────────────────
        Write-Host '  BACKUPS' -ForegroundColor DarkGray
        $bkpColor = if ($bkp.IsOld -or $bkp.Count -eq 0) {'Yellow'} else {'Green'}
        $bkpIcon  = if ($bkp.IsOld -or $bkp.Count -eq 0) {'⚠'} else {'✓'}
        Write-Host "  $bkpIcon Último backup".PadRight(30) $bkp.LastBackup -ForegroundColor $bkpColor
        Write-Host "    Total conservados:".PadRight(32) $bkp.Count -ForegroundColor Gray
        Write-Host ''

        # ── Recursos del sistema ──────────────────────────────────────────────
        Write-Host '  RECURSOS DEL SERVIDOR' -ForegroundColor DarkGray
        $cpuColor  = if ($res.CpuPct -gt 85) {'Red'} elseif ($res.CpuPct -gt 70) {'Yellow'} else {'Green'}
        $memColor  = if ($res.MemUsedPct -gt 90) {'Red'} elseif ($res.MemUsedPct -gt 80) {'Yellow'} else {'Green'}
        $diskColor = if ($res.DiskFreeGB -lt 2) {'Red'} elseif ($res.DiskFreeGB -lt 10) {'Yellow'} else {'Green'}

        Write-Host "  CPU:".PadRight(32) "$($res.CpuPct)%" -ForegroundColor $cpuColor
        Write-Host "  RAM:".PadRight(32) "Usada $($res.MemUsedPct)% — Libre: $($res.MemFreeGB) GB / $($res.MemTotalGB) GB" -ForegroundColor $memColor
        Write-Host "  Disco C:".PadRight(32) "Libre: $($res.DiskFreeGB) GB (Uso: $($res.DiskUsedPct)%)" -ForegroundColor $diskColor
        Write-Host ''
    }

    # ── Alertas ───────────────────────────────────────────────────────────────
    $alerts = @()
    if ($apiSvc.Status -ne 'Running')   { $alerts += "SERVICIO DETENIDO: $($script:BioStock.ServiceApi)" }
    if ($nginxSvc.Status -ne 'Running') { $alerts += "SERVICIO DETENIDO: $($script:BioStock.ServiceNginx)" }
    if (-not $apiUp)                    { $alerts += 'API NO RESPONDE al health check' }
    if (-not $db.Exists)                { $alerts += 'BASE DE DATOS no encontrada' }
    if ($bkp.Count -eq 0)              { $alerts += 'No hay backups disponibles' }
    if ($bkp.IsOld)                     { $alerts += 'El último backup tiene más de 26 horas' }
    if ($res.CpuPct -gt 85)            { $alerts += "CPU al $($res.CpuPct)% — carga alta" }
    if ($res.MemUsedPct -gt 90)        { $alerts += "RAM al $($res.MemUsedPct)% — memoria crítica" }
    if ($res.DiskFreeGB -lt 2)         { $alerts += "Disco C: casi lleno ($($res.DiskFreeGB) GB libres)" }

    if ($alerts.Count -gt 0) {
        $hasAlert = $true
        Write-Host '  ══ ALERTAS ══════════════════════════════════' -ForegroundColor Red
        foreach ($alert in $alerts) {
            Write-Host "  ⚠  $alert" -ForegroundColor Red
            Write-EventLog -LogName Application -Source $script:BioStock.EventSource `
                -EventId 4001 -EntryType Warning -Message "ALERTA BIO-STOCK: $alert" `
                -ErrorAction SilentlyContinue
        }
        Write-Host ''
    } elseif (-not $AlertOnly) {
        Write-Host '  ✓ Sistema operando normalmente. Sin alertas.' -ForegroundColor Green
    }

    if ($AlertOnly) { return $hasAlert }
}

# ── Modo watch o instantáneo ──────────────────────────────────────────────────
if ($Watch) {
    Write-Host "Iniciando monitor continuo (intervalo: ${IntervalSeconds}s). Ctrl+C para salir." -ForegroundColor DarkGray
    while ($true) {
        Show-Status
        Start-Sleep -Seconds $IntervalSeconds
    }
} else {
    $hasAlert = Show-Status
    if ($AlertOnly -and $hasAlert) { exit 1 }
    exit 0
}
