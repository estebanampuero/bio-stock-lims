#Requires -Version 5.1
<#
.SYNOPSIS
    BIO-STOCK LIMS — Restauración de base de datos desde backup

.DESCRIPTION
    Restaura la base de datos desde un archivo de backup (.zip o .db).
    Siempre detiene los servicios antes de restaurar y los reinicia al terminar.
    Crea un backup de seguridad de la DB actual antes de sobreescribir.

.PARAMETER BackupFile
    Ruta al archivo de backup (.zip o .db). Si no se especifica, muestra los disponibles.

.PARAMETER BackupPath
    Carpeta donde buscar backups. Por defecto: C:\BioStock\backups

.PARAMETER Force
    No pedir confirmación antes de restaurar.

.EXAMPLE
    .\Restore-BioStock.ps1
    Muestra lista de backups disponibles para seleccionar.

.EXAMPLE
    .\Restore-BioStock.ps1 -BackupFile C:\BioStock\backups\biostock_2026-05-07_02-00-00.zip
    Restaura un backup específico.
#>

[CmdletBinding(SupportsShouldProcess)]
param(
    [string]$BackupFile = '',
    [string]$BackupPath = 'C:\BioStock\backups',
    [switch]$Force
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

. (Join-Path $PSScriptRoot 'BioStockConfig.ps1')

Show-Banner 'Restauración de Base de Datos'

if (-not (Test-Administrator)) {
    Write-BioLog 'Este script requiere permisos de Administrador.' ERROR
    exit 1
}

# ── Seleccionar backup ────────────────────────────────────────────────────────
if ($BackupFile -eq '') {
    $backups = Get-ChildItem $BackupPath -Filter 'biostock_*.zip' |
               Sort-Object LastWriteTime -Descending |
               Select-Object -First 20

    if ($backups.Count -eq 0) {
        Write-BioLog "No se encontraron backups en $BackupPath" ERROR
        exit 1
    }

    Write-Host "`nBackups disponibles:" -ForegroundColor Cyan
    for ($i = 0; $i -lt $backups.Count; $i++) {
        $b = $backups[$i]
        $sizeMB = [Math]::Round($b.Length / 1MB, 2)
        Write-Host "  [$($i+1)] $($b.Name) — $sizeMB MB — $($b.LastWriteTime.ToString('dd/MM/yyyy HH:mm'))" -ForegroundColor White
    }
    Write-Host "  [0] Cancelar`n" -ForegroundColor Gray

    $selection = Read-Host 'Selecciona el número del backup a restaurar'
    if ($selection -eq '0' -or $selection -eq '') { exit 0 }

    $idx = [int]$selection - 1
    if ($idx -lt 0 -or $idx -ge $backups.Count) {
        Write-BioLog 'Selección inválida.' ERROR
        exit 1
    }
    $BackupFile = $backups[$idx].FullName
}

if (-not (Test-Path $BackupFile)) {
    Write-BioLog "Archivo de backup no encontrado: $BackupFile" ERROR
    exit 1
}

Write-Host "`nBackup seleccionado: $BackupFile" -ForegroundColor Yellow

# ── Confirmación ──────────────────────────────────────────────────────────────
if (-not $Force) {
    Write-Host "`n  ADVERTENCIA: Esta operación sobreescribirá la base de datos actual." -ForegroundColor Red
    Write-Host '  Se creará un backup de seguridad de la DB actual antes de proceder.' -ForegroundColor Yellow
    $confirm = Read-Host "`n  ¿Confirmar restauración? (escribir SI para continuar)"
    if ($confirm -ne 'SI') {
        Write-Host 'Restauración cancelada.' -ForegroundColor Gray
        exit 0
    }
}

# ── Backup de seguridad de la DB actual ──────────────────────────────────────
Write-BioLog 'Creando backup de seguridad de la DB actual...' INFO
$safetyBackup = Join-Path $BackupPath "biostock_prerestauración_$(Get-Date -Format 'yyyy-MM-dd_HH-mm-ss').db"
if (Test-Path $script:BioStock.DbFile) {
    Copy-Item $script:BioStock.DbFile -Destination $safetyBackup -Force
    Write-BioLog "Backup de seguridad: $safetyBackup" OK
}

# ── Detener servicios ─────────────────────────────────────────────────────────
Write-BioLog 'Deteniendo servicios BIO-STOCK...' INFO
Stop-Service -Name $script:BioStock.ServiceNginx -Force -ErrorAction SilentlyContinue
Stop-Service -Name $script:BioStock.ServiceApi   -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 3
Write-BioLog 'Servicios detenidos' OK

# ── Extraer backup ────────────────────────────────────────────────────────────
Write-BioLog 'Extrayendo backup...' INFO
$extractDir = Join-Path $env:TEMP 'bs_restore'
Remove-Item $extractDir -Recurse -Force -ErrorAction SilentlyContinue
New-Item $extractDir -ItemType Directory | Out-Null

if ($BackupFile -match '\.zip$') {
    Expand-Archive -Path $BackupFile -DestinationPath $extractDir -Force
    $restoredDb = Get-ChildItem $extractDir -Filter '*.db' | Select-Object -First 1
} else {
    # .db directo
    Copy-Item $BackupFile -Destination $extractDir
    $restoredDb = Get-Item $BackupFile
}

if (-not $restoredDb) {
    Write-BioLog 'No se encontró archivo .db en el backup.' ERROR
    Start-Service -Name $script:BioStock.ServiceApi -ErrorAction SilentlyContinue
    Start-Service -Name $script:BioStock.ServiceNginx -ErrorAction SilentlyContinue
    exit 1
}

# ── Reemplazar DB ─────────────────────────────────────────────────────────────
Write-BioLog "Restaurando DB desde: $($restoredDb.Name)" INFO
Copy-Item $restoredDb.FullName -Destination $script:BioStock.DbFile -Force
Remove-Item $extractDir -Recurse -Force -ErrorAction SilentlyContinue
Write-BioLog 'Base de datos restaurada' OK

# ── Reiniciar servicios ───────────────────────────────────────────────────────
Write-BioLog 'Reiniciando servicios...' INFO
Start-Service -Name $script:BioStock.ServiceApi
Start-Sleep -Seconds 4
Start-Service -Name $script:BioStock.ServiceNginx
Start-Sleep -Seconds 3

# ── Verificar ─────────────────────────────────────────────────────────────────
$healthy = Test-ApiHealth
if ($healthy) {
    Write-BioLog 'Sistema restaurado y funcionando correctamente' OK
} else {
    Write-BioLog 'Servicios reiniciados pero API no responde. Verifica los logs.' WARN
}

Write-EventLog -LogName Application -Source $script:BioStock.EventSource `
    -EventId 2010 -EntryType Information `
    -Message "DB de BIO-STOCK restaurada desde: $BackupFile" `
    -ErrorAction SilentlyContinue

Write-Host ''
Write-BioLog "Backup de seguridad (DB anterior): $safetyBackup" INFO
