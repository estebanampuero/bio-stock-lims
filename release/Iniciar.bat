@echo off
title BIO-STOCK LIMS
cd /d "%~dp0"
echo.
echo ============================================
echo   BIO-STOCK LIMS - Iniciando servidor...
echo ============================================
echo.
echo Acceso desde este equipo:   http://localhost:3000
echo Acceso desde otros equipos: http://[IP-de-este-PC]:3000
echo.
echo Usuario inicial: admin   PIN: 1234
echo (Cambialo desde Personal apenas entres)
echo.
echo Cierra esta ventana para detener el servidor.
echo ============================================
echo.
BioStock-LIMS.exe
pause
