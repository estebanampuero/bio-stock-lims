# BIO-STOCK LIMS Pro — Script de inicio
# Doble clic o: powershell -ExecutionPolicy Bypass -File .\Iniciar.ps1

$Host.UI.RawUI.WindowTitle = "BIO-STOCK LIMS Pro"
$ErrorActionPreference = "Stop"

function Write-Step([string]$msg) {
    Write-Host "  $msg" -ForegroundColor Cyan
}
function Write-OK([string]$msg) {
    Write-Host "  $msg" -ForegroundColor Green
}
function Write-Fail([string]$msg) {
    Write-Host "`n  ERROR: $msg" -ForegroundColor Red
}

Clear-Host
Write-Host @"

  ██████╗ ██╗ ██████╗       ███████╗████████╗ ██████╗  ██████╗██╗  ██╗
  ██╔══██╗██║██╔═══██╗      ██╔════╝╚══██╔══╝██╔═══██╗██╔════╝██║ ██╔╝
  ██████╔╝██║██║   ██║█████╗███████╗   ██║   ██║   ██║██║     █████╔╝
  ██╔══██╗██║██║   ██║╚════╝╚════██║   ██║   ██║   ██║██║     ██╔═██╗
  ██████╔╝██║╚██████╔╝      ███████║   ██║   ╚██████╔╝╚██████╗██║  ██╗
  ╚═════╝ ╚═╝ ╚═════╝       ╚══════╝   ╚═╝    ╚═════╝  ╚═════╝╚═╝  ╚═╝

                     LIMS Pro v1.0 - Iniciando...
"@ -ForegroundColor Cyan

$root = $PSScriptRoot

# ── 1. Verificar Node.js ─────────────────────────────────────────────────────
try {
    $nodeVersion = (node --version 2>&1).ToString().Trim()
    Write-OK "[OK] Node.js $nodeVersion"
} catch {
    Write-Fail "Node.js no está instalado. Descárgalo desde: https://nodejs.org"
    Read-Host "`n  Presiona Enter para cerrar"
    exit 1
}

# ── 2. Instalar dependencias si faltan ────────────────────────────────────────
if (-not (Test-Path (Join-Path $root "node_modules"))) {
    Write-Step "[1/3] Instalando dependencias (solo ocurre la primera vez)..."
    Push-Location $root
    npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Fail "npm install falló. Verifica tu conexión a internet."
        Pop-Location
        Read-Host "`n  Presiona Enter para cerrar"
        exit 1
    }
    Pop-Location
    Write-OK "      Dependencias instaladas."
} else {
    Write-OK "[1/3] Dependencias OK."
}

# ── 3. Compilar frontend si no existe ─────────────────────────────────────────
$indexHtml = Join-Path $root "dist\index.html"
if (-not (Test-Path $indexHtml)) {
    Write-Step "[2/3] Compilando interfaz web (solo ocurre la primera vez o tras actualizaciones)..."
    Push-Location $root
    npm run build
    if ($LASTEXITCODE -ne 0) {
        Write-Fail "La compilación falló."
        Pop-Location
        Read-Host "`n  Presiona Enter para cerrar"
        exit 1
    }
    Pop-Location
    Write-OK "      Compilación completada."
} else {
    Write-OK "[2/3] Interfaz web compilada y lista."
}

# ── 4. Obtener IP de la red local ─────────────────────────────────────────────
$serverIP = (Get-NetIPAddress -AddressFamily IPv4 |
             Where-Object { $_.IPAddress -notmatch '^(127\.|169\.254\.)' } |
             Sort-Object InterfaceIndex |
             Select-Object -First 1).IPAddress
if (-not $serverIP) { $serverIP = "localhost" }

$port = 3000
$localUrl  = "http://localhost:$port"
$networkUrl = "http://${serverIP}:$port"

# ── 5. Mostrar información de acceso ──────────────────────────────────────────
Write-Host ""
Write-Host "  ╔══════════════════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "  ║                                                      ║" -ForegroundColor Green
Write-Host "  ║   SISTEMA LISTO — Accede desde cualquier navegador  ║" -ForegroundColor Green
Write-Host "  ║                                                      ║" -ForegroundColor Green
Write-Host "  ║   Este PC:    $($localUrl.PadRight(38))║" -ForegroundColor Green
Write-Host "  ║   Red local:  $($networkUrl.PadRight(38))║" -ForegroundColor Green
Write-Host "  ║                                                      ║" -ForegroundColor Green
Write-Host "  ║   Comparte la URL de 'Red local' con los demás PCs  ║" -ForegroundColor Green
Write-Host "  ║   Para detener: cierra esta ventana o Ctrl+C        ║" -ForegroundColor Green
Write-Host "  ║                                                      ║" -ForegroundColor Green
Write-Host "  ╚══════════════════════════════════════════════════════╝" -ForegroundColor Green
Write-Host ""

# Abrir el navegador después de 2 segundos
Start-Job -ScriptBlock {
    param($url)
    Start-Sleep -Seconds 2
    Start-Process $url
} -ArgumentList $localUrl | Out-Null

# ── 6. Iniciar servidor (mantiene la ventana abierta con los logs) ───────────
Write-Host "  Logs del servidor:" -ForegroundColor DarkGray
Write-Host "  ─────────────────────────────────────────────────────────" -ForegroundColor DarkGray
Push-Location $root
node server.cjs
Pop-Location

Write-Host ""
Write-Host "  El servidor se detuvo." -ForegroundColor Yellow
Read-Host "  Presiona Enter para cerrar"
