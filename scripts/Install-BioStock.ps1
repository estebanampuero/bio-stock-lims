#Requires -Version 5.1
<#
.SYNOPSIS
    BIO-STOCK LIMS Pro — Instalador Enterprise para Windows

.DESCRIPTION
    Instala el sistema BIO-STOCK LIMS completo como servicios nativos de Windows.
    No requiere Docker ni WSL2. Utiliza:
      - Node.js (debe estar instalado previamente)
      - Nginx para Windows (descargado automáticamente si no está presente)
      - NSSM (descargado automáticamente) para ejecutar servicios Windows
      - SQLite (incluido como dependencia npm)
      - Task Scheduler para backups automáticos
      - Windows Firewall configurado automáticamente

.PARAMETER InstallPath
    Ruta de instalación. Por defecto: C:\BioStock

.PARAMETER Port
    Puerto HTTP expuesto en la red local. Por defecto: 80

.PARAMETER SourcePath
    Ruta del código fuente. Por defecto: directorio padre del script.

.PARAMETER SkipFirewall
    Omitir configuración del Windows Firewall.

.PARAMETER Offline
    Modo sin internet: no intenta descargar NSSM ni Nginx. Deben estar en .\tools\

.EXAMPLE
    .\Install-BioStock.ps1
    Instalación estándar con valores por defecto.

.EXAMPLE
    .\Install-BioStock.ps1 -Port 8080 -InstallPath D:\Sistemas\BioStock
    Instalación en ruta y puerto personalizados.
#>

