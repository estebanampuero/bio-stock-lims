# Update-BioStock.ps1 — Actualiza BIO-STOCK LIMS desde un ZIP offline.
# Flujo: detener servicio → backup DB+exe → reemplazar binarios → reiniciar → verificar /health → rollback si falla.
# Uso: .\Update-BioStock.ps1 -ZipFile "C:\Temp\release-v1.2.0.zip"
# Requiere: ejecutar como Administrador.

[CmdletBinding()]
param(
  [Parameter(Mandatory=$true)][string]$ZipFile,
  [string]$InstallPath = "C:\BioStock",
  [string]$ServiceName = "BioStock-API",
  [string]$HealthUrl   = "http://localhost:3000/health",
  [int]   $HealthTimeoutSec = 30,
  [string]$EventSource = "BioStock-LIMS"
)

$ErrorActionPreference = "Stop"

function Write-Audit {
  param([string]$Message, [string]$Level = "Information", [int]$EventId = 3000)
  Write-Host $Message
  try {
    if (-not [System.Diagnostics.EventLog]::SourceExists($EventSource)) {
      New-EventLog -LogName Application -Source $EventSource -ErrorAction SilentlyContinue
    }
    Write-EventLog -LogName Application -Source $EventSource -EventId $EventId -EntryType $Level -Message $Message
  } catch { }
}

function Test-IsAdmin {
  $currentUser = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
  return $currentUser.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

if (-not (Test-IsAdmin)) {
  Write-Host "Este script debe ejecutarse como Administrador (PowerShell elevado)." -ForegroundColor Red
  exit 1
}

if (-not (Test-Path $ZipFile)) {
  Write-Audit -Message "Archivo de actualizacion no encontrado: $ZipFile" -Level Error -EventId 3001
  exit 1
}

if (-not (Test-Path $InstallPath)) {
  Write-Audit -Message "Ruta de instalacion no existe: $InstallPath" -Level Error -EventId 3001
  exit 1
}

$timestamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
$rollbackDir = Join-Path $InstallPath "rollback_$timestamp"
$tempExtract = Join-Path $env:TEMP "biostock_update_$timestamp"

Write-Host ""
Write-Host "==================================================================="
Write-Host "          BIO-STOCK LIMS - Update from ZIP"
Write-Host "==================================================================="
Write-Host ""
Write-Host "ZIP origen:     $ZipFile"
Write-Host "Instalacion:    $InstallPath"
Write-Host "Servicio:       $ServiceName"
Write-Host "Rollback dir:   $rollbackDir"
Write-Host ""

try {
  # 1. Detener servicio
  Write-Host "[1/6] Deteniendo servicio $ServiceName..."
  $svc = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
  if ($svc -and $svc.Status -eq "Running") {
    Stop-Service -Name $ServiceName -Force
    Start-Sleep -Seconds 2
  }

  # 2. Backup actual
  Write-Host "[2/6] Backup pre-update en $rollbackDir"
  New-Item -Path $rollbackDir -ItemType Directory -Force | Out-Null
  $itemsToBackup = @(
    "BioStock-LIMS.exe",
    "node_sqlite3.node",
    "inventario_biorad.db",
    "master.key",
    "jwt.secret"
  )
  foreach ($item in $itemsToBackup) {
    $src = Join-Path $InstallPath $item
    if (Test-Path $src) {
      Copy-Item -Path $src -Destination $rollbackDir -Force
    }
  }
  Write-Host "      Items respaldados: $((Get-ChildItem $rollbackDir).Count)"

  # 3. Extraer ZIP a temp
  Write-Host "[3/6] Extrayendo ZIP a $tempExtract..."
  Expand-Archive -Path $ZipFile -DestinationPath $tempExtract -Force

  # 4. Copiar binarios nuevos (NO sobreescribe master.key, jwt.secret ni la DB)
  Write-Host "[4/6] Aplicando binarios nuevos..."
  $protectedFiles = @("master.key", "jwt.secret", "inventario_biorad.db", "inventario_biorad.db-shm", "inventario_biorad.db-wal")
  Get-ChildItem -Path $tempExtract -Recurse -File | ForEach-Object {
    $rel = $_.FullName.Substring($tempExtract.Length).TrimStart('\','/')
    if ($protectedFiles -contains $_.Name) {
      Write-Host "      [SKIP] $rel (protegido - no se sobrescribe)"
      return
    }
    $dest = Join-Path $InstallPath $rel
    $destDir = Split-Path $dest -Parent
    if (-not (Test-Path $destDir)) { New-Item -Path $destDir -ItemType Directory -Force | Out-Null }
    Copy-Item -Path $_.FullName -Destination $dest -Force
  }

  # 5. Reiniciar servicio
  Write-Host "[5/6] Iniciando servicio..."
  Start-Service -Name $ServiceName

  # 6. Healthcheck con timeout
  Write-Host "[6/6] Verificando /health (timeout ${HealthTimeoutSec}s)..."
  $deadline = (Get-Date).AddSeconds($HealthTimeoutSec)
  $healthy = $false
  while ((Get-Date) -lt $deadline) {
    try {
      $r = Invoke-RestMethod -Uri $HealthUrl -TimeoutSec 5
      if ($r.status -eq "ok") { $healthy = $true; break }
    } catch { }
    Start-Sleep -Seconds 2
  }

  if ($healthy) {
    Write-Host ""
    Write-Host "UPDATE EXITOSO" -ForegroundColor Green
    Write-Audit -Message "Update aplicado correctamente desde $ZipFile. Rollback disponible en $rollbackDir" -Level Information -EventId 3000
    Write-Host ""
    Write-Host "Rollback queda disponible en: $rollbackDir"
    Write-Host "Si todo funciona durante 48h, podes borrar esa carpeta."
    exit 0
  } else {
    throw "Healthcheck no respondio OK despues de $HealthTimeoutSec segundos."
  }
} catch {
  Write-Host ""
  Write-Host "UPDATE FALLO: $_" -ForegroundColor Red
  Write-Host "Iniciando ROLLBACK automatico..." -ForegroundColor Yellow

  Stop-Service -Name $ServiceName -Force -ErrorAction SilentlyContinue
  Start-Sleep -Seconds 2

  if (Test-Path $rollbackDir) {
    Get-ChildItem -Path $rollbackDir -File | ForEach-Object {
      $dest = Join-Path $InstallPath $_.Name
      Copy-Item -Path $_.FullName -Destination $dest -Force
      Write-Host "      Restaurado: $($_.Name)"
    }
  }

  Start-Service -Name $ServiceName -ErrorAction SilentlyContinue
  Write-Audit -Message "Update FALLO desde $ZipFile. Rollback automatico ejecutado. Error: $_" -Level Error -EventId 3002
  exit 2
} finally {
  Remove-Item -Path $tempExtract -Recurse -Force -ErrorAction SilentlyContinue
}
