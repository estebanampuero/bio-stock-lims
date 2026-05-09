# ═══════════════════════════════════════════════════════════════════════════════
# BioStockConfig.ps1 — Módulo de configuración central
# Todos los scripts hacen dot-source de este archivo: . .\BioStockConfig.ps1
# ═══════════════════════════════════════════════════════════════════════════════

# ── Rutas del sistema ────────────────────────────────────────────────────────
$script:BioStock = @{
    # Raíz de instalación — cambiar solo si se instaló en otra ruta
    Root            = 'C:\BioStock'

    # Sub-directorios (derivados de Root, no editar)
    App             = 'C:\BioStock\app'
    Data            = 'C:\BioStock\data'
    Backups         = 'C:\BioStock\backups'
    Logs            = 'C:\BioStock\logs'
    NginxDir        = 'C:\BioStock\nginx'
    NginxConf       = 'C:\BioStock\nginx\conf\nginx.conf'
    NginxHtml       = 'C:\BioStock\nginx\html'
    Tools           = 'C:\BioStock\tools'
    Scripts         = 'C:\BioStock\scripts'
    EnvFile         = 'C:\BioStock\.env'
    NssmExe         = 'C:\BioStock\tools\nssm.exe'
    NginxExe        = 'C:\BioStock\nginx\nginx.exe'
    DbFile          = 'C:\BioStock\data\inventario_biorad.db'
    NodeExe         = '' # Se detecta en runtime via (Get-Command node).Source

    # ── Servicios Windows ────────────────────────────────────────────────────
    ServiceApi      = 'BioStock-API'
    ServiceNginx    = 'BioStock-Nginx'

    # ── Red ─────────────────────────────────────────────────────────────────
    ApiPort         = 3000   # Puerto interno del API (solo localhost)
    WebPort         = 80     # Puerto público expuesto en la LAN

    # ── Backups ──────────────────────────────────────────────────────────────
    BackupRetention = 30     # Días que se conservan los backups

    # ── Windows Event Log ────────────────────────────────────────────────────
    EventSource     = 'BioStock-LIMS'
    EventLog        = 'Application'

    # ── URLs de herramientas (descargas automáticas en install) ─────────────
    NssmUrl         = 'https://nssm.cc/release/nssm-2.24.zip'
    # Nginx Windows portable — se descarga en install si no está presente
    NginxUrl        = 'https://nginx.org/download/nginx-1.27.5.zip'
}

# ── Funciones de utilidad compartidas entre scripts ──────────────────────────

function Write-BioLog {
    param(
        [string]$Message,
        [ValidateSet('INFO','WARN','ERROR','OK')]
        [string]$Level = 'INFO'
    )
    $ts = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
    $colors = @{ INFO='Cyan'; WARN='Yellow'; ERROR='Red'; OK='Green' }
    $prefix = @{ INFO='[INFO] '; WARN='[WARN] '; ERROR='[ERROR]'; OK='[ OK ] ' }
    Write-Host "$ts $($prefix[$Level]) $Message" -ForegroundColor $colors[$Level]

    # También escribir a archivo de log diario
    $logFile = Join-Path $script:BioStock.Logs "biostock-$(Get-Date -Format 'yyyy-MM-dd').log"
    "$ts [$Level] $Message" | Out-File -FilePath $logFile -Append -Encoding UTF8 -ErrorAction SilentlyContinue

    # Windows Event Log para errores y warnings
    if ($Level -in 'ERROR','WARN') {
        $entryType = if ($Level -eq 'ERROR') { 'Error' } else { 'Warning' }
        try {
            Write-EventLog -LogName $script:BioStock.EventLog `
                           -Source $script:BioStock.EventSource `
                           -EventId 1001 `
                           -EntryType $entryType `
                           -Message $Message `
                           -ErrorAction SilentlyContinue
        } catch { <# Silencioso si el Event Source no está registrado aún #> }
    }
}

function Test-Administrator {
    $id = [System.Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = [System.Security.Principal.WindowsPrincipal]$id
    return $principal.IsInRole([System.Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Get-ServerIP {
    $ip = (Get-NetIPAddress -AddressFamily IPv4 |
           Where-Object { $_.IPAddress -notmatch '^(127\.|169\.254\.)' } |
           Sort-Object InterfaceIndex |
           Select-Object -First 1).IPAddress
    return $ip ?? 'localhost'
}

function Read-EnvFile {
    $envPath = $script:BioStock.EnvFile
    if (-not (Test-Path $envPath)) { return @{} }
    $env = @{}
    Get-Content $envPath | ForEach-Object {
        if ($_ -match '^\s*([^#][^=]+)=(.*)$') {
            $env[$Matches[1].Trim()] = $Matches[2].Trim()
        }
    }
    return $env
}

function Test-ApiHealth {
    try {
        $response = Invoke-RestMethod -Uri "http://localhost:$($script:BioStock.ApiPort)/health" `
                                      -TimeoutSec 5 -ErrorAction Stop
        return $response.status -eq 'ok'
    } catch {
        return $false
    }
}

function Show-Banner {
    param([string]$Title = 'BIO-STOCK LIMS Pro')
    $width = 60
    $border = '═' * $width
    Write-Host "`n╔$border╗" -ForegroundColor Cyan
    Write-Host "║$((' ' * [Math]::Floor(($width - $Title.Length)/2))$Title$(' ' * [Math]::Ceiling(($width - $Title.Length)/2)))║" -ForegroundColor Cyan
    Write-Host "╚$border╝`n" -ForegroundColor Cyan
}
