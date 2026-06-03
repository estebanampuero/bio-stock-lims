#Requires -Version 5.1
<#
.SYNOPSIS
    BIO-STOCK LIMS — Instalador para Windows (modelo .exe portable)
.DESCRIPTION
    Despliega el .exe portable, genera secrets/ con ACL strict, opcionalmente
    genera certificado TLS autofirmado, registra el servicio Windows con NSSM,
    abre el firewall, y programa los backups automaticos.
.PARAMETER InstallPath
    Ruta de instalacion. Default: C:\BioStock
.PARAMETER Port
    Puerto HTTP/HTTPS del servidor. Default: 3000
.PARAMETER EnableTLS
    Genera un certificado autofirmado y configura HTTPS.
.EXAMPLE
    .\Install-BioStock.ps1
    Instalacion basica.
.EXAMPLE
    .\Install-BioStock.ps1 -EnableTLS -Port 443
    Con TLS autofirmado en puerto 443.
#>

[CmdletBinding()]
param(
  [string]$InstallPath  = "C:\BioStock",
  [int]   $Port         = 3000,
  [switch]$EnableTLS,
  [string]$ServiceName  = "BioStock-API",
  [string]$EventSource  = "BioStock-LIMS"
)

$ErrorActionPreference = "Stop"

function Test-IsAdmin {
  $u = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
  return $u.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Write-Audit {
  param([string]$Message, [string]$Level = "Information", [int]$EventId = 1000)
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
Write-Host "       BIO-STOCK LIMS - Instalador Windows"
Write-Host "==================================================================="
Write-Host ""
Write-Host "Ruta:    $InstallPath"
Write-Host "Puerto:  $Port"
Write-Host "TLS:     $(if ($EnableTLS) { 'SI - autofirmado' } else { 'No (HTTP)' })"
Write-Host ""

# ── 1. Crear estructura de directorios ─────────────────────────────────────
Write-Host "[1/8] Creando estructura de directorios..."
$secretsDir = Join-Path $InstallPath "secrets"
$backupsDir = Join-Path $InstallPath "backups"
$logsDir    = Join-Path $InstallPath "logs"
$toolsDir   = Join-Path $InstallPath "tools"
foreach ($d in @($InstallPath, $secretsDir, $backupsDir, $logsDir, $toolsDir)) {
  if (-not (Test-Path $d)) { New-Item -Path $d -ItemType Directory -Force | Out-Null }
}

# ── 2. ACL strict sobre secrets/ ──────────────────────────────────────────
Write-Host "[2/8] Aplicando ACL strict en secrets/..."
$acl = Get-Acl $secretsDir
$acl.SetAccessRuleProtection($true, $false)   # remover herencia
$systemRule = New-Object System.Security.AccessControl.FileSystemAccessRule(
  "NT AUTHORITY\SYSTEM", "FullControl", "ContainerInherit,ObjectInherit", "None", "Allow")
$adminRule = New-Object System.Security.AccessControl.FileSystemAccessRule(
  "BUILTIN\Administrators", "FullControl", "ContainerInherit,ObjectInherit", "None", "Allow")
$acl.AddAccessRule($systemRule)
$acl.AddAccessRule($adminRule)
Set-Acl -Path $secretsDir -AclObject $acl
Write-Host "      Solo SYSTEM y Administrators pueden leer secrets/."

# ── 3. Copiar binarios desde la carpeta actual ─────────────────────────────
Write-Host "[3/8] Copiando binarios..."
$source = (Get-Location).Path
$itemsToCopy = @("BioStock-LIMS.exe", "node_sqlite3.node", "sqlite3.exe", "Iniciar.bat", "COMO-INSTALAR.txt")
foreach ($f in $itemsToCopy) {
  $src = Join-Path $source $f
  if (Test-Path $src) {
    Copy-Item -Path $src -Destination $InstallPath -Force
    Write-Host "      Copiado: $f"
  }
}
# Scripts PowerShell
$scriptsSourceDir = Join-Path $source "scripts"
$scriptsDestDir = Join-Path $InstallPath "scripts"
if (Test-Path $scriptsSourceDir) {
  if (-not (Test-Path $scriptsDestDir)) { New-Item -Path $scriptsDestDir -ItemType Directory | Out-Null }
  Copy-Item -Path (Join-Path $scriptsSourceDir "*.ps1") -Destination $scriptsDestDir -Force
}

# ── 4. Generar TLS autofirmado si --EnableTLS ──────────────────────────────
if ($EnableTLS) {
  Write-Host "[4/8] Generando certificado autofirmado..."
  $hostname = $env:COMPUTERNAME
  $ips = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.PrefixOrigin -ne "WellKnown" }).IPAddress
  $sanList = @("localhost", $hostname) + $ips
  $cert = New-SelfSignedCertificate `
    -DnsName $sanList `
    -CertStoreLocation "cert:\LocalMachine\My" `
    -KeyAlgorithm RSA `
    -KeyLength 2048 `
    -NotAfter (Get-Date).AddYears(3) `
    -FriendlyName "BIO-STOCK LIMS Local"

  $pwd = ConvertTo-SecureString -String "biostock-tls-temp" -Force -AsPlainText
  $pfxPath = Join-Path $env:TEMP "biostock.pfx"
  Export-PfxCertificate -Cert $cert -FilePath $pfxPath -Password $pwd | Out-Null

  # Extraer PEM key + cert con .NET (OpenSSL no es estandar en Windows)
  $certPath = Join-Path $InstallPath "cert.pem"
  $keyPath  = Join-Path $InstallPath "key.pem"

  # Cert.pem
  $certBase64 = [System.Convert]::ToBase64String($cert.RawData, [System.Base64FormattingOptions]::InsertLineBreaks)
  "-----BEGIN CERTIFICATE-----`n$certBase64`n-----END CERTIFICATE-----" | Set-Content -Path $certPath -Encoding ASCII

  # Key.pem (requiere reabrir PFX con flag exportable)
  $pfx = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2(
    $pfxPath, $pwd, [System.Security.Cryptography.X509Certificates.X509KeyStorageFlags]::Exportable)
  $rsa = [System.Security.Cryptography.X509Certificates.RSACertificateExtensions]::GetRSAPrivateKey($pfx)
  $keyBytes = $rsa.ExportPkcs8PrivateKey()
  $keyBase64 = [System.Convert]::ToBase64String($keyBytes, [System.Base64FormattingOptions]::InsertLineBreaks)
  "-----BEGIN PRIVATE KEY-----`n$keyBase64`n-----END PRIVATE KEY-----" | Set-Content -Path $keyPath -Encoding ASCII

  Remove-Item $pfxPath -ErrorAction SilentlyContinue
  Write-Host "      cert.pem y key.pem generados."
  Write-Host "      Para que los navegadores no muestren warning, importar el cert raiz en cada cliente:"
  Write-Host "      certutil -addstore -f Root `"$certPath`""
} else {
  Write-Host "[4/8] TLS omitido (HTTP plano). Para activar despues: regenerar con -EnableTLS."
}

# ── 5. Descargar NSSM si no esta ────────────────────────────────────────────
$nssmPath = Join-Path $toolsDir "nssm.exe"
if (-not (Test-Path $nssmPath)) {
  Write-Host "[5/8] Descargando NSSM..."
  $nssmZip = Join-Path $env:TEMP "nssm.zip"
  Invoke-WebRequest -Uri "https://nssm.cc/release/nssm-2.24.zip" -OutFile $nssmZip -UseBasicParsing
  Expand-Archive -Path $nssmZip -DestinationPath (Join-Path $env:TEMP "nssm-extract") -Force
  Copy-Item -Path (Join-Path $env:TEMP "nssm-extract\nssm-2.24\win64\nssm.exe") -Destination $nssmPath
  Remove-Item -Path $nssmZip, (Join-Path $env:TEMP "nssm-extract") -Recurse -Force -ErrorAction SilentlyContinue
} else {
  Write-Host "[5/8] NSSM ya presente."
}

# ── 6. Registrar servicio Windows ───────────────────────────────────────────
Write-Host "[6/8] Registrando servicio $ServiceName con NSSM..."
$exePath = Join-Path $InstallPath "BioStock-LIMS.exe"
if (-not (Test-Path $exePath)) {
  Write-Audit -Message "BioStock-LIMS.exe no encontrado en $InstallPath" -Level Error -EventId 1001
  exit 1
}

# Detener servicio anterior si existe
$svc = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($svc) {
  & $nssmPath stop $ServiceName | Out-Null
  & $nssmPath remove $ServiceName confirm | Out-Null
}

& $nssmPath install $ServiceName $exePath | Out-Null
& $nssmPath set $ServiceName AppDirectory $InstallPath | Out-Null
& $nssmPath set $ServiceName Start SERVICE_AUTO_START | Out-Null
& $nssmPath set $ServiceName AppExit Default Restart | Out-Null
& $nssmPath set $ServiceName AppRestartDelay 3000 | Out-Null
& $nssmPath set $ServiceName AppStdout (Join-Path $logsDir "api-stdout.log") | Out-Null
& $nssmPath set $ServiceName AppStderr (Join-Path $logsDir "api-stderr.log") | Out-Null
& $nssmPath set $ServiceName AppRotateFiles 1 | Out-Null
& $nssmPath set $ServiceName AppRotateBytes 10485760 | Out-Null
# Env del servicio. Con TLS activo forzamos REQUIRE_TLS=1 (la PII no puede ir en HTTP plano)
# y abrimos el redirect HTTP en :80 → HTTPS para quien teclee la IP sin https://.
$envExtra = @("PORT=$Port", "SECRETS_DIR=$secretsDir")
if ($EnableTLS) { $envExtra += "REQUIRE_TLS=1"; $envExtra += "HTTP_REDIRECT_PORT=80" }
& $nssmPath set $ServiceName AppEnvironmentExtra @envExtra | Out-Null

# ── 7. Firewall ────────────────────────────────────────────────────────────
Write-Host "[7/8] Configurando firewall..."
Get-NetFirewallRule -DisplayName "BioStock-HTTP*" -ErrorAction SilentlyContinue | Remove-NetFirewallRule
New-NetFirewallRule -DisplayName "BioStock-HTTP" `
  -Direction Inbound -LocalPort $Port -Protocol TCP -Action Allow `
  -Profile Domain,Private | Out-Null

# Exclusion en Windows Defender
Add-MpPreference -ExclusionPath $InstallPath -ErrorAction SilentlyContinue
Add-MpPreference -ExclusionProcess "BioStock-LIMS.exe" -ErrorAction SilentlyContinue

# ── 8. Task Scheduler — backup diario + verify ─────────────────────────────
Write-Host "[8/8] Programando backups diarios..."
$backupScript = Join-Path $scriptsDestDir "Backup-BioStock.ps1"
if (Test-Path $backupScript) {
  schtasks /Delete /TN "BioStock-Backup-Diario" /F 2>$null | Out-Null
  schtasks /Create /SC DAILY /ST 02:00 /TN "BioStock-Backup-Diario" /TR "powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"$backupScript`" -DestinationPath `"$backupsDir`"" /RU SYSTEM /F | Out-Null
}
$verifyScript = Join-Path $scriptsDestDir "Verify-Backup.ps1"
if (Test-Path $verifyScript) {
  schtasks /Delete /TN "BioStock-Verify-Backup" /F 2>$null | Out-Null
  schtasks /Create /SC DAILY /ST 02:15 /TN "BioStock-Verify-Backup" /TR "powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"$verifyScript`" -BackupDir `"$backupsDir`" -SqliteExe `"$InstallPath\sqlite3.exe`"" /RU SYSTEM /F | Out-Null
}

