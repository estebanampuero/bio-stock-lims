@echo off
setlocal enabledelayedexpansion
color 0B
title BIO-STOCK LIMS - Despliegue Inicial

echo.
echo ████████████████████████████████████████████████████████
echo █                                                      █
echo █           BIO-STOCK LIMS Pro - Instalador           █
echo █                                                      █
echo ████████████████████████████████████████████████████████
echo.

:: ── Verificar prerequisitos ──────────────────────────────────────────────────
echo [VERIFICANDO] Prerequisitos del sistema...
echo.

docker --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Docker no está instalado.
    echo         Descarga Docker Desktop desde: https://www.docker.com/products/docker-desktop/
    echo         Instala Docker Desktop, reinicia el equipo, y vuelve a ejecutar este script.
    pause
    exit /b 1
)

docker info >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Docker Desktop no está corriendo.
    echo         Abre Docker Desktop y espera a que termine de iniciar.
    pause
    exit /b 1
)

echo [OK] Docker detectado y funcionando.

:: ── Verificar archivo .env ────────────────────────────────────────────────────
if not exist ".env" (
    echo.
    echo [AVISO] No se encontró archivo .env
    echo         Copiando .env.example como .env...
    copy .env.example .env >nul
    echo.
    echo ════════════════════════════════════════════════════════
    echo  ACCIÓN REQUERIDA: Edita el archivo .env antes de continuar.
    echo  Específicamente, cambia JWT_SECRET y JWT_REFRESH_SECRET
    echo  por strings aleatorios únicos.
    echo ════════════════════════════════════════════════════════
    echo.
    echo  Puedes generar strings seguros ejecutando:
    echo  node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
    echo.
    pause
    echo Abriendo .env para edición...
    notepad .env
    pause
)

:: ── Crear directorios de datos ────────────────────────────────────────────────
echo [CREANDO] Directorios de datos...
if not exist "data" mkdir data
if not exist "backups" mkdir backups
if not exist "logs" mkdir logs
echo [OK] Directorios creados.

:: ── Obtener IP local del servidor ─────────────────────────────────────────────
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /i "IPv4" ^| findstr /v "169.254"') do (
    set SERVER_IP=%%a
    set SERVER_IP=!SERVER_IP: =!
    goto :found_ip
)
:found_ip

echo.
echo ════════════════════════════════════════════════════════
echo  IP del servidor detectada: %SERVER_IP%
echo  Los clientes acceden en:  http://%SERVER_IP%
echo ════════════════════════════════════════════════════════

:: ── Construir y lanzar contenedores ──────────────────────────────────────────
echo.
echo [1/3] Construyendo imágenes Docker...
docker compose build --no-cache
if errorlevel 1 (
    echo [ERROR] Falló la construcción de imágenes. Revisa el error anterior.
    pause
    exit /b 1
)

echo.
echo [2/3] Iniciando servicios...
docker compose up -d
if errorlevel 1 (
    echo [ERROR] Falló el inicio de servicios.
    pause
    exit /b 1
)

echo.
echo [3/3] Verificando estado de servicios...
timeout /t 10 >nul
docker compose ps

:: ── Configurar tarea programada de backup ─────────────────────────────────────
echo.
echo [BACKUP] Configurando backup automático diario...
set SCRIPT_PATH=%~dp0backup.bat
set TASK_CMD=schtasks /create /tn "BioStock-Backup-Diario" /tr "%SCRIPT_PATH%" /sc daily /st 02:00 /ru SYSTEM /f
%TASK_CMD% >nul 2>&1
if errorlevel 1 (
    echo [AVISO] No se pudo crear tarea automática de backup. Configura manualmente.
) else (
    echo [OK] Backup automático configurado para ejecutar a las 02:00 AM diariamente.
)

:: ── Resultado final ───────────────────────────────────────────────────────────
echo.
echo ████████████████████████████████████████████████████████
echo █                                                      █
echo █    SISTEMA EN LÍNEA - BIO-STOCK LIMS Pro            █
echo █                                                      █
echo █    Acceso local:    http://localhost                 █
echo █    Acceso en red:   http://%SERVER_IP%              █
echo █                                                      █
echo █    Para ver logs:   scripts\ver-logs.bat            █
echo █    Para actualizar: scripts\update.bat              █
echo █    Para backup:     scripts\backup.bat              █
echo █                                                      █
echo ████████████████████████████████████████████████████████
echo.
pause
