# Manual de Actualización — BIO-STOCK LIMS

Las actualizaciones **conservan siempre** la base de datos, los secretos (`jwt.secret`,
`master.key`) y los backups. El proceso respalda antes de reemplazar y hace *rollback*
automático si el `/health` no responde.

## Opción A — Autoactualización (recomendada)

Si activaste "Buscar actualizaciones automáticamente" en la instalación, existe la tarea
programada **`BioStock-Check-Update`** (domingos 03:30) que:

1. Lee la versión instalada desde `/api/version`.
2. Consulta `latest.json` en GitHub Releases.
3. Si hay una versión mayor, descarga el `Setup.exe`, **verifica su SHA-256** y lo ejecuta
   en modo silencioso (`/VERYSILENT`). El instalador hace el update-in-place.

Forzar el chequeo ahora:

```powershell
cd C:\BioStock\scripts
.\Check-Update.ps1                 # instala si hay versión nueva
.\Check-Update.ps1 -CheckOnly      # solo informa (exit 10 = hay update)
.\Check-Update.ps1 -Force          # reinstala la última aunque sea igual
```

## Opción B — Reinstalar el instalador nuevo

Descarga el nuevo `BioStock-Setup-x.y.z.exe` y ejecútalo. Detecta la instalación previa,
detiene el servicio, respalda la DB, reemplaza binarios y reinicia. **No** toca los datos.

Silencioso:

```powershell
BioStock-Setup-1.3.0.exe /VERYSILENT /SUPPRESSMSGBOXES /NORESTART
```

## Opción C — Update por ZIP offline (sin GitHub)

Para redes sin salida a internet, usa el script con rollback integrado:

```powershell
# Como Administrador
cd C:\BioStock\scripts
.\Update-BioStock.ps1 -ZipFile "C:\Temp\release-v1.3.0.zip"
```

Flujo: detiene servicio → backup de `.exe`, DB, `jwt.secret`, `master.key` en
`C:\BioStock\rollback_<fecha>` → reemplaza binarios (protege DB y secretos) → reinicia →
verifica `/health` → **si falla, restaura automáticamente** el rollback.

## Publicar una nueva versión (equipo de desarrollo)

1. Sube la versión en `package.json` (ej. `1.3.0`).
2. Commit y crea el tag:
   ```bash
   git tag v1.3.0
   git push origin v1.3.0
   ```
3. El workflow `.github/workflows/release.yml` (runner Windows) construye el `.exe`,
   compila el instalador con Inno Setup y publica en GitHub Releases:
   - `BioStock-Setup-1.3.0.exe`
   - `latest.json` (lo que consultan los clientes)

> El tag **debe** coincidir con la versión de `package.json`. El nombre del asset y
> `latest.json` se derivan de `release/VERSION.txt` (que sale de `package.json`).

## Verificar después de actualizar

```powershell
Invoke-RestMethod http://localhost:3000/api/version   # debe mostrar la versión nueva
Get-Service BioStock-API                              # 'Running'
```

## Rollback manual

Si algo salió mal y no se restauró solo, la carpeta `C:\BioStock\rollback_<fecha>`
contiene el `.exe`, la DB y los secretos previos. Detén el servicio, copia esos archivos
de vuelta a `C:\BioStock` y reinicia. Ver también `docs/RECUPERACION.md`.
