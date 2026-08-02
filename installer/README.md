# Instalador Windows — BIO-STOCK LIMS

Genera un instalador de **doble clic** (`BioStock-Setup-x.y.z.exe`) que despliega
BIO-STOCK como **servicio Windows**, sin que el usuario final instale Node, Python,
Docker ni nada. El `.exe` de la app ya embebe Node + React + SQLite.

## Piezas

| Archivo | Rol |
|---|---|
| `BioStock.iss` | Script Inno Setup 6: wizard, copia de binarios, accesos directos, apertura del navegador, update-in-place y desinstalación. |
| `build-installer.ps1` | Prepara el payload (NSSM, scripts, versión) y compila el `.iss` con ISCC. |

El `.iss` **no duplica** la lógica de Windows: delega en `scripts/Install-BioStock.ps1 -InPlace`
(servicio NSSM, firewall, backups, Defender, healthcheck) y en `scripts/Uninstall-BioStock.ps1`.
Fuente única de verdad.

## Construir localmente (en Windows)

```powershell
# 1. Generar el payload autocontenido (funciona también desde macOS/Linux)
npm ci
npm run build:exe          # -> release\BioStock-LIMS.exe + node_sqlite3.node + scripts\ + VERSION.txt

# 2. Instalar Inno Setup 6 (una vez)
choco install innosetup -y   # o https://jrsoftware.org/isdl.php

# 3. Compilar el instalador
.\installer\build-installer.ps1
# -> dist-installer\BioStock-Setup-<version>.exe
```

## Construir en CI

El workflow `.github/workflows/release.yml` lo hace automáticamente al crear un tag `v*`.
Corre en `windows-latest`: `npm run build:exe` → descarga NSSM → `ISCC` → publica el
Setup y `latest.json` en el GitHub Release.

## Qué hace el instalador (para el usuario final)

1. Wizard: elige carpeta (default `C:\BioStock`), puerto (default 3000), HTTPS opcional,
   autoactualización semanal opcional.
2. Detiene el servicio previo (si es un update) para liberar el `.exe`.
3. Copia binarios **sin tocar** `data\`, `secrets\`, `backups\` ni la base de datos.
4. Registra el servicio `BioStock-API` (autoarranque + restart on crash), abre el firewall,
   programa el backup diario 02:00 y el verify 02:15.
5. Crea accesos directos ("Abrir BIO-STOCK", "Estado del sistema", "Buscar actualizaciones").
6. **Abre el navegador** en `http://localhost:<puerto>` al terminar.

## Instalación silenciosa / desatendida

```powershell
BioStock-Setup-1.1.0.exe /VERYSILENT /SUPPRESSMSGBOXES /NORESTART
```

Usado por `Check-Update.ps1` para actualizar sin intervención.

## Nota sobre SmartScreen

El instalador **no está firmado**. Windows mostrará "Editor desconocido" →
*Más información* → *Ejecutar de todas formas*. Para eliminar el aviso, firmar el
`.exe` y el `Setup.exe` con un certificado de firma de código (el pipeline tiene el
punto de extensión listo; ver `docs/PACKAGING.md`).
