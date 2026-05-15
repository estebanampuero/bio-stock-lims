@echo off
setlocal enabledelayedexpansion
title BIO-STOCK LIMS Pro
color 0B

echo.
echo  ██████╗ ██╗ ██████╗       ███████╗████████╗ ██████╗  ██████╗██╗  ██╗
echo  ██╔══██╗██║██╔═══██╗      ██╔════╝╚══██╔══╝██╔═══██╗██╔════╝██║ ██╔╝
echo  ██████╔╝██║██║   ██║█████╗███████╗   ██║   ██║   ██║██║     █████╔╝
echo  ██╔══██╗██║██║   ██║╚════╝╚════██║   ██║   ██║   ██║██║     ██╔═██╗
echo  ██████╔╝██║╚██████╔╝      ███████║   ██║   ╚██████╔╝╚██████╗██║  ██╗
echo  ╚═════╝ ╚═╝ ╚═════╝       ╚══════╝   ╚═╝    ╚═════╝  ╚═════╝╚═╝  ╚═╝
echo.
echo                    ████████╗███╗   ███╗░
echo                    ╚══██╔══╝████╗ ████║░
echo                       ██║   ██╔████╔██║
echo                       ██║   ██║╚██╔╝██║  ██╗
echo                       ██║   ██║ ╚═╝ ██║  ╚═╝
echo                       ╚═╝   ╚═╝     ╚═╝
echo.
echo  ███╗   ███╗██╗ ██████╗ ██╗   ██╗███████╗██╗
echo  ████╗ ████║██║██╔════╝ ██║   ██║██╔════╝██║
echo  ██╔████╔██║██║██║  ███╗██║   ██║█████╗  ██║
echo  ██║╚██╔╝██║██║██║   ██║██║   ██║██╔══╝  ██║
echo  ██║ ╚═╝ ██║██║╚██████╔╝╚██████╔╝███████╗███████╗
echo  ╚═╝     ╚═╝╚═╝ ╚═════╝  ╚═════╝ ╚══════╝╚══════╝
echo.
echo  ███╗   ███╗ ██████╗ ██████╗ ███████╗██╗██████╗  █████╗
echo  ████╗ ████║██╔═══██╗██╔══██╗██╔════╝██║██╔══██╗██╔══██╗
echo  ██╔████╔██║██║   ██║██████╔╝█████╗  ██║██████╔╝███████║
echo  ██║╚██╔╝██║██║   ██║██╔══██╗██╔══╝  ██║██╔══██╗██╔══██║
echo  ██║ ╚═╝ ██║╚██████╔╝██║  ██║███████╗██║██║  ██║██║  ██║
echo  ╚═╝     ╚═╝ ╚═════╝ ╚═╝  ╚═╝╚══════╝╚═╝╚═╝  ╚═╝╚═╝  ╚═╝
echo.
echo                      LIMS Pro v1.0 - Iniciando...
echo.

:: ─────────────────────────────────────────────────────────────
:: PASO 1 — Verificar que Node.js está instalado
:: ─────────────────────────────────────────────────────────────
node --version >nul 2>&1
if errorlevel 1 (
    color 0C
    echo  [ERROR] Node.js no está instalado.
    echo.
    echo  Descarga e instala Node.js LTS desde:
    echo  https://nodejs.org
    echo.
    pause
    exit /b 1
)

:: ─────────────────────────────────────────────────────────────
:: PASO 2 — Instalar dependencias si no existen
:: ─────────────────────────────────────────────────────────────
if not exist "node_modules\" (
    echo  [1/3] Instalando dependencias por primera vez...
    echo        (Esto solo ocurre una vez, puede tardar 1-2 minutos)
    echo.
    call npm install
    if errorlevel 1 (
        color 0C
        echo  [ERROR] npm install falló. Revisa tu conexión a internet.
        pause
        exit /b 1
    )
    echo.
)

:: ─────────────────────────────────────────────────────────────
:: PASO 3 — Compilar el frontend si no existe el build
:: ─────────────────────────────────────────────────────────────
if not exist "dist\index.html" (
    echo  [2/3] Compilando interfaz web...
    echo        (Esto solo ocurre la primera vez o después de actualizaciones)
    echo.
    call npm run build
    if errorlevel 1 (
        color 0C
        echo  [ERROR] La compilación falló. Revisa los errores anteriores.
        pause
        exit /b 1
    )
    echo.
) else (
    echo  [2/3] Interfaz web lista (build encontrado).
)

:: ─────────────────────────────────────────────────────────────
:: PASO 4 — Obtener la IP local del servidor
:: ─────────────────────────────────────────────────────────────
set SERVER_IP=localhost
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /i "IPv4" ^| findstr /v "169.254"') do (
    set RAW_IP=%%a
    set SERVER_IP=!RAW_IP: =!
    goto :ip_found
)
:ip_found

:: ─────────────────────────────────────────────────────────────
:: PASO 5 — Iniciar el servidor
:: ─────────────────────────────────────────────────────────────
echo  [3/3] Iniciando servidor BIO-STOCK LIMS...
echo.
echo  ╔══════════════════════════════════════════════════╗
echo  ║                                                  ║
echo  ║   Sistema listo. Accede desde:                  ║
echo  ║                                                  ║
echo  ║   Este PC:      http://localhost:3000            ║
echo  ║   Red local:    http://!SERVER_IP!:3000     ║
echo  ║                                                  ║
echo  ║   Comparte la URL de red con los demás PCs.     ║
echo  ║                                                  ║
echo  ║   Para detener el sistema: cierra esta ventana  ║
echo  ║                                                  ║
echo  ╚══════════════════════════════════════════════════╝
echo.

:: Esperar 2 segundos y abrir el navegador automáticamente
timeout /t 2 >nul
start "" "http://localhost:3000"

:: Iniciar el servidor (mantiene esta ventana abierta con los logs)
node server.cjs

:: Si el servidor se cierra por error, pausar para ver el mensaje
echo.
echo  [!] El servidor se detuvo. Presiona cualquier tecla para cerrar.
pause >nul
