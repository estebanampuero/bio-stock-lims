@echo off
setlocal enabledelayedexpansion

:: ── BIO-STOCK LIMS — Backup Automático de Base de Datos ──────────────────────
:: Puede ejecutarse manualmente o como Tarea Programada de Windows
:: Guarda una copia timestamped de la DB SQLite

set BACKUP_DIR=%~dp0..\backups
set DATA_DIR=%~dp0..\data
set DB_FILE=inventario_biorad.db
set RETENTION_DAYS=30

:: Crear timestamp: YYYY-MM-DD_HH-MM
for /f "tokens=1-5 delims=/: " %%a in ("%date% %time%") do (
    set DAY=%%a
    set MONTH=%%b
    set YEAR=%%c
    set HOUR=%%d
    set MIN=%%e
)

:: Normalizar formato (puede variar por configuración regional de Windows)
set TIMESTAMP=%YEAR%-%MONTH%-%DAY%_%HOUR%-%MIN%
set TIMESTAMP=%TIMESTAMP: =0%

set BACKUP_FILE=%BACKUP_DIR%\biostock_%TIMESTAMP%.db

:: ── Verificar que la DB existe ────────────────────────────────────────────────
if not exist "%DATA_DIR%\%DB_FILE%" (
    echo [%TIMESTAMP%] ERROR: No se encontró %DATA_DIR%\%DB_FILE% >> "%BACKUP_DIR%\backup.log"
    exit /b 1
)

:: ── Crear directorio de backups si no existe ─────────────────────────────────
if not exist "%BACKUP_DIR%" mkdir "%BACKUP_DIR%"

:: ── Hacer backup usando API SQLite (backup online, seguro para DB activa) ─────
:: Usamos node con el módulo sqlite para hacer un backup seguro sin corromper la DB
node -e "
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const src = path.join('%DATA_DIR%', '%DB_FILE%').replace(/\\/g, '/');
const dst = '%BACKUP_FILE%'.replace(/\\/g, '/');
const db = new sqlite3.Database(src, (err) => {
  if(err) { console.error('Error abriendo DB:', err); process.exit(1); }
  db.run('VACUUM INTO ?', [dst], (err2) => {
    if(err2) { console.error('Error backup:', err2); process.exit(1); }
    console.log('Backup exitoso:', dst);
    db.close();
  });
});
" 2>&1

if errorlevel 1 (
    echo [%TIMESTAMP%] ERROR: Falló el backup >> "%BACKUP_DIR%\backup.log"
    exit /b 1
)

echo [%TIMESTAMP%] Backup exitoso: %BACKUP_FILE% >> "%BACKUP_DIR%\backup.log"

:: ── Eliminar backups más antiguos que RETENTION_DAYS días ────────────────────
forfiles /p "%BACKUP_DIR%" /s /m "biostock_*.db" /d -%RETENTION_DAYS% /c "cmd /c del @path" 2>nul

echo [%TIMESTAMP%] Limpieza completada. Backups conservados: últimos %RETENTION_DAYS% días. >> "%BACKUP_DIR%\backup.log"