[CmdletBinding(SupportsShouldProcess)]
param(
    [string]$InstallPath  = 'C:\BioStock',
    [int]   $Port         = 80,
    [string]$SourcePath   = (Split-Path (Split-Path $PSScriptRoot -Parent) -Parent),
    [switch]$SkipFirewall,
    [switch]$Offline
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# ── Dot-source módulo de configuración ───────────────────────────────────────
. (Join-Path $PSScriptRoot 'BioStockConfig.ps1')
$script:BioStock.Root     = $InstallPath
$script:BioStock.App      = "$InstallPath\app"
$script:BioStock.Data     = "$InstallPath\data"
$script:BioStock.Backups  = "$InstallPath\backups"
$script:BioStock.Logs     = "$InstallPath\logs"
$script:BioStock.NginxDir = "$InstallPath\nginx"
$script:BioStock.Tools    = "$InstallPath\tools"
$script:BioStock.Scripts  = "$InstallPath\scripts"
$script:BioStock.EnvFile  = "$InstallPath\.env"
$script:BioStock.NssmExe  = "$InstallPath\tools\nssm.exe"
$script:BioStock.NginxExe = "$InstallPath\nginx\nginx.exe"
$script:BioStock.DbFile   = "$InstallPath\data\inventario_biorad.db"
$script:BioStock.NginxHtml= "$InstallPath\nginx\html"
$script:BioStock.WebPort  = $Port

# ═══════════════════════════════════════════════════════════════════════════════
Show-Banner 'Instalador BIO-STOCK LIMS Pro'

# ── 0. Verificar privilegios ──────────────────────────────────────────────────
if (-not (Test-Administrator)) {
    Write-Host '  ERROR: Este script requiere permisos de Administrador.' -ForegroundColor Red
    Write-Host '  Haz clic derecho en PowerShell y selecciona "Ejecutar como administrador".' -ForegroundColor Yellow
    exit 1
}

# ── 1. Verificar prerequisitos ────────────────────────────────────────────────
Write-BioLog 'Verificando prerequisitos del sistema...' INFO

# Node.js
try {
    $nodeVersion = (node --version 2>&1).ToString().Trim()
    $nodeMajor = [int]($nodeVersion -replace 'v(\d+)\..*','$1')
    if ($nodeMajor -lt 18) {
        Write-BioLog "Node.js $nodeVersion detectado. Se requiere v18 o superior." ERROR
        Write-Host '  Descarga la última versión LTS desde: https://nodejs.org' -ForegroundColor Yellow
        exit 1
    }
    Write-BioLog "Node.js $nodeVersion — OK" OK
    $script:BioStock.NodeExe = (Get-Command node).Source
} catch {
    Write-BioLog 'Node.js no está instalado.' ERROR
    Write-Host '  Descarga e instala Node.js LTS desde: https://nodejs.org' -ForegroundColor Yellow
    exit 1
}

# Git (opcional — solo para actualizaciones via git pull)
try {
    $gitVersion = (git --version 2>&1).ToString().Trim()
    Write-BioLog "$gitVersion — OK (actualizaciones automáticas disponibles)" OK
} catch {
    Write-BioLog 'Git no detectado. Las actualizaciones deberán hacerse manualmente.' WARN
}

# ── 2. Crear estructura de directorios ────────────────────────────────────────
Write-BioLog 'Creando estructura de directorios...' INFO
$dirs = @($InstallPath, "$InstallPath\app", "$InstallPath\data",
          "$InstallPath\backups", "$InstallPath\logs",
          "$InstallPath\tools", "$InstallPath\scripts",
          "$InstallPath\nginx\conf", "$InstallPath\nginx\logs",
          "$InstallPath\nginx\temp\client_body",
          "$InstallPath\nginx\temp\proxy",
          "$InstallPath\nginx\temp\fastcgi",
          "$InstallPath\nginx\temp\uwsgi",
          "$InstallPath\nginx\temp\scgi")
foreach ($dir in $dirs) {
    New-Item -Path $dir -ItemType Directory -Force | Out-Null
}
Write-BioLog "Estructura creada en $InstallPath" OK

# ── 3. Registrar fuente en Windows Event Log ──────────────────────────────────
try {
    if (-not [System.Diagnostics.EventLog]::SourceExists($script:BioStock.EventSource)) {
        New-EventLog -LogName $script:BioStock.EventLog -Source $script:BioStock.EventSource
        Write-BioLog "Event Log source '$($script:BioStock.EventSource)' registrado" OK
    }
} catch {
    Write-BioLog "No se pudo registrar Event Log source (no crítico): $_" WARN
}

# ── 4. Descargar NSSM si no existe ───────────────────────────────────────────
if (-not (Test-Path $script:BioStock.NssmExe)) {
    if ($Offline) {
        Write-BioLog "Modo offline: NSSM no encontrado en $($script:BioStock.NssmExe)" ERROR
        exit 1
    }
    Write-BioLog 'Descargando NSSM (gestor de servicios Windows)...' INFO
    $nssmZip = "$env:TEMP\nssm.zip"
    try {
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        Invoke-WebRequest -Uri $script:BioStock.NssmUrl -OutFile $nssmZip -UseBasicParsing
        Expand-Archive -Path $nssmZip -DestinationPath "$env:TEMP\nssm_extract" -Force
        $nssmBin = Get-ChildItem "$env:TEMP\nssm_extract" -Recurse -Filter 'nssm.exe' |
                   Where-Object { $_.FullName -match 'win64' } |
                   Select-Object -First 1
        if (-not $nssmBin) {
            $nssmBin = Get-ChildItem "$env:TEMP\nssm_extract" -Recurse -Filter 'nssm.exe' |
                       Select-Object -First 1
        }
        Copy-Item $nssmBin.FullName -Destination $script:BioStock.NssmExe -Force
        Remove-Item $nssmZip, "$env:TEMP\nssm_extract" -Recurse -Force -ErrorAction SilentlyContinue
        Write-BioLog 'NSSM descargado correctamente' OK
    } catch {
        Write-BioLog "Error descargando NSSM: $_" ERROR
        exit 1
    }
}

# ── 5. Descargar Nginx para Windows si no existe ──────────────────────────────
if (-not (Test-Path $script:BioStock.NginxExe)) {
    if ($Offline) {
        Write-BioLog "Modo offline: nginx.exe no encontrado en $($script:BioStock.NginxExe)" ERROR
        exit 1
    }
    Write-BioLog 'Descargando Nginx para Windows...' INFO
    $nginxZip = "$env:TEMP\nginx.zip"
    try {
        Invoke-WebRequest -Uri $script:BioStock.NginxUrl -OutFile $nginxZip -UseBasicParsing
        $extractDir = "$env:TEMP\nginx_extract"
        Expand-Archive -Path $nginxZip -DestinationPath $extractDir -Force
        $nginxFolder = Get-ChildItem $extractDir -Directory | Select-Object -First 1
        # Copiar contenido de Nginx (preservar estructura: conf/, html/, etc.)
        Copy-Item "$($nginxFolder.FullName)\*" -Destination $script:BioStock.NginxDir -Recurse -Force
        Remove-Item $nginxZip, $extractDir -Recurse -Force -ErrorAction SilentlyContinue
        Write-BioLog 'Nginx descargado correctamente' OK
    } catch {
        Write-BioLog "Error descargando Nginx: $_" ERROR
        exit 1
    }
}

# ── 6. Copiar código fuente al directorio de instalación ─────────────────────
Write-BioLog 'Copiando archivos del sistema...' INFO

$filesToCopy = @('server.cjs', 'package.json', 'package-lock.json')
foreach ($file in $filesToCopy) {
    $src = Join-Path $SourcePath $file
    if (Test-Path $src) {
        Copy-Item $src -Destination $script:BioStock.App -Force
    }
}

# Copiar scripts de gestión
Copy-Item "$PSScriptRoot\*.ps1" -Destination $script:BioStock.Scripts -Force

Write-BioLog 'Archivos copiados' OK

# ── 7. Instalar dependencias npm ─────────────────────────────────────────────
Write-BioLog 'Instalando dependencias npm...' INFO
Push-Location $script:BioStock.App
try {
    & npm ci --omit=dev --prefer-offline 2>&1 | ForEach-Object { Write-Verbose $_ }
    if ($LASTEXITCODE -ne 0) { throw "npm ci falló con código $LASTEXITCODE" }
    Write-BioLog 'Dependencias npm instaladas' OK
} finally {
    Pop-Location
}

# ── 8. Compilar frontend ──────────────────────────────────────────────────────
Write-BioLog 'Compilando interfaz web (React)...' INFO
Push-Location $SourcePath
try {
    & npm ci 2>&1 | Out-Null
    & npm run build 2>&1 | ForEach-Object { Write-Verbose $_ }
    if ($LASTEXITCODE -ne 0) { throw "npm run build falló con código $LASTEXITCODE" }
    # Copiar archivos compilados a nginx\html
    $distPath = Join-Path $SourcePath 'dist'
    if (Test-Path $distPath) {
        Copy-Item "$distPath\*" -Destination $script:BioStock.NginxHtml -Recurse -Force
        Write-BioLog 'Frontend compilado y copiado a Nginx' OK
    }
} finally {
    Pop-Location
}

# ── 9. Generar archivo .env si no existe ─────────────────────────────────────
if (-not (Test-Path $script:BioStock.EnvFile)) {
    Write-BioLog 'Generando configuración de seguridad (.env)...' INFO

    # Generar secrets criptográficamente seguros
    $jwtSecret = -join ((1..64) | ForEach-Object {
        [char](Get-Random -InputObject ([char[]]('a'..'z' + 'A'..'Z' + '0'..'9')))
    })
    $jwtRefresh = -join ((1..64) | ForEach-Object {
        [char](Get-Random -InputObject ([char[]]('a'..'z' + 'A'..'Z' + '0'..'9')))
    })
    # Usar crypto de Node.js para mayor entropía
    $jwtSecret  = (node -e "process.stdout.write(require('crypto').randomBytes(48).toString('hex'))" 2>&1).ToString()
    $jwtRefresh = (node -e "process.stdout.write(require('crypto').randomBytes(48).toString('hex'))" 2>&1).ToString()

    $envContent = @"
# BIO-STOCK LIMS — Configuración de entorno
# Generado automáticamente el $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')
# MANTENER ESTE ARCHIVO PRIVADO — No compartir ni subir a repositorios

NODE_ENV=production
PORT=3000
DB_PATH=$($script:BioStock.DbFile -replace '\\','\\')
BACKUP_PATH=$($script:BioStock.Backups -replace '\\','\\')
LOG_LEVEL=info
JWT_SECRET=$jwtSecret
JWT_REFRESH_SECRET=$jwtRefresh
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d
"@
    $envContent | Out-File -FilePath $script:BioStock.EnvFile -Encoding UTF8
    Write-BioLog '.env generado con secrets criptográficos' OK
}

# ── 10. Escribir nginx.conf para Windows ─────────────────────────────────────
Write-BioLog 'Configurando Nginx...' INFO
$nginxHtmlEscaped = $script:BioStock.NginxHtml -replace '\\', '/'
$nginxLogsEscaped = "$InstallPath/nginx/logs" -replace '\\', '/'
$nginxTempEscaped = "$InstallPath/nginx/temp" -replace '\\', '/'

$nginxConf = @"
# BIO-STOCK LIMS — Configuración Nginx para Windows
# Generado automáticamente. Modificar con cuidado.

worker_processes  auto;
error_log  $nginxLogsEscaped/error.log warn;
pid        $nginxTempEscaped/nginx.pid;

events {
    worker_connections  1024;
}

http {
    include       mime.types;
    default_type  application/octet-stream;

    log_format  main  '`$remote_addr - `$remote_user [`$time_local] "`$request" '
                      '`$status `$body_bytes_sent "`$http_referer" '
                      '"`$http_user_agent"';
    access_log  $nginxLogsEscaped/access.log  main;

    sendfile        on;
    keepalive_timeout  65;

    # Compresión (reduce tráfico en LAN)
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml text/javascript image/svg+xml;
    gzip_comp_level 6;

    # Rate limiting
    limit_req_zone `$binary_remote_addr zone=api_zone:10m rate=60r/s;
    limit_req_zone `$binary_remote_addr zone=login_zone:10m rate=10r/m;

    upstream biostock_api {
        server 127.0.0.1:$($script:BioStock.ApiPort);
        keepalive 32;
    }

    server {
        listen       $Port;
        server_name  _;

        # Headers de seguridad
        add_header X-Frame-Options "SAMEORIGIN" always;
        add_header X-Content-Type-Options "nosniff" always;
        server_tokens off;

        # Frontend React SPA
        location / {
            root   $nginxHtmlEscaped;
            index  index.html;
            try_files `$uri `$uri/ /index.html;

            location ~* \.(js|css|png|jpg|jpeg|svg|ico|woff2)`$ {
                expires 1y;
                add_header Cache-Control "public, immutable";
            }
        }

        # API REST
        location /api/ {
            limit_req zone=api_zone burst=100 nodelay;
            proxy_pass http://biostock_api;
            proxy_http_version 1.1;
            proxy_set_header Host `$host;
            proxy_set_header X-Real-IP `$remote_addr;
            proxy_set_header X-Forwarded-For `$proxy_add_x_forwarded_for;
            proxy_connect_timeout 5s;
            proxy_read_timeout 30s;
        }

        # Rate limit en login
        location /api/auth/login {
            limit_req zone=login_zone burst=5 nodelay;
            proxy_pass http://biostock_api;
            proxy_http_version 1.1;
            proxy_set_header Host `$host;
            proxy_set_header X-Real-IP `$remote_addr;
        }

        # WebSocket (Socket.io)
        location /socket.io/ {
            proxy_pass http://biostock_api;
            proxy_http_version 1.1;
            proxy_set_header Upgrade `$http_upgrade;
            proxy_set_header Connection "upgrade";
            proxy_set_header Host `$host;
            proxy_read_timeout 86400s;
        }

        # Health check
        location /health {
            proxy_pass http://biostock_api/health;
            access_log off;
        }

        location ~ /\.(env|git) {
            deny all;
            return 404;
        }
    }
}
"@
$nginxConf | Out-File -FilePath $script:BioStock.NginxConf -Encoding UTF8 -NoNewline
Write-BioLog 'nginx.conf generado' OK

# ── 11. Instalar servicio Windows para el API (NSSM) ─────────────────────────
Write-BioLog "Instalando servicio Windows '$($script:BioStock.ServiceApi)'..." INFO

# Detener y eliminar servicio anterior si existe
$existingApi = Get-Service -Name $script:BioStock.ServiceApi -ErrorAction SilentlyContinue
if ($existingApi) {
    Stop-Service -Name $script:BioStock.ServiceApi -Force -ErrorAction SilentlyContinue
    & $script:BioStock.NssmExe remove $script:BioStock.ServiceApi confirm 2>&1 | Out-Null
    Start-Sleep -Seconds 2
}

# Instalar nuevo servicio
& $script:BioStock.NssmExe install $script:BioStock.ServiceApi $script:BioStock.NodeExe
& $script:BioStock.NssmExe set $script:BioStock.ServiceApi AppDirectory $script:BioStock.App
& $script:BioStock.NssmExe set $script:BioStock.ServiceApi AppParameters 'server.cjs'
& $script:BioStock.NssmExe set $script:BioStock.ServiceApi DisplayName 'BIO-STOCK LIMS - API Server'
& $script:BioStock.NssmExe set $script:BioStock.ServiceApi Description 'Servidor API de BIO-STOCK LIMS. NO detener manualmente — usar scripts de gestion.'
& $script:BioStock.NssmExe set $script:BioStock.ServiceApi Start SERVICE_AUTO_START
& $script:BioStock.NssmExe set $script:BioStock.ServiceApi AppStdout (Join-Path $script:BioStock.Logs 'api-stdout.log')
& $script:BioStock.NssmExe set $script:BioStock.ServiceApi AppStderr (Join-Path $script:BioStock.Logs 'api-stderr.log')
& $script:BioStock.NssmExe set $script:BioStock.ServiceApi AppRotateFiles 1
& $script:BioStock.NssmExe set $script:BioStock.ServiceApi AppRotateBytes 10485760  # 10MB
& $script:BioStock.NssmExe set $script:BioStock.ServiceApi AppRestartDelay 3000     # 3s entre reinicios

# Variables de entorno para el servicio
$envContent = Read-EnvFile
$envString = ($envContent.GetEnumerator() | ForEach-Object { "$($_.Key)=$($_.Value)" }) -join "`0"
& $script:BioStock.NssmExe set $script:BioStock.ServiceApi AppEnvironmentExtra $envString

Write-BioLog "Servicio '$($script:BioStock.ServiceApi)' instalado" OK

# ── 12. Instalar servicio Windows para Nginx (NSSM) ──────────────────────────
Write-BioLog "Instalando servicio Windows '$($script:BioStock.ServiceNginx)'..." INFO

$existingNginx = Get-Service -Name $script:BioStock.ServiceNginx -ErrorAction SilentlyContinue
if ($existingNginx) {
    Stop-Service -Name $script:BioStock.ServiceNginx -Force -ErrorAction SilentlyContinue
    & $script:BioStock.NssmExe remove $script:BioStock.ServiceNginx confirm 2>&1 | Out-Null
    Start-Sleep -Seconds 2
}

& $script:BioStock.NssmExe install $script:BioStock.ServiceNginx $script:BioStock.NginxExe
& $script:BioStock.NssmExe set $script:BioStock.ServiceNginx AppDirectory $script:BioStock.NginxDir
& $script:BioStock.NssmExe set $script:BioStock.ServiceNginx DisplayName 'BIO-STOCK LIMS - Web Server (Nginx)'
& $script:BioStock.NssmExe set $script:BioStock.ServiceNginx Description 'Servidor web Nginx de BIO-STOCK LIMS.'
& $script:BioStock.NssmExe set $script:BioStock.ServiceNginx Start SERVICE_AUTO_START
& $script:BioStock.NssmExe set $script:BioStock.ServiceNginx AppStdout (Join-Path $script:BioStock.Logs 'nginx-stdout.log')
& $script:BioStock.NssmExe set $script:BioStock.ServiceNginx AppStderr (Join-Path $script:BioStock.Logs 'nginx-stderr.log')
& $script:BioStock.NssmExe set $script:BioStock.ServiceNginx AppRotateFiles 1
& $script:BioStock.NssmExe set $script:BioStock.ServiceNginx AppRotateBytes 10485760
& $script:BioStock.NssmExe set $script:BioStock.ServiceNginx AppRestartDelay 3000

Write-BioLog "Servicio '$($script:BioStock.ServiceNginx)' instalado" OK

# ── 13. Registrar tareas programadas ─────────────────────────────────────────
Write-BioLog 'Registrando tareas programadas...' INFO

# Backup diario 02:00 AM
$backupScript = Join-Path $script:BioStock.Scripts 'Backup-BioStock.ps1'
$actionBackup = New-ScheduledTaskAction `
    -Execute 'powershell.exe' `
    -Argument "-NonInteractive -ExecutionPolicy Bypass -File `"$backupScript`""
$triggerBackup = New-ScheduledTaskTrigger -Daily -At '02:00'
$settingsBackup = New-ScheduledTaskSettingsSet `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 30) `
    -RunOnlyIfNetworkAvailable:$false `
    -StartWhenAvailable `
    -WakeToRun:$false
Register-ScheduledTask -TaskName 'BioStock-Backup-Diario' `
    -Action $actionBackup -Trigger $triggerBackup `
    -Settings $settingsBackup `
    -RunLevel Highest -User 'SYSTEM' `
    -Description 'Backup automático diario de BIO-STOCK LIMS a las 02:00 AM' `
    -Force | Out-Null
