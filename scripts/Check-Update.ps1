#Requires -Version 5.1
<#
.SYNOPSIS
    BIO-STOCK LIMS — Chequeo e instalación de actualizaciones desde GitHub Releases.
.DESCRIPTION
    1. Lee la versión instalada desde http://localhost:PORT/api/version
    2. Descarga latest.json del release "latest" de GitHub
    3. Si hay una versión más nueva (semver), descarga el instalador Setup.exe,
       verifica su SHA-256 y lo ejecuta en modo silencioso.

    El instalador Inno hace update-in-place: respalda la DB, detiene el servicio,
    reemplaza binarios y reinicia. No toca inventario_biorad.db ni los secrets.

    Diseñado para correr desatendido desde una tarea programada semanal, o a mano.
.PARAMETER Repo
    owner/repo de GitHub. Default: estebanampuero/bio-stock-lims
.PARAMETER Port
    Puerto del servidor local para consultar la versión. Default: 3000
.PARAMETER Scheme
    http o https. Default: http
.PARAMETER Force
    Instala aunque la versión remota no sea mayor (reinstala latest).
.PARAMETER CheckOnly
    Solo informa si hay update disponible; no descarga ni instala.
.EXAMPLE
    .\Check-Update.ps1 -CheckOnly
.EXAMPLE
    .\Check-Update.ps1               # Instala si hay una versión más nueva
#>

[CmdletBinding()]
param(
  [string]$Repo   = "estebanampuero/bio-stock-lims",
  [int]   $Port   = 3000,
  [ValidateSet("http","https")][string]$Scheme = "http",
  [switch]$Force,
  [switch]$CheckOnly,
  [string]$EventSource = "BioStock-LIMS"
)

$ErrorActionPreference = "Stop"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

function Write-Audit {
  param([string]$Message, [string]$Level = "Information", [int]$EventId = 3100)
  Write-Host $Message
  try {
    if (-not [System.Diagnostics.EventLog]::SourceExists($EventSource)) {
      New-EventLog -LogName Application -Source $EventSource -ErrorAction SilentlyContinue
    }
    Write-EventLog -LogName Application -Source $EventSource -EventId $EventId -EntryType $Level -Message $Message
  } catch { }
}

# Compara dos versiones semver "x.y.z". Devuelve 1 si $a > $b, -1 si <, 0 si igual.
function Compare-SemVer {
  param([string]$a, [string]$b)
  $pa = ($a -replace '[^\d.].*$','').Split('.') | ForEach-Object { [int]$_ }
  $pb = ($b -replace '[^\d.].*$','').Split('.') | ForEach-Object { [int]$_ }
  for ($i = 0; $i -lt [Math]::Max($pa.Count, $pb.Count); $i++) {
    $va = if ($i -lt $pa.Count) { $pa[$i] } else { 0 }
    $vb = if ($i -lt $pb.Count) { $pb[$i] } else { 0 }
    if ($va -gt $vb) { return 1 }
    if ($va -lt $vb) { return -1 }
  }
  return 0
}

# ── 1. Versión instalada ────────────────────────────────────────────────────
$installed = $null
try {
  $localUrl = "${Scheme}://localhost:${Port}/api/version"
  $installed = (Invoke-RestMethod -Uri $localUrl -TimeoutSec 8 -SkipCertificateCheck).version
} catch {
  Write-Host "No se pudo leer la version instalada desde /api/version. Se continua asumiendo 0.0.0." -ForegroundColor Yellow
  $installed = "0.0.0"
}
Write-Host "Version instalada: $installed"

# ── 2. latest.json de GitHub ────────────────────────────────────────────────
$latestJsonUrl = "https://github.com/$Repo/releases/latest/download/latest.json"
Write-Host "Consultando: $latestJsonUrl"
try {
  $latest = Invoke-RestMethod -Uri $latestJsonUrl -TimeoutSec 20 -UseBasicParsing
} catch {
  Write-Audit -Message "Check-Update: no se pudo obtener latest.json ($_)" -Level Warning -EventId 3101
  exit 1
}
$remote = $latest.version
Write-Host "Version disponible: $remote"

$cmp = Compare-SemVer $remote $installed
if ($cmp -le 0 -and -not $Force) {
  Write-Host "Ya estas en la ultima version. Nada que hacer." -ForegroundColor Green
  exit 0
}

Write-Host ""
Write-Host "HAY UNA ACTUALIZACION DISPONIBLE: $installed -> $remote" -ForegroundColor Cyan
if ($latest.notes) { Write-Host "Notas: $($latest.notes)" }

if ($CheckOnly) {
  Write-Host "(Modo -CheckOnly: no se instala.)"
  exit 10   # exit 10 = hay update disponible
}

# ── 3. Descargar el instalador ──────────────────────────────────────────────
$setupUrl = $latest.url
$tmp = Join-Path $env:TEMP ("BioStock-Setup-$remote.exe")
Write-Host "Descargando instalador: $setupUrl"
Invoke-WebRequest -Uri $setupUrl -OutFile $tmp -UseBasicParsing

# Verificar SHA-256 si latest.json lo trae
if ($latest.sha256) {
  $hash = (Get-FileHash -Path $tmp -Algorithm SHA256).Hash.ToLower()
  if ($hash -ne $latest.sha256.ToLower()) {
    Remove-Item $tmp -Force -ErrorAction SilentlyContinue
    Write-Audit -Message "Check-Update: SHA-256 NO coincide. Descarga abortada." -Level Error -EventId 3102
    Write-Host "SHA-256 no coincide. Instalacion abortada por seguridad." -ForegroundColor Red
    exit 2
  }
  Write-Host "SHA-256 verificado OK."
}

# ── 4. Ejecutar el instalador en silencio (update-in-place) ──────────────────
Write-Host "Ejecutando instalador en modo silencioso..."
$proc = Start-Process -FilePath $tmp -ArgumentList "/VERYSILENT","/SUPPRESSMSGBOXES","/NORESTART","/NOICONS" -Wait -PassThru
Remove-Item $tmp -Force -ErrorAction SilentlyContinue

if ($proc.ExitCode -eq 0) {
  Write-Audit -Message "Check-Update: actualizado de $installed a $remote correctamente." -Level Information -EventId 3100
  Write-Host "ACTUALIZACION APLICADA: $remote" -ForegroundColor Green
  exit 0
} else {
  Write-Audit -Message "Check-Update: instalador devolvio codigo $($proc.ExitCode)." -Level Error -EventId 3103
  Write-Host "El instalador devolvio codigo $($proc.ExitCode)." -ForegroundColor Red
  exit $proc.ExitCode
}
