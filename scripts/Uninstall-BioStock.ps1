#Requires -Version 5.1
<#
.SYNOPSIS
    BIO-STOCK LIMS — Desinstalador para Windows.
.DESCRIPTION
    Detiene y remueve el servicio Windows (NSSM), elimina la regla de firewall,
    las tareas programadas de backup y la exclusión de Defender.

    Por defecto CONSERVA los datos (inventario_biorad.db, secrets/, backups/).
    Usar -PurgeData para borrarlos también (irreversible).

    Este script lo invoca el desinstalador de Inno Setup, pero también puede
    ejecutarse manualmente como Administrador.
.PARAMETER InstallPath
    Ruta de instalación. Default: C:\BioStock
.PARAMETER PurgeData
    Además de desinstalar, borra la base de datos, secrets/ y backups/.
.EXAMPLE
    .\Uninstall-BioStock.ps1
    Desinstala el servicio pero conserva todos los datos.
.EXAMPLE
    .\Uninstall-BioStock.ps1 -PurgeData
    Desinstala y borra TODO (inventario, usuarios, backups). Irreversible.
#>

[CmdletBinding()]
param(
  [string]$InstallPath = "C:\BioStock",
  [switch]$PurgeData,
  [string]$ServiceName = "BioStock-API",
  [string]$EventSource = "BioStock-LIMS"
)

$ErrorActionPreference = "Continue"   # desinstalar es best-effort: nunca abortar a medias

function Test-IsAdmin {
  $u = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
  return $u.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Write-Audit {
  param([string]$Message, [string]$Level = "Information", [int]$EventId = 5000)
  Write-Host $Message
  try {
    if (-not [System.Diagnostics.EventLog]::SourceExists($EventSource)) {
      New-EventLog -LogName Application -Source $EventSource -ErrorAction SilentlyContinue
    }
    Write-EventLog -LogName Application -Source $EventSource -EventId $EventId -EntryType $Level -Message $Message
  } catch { }
}

if (-not (Test-IsAdmin)) {
  Write-Host "Este script debe ejecutarse como Administrador." -ForegroundColor Red
  exit 1
}

Write-Host ""
Write-Host "==================================================================="
Write-Host "       BIO-STOCK LIMS - Desinstalador"
Write-Host "==================================================================="
Write-Host "Ruta:        $InstallPath"
Write-Host "Purgar datos: $(if ($PurgeData) { 'SI - se borrara la base de datos' } else { 'No - se conservan los datos' })"
Write-Host ""

# ── 1. Detener y remover el servicio (NSSM si está, si no SC) ────────────────
Write-Host "[1/5] Deteniendo y removiendo el servicio $ServiceName..."
$nssmPath = Join-Path $InstallPath "tools\nssm.exe"
$svc = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($svc) {
  if (Test-Path $nssmPath) {
    & $nssmPath stop $ServiceName | Out-Null
    Start-Sleep -Seconds 2
    & $nssmPath remove $ServiceName confirm | Out-Null
  } else {
    Stop-Service -Name $ServiceName -Force -ErrorAction SilentlyContinue
    sc.exe delete $ServiceName | Out-Null
  }
  Write-Host "      Servicio removido."
} else {
  Write-Host "      El servicio no estaba registrado."
}

# ── 2. Firewall ─────────────────────────────────────────────────────────────
Write-Host "[2/5] Eliminando regla de firewall..."
Get-NetFirewallRule -DisplayName "BioStock-HTTP*" -ErrorAction SilentlyContinue | Remove-NetFirewallRule -ErrorAction SilentlyContinue

# ── 3. Tareas programadas ───────────────────────────────────────────────────
Write-Host "[3/5] Eliminando tareas programadas..."
foreach ($task in @("BioStock-Backup-Diario", "BioStock-Verify-Backup", "BioStock-Check-Update")) {
  schtasks /Delete /TN $task /F 2>$null | Out-Null
}

# ── 4. Exclusión de Windows Defender ────────────────────────────────────────
Write-Host "[4/5] Removiendo exclusiones de Defender..."
Remove-MpPreference -ExclusionPath $InstallPath -ErrorAction SilentlyContinue
Remove-MpPreference -ExclusionProcess "BioStock-LIMS.exe" -ErrorAction SilentlyContinue

# ── 5. Datos ────────────────────────────────────────────────────────────────
if ($PurgeData) {
  Write-Host "[5/5] Purgando datos (irreversible)..." -ForegroundColor Yellow
  $toDelete = @(
    "inventario_biorad.db", "inventario_biorad.db-wal", "inventario_biorad.db-shm",
    "secrets", "backups", "master.key", "jwt.secret", "INITIAL_PIN.txt"
  )
  foreach ($item in $toDelete) {
    $p = Join-Path $InstallPath $item
    if (Test-Path $p) { Remove-Item $p -Recurse -Force -ErrorAction SilentlyContinue }
  }
  Write-Host "      Datos borrados."
} else {
  Write-Host "[5/5] Datos conservados en: $InstallPath"
  Write-Host "      (inventario_biorad.db, secrets/, backups/ NO se borraron)"
}

Write-Audit -Message "Desinstalacion completada. PurgeData=$PurgeData" -Level Information -EventId 5000
Write-Host ""
Write-Host "DESINSTALACION COMPLETADA" -ForegroundColor Green
exit 0
