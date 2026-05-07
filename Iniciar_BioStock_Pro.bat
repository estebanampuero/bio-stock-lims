@echo off
color 0B
echo ===================================================
echo       SISTEMA BIO-STOCK LIMS - INICIO SEGURO
echo ===================================================
echo.
echo [1/3] Limpiando memoria y servidores antiguos...
taskkill /F /IM node.exe >nul 2>&1

echo [2/3] Levantando Servidor de Base de Datos...
start "Servidor SQL - Bio-Stock" cmd /c "title Servidor Backend && node server.cjs"

echo [3/3] Levantando Interfaz Clinica...
start "Interfaz Web - Bio-Stock" cmd /c "title Interfaz Visual && npm run dev -- --host"

echo.
echo ===================================================
echo   ? SISTEMA EN LINEA Y FUNCIONANDO
echo ===================================================
echo.
echo La aplicacion se abrira en tu navegador...
timeout /t 3 >nul
start http://localhost:1420/
