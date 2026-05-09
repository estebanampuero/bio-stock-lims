#Requires -Version 5.1
<#
.SYNOPSIS
    BIO-STOCK LIMS — Actualización del sistema

.DESCRIPTION
    Actualiza el sistema a la última versión disponible.
    Proceso: backup → detener servicios → actualizar código → compilar → reiniciar → verificar.
    Si algo falla, permite rollback al estado anterior automáticamente.

.PARAMETER SourcePath
    Ruta del repositorio/código fuente actualizado.
    Por defecto: directorio padre del script (asume que ya se hizo git pull).

.PARAMETER SkipBackup
    Omitir backup antes de actualizar (no recomendado).

.PARAMETER AutoRollback
    Revertir automáticamente si el sistema no responde tras la actualización.

.EXAMPLE
    .\Update-BioStock.ps1
    Actualización estándar con backup y verificación.

.EXAMPLE
    git pull && .\scripts\Update-BioStock.ps1 -AutoRollback
    Actualización con git pull y rollback automático ante fallos.
#>

[CmdletBinding()]
param(
    [string]$SourcePath   = (Split-Path (Split-Path $PSScriptRoot -Parent) -Parent),
    [switch]$SkipBackup,
    [switch]$AutoRollback
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

. (Join-Path $PSScriptRoot 'BioStockConfig.ps1')

Show-Banner 'Actualización del Sistema'

if (-not (Test-Administrator)) {
    Write-BioLog 'Este script requiere permisos de Administrador.' ERROR
    exit 1
}

$startTime = Get-Date

# ── Paso 1: Backup preventivo ─────────────────────────────────────────────────
if (-not $SkipBackup) {
    Write-BioLog '[1/6] Creando backup de seguridad...' INFO
    try {
        & (Join-Path $PSScriptRoot 'Backup-BioStock.ps1')
        Write-BioLog 'Backup completado' OK
    } catch {
        Write-BioLog "Error en backup: $_" WARN
        $continue = Read-Host 'El backup falló. ¿Continuar de todos modos? (SI/no)'
        if ($continue -ne 'SI') { exit 1 }
    }
} else {
    Write-BioLog '[1/6] Backup omitido (--SkipBackup)' WARN
}

# ── Paso 2: Detener servicios ─────────────────────────────────────────────────
Write-BioLog '[2/6] Deteniendo servicios...' INFO
Stop-Service -Name $script:BioStock.ServiceNginx -Force -ErrorAction SilentlyContinue
Stop-Service -Name $script:BioStock.ServiceApi   -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2
Write-BioLog 'Servicios detenidos' OK

# Capturar versión actual para posible rollback
$currentVersion = git -C $SourcePath rev-parse HEAD 2>$null

# ── Paso 3: Actualizar código fuente ─────────────────────────────────────────
Write-BioLog '[3/6] Actualizando código fuente...' INFO
try {
    $gitStatus = git -C $SourcePath pull origin main 2>&1
    if ($LASTEXITCODE -eq 0) {
        $newVersion = git -C $SourcePath rev-parse HEAD 2>$null
        Write-BioLog "Código actualizado: $($currentVersion?.Substring(0,8)) → $($newVersion?.Substring(0,8))" OK
    } else {
        Write-BioLog "git pull no disponible o falló: $gitStatus" WARN
        Write-BioLog 'Continuando con código actual en el directorio de instalación' INFO
    }
} catch {
    Write-BioLog "git no disponible. Continuando con código existente." WARN
}

# ── Paso 4: Instalar dependencias ────────────────────────────────────────────
Write-BioLog '[4/6] Actualizando dependencias npm...' INFO
try {
    Push-Location $script:BioStock.App
    Copy-Item (Join-Path $SourcePath 'package*.json') -Destination . -Force -ErrorAction SilentlyContinue
    Copy-Item (Join-Path $SourcePath 'server.cjs')    -Destination . -Force -ErrorAction SilentlyContinue
    & npm ci --omit=dev --prefer-offline 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "npm ci falló" }
    Write-BioLog 'Dependencias actualizadas' OK
} finally {
    Pop-Location
}

# ── Paso 5: Recompilar frontend ───────────────────────────────────────────────
Write-BioLog '[5/6] Compilando interfaz web...' INFO
try {
    Push-Location $SourcePath
    & npm ci 2>&1 | Out-Null
    & npm run build 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "npm run build falló" }
    $distPath = Join-Path $SourcePath 'dist'
    Copy-Item "$distPath\*" -Destination $script:BioStock.NginxHtml -Recurse -Force
    Write-BioLog 'Frontend compilado y desplegado' OK
} catch {
    Write-BioLog "Error compilando frontend: $_" ERROR
    if ($AutoRollback -and $currentVersion) {
        Write-BioLog 'Iniciando rollback automático...' WARN
        git -C $SourcePath checkout $currentVersion 2>$null
    }
    # Reiniciar servicios aunque haya error
    Start-Service -Name $script:BioStock.ServiceApi   -ErrorAction SilentlyContinue
    Start-Service -Name $script:BioStock.ServiceNginx -ErrorAction SilentlyContinue
    exit 1
} finally {
    Pop-Location
}

# ── Paso 6: Reiniciar servicios ───────────────────────────────────────────────
Write-BioLog '[6/6] Reiniciando servicios actualizados...' INFO
Start-Service -Name $script:BioStock.ServiceApi
Start-Sleep -Seconds 4
Start-Service -Name $script:BioStock.ServiceNginx
Start-Sleep -Seconds 3

# ── Verificar ─────────────────────────────────────────────────────────────────
Write-BioLog 'Verificando sistema...' INFO
$attempts = 0
$healthy = $false
while ($attempts -lt 8 -and -not $healthy) {
    Start-Sleep -Seconds 2
    $healthy = Test-ApiHealth
    $attempts++
}

$elapsed = [Math]::Round(((Get-Date) - $startTime).TotalSeconds)

if ($healthy) {
    Write-BioLog "Actualización completada en $elapsed segundos" OK
    Write-EventLog -LogName Application -Source $script:BioStock.EventSource `
        -EventId 3000 -EntryType Information `
        -Message "BIO-STOCK LIMS actualizado exitosamente en $elapsed segundos" `
        -ErrorAction SilentlyContinue
} else {
    Write-BioLog 'El sistema no responde tras la actualización.' ERROR
    if ($AutoRollback -and $currentVersion) {
        Write-BioLog "Ejecutando rollback a $($currentVersion.Substring(0,8))..." WARN
        git -C $SourcePath checkout $currentVersion 2>$null
        Write-BioLog 'Ejecuta Update-BioStock.ps1 nuevamente para volver a intentar.' INFO
    } else {
        Write-Host "`n  Para rollback manual:" -ForegroundColor Yellow
        Write-Host "  1. git checkout $($currentVersion?.Substring(0,8))" -ForegroundColor Gray
        Write-Host '  2. .\Update-BioStock.ps1' -ForegroundColor Gray
    }
    exit 1
}
