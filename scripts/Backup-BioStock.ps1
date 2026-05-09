#Requires -Version 5.1
<#
.SYNOPSIS
    BIO-STOCK LIMS — Backup automatizado de base de datos

.DESCRIPTION
    Realiza un backup seguro de la base de datos SQLite usando VACUUM INTO,
    que garantiza una copia consistente sin corromper la DB activa.
    Comprime el backup con Compress-Archive y limpia los más antiguos.
    Compatible con Task Scheduler de Windows (se ejecuta como SYSTEM).

.PARAMETER DestinationPath
    Carpeta donde guardar el backup. Por defecto: C:\BioStock\backups

.PARAMETER RetentionDays
    Días que se conservan los backups. Por defecto: 30

.PARAMETER NoCopy
    Solo crear backup local, sin copiar a NAS o ubicación de red.

.PARAMETER NetworkPath
    Ruta de red UNC para copia adicional (ej: \\NAS\Backups\BioStock)

.EXAMPLE
    .\Backup-BioStock.ps1
    Backup estándar con configuración por defecto.

.EXAMPLE
    .\Backup-BioStock.ps1 -NetworkPath \\servidor-nas\backups\biostock
    Backup local más copia al NAS corporativo.
#>

[CmdletBinding()]
param(
    [string]$DestinationPath = 'C:\BioStock\backups',
    [int]   $RetentionDays   = 30,
    [switch]$NoCopy,
    [string]$NetworkPath     = ''
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

. (Join-Path $PSScriptRoot 'BioStockConfig.ps1')

$timestamp  = Get-Date -Format 'yyyy-MM-dd_HH-mm-ss'
$dbSource   = $script:BioStock.DbFile
$backupDb   = Join-Path $DestinationPath "biostock_$timestamp.db"
$backupZip  = Join-Path $DestinationPath "biostock_$timestamp.zip"
$logFile    = Join-Path $DestinationPath 'backup.log'

function Log-Backup ([string]$msg, [string]$lvl = 'INFO') {
    $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') [$lvl] $msg"
    Write-Host $line -ForegroundColor $(if ($lvl -eq 'ERROR') {'Red'} elseif ($lvl -eq 'WARN') {'Yellow'} else {'Gray'})
    $line | Out-File -FilePath $logFile -Append -Encoding UTF8
}

# ── Crear directorio de backups si no existe ─────────────────────────────────
New-Item -Path $DestinationPath -ItemType Directory -Force | Out-Null

Log-Backup "=== Inicio de backup ==="

# ── Verificar que la DB existe ────────────────────────────────────────────────
if (-not (Test-Path $dbSource)) {
    Log-Backup "Base de datos no encontrada: $dbSource" ERROR
    Write-EventLog -LogName Application -Source $script:BioStock.EventSource `
        -EventId 2001 -EntryType Error -Message "Backup FALLIDO: DB no encontrada en $dbSource" `
        -ErrorAction SilentlyContinue
    exit 1
}

# ── Backup via VACUUM INTO (online, no requiere detener el servicio) ──────────
Log-Backup "Creando backup: $backupDb"
try {
    $vacuumScript = @"
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('$($dbSource -replace '\\','/')', sqlite3.OPEN_READONLY, (err) => {
  if (err) { console.error(err.message); process.exit(1); }
  db.run('VACUUM INTO ?', ['$($backupDb -replace '\\','/') '], (err2) => {
    if (err2) { console.error(err2.message); process.exit(1); }
    db.close();
    process.exit(0);
  });
});
"@
    $tmpScript = Join-Path $env:TEMP 'bs_backup.cjs'
    $vacuumScript | Out-File -FilePath $tmpScript -Encoding UTF8

    # Ejecutar en el directorio del app donde están los node_modules
    $result = & node $tmpScript 2>&1
    if ($LASTEXITCODE -ne 0) { throw "VACUUM INTO falló: $result" }
    Remove-Item $tmpScript -ErrorAction SilentlyContinue
} catch {
    Log-Backup "Error en VACUUM INTO: $_" ERROR
    exit 1
}

# Verificar que el backup no está vacío
$backupInfo = Get-Item $backupDb -ErrorAction SilentlyContinue
if (-not $backupInfo -or $backupInfo.Length -lt 1024) {
    Log-Backup "Backup creado pero parece estar vacío o corrupto." ERROR
    exit 1
}

$sizeMB = [Math]::Round($backupInfo.Length / 1MB, 2)
Log-Backup "Backup creado: $($backupInfo.Name) ($sizeMB MB)"

# ── Comprimir backup ──────────────────────────────────────────────────────────
Log-Backup "Comprimiendo backup..."
Compress-Archive -Path $backupDb -DestinationPath $backupZip -CompressionLevel Optimal -Force
Remove-Item $backupDb -Force  # Eliminar .db sin comprimir, conservar solo .zip

$zipInfo = Get-Item $backupZip
$zipSizeMB = [Math]::Round($zipInfo.Length / 1MB, 2)
Log-Backup "Comprimido: $($zipInfo.Name) ($zipSizeMB MB)"

# ── Copia a red/NAS (opcional) ────────────────────────────────────────────────
if (-not $NoCopy -and $NetworkPath -ne '') {
    try {
        if (Test-Path $NetworkPath) {
            Copy-Item $backupZip -Destination $NetworkPath -Force
            Log-Backup "Copia en red exitosa: $NetworkPath\$($zipInfo.Name)"
        } else {
            Log-Backup "Ruta de red no accesible: $NetworkPath" WARN
        }
    } catch {
        Log-Backup "Error copiando a red: $_" WARN
    }
}

# ── Limpiar backups antiguos ──────────────────────────────────────────────────
$cutoff = (Get-Date).AddDays(-$RetentionDays)
$deleted = Get-ChildItem $DestinationPath -Filter 'biostock_*.zip' |
           Where-Object { $_.LastWriteTime -lt $cutoff }
$deletedCount = ($deleted | Measure-Object).Count
$deleted | Remove-Item -Force -ErrorAction SilentlyContinue
Log-Backup "Limpieza: $deletedCount archivo(s) eliminado(s) (retención: $RetentionDays días)"

# ── Contar backups actuales ───────────────────────────────────────────────────
$totalBackups = (Get-ChildItem $DestinationPath -Filter 'biostock_*.zip').Count
Log-Backup "Total backups conservados: $totalBackups"
Log-Backup "=== Backup completado exitosamente ==="

# Registrar en Windows Event Log
Write-EventLog -LogName Application -Source $script:BioStock.EventSource `
    -EventId 2000 -EntryType Information `
    -Message "Backup BIO-STOCK completado: $($zipInfo.Name) ($zipSizeMB MB). Backups conservados: $totalBackups" `
    -ErrorAction SilentlyContinue
