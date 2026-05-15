/**
 * build-exe.cjs — Empaqueta BIO-STOCK LIMS en un .exe portable para Windows x64
 *
 * Funciona cross-platform: puedes ejecutarlo desde macOS, Linux o Windows.
 *
 * Uso:
 *   npm run build:exe
 *
 * Produce en ./release/:
 *   BioStock-LIMS.exe     — Servidor Node.js + React empaquetado (~50–80 MB)
 *   node_sqlite3.node     — Binding nativo Windows x64 (necesario junto al .exe)
 *   Iniciar.bat           — Lanzador con doble clic
 *   COMO-INSTALAR.txt     — Manual para personal de IT del hospital
 */

"use strict";

const fs           = require("fs");
const path         = require("path");
const https        = require("https");
const { spawnSync, execSync } = require("child_process");

const ROOT     = path.resolve(__dirname, "..");
const RELEASE  = path.join(ROOT, "release");
const DIST     = path.join(ROOT, "dist");
const TMP      = path.join(ROOT, ".tmp-exe-build");

const SQLITE3_VERSION = require(path.join(ROOT, "node_modules/sqlite3/package.json")).version;
const NODE_API        = 6;                          // sqlite3 v6 usa Node-API v6
const WIN_TARBALL_URL = `https://github.com/TryGhost/node-sqlite3/releases/download/v${SQLITE3_VERSION}/sqlite3-v${SQLITE3_VERSION}-napi-v${NODE_API}-win32-x64.tar.gz`;

// ── 0. Banner ─────────────────────────────────────────────────────────────────

console.log(`
╔════════════════════════════════════════════════════════════════╗
║          BIO-STOCK LIMS — Build ejecutable Windows x64         ║
║          Cross-compile desde ${process.platform.padEnd(11)} → win32-x64       ║
╚════════════════════════════════════════════════════════════════╝
`);

// ── 1. Verificaciones previas ─────────────────────────────────────────────────

if (!fs.existsSync(DIST)) {
  console.error("❌ No existe dist/. Ejecuta primero: npm run build");
  process.exit(1);
}

if (!fs.existsSync(path.join(ROOT, "node_modules/pkg"))) {
  console.error("❌ pkg no instalado. Ejecuta: npm install");
  process.exit(1);
}

// ── 2. Preparar carpetas ──────────────────────────────────────────────────────

fs.mkdirSync(RELEASE, { recursive: true });
fs.mkdirSync(TMP,     { recursive: true });

// ── 3. Descargar el binding Windows de sqlite3 ────────────────────────────────

const tarPath  = path.join(TMP, "sqlite3-win.tar.gz");
const winNode  = path.join(TMP, "node_sqlite3.node");

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const req = (u) => https.get(u, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode)) {
        res.resume();
        return req(res.headers.location);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode} para ${u}`));
      }
      const file = fs.createWriteStream(dest);
      res.pipe(file);
      file.on("finish", () => file.close(resolve));
      file.on("error", reject);
    }).on("error", reject);
    req(url);
  });
}

(async () => {
  console.log(`📥 Descargando binding Windows de sqlite3 v${SQLITE3_VERSION}...`);
  console.log(`   ${WIN_TARBALL_URL}`);
  try {
    await download(WIN_TARBALL_URL, tarPath);
  } catch (e) {
    console.error("❌ No se pudo descargar:", e.message);
    console.error("\nDescargar manualmente y colocar en:");
    console.error(`   ${tarPath}`);
    process.exit(1);
  }
  console.log("✅ Tarball descargado\n");

  // ── 4. Extraer node_sqlite3.node ────────────────────────────────────────────
  console.log("📦 Extrayendo binding nativo...");
  execSync(`tar -xzf "${tarPath}" -C "${TMP}"`, { stdio: "inherit" });

  // El .node puede estar en distintas ubicaciones según la versión
  const candidatos = [
    path.join(TMP, "build/Release/node_sqlite3.node"),
    path.join(TMP, "build/Release/napi-v6-win32-x64/node_sqlite3.node"),
    path.join(TMP, "lib/binding/napi-v6-win32-x64/node_sqlite3.node"),
    path.join(TMP, "napi-v6-win32-x64/node_sqlite3.node"),
  ];
  const found = candidatos.find(fs.existsSync) ||
                execSync(`find "${TMP}" -name node_sqlite3.node -type f`, { encoding: "utf8" }).trim().split("\n")[0];

  if (!found || !fs.existsSync(found)) {
    console.error("❌ No se encontró node_sqlite3.node en el tarball");
    process.exit(1);
  }
  fs.copyFileSync(found, winNode);
  console.log(`✅ Binding extraído: ${path.relative(ROOT, winNode)}\n`);

  // ── 5. Sustituir temporalmente el binding local por el Windows ─────────────
  //     pkg lee node_modules/sqlite3/build/Release/node_sqlite3.node
  //     y lo incluye en el snapshot del .exe
  const localBindingDir  = path.join(ROOT, "node_modules/sqlite3/build/Release");
  const localBindingFile = path.join(localBindingDir, "node_sqlite3.node");
  const backupBinding    = path.join(TMP, "node_sqlite3.local.node.bak");

  if (!fs.existsSync(localBindingDir)) fs.mkdirSync(localBindingDir, { recursive: true });
  if (fs.existsSync(localBindingFile)) {
    fs.copyFileSync(localBindingFile, backupBinding);
    console.log("💾 Binding local respaldado");
  }
  fs.copyFileSync(winNode, localBindingFile);
  console.log("🔄 Binding local reemplazado por Windows x64 (temporal)\n");

  // ── 6. Crear server-launcher.cjs (entry para pkg) ──────────────────────────
  const launcherPath = path.join(ROOT, "server-launcher.cjs");
  fs.writeFileSync(launcherPath, `// Auto-generado por build-exe.cjs — no editar
