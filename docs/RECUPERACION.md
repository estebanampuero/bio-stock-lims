# Manual de Recuperación ante Fallos — BIO-STOCK LIMS

Todo el estado importante vive en `C:\BioStock`:

| Qué | Dónde | Respaldar |
|---|---|---|
| Base de datos | `inventario_biorad.db` (+ `-wal`, `-shm`) | **Sí, crítico** |
| Secretos JWT | `secrets\jwt.secret` (y `master.key` si existe) | **Sí** (sin esto, las sesiones se invalidan) |
| Backups automáticos | `backups\*.db` (diarios 02:00) | Ya son el respaldo |
| Logs | `logs\api-stderr.log`, `api-stdout.log` | Para diagnóstico |

> La DB usa modo WAL. Para copiarla en caliente, usa un backup consistente
> (`Backup-BioStock.ps1`, que hace `VACUUM INTO`) en vez de copiar el archivo a mano.

---

## Escenario 1 — El servicio no arranca / se cae

```powershell
Get-Service BioStock-API
Get-Content C:\BioStock\logs\api-stderr.log -Tail 50   # ver la causa
Restart-Service BioStock-API
```

Si sigue cayendo, el servicio está configurado para reintentar cada 3 s (NSSM
`AppExit Default Restart`). Revisa el log para la excepción concreta.

---

## Escenario 2 — Base de datos corrupta

```powershell
Stop-Service BioStock-API

# Restaurar el último backup bueno (interactivo)
cd C:\BioStock\scripts
.\Restore-BioStock.ps1
# o uno específico:
.\Restore-BioStock.ps1 -BackupFile C:\BioStock\backups\biostock_2026-07-09_02-00.db

Start-Service BioStock-API
Invoke-RestMethod http://localhost:3000/health
```

Verificar integridad de un backup antes de restaurar:

```powershell
.\Verify-Backup.ps1 -BackupDir C:\BioStock\backups -SqliteExe C:\BioStock\sqlite3.exe
```

---

## Escenario 3 — Una actualización quedó mal

El update por ZIP deja `C:\BioStock\rollback_<fecha>` con el `.exe`, la DB y los secretos
anteriores (y hace rollback solo si `/health` falló). Rollback manual:

```powershell
Stop-Service BioStock-API
$rb = Get-ChildItem C:\BioStock\rollback_* | Sort-Object Name -Descending | Select-Object -First 1
Copy-Item "$($rb.FullName)\*" C:\BioStock\ -Force
Start-Service BioStock-API
```

---

## Escenario 4 — El PC servidor murió (reemplazo de máquina)

Tiempo objetivo: **< 15 minutos**.

1. En el PC nuevo, ejecuta el mismo `BioStock-Setup-x.y.z.exe`.
2. Detén el servicio: `Stop-Service BioStock-API`.
3. Copia desde el último backup / NAS a `C:\BioStock`:
   - `inventario_biorad.db`
   - `secrets\jwt.secret` (y `master.key` si existía)
4. `Start-Service BioStock-API`.
5. Comunica la nueva IP a los usuarios (o asigna IP estática / reserva DHCP para no
   volver a cambiarla).

> Sin el `jwt.secret` original, la app sigue funcionando pero todos deben volver a
> iniciar sesión (las sesiones viejas dejan de validar). Los datos del inventario están
> intactos si restauraste la DB.

---

## Escenario 5 — Desinstalar y reinstalar limpio

```powershell
# Conserva los datos (default)
cd C:\BioStock\scripts
.\Uninstall-BioStock.ps1

# Borra TODO (irreversible: inventario, usuarios, backups)
.\Uninstall-BioStock.ps1 -PurgeData
```

El desinstalador del Panel de Control (Inno) ejecuta `Uninstall-BioStock.ps1` conservando
los datos.

---

## Backups: verificación periódica

- Manual: `.\Backup-BioStock.ps1 -DestinationPath C:\BioStock\backups`
- A un NAS/red: `.\Backup-BioStock.ps1 -NetworkPath \\NAS\biostock`
- Historial: `Get-Content C:\BioStock\backups\backup.log -Tail 20`

**Regla de oro:** copia periódicamente `C:\BioStock\backups\` y `secrets\jwt.secret` a un
disco/NAS separado. Con esos dos, puedes reconstruir el sistema en cualquier PC.