# ── Arrancar servicio ──────────────────────────────────────────────────────
Write-Host ""
Write-Host "Iniciando servicio..."
Start-Service -Name $ServiceName
Start-Sleep -Seconds 4

# Verificar healthcheck
$scheme = if ($EnableTLS) { "https" } else { "http" }
$healthUrl = "${scheme}://localhost:${Port}/health"
try {
  $r = Invoke-RestMethod -Uri $healthUrl -TimeoutSec 8 -SkipCertificateCheck:$EnableTLS -ErrorAction Stop
  Write-Host ""
  Write-Host "INSTALACION EXITOSA" -ForegroundColor Green
  Write-Host ""
  Write-Host "  URL local:        $healthUrl"
  $ip = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.PrefixOrigin -eq "Dhcp" -or $_.PrefixOrigin -eq "Manual" } | Select-Object -First 1).IPAddress
  if ($ip) { Write-Host "  URL LAN:          ${scheme}://${ip}:${Port}" }
  Write-Host "  Servicio:         $ServiceName ($(Get-Service $ServiceName | Select-Object -ExpandProperty Status))"
  Write-Host "  Secrets dir:      $secretsDir (ACL strict)"
  Write-Host "  Backups dir:      $backupsDir (diario 02:00, verificacion 02:15)"

  $initialPin = Join-Path $InstallPath "INITIAL_PIN.txt"
  if (Test-Path $initialPin) {
    Write-Host ""
    Write-Host "PIN INICIAL DEL ADMIN:" -ForegroundColor Yellow
    Get-Content $initialPin | Where-Object { $_ -match "PIN:" }
    Write-Host ""
    Write-Host "Entregue este PIN al quimico responsable y borre $initialPin." -ForegroundColor Yellow
  }
  Write-Audit -Message "Instalacion exitosa en $InstallPath puerto $Port TLS=$EnableTLS" -Level Information -EventId 1000
} catch {
  Write-Host ""
  Write-Host "ALERTA: Servicio instalado pero /health no respondio." -ForegroundColor Red
  Write-Host "Revisar: $logsDir\api-stderr.log"
  Write-Audit -Message "Healthcheck post-install fallo: $_" -Level Warning -EventId 1002
  exit 1
}
