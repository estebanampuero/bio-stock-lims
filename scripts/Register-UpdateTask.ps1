#Requires -Version 5.1
<#
.SYNOPSIS
    Registra (o elimina) la tarea programada semanal de autoactualización.
.DESCRIPTION
    Crea la tarea "BioStock-Check-Update" que corre Check-Update.ps1 los domingos 03:30
    como SYSTEM. Se invoca desde el instalador Inno cuando el usuario elige
    "Buscar actualizaciones automáticamente". Aísla el quoting fuera del .iss.
.PARAMETER InstallPath
    Ruta de instalación. Default: C:\BioStock
.PARAMETER Port
    Puerto del servidor local (para leer /api/version). Default: 3000
.PARAMETER Remove
    Elimina la tarea en vez de crearla.
#>

[CmdletBinding()]
param(
  [string]$InstallPath = "C:\BioStock",
  [int]   $Port        = 3000,
  [switch]$Remove
)

$ErrorActionPreference = "Stop"
$TaskName = "BioStock-Check-Update"

if ($Remove) {
  schtasks /Delete /TN $TaskName /F 2>$null | Out-Null
  Write-Host "Tarea $TaskName eliminada (si existía)."
  exit 0
}

$checkScript = Join-Path $InstallPath "scripts\Check-Update.ps1"
if (-not (Test-Path $checkScript)) {
  Write-Host "No se encontró $checkScript. No se registra la tarea." -ForegroundColor Yellow
  exit 1
}

# El comando que ejecutará la tarea. schtasks requiere el /TR entre comillas dobles;
# las comillas internas del -File se escapan con \" para schtasks.
$action = "powershell.exe -NoProfile -ExecutionPolicy Bypass -File \`"$checkScript\`" -Port $Port"

schtasks /Delete /TN $TaskName /F 2>$null | Out-Null
schtasks /Create /SC WEEKLY /D SUN /ST 03:30 /TN $TaskName /TR $action /RU SYSTEM /RL HIGHEST /F | Out-Null

Write-Host "Tarea $TaskName registrada (domingos 03:30, SYSTEM)."
exit 0
