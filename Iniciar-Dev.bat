@echo off
title BIO-STOCK LIMS - Modo Desarrollo
color 0E

echo.
echo  [MODO DESARROLLO] BIO-STOCK LIMS
echo  ──────────────────────────────────
echo  Los cambios en el codigo se recargan automaticamente.
echo  Para produccion, usa: Iniciar.bat
echo.

:: Verificar Node.js
node --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js no instalado.
    pause & exit /b 1
)

:: Instalar dependencias si faltan
if not exist "node_modules\" (
    echo Instalando dependencias...
    call npm install
)

echo  Iniciando servidor API en puerto 3000...
start "BIO-STOCK API" cmd /k "title BIO-STOCK API (puerto 3000) && node server.cjs"

timeout /t 2 >nul

echo  Iniciando Vite en puerto 1420...
echo  Accede en: http://localhost:1420
echo.
start "" "http://localhost:1420"
npm run dev
