#Requires -Version 5.1
<#
.SYNOPSIS
    Compila el instalador Windows de BIO-STOCK LIMS con Inno Setup.
.DESCRIPTION
    Prepara el payload en ..\release y compila installer\BioStock.iss con ISCC:
      1. Verifica que exista release\BioStock-LIMS.exe (correr antes: npm run build:exe).
      2. Descarga nssm.exe a release\tools\ (si no está) para instalación offline.
      3. Lee la versión desde release\VERSION.txt (o package.json).
      4. Ejecuta ISCC generando dist-installer\BioStock-Setup-<version>.exe.

    Debe correr en Windows (ISCC es Windows-only). En el pipeline lo hace un
    runner windows-latest. Localmente requiere Inno Setup 6 instalado.
.PARAMETER Iscc
    Ruta a ISCC.exe. Default: autodetección en Program Files.
.EXAMPLE
    npm run build:exe            # (en cualquier SO) genera release\
    .\installer\build-installer.ps1   # (en Windows) compila el Setup.exe
#>

[CmdletBinding()]
param(
  [string]$Iscc = ""
)

$ErrorActionPreference = "Stop"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$RepoRoot   = Split-Path -Parent $PSScriptRoot
$ReleaseDir = Join-Path $RepoRoot "release"
$IssFile    = Join-Path $PSScriptRoot "BioStock.iss"
$OutDir     = Join-Path $RepoRoot "dist-installer"

Write-Host "==================================================================="
Write-Host "   BIO-STOCK LIMS - Build del instalador (Inno Setup)"
Write-Host "==================================================================="

# ── 1. Verificar payload ────────────────────────────────────────────────────
$exe = Join-Path $ReleaseDir "BioStock-LIMS.exe"
if (-not (Test-Path $exe)) {
  Write-Host "ERROR: No existe $exe" -ForegroundColor Red
  Write-Host "Ejecuta primero:  npm run build:exe" -ForegroundColor Yellow
  exit 1
}

# ── 2. Versión ──────────────────────────────────────────────────────────────
$versionFile = Join-Path $ReleaseDir "VERSION.txt"
if (Test-Path $versionFile) {
  $Version = (Get-Content $versionFile -Raw).Trim()
} else {
  $Version = (Get-Content (Join-Path $RepoRoot "package.json") -Raw | ConvertFrom-Json).version
}
Write-Host "Version: $Version"

# ── 3. NSSM (para instalación offline) ──────────────────────────────────────
$toolsDir = Join-Path $ReleaseDir "tools"
$nssmDest = Join-Path $toolsDir "nssm.exe"
if (-not (Test-Path $nssmDest)) {
  Write-Host "Descargando NSSM..."
  New-Item -Path $toolsDir -ItemType Directory -Force | Out-Null
  $nssmZip = Join-Path $env:TEMP "nssm-2.24.zip"
  $nssmDir = Join-Path $env:TEMP "nssm-extract"
  Invoke-WebRequest -Uri "https://nssm.cc/release/nssm-2.24.zip" -OutFile $nssmZip -UseBasicParsing
  if (Test-Path $nssmDir) { Remove-Item $nssmDir -Recurse -Force }
  Expand-Archive -Path $nssmZip -DestinationPath $nssmDir -Force
  Copy-Item -Path (Join-Path $nssmDir "nssm-2.24\win64\nssm.exe") -Destination $nssmDest -Force
  Remove-Item $nssmZip, $nssmDir -Recurse -Force -ErrorAction SilentlyContinue
  Write-Host "  NSSM listo: $nssmDest"
} else {
  Write-Host "NSSM ya presente."
}

# ── 3b. Asegurar que los scripts nuevos estén en el payload ─────────────────
$scriptsSrc  = Join-Path $RepoRoot "scripts"
$scriptsDest = Join-Path $ReleaseDir "scripts"
New-Item -Path $scriptsDest -ItemType Directory -Force | Out-Null
Copy-Item -Path (Join-Path $scriptsSrc "*.ps1") -Destination $scriptsDest -Force
Write-Host "Scripts PowerShell sincronizados al payload."

# ── 4. Localizar ISCC ───────────────────────────────────────────────────────
if (-not $Iscc) {
  $candidates = @(
    "C:\Program Files (x86)\Inno Setup 6\ISCC.exe",
    "C:\Program Files\Inno Setup 6\ISCC.exe"
  )
  $Iscc = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
}
if (-not $Iscc -or -not (Test-Path $Iscc)) {
  Write-Host "ERROR: No se encontró ISCC.exe (Inno Setup 6)." -ForegroundColor Red
  Write-Host "Instalar con:  choco install innosetup   (o https://jrsoftware.org/isdl.php)" -ForegroundColor Yellow
  exit 1
}
Write-Host "ISCC: $Iscc"

# ── 5. Compilar ─────────────────────────────────────────────────────────────
New-Item -Path $OutDir -ItemType Directory -Force | Out-Null
Write-Host "Compilando instalador..."
& $Iscc "/DAppVersion=$Version" "/DSourceDir=$ReleaseDir" $IssFile
if ($LASTEXITCODE -ne 0) {
  Write-Host "ERROR: ISCC devolvió $LASTEXITCODE" -ForegroundColor Red
  exit $LASTEXITCODE
}

$setup = Join-Path $OutDir "BioStock-Setup-$Version.exe"
if (Test-Path $setup) {
  $sizeMB = [Math]::Round((Get-Item $setup).Length / 1MB, 1)
  Write-Host ""
  Write-Host "INSTALADOR GENERADO:" -ForegroundColor Green
  Write-Host "  $setup  ($sizeMB MB)"
} else {
  Write-Host "ADVERTENCIA: ISCC terminó pero no se encontró $setup" -ForegroundColor Yellow
}
