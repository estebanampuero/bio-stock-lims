@echo off
REM ============================================================================
REM  Reiniciar BIO-STOCK LIMS
REM  Doble clic para reiniciar el sistema si dejo de responder.
REM  Pide permiso de administrador (boton "Si" en el aviso de Windows).
REM ============================================================================

REM -- Auto-elevar a administrador si no lo es --
net session >nul 2>&1
if %errorlevel% neq 0 (
  echo Solicitando permisos de administrador...
  powershell -Command "Start-Process '%~f0' -Verb RunAs"
  exit /b
)

echo.
echo  ============================================
echo     Reiniciando BIO-STOCK LIMS...
echo  ============================================
echo.

net stop BioStock-API
timeout /t 2 /nobreak >nul
net start BioStock-API

echo.
echo  Estado del servicio:
sc query BioStock-API | findstr /C:"STATE"
echo.
echo  Si dice RUNNING, el sistema ya esta arriba.
echo  Abre el navegador en la direccion de siempre (http(s)://IP-del-servidor).
echo.
pause
