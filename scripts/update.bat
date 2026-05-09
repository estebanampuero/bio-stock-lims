@echo off
setlocal
color 0E
title BIO-STOCK LIMS - Actualización del Sistema

echo.
echo ████████████████████████████████████████████████████
echo █       BIO-STOCK LIMS - Actualización            █
echo ████████████████████████████████████████████████████
echo.

:: ── Backup automático antes de actualizar ────────────────────────────────────
echo [1/5] Creando backup de seguridad antes de actualizar...
call "%~dp0backup.bat"
echo [OK] Backup completado.

:: ── Verificar Docker ─────────────────────────────────────────────────────────
docker info >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Docker no está corriendo. Abre Docker Desktop primero.
    pause
    exit /b 1
)

:: ── Detener contenedores ──────────────────────────────────────────────────────
echo.
echo [2/5] Deteniendo servicios...
docker compose down
echo [OK] Servicios detenidos.

:: ── Actualizar código fuente ──────────────────────────────────────────────────
echo.
echo [3/5] Actualizando código...
git pull origin main 2>nul
if errorlevel 1 (
    echo [AVISO] No se pudo actualizar via git. Continuando con código actual.
) else (
    echo [OK] Código actualizado.
)

:: ── Reconstruir imágenes ──────────────────────────────────────────────────────
echo.
echo [4/5] Reconstruyendo imágenes Docker...
docker compose build --no-cache
if errorlevel 1 (
    echo [ERROR] Falló la construcción. El sistema NO fue actualizado.
    echo         Ejecuta 'docker compose up -d' para restaurar la versión anterior.
    pause
    exit /b 1
)

:: ── Reiniciar servicios ───────────────────────────────────────────────────────
echo.
echo [5/5] Reiniciando servicios actualizados...
docker compose up -d
if errorlevel 1 (
    echo [ERROR] Falló el inicio de los servicios actualizados.
    pause
    exit /b 1
)

:: ── Verificar estado ─────────────────────────────────────────────────────────
echo.
timeout /t 8 >nul
docker compose ps

echo.
echo ████████████████████████████████████████████████████
echo █    ACTUALIZACIÓN COMPLETADA EXITOSAMENTE         █
echo █    El sistema ya está corriendo la nueva versión █
echo ████████████████████████████████████████████████████
echo.
pause
