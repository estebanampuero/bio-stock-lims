# Empaquetado y Distribución — Documentación Técnica

Cómo se construye y distribuye BIO-STOCK LIMS para Windows. Decisión de arquitectura y
mecánica de build.

## Estrategia elegida

**`.exe` autocontenido (pkg) + instalador Inno Setup + servicio Windows (NSSM), publicado
en GitHub Releases con autoactualización.**

### Por qué (resumen)

La app es un **servidor Node monoproceso** que sirve la SPA React y la API `/api/*` en un
puerto, con **SQLite embebida** y acceso **multiusuario por LAN**. No es una app de
escritorio de un usuario. Esto descarta:

- **Electron / Tauri** — empaquetan una ventana de escritorio de 1 usuario; rompen el
  modelo de acceso por IP y (Electron) pesan +300 MB. Ver ADR-002 en `CLAUDE.md`.
- **Docker Desktop / WSL** — exigen un kernel Linux dentro de Windows; violan la
  restricción "Windows puro". (Docker sí se usa, pero solo para el VPS de pruebas cloud.)
- **Streamlit** — no aplica (no es Python).
- **Web autoalojada con Node manual** — obligaría a instalar Node y dependencias en el
  cliente; no es "doble clic".

El `.exe` de pkg ya embebe **Node + build de React + binding SQLite**, así que el cliente
no instala nada. Un proceso = un servicio Windows. SQLite = sin servidor de DB. Todo encaja.

## Cadena de build

```
package.json (version)
      │
      ▼
npm run build          → tsc + vite  → dist/           (SPA estática)
      │
      ▼
npm run build:exe      → scripts/build-exe.cjs
      │                    ├─ descarga binding sqlite3 win32-x64 (napi-v6)
      │                    ├─ pkg  → release/BioStock-LIMS.exe (node18-win-x64)
      │                    ├─ copia node_sqlite3.node, sqlite3.exe, scripts/*.ps1
      │                    └─ escribe release/VERSION.txt, COMO-INSTALAR.txt, Iniciar.bat
      ▼
installer/build-installer.ps1  (Windows)
      │                    ├─ descarga tools/nssm.exe
      │                    ├─ sincroniza scripts/*.ps1 al payload
      │                    └─ ISCC installer/BioStock.iss  → dist-installer/BioStock-Setup-<v>.exe
      ▼
.github/workflows/release.yml  (tag v*)
                           └─ + latest.json (version, url, sha256) → GitHub Release
```

### Cross-compile desde macOS/Linux

`build-exe.cjs` funciona en cualquier SO: descarga el binding Windows de sqlite3 y lo
inyecta antes de correr `pkg --targets node18-win-x64`. El **instalador** (ISCC) sí es
Windows-only → se compila en el runner `windows-latest` del pipeline (o en un PC Windows).

## Piezas y responsabilidades

| Componente | Archivo | Responsabilidad |
|---|---|---|
| Empaquetado del runtime | `scripts/build-exe.cjs`, config `pkg` en `package.json` | `.exe` autocontenido |
| Wizard / instalador | `installer/BioStock.iss` | UX, copia, accesos directos, abrir navegador, update-in-place, desinstalación |
| Build del instalador | `installer/build-installer.ps1` | NSSM + ISCC |
| Integración Windows | `scripts/Install-BioStock.ps1 -InPlace` | Servicio, firewall, backups, Defender, healthcheck |
| Desinstalación | `scripts/Uninstall-BioStock.ps1` | Quitar servicio/firewall/tareas; conservar datos |
| Autoactualización | `scripts/Check-Update.ps1` + `/api/version` + `latest.json` | Comparar semver, descargar, verificar SHA-256, instalar |
| Update offline | `scripts/Update-BioStock.ps1` | ZIP con rollback automático |
| Pipeline | `.github/workflows/release.yml` | Build + release en tag `v*` |
| Gate | `.github/workflows/ci.yml` | build + tests en cada push/PR |

**Fuente única de verdad:** el instalador Inno **no duplica** la lógica de servicio —
delega en `Install-BioStock.ps1 -InPlace`. Cambiar el comportamiento del servicio se hace
en un solo lugar.

## Datos que nunca se sobrescriben en un update

El `.iss` no incluye la DB en `[Files]`; `Update-BioStock.ps1` protege explícitamente:
`inventario_biorad.db(-wal/-shm)`, `jwt.secret`, `master.key`. Las carpetas `data/`,
`secrets/`, `backups/` se crean pero no se tocan si ya existen.

## Variables de entorno del servicio

Todas opcionales (ver `.env.example`). El instalador setea vía NSSM `AppEnvironmentExtra`:
`PORT`, `SECRETS_DIR`, y con TLS: `REQUIRE_TLS=1`, `HTTP_REDIRECT_PORT=80`.

## Riesgos conocidos y planes B

- **`pkg` está archivado (deprecado).** Funciona con node18-win-x64. Plan B: migrar a
  **Node.js SEA** (Single Executable Applications, nativo desde Node 20) o empaquetar un
  runtime Node portable + `server.cjs`. El resto de la cadena (Inno, servicio, pipeline)
  no cambia; solo se reemplaza el paso que produce `release/BioStock-LIMS.exe`.
- **Binding nativo SQLite:** `node_sqlite3.node` debe viajar junto al `.exe`. El instalador
  garantiza que estén juntos; nunca separarlos manualmente.
- **SmartScreen:** el `Setup.exe` no está firmado. Ver "Firma de código" abajo.

## Firma de código (punto de extensión, opcional)

Para eliminar el aviso "Editor desconocido":

1. Consigue un certificado de firma de código (OV o EV; EV evita el warming period de
   reputación de SmartScreen).
2. Firma el `.exe` de la app y el `Setup.exe`:
   ```powershell
   signtool sign /fd SHA256 /tr http://timestamp.digicert.com /td SHA256 /f cert.pfx /p <pass> `
     release\BioStock-LIMS.exe dist-installer\BioStock-Setup-<v>.exe
   ```
3. En el pipeline, añade un step de firma tras `build:exe` y tras `build-installer.ps1`,
   con el `.pfx` en un secreto de GitHub. Inno también soporta `SignTool` nativo vía
   directivas `[Setup] SignTool=`.

## Comandos rápidos

```bash
npm run build:exe                 # release/  (cualquier SO)
```
```powershell
.\installer\build-installer.ps1   # dist-installer/BioStock-Setup-<v>.exe  (Windows)
```
```bash
git tag v1.3.0 && git push origin v1.3.0   # dispara el release en CI
```
