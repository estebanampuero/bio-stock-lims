@echo off
title BIO-STOCK LIMS - Monitor de Logs

echo.
echo Selecciona qué logs ver:
echo.
echo  [1] Logs del API (tiempo real)
echo  [2] Logs de Nginx (tiempo real)
echo  [3] Estado de todos los servicios
echo  [4] Logs del ultimo backup
echo  [5] Salir
echo.
set /p OPCION="Opción: "

if "%OPCION%"=="1" (
    echo Mostrando logs del API (Ctrl+C para salir)...
    docker compose logs -f api
)
if "%OPCION%"=="2" (
    echo Mostrando logs de Nginx (Ctrl+C para salir)...
    docker compose logs -f nginx
)
if "%OPCION%"=="3" (
    docker compose ps
    echo.
    docker stats --no-stream
    pause
)
if "%OPCION%"=="4" (
    type "%~dp0..\backups\backup.log" 2>nul || echo No hay logs de backup aun.
    pause
)
if "%OPCION%"=="5" exit /b 0