"use strict";
const path = require("path");

// Cuando corre como .exe, persistir la DB junto al ejecutable, no en C:\\snapshot
if (process.pkg) {
  process.chdir(path.dirname(process.execPath));
}

require("./server.cjs");
`);

  // ── 7. Empaquetar con pkg ──────────────────────────────────────────────────
  console.log("🔨 Empaquetando con pkg (esto descarga el runtime Node 18 la 1ª vez)...\n");

  const exeOut = path.join(RELEASE, "BioStock-LIMS.exe");
  const pkgBin = path.join(ROOT, "node_modules/.bin/pkg");

  const pkgRes = spawnSync(pkgBin, [
    "server-launcher.cjs",
    "--targets", "node18-win-x64",
    "--output",  exeOut,
    "--compress", "GZip",
    "--public",
  ], { cwd: ROOT, stdio: "inherit" });

  // ── 8. Restaurar el binding macOS/Linux original ────────────────────────────
  if (fs.existsSync(backupBinding)) {
    fs.copyFileSync(backupBinding, localBindingFile);
    console.log("\n🔁 Binding local restaurado");
  }
  try { fs.unlinkSync(launcherPath); } catch (_) {}

  if (pkgRes.status !== 0) {
    console.error("\n❌ pkg falló");
    process.exit(1);
  }

  if (!fs.existsSync(exeOut)) {
    console.error("\n❌ No se generó el .exe");
    process.exit(1);
  }

  // ── 9. Copiar archivos de acompañamiento ────────────────────────────────────
  fs.copyFileSync(winNode, path.join(RELEASE, "node_sqlite3.node"));

  // .bat lanzador (doble clic en Windows)
  fs.writeFileSync(path.join(RELEASE, "Iniciar.bat"),
`@echo off
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
`);

  // Manual de instalación
  fs.writeFileSync(path.join(RELEASE, "COMO-INSTALAR.txt"),
`BIO-STOCK LIMS — Instrucciones de Instalacion
=============================================

CONTENIDO DE ESTA CARPETA:
  BioStock-LIMS.exe     -> Servidor (Node.js + React + SQLite incluidos)
  node_sqlite3.node     -> Modulo SQLite (NO mover, mantener junto al .exe)
  Iniciar.bat           -> Lanzador con doble clic
  COMO-INSTALAR.txt     -> Este archivo

REQUISITOS:
  - Windows 10 o Windows 11 (64 bits)
  - NO requiere instalar Node.js, Python ni nada mas
  - Puerto 3000 disponible

PRIMERA EJECUCION:
  1. Copiar la carpeta completa a C:\\BioStock\\
  2. Doble clic en "Iniciar.bat"
  3. Abrir navegador en:  http://localhost:3000
  4. Login inicial: usuario "admin", PIN "1234"
  5. Cambiar el PIN del admin desde Personal

ACCESO DESDE OTROS PCs DE LA RED:
  - Reemplazar "localhost" por la IP del servidor
  - Ejemplo: http://192.168.1.100:3000
  - Si Windows Firewall bloquea, permitir entrada en puerto 3000:
       New-NetFirewallRule -DisplayName "BioStock" -Direction Inbound \`
         -LocalPort 3000 -Protocol TCP -Action Allow

EJECUTAR COMO SERVICIO WINDOWS (auto-start al encender el PC):
  - Descargar NSSM desde https://nssm.cc/download
  - PowerShell como Administrador:
       nssm install BioStock "C:\\BioStock\\BioStock-LIMS.exe"
       nssm set BioStock AppDirectory "C:\\BioStock"
       nssm set BioStock Start SERVICE_AUTO_START
       nssm start BioStock

BASE DE DATOS:
  - Se crea automaticamente en la carpeta del .exe:
       inventario_biorad.db
  - RESPALDAR este archivo diariamente (USB, NAS o carpeta de red)

VERSION: 1.1.0
`);

  // ── 10. Resumen ────────────────────────────────────────────────────────────
  const sizeMB = (fs.statSync(exeOut).size / 1024 / 1024).toFixed(1);
  const bindingMB = (fs.statSync(path.join(RELEASE, "node_sqlite3.node")).size / 1024).toFixed(0);

  // Limpieza opcional del tmp
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (_) {}

  console.log(`
╔════════════════════════════════════════════════════════════════╗
║                    ✅ BUILD COMPLETADO                          ║
╠════════════════════════════════════════════════════════════════╣
║  📁 release/                                                   ║
║     ├── BioStock-LIMS.exe       (${sizeMB.padStart(5)} MB)                  ║
║     ├── node_sqlite3.node       (${bindingMB.padStart(5)} KB)                  ║
║     ├── Iniciar.bat                                            ║
║     └── COMO-INSTALAR.txt                                      ║
║                                                                ║
║  Comprimir la carpeta release/ como ZIP y enviar al hospital.  ║
║  No separar el .exe del .node — deben estar siempre juntos.    ║
╚════════════════════════════════════════════════════════════════╝
`);
})().catch((e) => {
  console.error("\n❌ Error:", e);
  process.exit(1);
});