Write-BioLog 'Tarea: BioStock-Backup-Diario (02:00 AM, SYSTEM)' OK

# Cleanup de logs semanalmente (domingos 03:00 AM)
$cleanupAction = New-ScheduledTaskAction `
    -Execute 'powershell.exe' `
    -Argument @"
-NonInteractive -ExecutionPolicy Bypass -Command "
Get-ChildItem '$($script:BioStock.Logs)' -Filter '*.log' |
Where-Object { `$_.LastWriteTime -lt (Get-Date).AddDays(-90) } |
Remove-Item -Force"
"@
$triggerCleanup = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Sunday -At '03:00'
Register-ScheduledTask -TaskName 'BioStock-Limpieza-Logs' `
    -Action $cleanupAction -Trigger $triggerCleanup `
    -RunLevel Highest -User 'SYSTEM' `
    -Description 'Limpieza de logs antiguos de BIO-STOCK LIMS' `
    -Force | Out-Null
Write-BioLog 'Tarea: BioStock-Limpieza-Logs (Domingos 03:00 AM, SYSTEM)' OK

# ── 14. Configurar Windows Firewall ──────────────────────────────────────────
if (-not $SkipFirewall) {
    Write-BioLog 'Configurando Windows Firewall...' INFO
    try {
        # Permitir tráfico entrante en el puerto web desde la LAN
        $existingRule = Get-NetFirewallRule -DisplayName 'BioStock-HTTP' -ErrorAction SilentlyContinue
        if ($existingRule) { Remove-NetFirewallRule -DisplayName 'BioStock-HTTP' -ErrorAction SilentlyContinue }

        New-NetFirewallRule `
            -DisplayName 'BioStock-HTTP' `
            -Description 'BIO-STOCK LIMS: Acceso web desde red local' `
            -Direction Inbound `
            -Protocol TCP `
            -LocalPort $Port `
            -Profile Domain,Private `
            -Action Allow | Out-Null

        # Bloquear acceso directo al puerto del API desde la red (solo Nginx accede)
        $existingApiBlock = Get-NetFirewallRule -DisplayName 'BioStock-API-Block' -ErrorAction SilentlyContinue
        if ($existingApiBlock) { Remove-NetFirewallRule -DisplayName 'BioStock-API-Block' -ErrorAction SilentlyContinue }

        New-NetFirewallRule `
            -DisplayName 'BioStock-API-Block' `
            -Description 'BIO-STOCK LIMS: Bloquear acceso directo al API (solo Nginx via localhost)' `
            -Direction Inbound `
            -Protocol TCP `
            -LocalPort $script:BioStock.ApiPort `
            -RemoteAddress '0.0.0.0/0' `
            -Action Block | Out-Null

        Write-BioLog "Firewall: Puerto $Port abierto para LAN, puerto $($script:BioStock.ApiPort) bloqueado externamente" OK
    } catch {
        Write-BioLog "Error configurando Firewall (puede requerir permisos adicionales): $_" WARN
    }
}

# ── 15. Configurar exclusiones de Windows Defender ───────────────────────────
Write-BioLog 'Configurando exclusiones de Windows Defender...' INFO
try {
    $excludePaths = @(
        $InstallPath,
        $script:BioStock.NodeExe,
        $script:BioStock.NginxExe
    )
    foreach ($path in $excludePaths) {
        if (Test-Path $path) {
            Add-MpPreference -ExclusionPath $path -ErrorAction SilentlyContinue
        }
    }
    Write-BioLog 'Exclusiones de Defender configuradas' OK
} catch {
    Write-BioLog "Error configurando exclusiones de Defender: $_" WARN
}

# ── 16. Iniciar servicios ─────────────────────────────────────────────────────
Write-BioLog 'Iniciando servicios...' INFO
Start-Sleep -Seconds 2

Start-Service -Name $script:BioStock.ServiceApi
Start-Sleep -Seconds 3
Start-Service -Name $script:BioStock.ServiceNginx
Start-Sleep -Seconds 3

# ── 17. Verificar que el sistema está respondiendo ────────────────────────────
Write-BioLog 'Verificando sistema...' INFO
$maxAttempts = 10
$attempt = 0
$healthy = $false
while ($attempt -lt $maxAttempts -and -not $healthy) {
    Start-Sleep -Seconds 2
    $healthy = Test-ApiHealth
    $attempt++
    if (-not $healthy) { Write-BioLog "Esperando API... intento $attempt/$maxAttempts" INFO }
}

# ── 18. Resumen final ─────────────────────────────────────────────────────────
$serverIp = Get-ServerIP
Write-Host ''
if ($healthy) {
    Write-Host '╔════════════════════════════════════════════════════════════╗' -ForegroundColor Green
    Write-Host '║      INSTALACIÓN COMPLETADA EXITOSAMENTE                  ║' -ForegroundColor Green
    Write-Host '╠════════════════════════════════════════════════════════════╣' -ForegroundColor Green
    Write-Host "║  Acceso local:    http://localhost$(if($Port -ne 80){":$Port"})" -ForegroundColor Green
    Write-Host "║  Acceso en red:   http://$serverIp$(if($Port -ne 80){":$Port"})" -ForegroundColor Green
    Write-Host '╠════════════════════════════════════════════════════════════╣' -ForegroundColor Green
    Write-Host "║  Servicios:  $($script:BioStock.ServiceApi) + $($script:BioStock.ServiceNginx)" -ForegroundColor Green
    Write-Host "║  Datos:      $($script:BioStock.Data)" -ForegroundColor Green
    Write-Host "║  Scripts:    $($script:BioStock.Scripts)" -ForegroundColor Green
    Write-Host '╠════════════════════════════════════════════════════════════╣' -ForegroundColor Green
    Write-Host '║  Estado:     .\Get-BioStockStatus.ps1                     ║' -ForegroundColor Cyan
    Write-Host '║  Backup:     .\Backup-BioStock.ps1                        ║' -ForegroundColor Cyan
    Write-Host '║  Actualizar: .\Update-BioStock.ps1                        ║' -ForegroundColor Cyan
    Write-Host '╚════════════════════════════════════════════════════════════╝' -ForegroundColor Green
} else {
    Write-BioLog 'Los servicios se instalaron pero el API no responde aún. Revisa los logs.' WARN
    Write-Host "  Logs: $($script:BioStock.Logs)" -ForegroundColor Yellow
}

Write-EventLog -LogName Application -Source $script:BioStock.EventSource `
    -EventId 1000 -EntryType Information `
    -Message "BIO-STOCK LIMS instalado en $InstallPath. IP: $serverIp`:$Port" `
    -ErrorAction SilentlyContinue
