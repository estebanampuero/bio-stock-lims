# Verify-Backup.ps1 — Valida integridad del último backup de BIO-STOCK LIMS
# Uso: .\Verify-Backup.ps1 [-BackupDir C:\BioStock\backups] [-SqliteExe C:\BioStock\sqlite3.exe]
# Sale con código 0 si el backup más reciente es válido, 1 si está corrupto o no existe.

[CmdletBinding()]
param(
  [string]$BackupDir = "C:\BioStock\backups",
  [string]$SqliteExe = "C:\BioStock\sqlite3.exe",
  [string]$EventSource = "BioStock-LIMS"
)

$ErrorActionPreference = "Stop"

function Write-Audit {
  param([string]$Message, [string]$Level = "Information", [int]$EventId = 2000)
  Write-Host $Message
  try {
    if (-not [System.Diagnostics.EventLog]::SourceExists($EventSource)) {
      New-EventLog -LogName Application -Source $EventSource -ErrorAction SilentlyContinue
    }
    Write-EventLog -LogName Application -Source $EventSource -EventId $EventId -EntryType $Level -Message $Message
  } catch { }
}

if (-not (Test-Path $BackupDir)) {
  Write-Audit -Message "Directorio de backups no existe: $BackupDir" -Level Error -EventId 2001
  exit 1
}

# Buscar el backup más reciente (.zip o .db)
$latest = Get-ChildItem -Path $BackupDir -Include "*.zip","*.db","*.db.gz" -Recurse |
          Sort-Object LastWriteTime -Descending | Select-Object -First 1

if (-not $latest) {
  Write-Audit -Message "No se encontraron backups en $BackupDir" -Level Error -EventId 2001
  exit 1
}

Write-Host ""
Write-Host "📂 Backup más reciente: $($latest.Name)"
Write-Host "   Tamaño: $([math]::Round($latest.Length / 1KB, 1)) KB"
Write-Host "   Fecha:  $($latest.LastWriteTime)"
Write-Host ""

# Si es ZIP, descomprimir a temp y extraer el .db
$tempDir = Join-Path $env:TEMP "biostock_verify_$(Get-Random)"
New-Item -Path $tempDir -ItemType Directory -Force | Out-Null

try {
  $dbFile = $null

  if ($latest.Extension -eq ".zip") {
    Expand-Archive -Path $latest.FullName -DestinationPath $tempDir -Force
    $dbFile = (Get-ChildItem -Path $tempDir -Filter "*.db" -Recurse | Select-Object -First 1).FullName
  } elseif ($latest.Extension -eq ".gz") {
    Write-Audit -Message "Backup gzip — instalá 7-Zip o ajustá este script para descomprimirlo." -Level Warning -EventId 2002
    exit 1
  } else {
    $dbFile = $latest.FullName
  }

  if (-not $dbFile -or -not (Test-Path $dbFile)) {
    Write-Audit -Message "No se pudo extraer el archivo .db del backup: $($latest.Name)" -Level Error -EventId 2001
    exit 1
  }

  if (-not (Test-Path $SqliteExe)) {
    Write-Audit -Message "sqlite3.exe no encontrado en $SqliteExe — copialo desde el bundle." -Level Error -EventId 2001
    exit 1
  }

  # Ejecutar PRAGMA integrity_check
  Write-Host "🔍 Ejecutando PRAGMA integrity_check..."
  $result = & $SqliteExe $dbFile "PRAGMA integrity_check;" 2>&1
  $resultStr = ($result | Out-String).Trim()

  if ($resultStr -eq "ok") {
    # Verificar también que las tablas críticas existan y tengan filas razonables
    $tables = & $SqliteExe $dbFile "SELECT name FROM sqlite_master WHERE type='table';" 2>&1
    $criticalTables = @("usuarios", "inventario", "logs", "diuresis", "anexos", "protocolos", "maestro_productos")
    $missing = $criticalTables | Where-Object { $tables -notcontains $_ }

    if ($missing) {
      Write-Audit -Message "Backup pasó integrity_check pero faltan tablas: $($missing -join ', ')" -Level Warning -EventId 2002
      exit 1
    }

    $userCount = & $SqliteExe $dbFile "SELECT COUNT(*) FROM usuarios;" 2>&1
    Write-Host ""
    Write-Host "✅ BACKUP ÍNTEGRO"
    Write-Host "   Tablas críticas: presentes ($($criticalTables.Count))"
    Write-Host "   Usuarios:        $userCount"
    Write-Audit -Message "Verificación de backup exitosa: $($latest.Name). Usuarios: $userCount" -Level Information -EventId 2000
    exit 0
  } else {
    Write-Audit -Message "BACKUP CORRUPTO: $($latest.Name) — integrity_check retornó: $resultStr" -Level Error -EventId 2001
    exit 1
  }
} finally {
  Remove-Item -Path $tempDir -Recurse -Force -ErrorAction SilentlyContinue
}
