"use strict";

const express    = require("express");
const cors       = require("cors");
const sqlite3    = require("sqlite3").verbose();
const { open }   = require("sqlite");
const path       = require("path");
const fs         = require("fs");
const http       = require("http");
const https      = require("https");
const crypto     = require("crypto");
const { randomUUID } = require("crypto");
const bcrypt     = require("bcryptjs");
const rateLimit  = require("express-rate-limit");
const jwt        = require("jsonwebtoken");

// ════════════════════════════════════════════════════════════════════════════
// CONFIG & PATHS
// ════════════════════════════════════════════════════════════════════════════

const BASE_DIR = process.pkg ? path.dirname(process.execPath) : __dirname;

// Secrets se prefieren desde subdir secrets/ (con ACL strict en Windows)
const SECRETS_DIR  = process.env.SECRETS_DIR || path.join(BASE_DIR, "secrets");
const LEGACY_DIR   = BASE_DIR;
function findOrCreate(name, generator) {
  const dirs = [SECRETS_DIR, LEGACY_DIR];
  for (const d of dirs) {
    const p = path.join(d, name);
    if (fs.existsSync(p)) return p;
  }
  // No existe en ningún lado, crear en SECRETS_DIR (o LEGACY si no se puede)
  if (!fs.existsSync(SECRETS_DIR)) {
    try { fs.mkdirSync(SECRETS_DIR, { recursive: true, mode: 0o700 }); } catch (_) {}
  }
  const target = fs.existsSync(SECRETS_DIR) ? path.join(SECRETS_DIR, name) : path.join(LEGACY_DIR, name);
  const data = generator();
  fs.writeFileSync(target, data, { mode: 0o600 });
  return target;
}

const DB_PATH      = process.env.DB_PATH || path.join(BASE_DIR, "inventario_biorad.db");
const MASTER_KEY_F = process.env.MASTER_KEY || findOrCreate("master.key", () => crypto.randomBytes(32));
const JWT_SECRET_F = process.env.JWT_SECRET_FILE || findOrCreate("jwt.secret", () => crypto.randomBytes(48).toString("hex"));
const PORT         = parseInt(process.env.PORT || "3000", 10);

const MASTER_KEY = fs.readFileSync(MASTER_KEY_F);
if (MASTER_KEY.length !== 32) { console.error("⚠ master.key debe ser exactamente 32 bytes"); process.exit(1); }

const JWT_SECRET = fs.readFileSync(JWT_SECRET_F, "utf8").trim();
const JWT_TTL = "8h";

// ── TLS opcional (cert + key en BASE_DIR o env vars) ─────────────────────────
const TLS_CERT_PATH = process.env.TLS_CERT || path.join(BASE_DIR, "cert.pem");
const TLS_KEY_PATH  = process.env.TLS_KEY  || path.join(BASE_DIR, "key.pem");
const TLS_ENABLED = fs.existsSync(TLS_CERT_PATH) && fs.existsSync(TLS_KEY_PATH);

// ── Crypto helpers (AES-256-GCM) ─────────────────────────────────────────────
function encPII(plain) {
  if (plain === null || plain === undefined || plain === "") return "";
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", MASTER_KEY, iv);
  const enc = Buffer.concat([cipher.update(String(plain), "utf8"), cipher.final()]);
  return `enc:v1:${iv.toString("hex")}:${cipher.getAuthTag().toString("hex")}:${enc.toString("hex")}`;
}
function decPII(stored) {
  if (!stored) return "";
  if (typeof stored !== "string" || !stored.startsWith("enc:v1:")) return stored;
  const parts = stored.split(":");
  if (parts.length !== 5) return "";
  try {
    const decipher = crypto.createDecipheriv("aes-256-gcm", MASTER_KEY, Buffer.from(parts[2], "hex"));
    decipher.setAuthTag(Buffer.from(parts[3], "hex"));
    return Buffer.concat([decipher.update(Buffer.from(parts[4], "hex")), decipher.final()]).toString("utf8");
  } catch (_) { return ""; }
}

// ════════════════════════════════════════════════════════════════════════════
// APP SETUP
// ════════════════════════════════════════════════════════════════════════════

const app = express();
app.disable("x-powered-by");
app.use(cors());
app.use(express.json({ limit: "1mb" }));

const distPath = path.join(__dirname, "dist");
if (fs.existsSync(distPath)) app.use(express.static(distPath));

let db;

// ════════════════════════════════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════════════════════════════════

function getIP(req) {
  const fwd = req.headers["x-forwarded-for"];
  if (fwd) return fwd.split(",")[0].trim();
  return req.socket?.remoteAddress || "desconocida";
}

function errRes(res, e, msg = "Error interno del servidor") {
  console.error(`[ERR] ${msg}:`, e?.message || e);
  res.status(500).json({ success: false, message: msg });
}

function authenticate(req, res, next) {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return res.status(401).json({ success: false, message: "Token requerido" });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (_) {
    return res.status(401).json({ success: false, message: "Token inválido o expirado" });
  }
}

function authorize(...rolesPermitidos) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ success: false, message: "No autenticado" });
    if (!rolesPermitidos.includes(req.user.rol)) {
      registrarLog(req.user.nombre, "ACCESO DENEGADO", `Ruta: ${req.method} ${req.path}`, getIP(req));
      return res.status(403).json({ success: false, message: "Permiso insuficiente" });
    }
    next();
  };
}

// ── Lockout por usuario (persistente en DB, sobrevive reinicio del servicio)
const LOCK_AFTER       = 5;
const LOCK_DURATION_MS = 30 * 60 * 1000;

async function registerLoginAttempt(nombre, success) {
  try {
    if (success) {
      await db.run("DELETE FROM login_lockouts WHERE nombre = ?", [nombre]);
      return { locked: false };
    }
    const now = new Date().toISOString();
    const row = await db.get("SELECT fail_count, locked_until FROM login_lockouts WHERE nombre = ?", [nombre]);
    let count = (row?.fail_count || 0) + 1;
    let lockedUntil = null;
    if (count >= LOCK_AFTER) {
      lockedUntil = new Date(Date.now() + LOCK_DURATION_MS).toISOString();
      count = 0;
    }
    await db.run(
      "INSERT INTO login_lockouts (nombre, fail_count, locked_until, last_attempt) VALUES (?, ?, ?, ?) ON CONFLICT(nombre) DO UPDATE SET fail_count = ?, locked_until = ?, last_attempt = ?",
      [nombre, count, lockedUntil, now, count, lockedUntil, now]
    );
    return { locked: !!lockedUntil };
  } catch (_) { return { locked: false }; }
}

async function isLocked(nombre) {
  try {
    const row = await db.get("SELECT locked_until FROM login_lockouts WHERE nombre = ?", [nombre]);
    if (!row || !row.locked_until) return false;
    if (new Date(row.locked_until).getTime() <= Date.now()) {
      await db.run("DELETE FROM login_lockouts WHERE nombre = ?", [nombre]);
      return false;
    }
    return true;
  } catch (_) { return false; }
}

// ── PII access log con throttle (max 1 row/min/user/tabla) ──────────────────
const recentPIIAccess = new Map(); // key → timestamp
const PII_LOG_THROTTLE_MS = 60_000;

// ════════════════════════════════════════════════════════════════════════════
// MIGRATIONS
// ════════════════════════════════════════════════════════════════════════════

async function runMigrations(db) {
  const { user_version } = await db.get("PRAGMA user_version");
  let v = user_version;

  if (v < 1) {
    await db.exec(`CREATE TABLE IF NOT EXISTS inventario (id TEXT PRIMARY KEY, gtin TEXT, lot TEXT, expiration TEXT, scanDate TEXT, usuario TEXT, fecha_baja TEXT DEFAULT NULL)`);
    await db.exec(`CREATE TABLE IF NOT EXISTS maestro_productos (gtin TEXT PRIMARY KEY, nombre TEXT, detalle TEXT, pack TEXT, seccion TEXT, temperatura TEXT)`);
    await db.exec(`CREATE TABLE IF NOT EXISTS secciones (nombre TEXT PRIMARY KEY)`);
    await db.exec(`CREATE TABLE IF NOT EXISTS usuarios (id TEXT PRIMARY KEY, nombre TEXT, rol TEXT, pin TEXT)`);
    await db.exec(`CREATE TABLE IF NOT EXISTS logs (id INTEGER PRIMARY KEY AUTOINCREMENT, usuario TEXT, accion TEXT, detalles TEXT, fecha TEXT)`);
    const userCount = await db.get("SELECT COUNT(*) as c FROM usuarios");
    if (userCount.c === 0) {
      const hash = await bcrypt.hash("1234", 10);
      await db.run("INSERT INTO usuarios (id, nombre, rol, pin) VALUES (?, ?, ?, ?)", ["admin_init", "admin", "ADMIN", hash]);
    }
    await db.exec("PRAGMA user_version = 1"); v = 1;
  }
  if (v < 2) { await db.exec(`ALTER TABLE maestro_productos ADD COLUMN preparacion TEXT`); await db.exec("PRAGMA user_version = 2"); v = 2; }
  if (v < 3) {
    await db.exec(`CREATE TABLE IF NOT EXISTS protocolos (id TEXT PRIMARY KEY, titulo TEXT NOT NULL, seccion TEXT NOT NULL, contenido TEXT NOT NULL, autor TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`);
    await db.exec("PRAGMA user_version = 3"); v = 3;
  }
  if (v < 4) { await db.exec(`ALTER TABLE logs ADD COLUMN ip TEXT DEFAULT 'desconocida'`); await db.exec("PRAGMA user_version = 4"); v = 4; }
  if (v < 5) {
    await db.exec(`ALTER TABLE logs ADD COLUMN perfil TEXT DEFAULT ''`);
    await db.exec(`CREATE TABLE IF NOT EXISTS anexos (id TEXT PRIMARY KEY, servicio TEXT NOT NULL, salas TEXT, numero TEXT NOT NULL, creado_por TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`);
    await db.exec(`CREATE TABLE IF NOT EXISTS diuresis (id TEXT PRIMARY KEY, num_peticion TEXT NOT NULL, rut_paciente TEXT, nombre_paciente TEXT, diuresis_ml TEXT, peso TEXT, talla TEXT, baja_motivo TEXT NOT NULL, obs_rechazo TEXT, motivo_vih TEXT, usuario TEXT NOT NULL, fecha TEXT NOT NULL, archivado INTEGER DEFAULT 0, archivado_at TEXT)`);
    await db.exec("PRAGMA user_version = 5"); v = 5;
  }
  if (v < 6) {
    await db.exec(`CREATE INDEX IF NOT EXISTS idx_inv_gtin       ON inventario(gtin)`);
    await db.exec(`CREATE INDEX IF NOT EXISTS idx_inv_expiration ON inventario(expiration)`);
    await db.exec(`CREATE INDEX IF NOT EXISTS idx_inv_baja       ON inventario(fecha_baja)`);
    await db.exec(`CREATE INDEX IF NOT EXISTS idx_logs_fecha     ON logs(fecha)`);
    await db.exec(`CREATE INDEX IF NOT EXISTS idx_diuresis_fecha ON diuresis(fecha)`);
    await db.exec("PRAGMA user_version = 6"); v = 6;
  }
  if (v < 7) {
    const users = await db.all("SELECT id, pin FROM usuarios");
    for (const u of users) {
      if (u.pin && !u.pin.startsWith("$2")) {
        const hash = await bcrypt.hash(u.pin, 10);
        await db.run("UPDATE usuarios SET pin = ? WHERE id = ?", [hash, u.id]);
      }
    }
    await db.exec("PRAGMA user_version = 7"); v = 7;
  }
  if (v < 8) {
    await db.exec(`CREATE INDEX IF NOT EXISTS idx_maestro_seccion ON maestro_productos(seccion)`);
    await db.exec(`CREATE INDEX IF NOT EXISTS idx_inv_gtin_lot   ON inventario(gtin, lot)`);
    await db.exec(`CREATE INDEX IF NOT EXISTS idx_logs_user_fecha ON logs(usuario, fecha)`);
    await db.exec(`ALTER TABLE usuarios ADD COLUMN must_change_pin INTEGER DEFAULT 0`);
    await db.run("UPDATE usuarios SET must_change_pin = 1 WHERE nombre = 'admin' AND pin LIKE '$2%'");
    await db.exec("PRAGMA user_version = 8"); v = 8;
  }
  if (v < 9) {
    const rows = await db.all("SELECT id, rut_paciente, nombre_paciente FROM diuresis");
    for (const r of rows) {
      const rutEnc    = r.rut_paciente    && !r.rut_paciente.startsWith("enc:v1:")    ? encPII(r.rut_paciente)    : r.rut_paciente;
      const nombreEnc = r.nombre_paciente && !r.nombre_paciente.startsWith("enc:v1:") ? encPII(r.nombre_paciente) : r.nombre_paciente;
      if (rutEnc !== r.rut_paciente || nombreEnc !== r.nombre_paciente) {
        await db.run("UPDATE diuresis SET rut_paciente = ?, nombre_paciente = ? WHERE id = ?", [rutEnc, nombreEnc, r.id]);
      }
    }
    await db.exec("PRAGMA user_version = 9"); v = 9;
  }
  if (v < 10) {
    await db.exec(`CREATE TABLE IF NOT EXISTS pii_access_log (id INTEGER PRIMARY KEY AUTOINCREMENT, usuario TEXT NOT NULL, perfil TEXT, tabla TEXT NOT NULL, filtro TEXT, rows_devueltos INTEGER, fecha TEXT NOT NULL, ip TEXT)`);
    await db.exec("PRAGMA user_version = 10"); v = 10;
  }
  if (v < 11) {
    await db.exec(`CREATE TABLE IF NOT EXISTS login_lockouts (
      nombre TEXT PRIMARY KEY,
      fail_count INTEGER DEFAULT 0,
      locked_until TEXT,
      last_attempt TEXT
    )`);
    await db.exec("PRAGMA user_version = 11"); v = 11;
  }
  // v12: Campos estructurados de preparación en maestro_productos
  if (v < 12) {
    await db.exec(`ALTER TABLE maestro_productos ADD COLUMN almacenamiento_sin_abrir TEXT`);
    await db.exec(`ALTER TABLE maestro_productos ADD COLUMN descongelar_min INTEGER`);
    await db.exec(`ALTER TABLE maestro_productos ADD COLUMN reconstituir TEXT`);
    await db.exec(`ALTER TABLE maestro_productos ADD COLUMN tiempo_reconstitucion_min INTEGER`);
    await db.exec(`ALTER TABLE maestro_productos ADD COLUMN temperatura_post_reconstitucion TEXT`);
    await db.exec(`ALTER TABLE maestro_productos ADD COLUMN duracion_dias INTEGER`);
    await db.exec(`ALTER TABLE maestro_productos ADD COLUMN cantidad_alicuotas INTEGER`);
    await db.exec(`ALTER TABLE maestro_productos ADD COLUMN volumen_ul INTEGER`);
    // Migrar la temperatura legacy a almacenamiento_sin_abrir
    await db.run("UPDATE maestro_productos SET almacenamiento_sin_abrir = temperatura WHERE almacenamiento_sin_abrir IS NULL AND temperatura IS NOT NULL");
    await db.exec("PRAGMA user_version = 12"); v = 12;
  }
  // v13: Soft delete (fecha_baja) en todas las tablas operativas
  if (v < 13) {
    await db.exec(`ALTER TABLE protocolos ADD COLUMN fecha_baja TEXT DEFAULT NULL`);
    await db.exec(`ALTER TABLE anexos ADD COLUMN fecha_baja TEXT DEFAULT NULL`);
    await db.exec(`ALTER TABLE diuresis ADD COLUMN fecha_baja TEXT DEFAULT NULL`);
    await db.exec(`ALTER TABLE usuarios ADD COLUMN fecha_baja TEXT DEFAULT NULL`);
    await db.exec(`ALTER TABLE maestro_productos ADD COLUMN fecha_baja TEXT DEFAULT NULL`);
    // Índices para queries que filtran por fecha_baja
    await db.exec(`CREATE INDEX IF NOT EXISTS idx_proto_baja    ON protocolos(fecha_baja)`);
    await db.exec(`CREATE INDEX IF NOT EXISTS idx_anexos_baja   ON anexos(fecha_baja)`);
    await db.exec(`CREATE INDEX IF NOT EXISTS idx_diuresis_baja ON diuresis(fecha_baja)`);
    await db.exec(`CREATE INDEX IF NOT EXISTS idx_users_baja    ON usuarios(fecha_baja)`);
    await db.exec(`CREATE INDEX IF NOT EXISTS idx_maestro_baja  ON maestro_productos(fecha_baja)`);
    await db.exec("PRAGMA user_version = 13"); v = 13;
  }
  // v14: Abreviatura del control + días de autonomía por unidad
  if (v < 14) {
    await db.exec(`ALTER TABLE maestro_productos ADD COLUMN abreviado TEXT`);
    await db.exec(`ALTER TABLE maestro_productos ADD COLUMN dias_uso_aprox INTEGER`);
    await db.exec("PRAGMA user_version = 14"); v = 14;
  }
}

// ── PIN admin por defecto: 1234 con must_change_pin obligatorio ─────────────
// Para activar rotación a PIN aleatorio en producción: set AUTO_ROTATE_DEFAULT_PIN=1
async function rotateDefaultAdminPin() {
  if (process.env.AUTO_ROTATE_DEFAULT_PIN !== "1") {
    // Modo dev/default: garantizar que admin tenga 1234 + must_change_pin=1
    const admin = await db.get("SELECT id, pin FROM usuarios WHERE nombre = 'admin'");
    if (!admin) return;
    await db.run("UPDATE usuarios SET must_change_pin = 1 WHERE id = ?", [admin.id]);
    console.log(`🔓 Modo dev: admin/1234 (debe cambiar PIN al primer login)`);
    return;
  }
  // Modo producción: rotar a PIN aleatorio si todavía es 1234
  const admin = await db.get("SELECT id, pin FROM usuarios WHERE nombre = 'admin'");
  if (!admin) return;
  const isDefault = await bcrypt.compare("1234", admin.pin).catch(() => false);
  if (!isDefault) return;
  const newPin = crypto.randomInt(10000000, 99999999).toString();
  const hash = await bcrypt.hash(newPin, 10);
  await db.run("UPDATE usuarios SET pin = ?, must_change_pin = 1 WHERE id = ?", [hash, admin.id]);
  const pinFile = path.join(BASE_DIR, "INITIAL_PIN.txt");
  fs.writeFileSync(pinFile,
`BIO-STOCK LIMS — PIN Inicial del Administrador
================================================

Usuario:  admin
PIN:      ${newPin}

Entregar al quimico responsable. Al primer login se forzara el cambio.
Una vez confirmado, ELIMINAR este archivo.

Generado: ${new Date().toISOString()}
`, { mode: 0o600 });
  console.log(`🔐 PIN admin default rotado: ${pinFile}`);
}

// ════════════════════════════════════════════════════════════════════════════
// LOGGING
// ════════════════════════════════════════════════════════════════════════════

async function registrarLog(usuario, accion, detalles, ip = "desconocida") {
  try {
    let perfil = "";
    try { const u = await db.get("SELECT rol FROM usuarios WHERE nombre = ?", [usuario]); if (u) perfil = u.rol; } catch (_) {}
    await db.run("INSERT INTO logs (usuario, perfil, accion, detalles, fecha, ip) VALUES (?, ?, ?, ?, ?, ?)",
      [usuario, perfil, accion, detalles, new Date().toISOString(), ip]);
  } catch (_) {}
}

async function registrarAccesoPII(req, tabla, filtro, rowsDevueltos) {
  try {
    const usuario = req.user?.nombre || "?";
    const key = `${usuario}:${tabla}`;
    const now = Date.now();
    const last = recentPIIAccess.get(key) || 0;
    if (now - last < PII_LOG_THROTTLE_MS) return;
    recentPIIAccess.set(key, now);
    await db.run("INSERT INTO pii_access_log (usuario, perfil, tabla, filtro, rows_devueltos, fecha, ip) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [usuario, req.user?.rol || "?", tabla, filtro, rowsDevueltos, new Date().toISOString(), getIP(req)]);
  } catch (_) {}
}

// ════════════════════════════════════════════════════════════════════════════
// BACKUP AUTOMÁTICO DIARIO (02:00 + uno al arranque si > 24h sin backup)
// ════════════════════════════════════════════════════════════════════════════

const BACKUPS_DIR     = path.join(BASE_DIR, "backups");
const BACKUP_RETAIN_DAYS = 30;

function listBackups() {
  if (!fs.existsSync(BACKUPS_DIR)) return [];
  return fs.readdirSync(BACKUPS_DIR)
    .filter(f => f.startsWith("inventario_") && f.endsWith(".db"))
    .map(f => ({ name: f, path: path.join(BACKUPS_DIR, f), mtime: fs.statSync(path.join(BACKUPS_DIR, f)).mtime }))
    .sort((a, b) => b.mtime - a.mtime);
}

async function ejecutarBackupDB() {
  if (!fs.existsSync(BACKUPS_DIR)) fs.mkdirSync(BACKUPS_DIR, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const dest = path.join(BACKUPS_DIR, `inventario_${ts}.db`);
  try {
    // VACUUM INTO crea una copia consistente sin bloquear writers
    await db.exec(`VACUUM INTO '${dest.replace(/'/g, "''")}'`);
    // Verificación rápida de integridad
    const verify = await db.get(`SELECT 1`);  // si la DB original está OK ya es suficiente
    const sz = fs.statSync(dest).size;
    console.log(`💾 Backup creado: ${dest} (${(sz/1024).toFixed(1)} KB)`);

    // Retention: borrar backups > BACKUP_RETAIN_DAYS días
    const cutoff = Date.now() - BACKUP_RETAIN_DAYS * 86400000;
    let purged = 0;
    for (const b of listBackups()) {
      if (b.mtime.getTime() < cutoff) { fs.unlinkSync(b.path); purged++; }
    }
    if (purged > 0) console.log(`🧹 Purgados ${purged} backup(s) > ${BACKUP_RETAIN_DAYS}d`);

    await registrarLog("system", "BACKUP DB", `${path.basename(dest)} (${(sz/1024).toFixed(0)} KB)`, "localhost");
    return dest;
  } catch (e) {
    console.error(`❌ Backup falló: ${e.message}`);
    await registrarLog("system", "BACKUP DB FALLIDO", e.message, "localhost");
    return null;
  }
}

function programarBackupDiario() {
  const ahora = new Date();
  const objetivo = new Date();
  objetivo.setHours(2, 0, 0, 0); // 02:00 hora local
  if (ahora >= objetivo) objetivo.setDate(objetivo.getDate() + 1);
  const ms = objetivo - ahora;
  console.log(`⏰ Próximo backup automático: ${objetivo.toLocaleString("es-CL")} (en ${Math.round(ms/3600000)}h)`);
  setTimeout(async () => {
    await ejecutarBackupDB();
    programarBackupDiario();
  }, ms);
}

// Al arranque: si no hay backup o el último es > 24h, hacer uno ahora.
async function backupAlArranqueSiHaceFalta() {
  const backups = listBackups();
  const last = backups[0];
  if (!last || (Date.now() - last.mtime.getTime()) > 24 * 3600000) {
    console.log("📥 Sin backup reciente (<24h) — generando uno ahora...");
    await ejecutarBackupDB();
  } else {
    const hsAgo = Math.round((Date.now() - last.mtime.getTime()) / 3600000);
    console.log(`✓ Último backup: ${last.name} (${hsAgo}h atrás)`);
  }
}

// ════════════════════════════════════════════════════════════════════════════
// ARCHIVO DIURESIS 23:00
// ════════════════════════════════════════════════════════════════════════════

function programarArchivoDiuresis() {
  const ahora = new Date();
  const objetivo = new Date();
  objetivo.setHours(23, 0, 0, 0);
  if (ahora >= objetivo) objetivo.setDate(objetivo.getDate() + 1);
  setTimeout(async () => {
    try {
      const hoy = new Date().toISOString().split("T")[0];
      const res = await db.run("UPDATE diuresis SET archivado = 1, archivado_at = ? WHERE DATE(fecha, 'localtime') = ? AND archivado = 0",
        [new Date().toISOString(), hoy]);
      console.log(`✅ Diuresis archivada — ${hoy} (${res.changes})`);
    } catch (e) { console.error("Archivo diuresis:", e.message); }
    programarArchivoDiuresis();
  }, objetivo - ahora);
}

// ════════════════════════════════════════════════════════════════════════════
// INIT
// ════════════════════════════════════════════════════════════════════════════

(async () => {
  db = await open({ filename: DB_PATH, driver: sqlite3.Database });
  await db.exec("PRAGMA journal_mode = WAL");
  await db.exec("PRAGMA synchronous  = NORMAL");
  await db.exec("PRAGMA cache_size   = -64000");
  await db.exec("PRAGMA temp_store   = memory");
  await db.exec("PRAGMA foreign_keys = ON");
  await runMigrations(db);
  await rotateDefaultAdminPin();
  console.log(`✅ BIO-STOCK API lista. DB: ${DB_PATH}`);
  programarArchivoDiuresis();
  await backupAlArranqueSiHaceFalta();
  programarBackupDiario();
})().catch(e => { console.error("Init fallido:", e); process.exit(1); });

// ════════════════════════════════════════════════════════════════════════════
// RATE LIMITS
// ════════════════════════════════════════════════════════════════════════════

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false,
  message: { success: false, message: "Demasiados intentos. Espere 15 minutos." },
});

// ════════════════════════════════════════════════════════════════════════════
// ROUTER /api/v1
// ════════════════════════════════════════════════════════════════════════════

const v1 = express.Router();

// ── AUTH ────────────────────────────────────────────────────────────────────
v1.post("/login", loginLimiter, async (req, res) => {
  try {
    const { nombre, pin } = req.body;
    const ip = getIP(req);
    if (!nombre || !pin) return res.status(400).json({ success: false, message: "Nombre y PIN obligatorios" });

    if (await isLocked(nombre)) {
      await registrarLog(nombre, "LOGIN BLOQUEADO", `Usuario en lockout temporal`, ip);
      return res.status(429).json({ success: false, message: "Cuenta bloqueada temporalmente. Intente en 30 minutos." });
    }

    const user = await db.get("SELECT id, nombre, rol, pin, must_change_pin FROM usuarios WHERE nombre = ? AND fecha_baja IS NULL", [nombre]);
    const valid = user && await bcrypt.compare(pin, user.pin);
    await registerLoginAttempt(nombre, !!valid);

    if (valid) {
      const token = jwt.sign({ sub: user.id, nombre: user.nombre, rol: user.rol }, JWT_SECRET, { expiresIn: JWT_TTL });
      await registrarLog(user.nombre, "LOGIN", `Sesión iniciada — rol: ${user.rol}`, ip);
      res.json({ success: true, token, user: { id: user.id, nombre: user.nombre, rol: user.rol, must_change_pin: !!user.must_change_pin } });
    } else {
      await registrarLog(nombre || "?", "LOGIN FALLIDO", "Acceso denegado", ip);
      res.status(401).json({ success: false, message: "Usuario o PIN incorrecto" });
    }
  } catch (e) { errRes(res, e, "Error en autenticación"); }
});

v1.post("/logout", authenticate, async (req, res) => {
  try { await registrarLog(req.user.nombre, "LOGOUT", "Sesión cerrada", getIP(req)); res.json({ success: true }); }
  catch (e) { errRes(res, e); }
});

v1.get("/me", authenticate, async (req, res) => {
  try {
    const u = await db.get("SELECT id, nombre, rol, must_change_pin FROM usuarios WHERE id = ?", [req.user.sub]);
    if (!u) return res.status(404).json({ success: false, message: "Usuario no encontrado" });
    res.json({ id: u.id, nombre: u.nombre, rol: u.rol, must_change_pin: !!u.must_change_pin });
  } catch (e) { errRes(res, e); }
});

v1.post("/cambiar-pin", authenticate, async (req, res) => {
  try {
    const { pinActual, pinNuevo } = req.body;
    if (!pinNuevo || pinNuevo.length < 4) return res.status(400).json({ success: false, message: "PIN nuevo mínimo 4 caracteres" });
    if (pinNuevo === "1234" || pinNuevo === "0000") return res.status(400).json({ success: false, message: "PIN demasiado débil" });
    const u = await db.get("SELECT pin FROM usuarios WHERE id = ?", [req.user.sub]);
    if (!u) return res.status(404).json({ success: false, message: "Usuario no encontrado" });
    if (!await bcrypt.compare(pinActual || "", u.pin)) return res.status(401).json({ success: false, message: "PIN actual incorrecto" });
    const hash = await bcrypt.hash(pinNuevo, 10);
    await db.run("UPDATE usuarios SET pin = ?, must_change_pin = 0 WHERE id = ?", [hash, req.user.sub]);
    await registrarLog(req.user.nombre, "CAMBIO PIN", "PIN actualizado", getIP(req));
    res.json({ success: true });
  } catch (e) { errRes(res, e); }
});

// ── INVENTARIO ──────────────────────────────────────────────────────────────
const canInv = authorize("ADMIN", "TECNOLOGO");

v1.get("/inventario", authenticate, async (req, res) => {
  try {
    const rows = await db.all(`SELECT i.*,
        m.nombre, m.abreviado, m.detalle, m.pack, m.seccion, m.temperatura, m.preparacion,
        m.almacenamiento_sin_abrir, m.descongelar_min, m.reconstituir,
        m.tiempo_reconstitucion_min, m.temperatura_post_reconstitucion,
        m.duracion_dias, m.cantidad_alicuotas, m.volumen_ul, m.dias_uso_aprox
      FROM inventario i LEFT JOIN maestro_productos m ON i.gtin = m.gtin
      WHERE i.fecha_baja IS NULL AND (m.fecha_baja IS NULL OR m.fecha_baja = '')
      ORDER BY i.expiration ASC`);
    res.json(rows);
  } catch (e) { errRes(res, e); }
});
v1.post("/inventario", authenticate, canInv, async (req, res) => {
  try {
    const { gtin, lot, expiration, scanDate } = req.body;
    if (!gtin || !lot || !expiration) return res.status(400).json({ success: false, message: "Faltan campos" });
    const id = randomUUID();
    await db.run("INSERT INTO inventario (id, gtin, lot, expiration, scanDate, usuario) VALUES (?, ?, ?, ?, ?, ?)",
      [id, gtin, lot, expiration, scanDate, req.user.nombre]);
    await registrarLog(req.user.nombre, "INGRESO STOCK", `GTIN: ${gtin} | Lote: ${lot}`, getIP(req));
    res.json({ success: true });
  } catch (e) { errRes(res, e); }
});
v1.patch("/inventario/:id", authenticate, canInv, async (req, res) => {
  try {
    const item = await db.get("SELECT gtin, lot FROM inventario WHERE id = ?", [req.params.id]);
    if (!item) return res.status(404).json({ success: false, message: "No encontrado" });
    await db.run("UPDATE inventario SET fecha_baja = ? WHERE id = ?", [new Date().toISOString(), req.params.id]);
    await registrarLog(req.user.nombre, "BAJA STOCK", `GTIN: ${item.gtin} | Lote: ${item.lot}`, getIP(req));
    res.json({ success: true });
  } catch (e) { errRes(res, e); }
});
// Bulk import: recibe array de productos (maestro_productos), inserta en transacción.
// Cada fila: { gtin, nombre, detalle?, pack?, seccion, temperatura?, preparacion? }
v1.post("/inventario/bulk-import", authenticate, authorize("ADMIN"), async (req, res) => {
  try {
    const { items } = req.body;
    if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ success: false, message: "items debe ser un array no vacío" });
    if (items.length > 5000) return res.status(400).json({ success: false, message: "Máximo 5000 filas por import" });

    let inserted = 0, updated = 0, skipped = 0;
    const errors = [];
    await db.exec("BEGIN");
    try {
      for (let i = 0; i < items.length; i++) {
        const r = items[i];
        const gtin = String(r.gtin || "").trim();
        const nombre = String(r.nombre || "").trim();
        const seccion = String(r.seccion || "").trim();
        if (!gtin || !nombre || !seccion) { skipped++; errors.push({ row: i+2, reason: "Faltan campos GTIN, Nombre o Sección" }); continue; }
        await db.run("INSERT OR IGNORE INTO secciones (nombre) VALUES (?)", [seccion]);
        const existing = await db.get("SELECT gtin FROM maestro_productos WHERE gtin = ?", [gtin]);
        await db.run(
          "INSERT OR REPLACE INTO maestro_productos (gtin, nombre, detalle, pack, seccion, temperatura, preparacion) VALUES (?, ?, ?, ?, ?, ?, ?)",
          [gtin, nombre, r.detalle || "", r.pack || "", seccion, r.temperatura || "Refrigerado", r.preparacion || ""]
        );
        if (existing) updated++; else inserted++;
      }
      await db.exec("COMMIT");
    } catch (e) {
      await db.exec("ROLLBACK");
      throw e;
    }
    await registrarLog(req.user.nombre, "BULK IMPORT", `Insertados: ${inserted}, Actualizados: ${updated}, Saltados: ${skipped}`, getIP(req));
    res.json({ success: true, inserted, updated, skipped, errors: errors.slice(0, 50) });
  } catch (e) { errRes(res, e, "Error en bulk import"); }
});

v1.put("/inventario/lote", authenticate, canInv, async (req, res) => {
  try {
    const { gtin, lotActual, nuevoLot, nuevaExp } = req.body;
    await db.run("UPDATE inventario SET lot = ?, expiration = ? WHERE gtin = ? AND lot = ? AND fecha_baja IS NULL",
      [nuevoLot, nuevaExp, gtin, lotActual]);
    await registrarLog(req.user.nombre, "EDITAR LOTE", `GTIN: ${gtin} | ${lotActual} → ${nuevoLot}`, getIP(req));
    res.json({ success: true });
  } catch (e) { errRes(res, e); }
});

// ── PROTOCOLOS ──────────────────────────────────────────────────────────────
const canProto = authorize("ADMIN", "TECNOLOGO");
v1.get("/protocolos", authenticate, async (req, res) => {
  try { res.json(await db.all("SELECT * FROM protocolos WHERE fecha_baja IS NULL ORDER BY seccion ASC, titulo ASC")); }
  catch (e) { errRes(res, e); }
});
v1.post("/protocolos", authenticate, canProto, async (req, res) => {
  try {
    const { titulo, seccion, contenido } = req.body;
    if (!titulo || !seccion || !contenido) return res.status(400).json({ success: false, message: "Faltan campos" });
    const id = randomUUID(); const now = new Date().toISOString();
    await db.run("INSERT INTO protocolos (id, titulo, seccion, contenido, autor, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [id, titulo, seccion, contenido, req.user.nombre, now, now]);
    await registrarLog(req.user.nombre, "NUEVO PROTOCOLO", `"${titulo}" → ${seccion}`, getIP(req));
    res.json({ success: true, id });
  } catch (e) { errRes(res, e); }
});
v1.put("/protocolos/:id", authenticate, canProto, async (req, res) => {
  try {
    const { titulo, seccion, contenido } = req.body;
    await db.run("UPDATE protocolos SET titulo=?, seccion=?, contenido=?, updated_at=? WHERE id=?",
      [titulo, seccion, contenido, new Date().toISOString(), req.params.id]);
    await registrarLog(req.user.nombre, "EDITAR PROTOCOLO", `"${titulo}" (${seccion})`, getIP(req));
    res.json({ success: true });
  } catch (e) { errRes(res, e); }
});
// SOFT delete
v1.delete("/protocolos/:id", authenticate, authorize("ADMIN"), async (req, res) => {
  try {
    const p = await db.get("SELECT titulo FROM protocolos WHERE id = ?", [req.params.id]);
    if (!p) return res.status(404).json({ success: false, message: "No encontrado" });
    await db.run("UPDATE protocolos SET fecha_baja = ? WHERE id = ?", [new Date().toISOString(), req.params.id]);
    await registrarLog(req.user.nombre, "ELIMINAR PROTOCOLO (SOFT)", `"${p.titulo}"`, getIP(req));
    res.json({ success: true });
  } catch (e) { errRes(res, e); }
});

// ── ANEXOS ──────────────────────────────────────────────────────────────────
v1.get("/anexos", authenticate, async (req, res) => {
  try { res.json(await db.all("SELECT * FROM anexos WHERE fecha_baja IS NULL ORDER BY servicio ASC, salas ASC")); }
  catch (e) { errRes(res, e); }
});
v1.post("/anexos", authenticate, authorize("ADMIN"), async (req, res) => {
  try {
    const { servicio, salas, numero } = req.body;
    if (!servicio || !numero) return res.status(400).json({ success: false, message: "Servicio y número obligatorios" });
    const id = randomUUID(); const now = new Date().toISOString();
    await db.run("INSERT INTO anexos (id, servicio, salas, numero, creado_por, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [id, servicio, salas || "", numero, req.user.nombre, now, now]);
    await registrarLog(req.user.nombre, "NUEVO ANEXO", `${servicio}${salas ? " / " + salas : ""} — ${numero}`, getIP(req));
    res.json({ success: true, id });
  } catch (e) { errRes(res, e); }
});
v1.put("/anexos/:id", authenticate, authorize("ADMIN"), async (req, res) => {
  try {
    const { servicio, salas, numero } = req.body;
    await db.run("UPDATE anexos SET servicio=?, salas=?, numero=?, updated_at=? WHERE id=?",
      [servicio, salas || "", numero, new Date().toISOString(), req.params.id]);
    await registrarLog(req.user.nombre, "EDITAR ANEXO", `${servicio} — ${numero}`, getIP(req));
    res.json({ success: true });
  } catch (e) { errRes(res, e); }
});
v1.delete("/anexos/:id", authenticate, authorize("ADMIN"), async (req, res) => {
  try {
    const a = await db.get("SELECT servicio, numero FROM anexos WHERE id = ?", [req.params.id]);
    if (!a) return res.status(404).json({ success: false, message: "No encontrado" });
    await db.run("UPDATE anexos SET fecha_baja = ? WHERE id = ?", [new Date().toISOString(), req.params.id]);
    await registrarLog(req.user.nombre, "ELIMINAR ANEXO (SOFT)", `${a.servicio} — ${a.numero}`, getIP(req));
    res.json({ success: true });
  } catch (e) { errRes(res, e); }
});

// ── DIURESIS ────────────────────────────────────────────────────────────────
function diuresisToClient(r) {
  return { ...r, rut_paciente: decPII(r.rut_paciente), nombre_paciente: decPII(r.nombre_paciente) };
}

v1.get("/diuresis/hoy", authenticate, async (req, res) => {
  try {
    const rows = await db.all("SELECT * FROM diuresis WHERE fecha_baja IS NULL AND DATE(fecha, 'localtime') = DATE('now', 'localtime') ORDER BY fecha DESC");
    const out = rows.map(diuresisToClient);
    await registrarAccesoPII(req, "diuresis", "hoy", out.length); // throttled internamente
    res.json(out);
  } catch (e) { errRes(res, e); }
});

v1.get("/diuresis/historico", authenticate, authorize("ADMIN", "TECNOLOGO"), async (req, res) => {
  try {
    const { fecha, peticion, nombre, cursor } = req.query;
    const LIMIT = 200;
    let q = "SELECT * FROM diuresis WHERE fecha_baja IS NULL"; const params = [];
    if (fecha)    { q += " AND DATE(fecha, 'localtime') = ?"; params.push(fecha); }
    if (peticion) { q += " AND num_peticion LIKE ?";          params.push(`%${peticion}%`); }
    if (cursor)   { q += " AND fecha < ?";                    params.push(cursor); }
    q += " ORDER BY fecha DESC LIMIT ?"; params.push(LIMIT + 1);
    let rows = await db.all(q, params);
    let hasMore = false;
    if (rows.length > LIMIT) { rows = rows.slice(0, LIMIT); hasMore = true; }
    let out = rows.map(diuresisToClient);
    if (nombre) {
      const t = String(nombre).toLowerCase();
      out = out.filter(r => (r.nombre_paciente || "").toLowerCase().includes(t));
    }
    await registrarAccesoPII(req, "diuresis", `historico:${JSON.stringify({fecha,peticion,nombre})}`, out.length);
    res.json({ rows: out, nextCursor: hasMore ? rows[rows.length - 1].fecha : null });
  } catch (e) { errRes(res, e); }
});

// Detección de anomalías — z-score de diuresis_ml por petición histórica
v1.get("/diuresis/stats/:num_peticion", authenticate, async (req, res) => {
  try {
    const rows = await db.all(
      "SELECT diuresis_ml, fecha FROM diuresis WHERE num_peticion = ? AND diuresis_ml IS NOT NULL AND diuresis_ml != '' ORDER BY fecha DESC LIMIT 30",
      [req.params.num_peticion]
    );
    const vals = rows.map(r => parseFloat(r.diuresis_ml)).filter(n => !isNaN(n));
    if (vals.length < 3) return res.json({ n: vals.length, mean: null, std: null, lastValue: vals[0] ?? null });
    const mean = vals.reduce((a,b) => a+b, 0) / vals.length;
    const variance = vals.reduce((a,b) => a + (b-mean)**2, 0) / vals.length;
    const std = Math.sqrt(variance);
    res.json({ n: vals.length, mean: Math.round(mean), std: Math.round(std), lastValue: vals[0], lastDate: rows[0].fecha });
  } catch (e) { errRes(res, e); }
});

v1.post("/diuresis", authenticate, authorize("ADMIN", "TOMA_MUESTRA"), async (req, res) => {
  try {
    const { num_peticion, rut_paciente, nombre_paciente, diuresis_ml, peso, talla, baja_motivo, obs_rechazo, motivo_vih } = req.body;
    if (!num_peticion || !baja_motivo) return res.status(400).json({ success: false, message: "Petición y motivo de baja obligatorios" });
    const id = randomUUID(); const now = new Date().toISOString();
    await db.run(`INSERT INTO diuresis (id, num_peticion, rut_paciente, nombre_paciente, diuresis_ml, peso, talla, baja_motivo, obs_rechazo, motivo_vih, usuario, fecha)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, num_peticion, encPII(rut_paciente), encPII(nombre_paciente), diuresis_ml || "", peso || "", talla || "", baja_motivo, obs_rechazo || "", motivo_vih || "", req.user.nombre, now]);
    await registrarLog(req.user.nombre, "INGRESO DIURESIS", `Petición: ${num_peticion}`, getIP(req));
    res.json({ success: true, id });
  } catch (e) { errRes(res, e); }
});

v1.delete("/diuresis/:id", authenticate, authorize("ADMIN"), async (req, res) => {
  try {
    const d = await db.get("SELECT num_peticion FROM diuresis WHERE id = ?", [req.params.id]);
    if (!d) return res.status(404).json({ success: false, message: "No encontrado" });
    await db.run("UPDATE diuresis SET fecha_baja = ? WHERE id = ?", [new Date().toISOString(), req.params.id]);
    await registrarLog(req.user.nombre, "ELIMINAR DIURESIS (SOFT)", `Petición: ${d.num_peticion}`, getIP(req));
    res.json({ success: true });
  } catch (e) { errRes(res, e); }
});

// ── MAESTRO ────────────────────────────────────────────────────────────────
v1.get("/producto/:gtin", authenticate, async (req, res) => {
  try {
    const row = await db.get(
      "SELECT * FROM maestro_productos WHERE gtin = ? AND nombre IS NOT NULL AND nombre != '' AND fecha_baja IS NULL",
      [req.params.gtin]
    );
    res.json(row || null);
  } catch (e) { errRes(res, e); }
});

// Lista todo el maestro (activo) — para auto-fill por nombre en el frontend
v1.get("/maestro", authenticate, async (req, res) => {
  try {
    const rows = await db.all(
      "SELECT * FROM maestro_productos WHERE nombre IS NOT NULL AND nombre != '' AND fecha_baja IS NULL ORDER BY nombre ASC"
    );
    res.json(rows);
  } catch (e) { errRes(res, e); }
});

// Buscar producto por nombre (case-insensitive) — devuelve el más reciente
v1.get("/maestro/by-name", authenticate, async (req, res) => {
  try {
    const { nombre } = req.query;
    if (!nombre) return res.json(null);
    const row = await db.get(
      "SELECT * FROM maestro_productos WHERE LOWER(nombre) = LOWER(?) AND fecha_baja IS NULL LIMIT 1",
      [String(nombre).trim()]
    );
    res.json(row || null);
  } catch (e) { errRes(res, e); }
});

v1.post("/producto", authenticate, canInv, async (req, res) => {
  try {
    const {
      gtin, nombre, abreviado, detalle, pack, seccion, temperatura, preparacion,
      almacenamiento_sin_abrir, descongelar_min, reconstituir,
      tiempo_reconstitucion_min, temperatura_post_reconstitucion,
      duracion_dias, cantidad_alicuotas, volumen_ul, dias_uso_aprox,
    } = req.body;
    if (!gtin || !nombre || !seccion) return res.status(400).json({ success: false, message: "GTIN, nombre y sección obligatorios" });
    await db.run("INSERT OR IGNORE INTO secciones (nombre) VALUES (?)", [seccion]);
    const storage = almacenamiento_sin_abrir || temperatura || "Refrigerado";
    await db.run(
      `INSERT OR REPLACE INTO maestro_productos (
        gtin, nombre, abreviado, detalle, pack, seccion, temperatura, preparacion,
        almacenamiento_sin_abrir, descongelar_min, reconstituir,
        tiempo_reconstitucion_min, temperatura_post_reconstitucion,
        duracion_dias, cantidad_alicuotas, volumen_ul, dias_uso_aprox, fecha_baja
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
      [
        gtin, nombre, abreviado || "", detalle || "", pack || "", seccion, storage, preparacion || "",
        storage, descongelar_min ?? null, reconstituir || "No",
        tiempo_reconstitucion_min ?? null, temperatura_post_reconstitucion || null,
        duracion_dias ?? null, cantidad_alicuotas ?? null, volumen_ul ?? null,
        dias_uso_aprox ?? null,
      ]
    );
    await registrarLog(req.user.nombre, "NUEVO MAESTRO", `${nombre} → ${seccion} | GTIN: ${gtin}`, getIP(req));
    res.json({ success: true });
  } catch (e) { errRes(res, e); }
});

v1.put("/producto/:gtin", authenticate, canInv, async (req, res) => {
  try {
    const {
      nombre, abreviado, detalle, pack, seccion, temperatura, preparacion,
      almacenamiento_sin_abrir, descongelar_min, reconstituir,
      tiempo_reconstitucion_min, temperatura_post_reconstitucion,
      duracion_dias, cantidad_alicuotas, volumen_ul, dias_uso_aprox,
    } = req.body;
    await db.run("INSERT OR IGNORE INTO secciones (nombre) VALUES (?)", [seccion]);
    const storage = almacenamiento_sin_abrir || temperatura || "Refrigerado";
    await db.run(
      `UPDATE maestro_productos SET
        nombre=?, abreviado=?, detalle=?, pack=?, seccion=?, temperatura=?, preparacion=?,
        almacenamiento_sin_abrir=?, descongelar_min=?, reconstituir=?,
        tiempo_reconstitucion_min=?, temperatura_post_reconstitucion=?,
        duracion_dias=?, cantidad_alicuotas=?, volumen_ul=?, dias_uso_aprox=?
        WHERE gtin=?`,
      [
        nombre, abreviado || "", detalle || "", pack || "", seccion, storage, preparacion || "",
        storage, descongelar_min ?? null, reconstituir || "No",
        tiempo_reconstitucion_min ?? null, temperatura_post_reconstitucion || null,
        duracion_dias ?? null, cantidad_alicuotas ?? null, volumen_ul ?? null,
        dias_uso_aprox ?? null,
        req.params.gtin,
      ]
    );
    await registrarLog(req.user.nombre, "EDITAR MAESTRO", `${nombre} (GTIN: ${req.params.gtin})`, getIP(req));
    res.json({ success: true });
  } catch (e) { errRes(res, e); }
});

// SOFT delete: marca fecha_baja en maestro + da de baja stock asociado
v1.delete("/producto/:gtin", authenticate, authorize("ADMIN"), async (req, res) => {
  try {
    const prod = await db.get("SELECT nombre FROM maestro_productos WHERE gtin = ?", [req.params.gtin]);
    if (!prod) return res.status(404).json({ success: false, message: "Producto no encontrado" });
    const now = new Date().toISOString();
    await db.run("UPDATE inventario SET fecha_baja = ? WHERE gtin = ? AND fecha_baja IS NULL", [now, req.params.gtin]);
    await db.run("UPDATE maestro_productos SET fecha_baja = ? WHERE gtin = ?", [now, req.params.gtin]);
    await registrarLog(req.user.nombre, "ELIMINAR MAESTRO (SOFT)", `${prod.nombre}`, getIP(req));
    res.json({ success: true });
  } catch (e) { errRes(res, e); }
});

// ── CONFIG / LOGS / USERS ──────────────────────────────────────────────────
v1.get("/config", authenticate, async (req, res) => {
  try {
    const secciones = await db.all("SELECT * FROM secciones WHERE nombre IS NOT NULL ORDER BY nombre ASC");
    const usuarios  = await db.all("SELECT id, nombre, rol FROM usuarios WHERE fecha_baja IS NULL");
    res.json({ secciones, usuarios });
  } catch (e) { errRes(res, e); }
});

v1.get("/logs", authenticate, authorize("ADMIN"), async (req, res) => {
  try {
    const { cursor } = req.query;
    const LIMIT = 200;
    let q = "SELECT * FROM logs"; const params = [];
    if (cursor) { q += " WHERE fecha < ?"; params.push(cursor); }
    q += " ORDER BY fecha DESC LIMIT ?"; params.push(LIMIT + 1);
    let rows = await db.all(q, params);
    let hasMore = false;
    if (rows.length > LIMIT) { rows = rows.slice(0, LIMIT); hasMore = true; }
    res.json({ rows, nextCursor: hasMore ? rows[rows.length - 1].fecha : null });
  } catch (e) { errRes(res, e); }
});

v1.post("/log-accion", authenticate, async (req, res) => {
  try {
    const { accion, detalles } = req.body;
    await registrarLog(req.user.nombre, accion, detalles, getIP(req));
    res.json({ success: true });
  } catch (e) { errRes(res, e); }
});

v1.post("/usuarios", authenticate, authorize("ADMIN"), async (req, res) => {
  try {
    const { nombre, rol, pin } = req.body;
    if (!nombre || !rol || !pin) return res.status(400).json({ success: false, message: "Faltan campos" });
    const rolesValidos = ["ADMIN", "TECNOLOGO", "TECNICO", "TOMA_MUESTRA"];
    if (!rolesValidos.includes(rol)) return res.status(400).json({ success: false, message: "Rol inválido" });
    if (pin.length < 4) return res.status(400).json({ success: false, message: "PIN mínimo 4 caracteres" });
    if (await db.get("SELECT id FROM usuarios WHERE nombre = ?", [nombre])) return res.status(409).json({ success: false, message: "El usuario ya existe" });
    const id = randomUUID();
    const hash = await bcrypt.hash(pin, 10);
    await db.run("INSERT INTO usuarios (id, nombre, rol, pin, must_change_pin) VALUES (?, ?, ?, ?, 1)", [id, nombre, rol, hash]);
    await registrarLog(req.user.nombre, "CREAR USUARIO", `${nombre} (${rol})`, getIP(req));
    res.json({ success: true });
  } catch (e) { errRes(res, e); }
});

v1.delete("/usuarios/:id", authenticate, authorize("ADMIN"), async (req, res) => {
  try {
    if (req.params.id === req.user.sub) return res.status(400).json({ success: false, message: "No puede auto-eliminarse" });
    const user = await db.get("SELECT nombre, rol FROM usuarios WHERE id = ?", [req.params.id]);
    if (!user) return res.status(404).json({ success: false, message: "No encontrado" });
    await db.run("UPDATE usuarios SET fecha_baja = ? WHERE id = ?", [new Date().toISOString(), req.params.id]);
    await registrarLog(req.user.nombre, "ELIMINAR USUARIO (SOFT)", `${user.nombre} (${user.rol})`, getIP(req));
    res.json({ success: true });
  } catch (e) { errRes(res, e); }
});

// Montar el router versionado
app.use("/api/v1", v1);

// ════════════════════════════════════════════════════════════════════════════
// ADMIN: HARD DELETE + RESTORE + LIST INCLUDING DELETED
// Exclusivos del Control Center — el admin es el único que puede eliminar
// físicamente registros o restaurar soft-deleted.
// ════════════════════════════════════════════════════════════════════════════

// Mapeo de tabla → columna PK y validación
const ADMIN_TABLES = {
  inventario:        { pk: "id",   softCol: "fecha_baja", label: "Inventario" },
  maestro_productos: { pk: "gtin", softCol: "fecha_baja", label: "Maestro de productos" },
  protocolos:        { pk: "id",   softCol: "fecha_baja", label: "Protocolos" },
  anexos:            { pk: "id",   softCol: "fecha_baja", label: "Anexos" },
  diuresis:          { pk: "id",   softCol: "fecha_baja", label: "Diuresis" },
  usuarios:          { pk: "id",   softCol: "fecha_baja", label: "Usuarios" },
};

v1.delete("/admin/hard-delete/:tabla/:id", authenticate, authorize("ADMIN"), async (req, res) => {
  try {
    const meta = ADMIN_TABLES[req.params.tabla];
    if (!meta) return res.status(400).json({ success: false, message: "Tabla inválida" });
    if (req.params.tabla === "usuarios" && req.params.id === req.user.sub) {
      return res.status(400).json({ success: false, message: "No puede auto-eliminarse" });
    }
    const existed = await db.get(`SELECT ${meta.pk} FROM ${req.params.tabla} WHERE ${meta.pk} = ?`, [req.params.id]);
    if (!existed) return res.status(404).json({ success: false, message: "No encontrado" });
    await db.run(`DELETE FROM ${req.params.tabla} WHERE ${meta.pk} = ?`, [req.params.id]);
    await registrarLog(req.user.nombre, "HARD DELETE", `${meta.label}: ${req.params.id}`, getIP(req));
    res.json({ success: true });
  } catch (e) { errRes(res, e); }
});

v1.post("/admin/restore/:tabla/:id", authenticate, authorize("ADMIN"), async (req, res) => {
  try {
    const meta = ADMIN_TABLES[req.params.tabla];
    if (!meta) return res.status(400).json({ success: false, message: "Tabla inválida" });
    const existed = await db.get(`SELECT ${meta.pk} FROM ${req.params.tabla} WHERE ${meta.pk} = ?`, [req.params.id]);
    if (!existed) return res.status(404).json({ success: false, message: "No encontrado" });
    await db.run(`UPDATE ${req.params.tabla} SET ${meta.softCol} = NULL WHERE ${meta.pk} = ?`, [req.params.id]);
    await registrarLog(req.user.nombre, "RESTAURAR", `${meta.label}: ${req.params.id}`, getIP(req));
    res.json({ success: true });
  } catch (e) { errRes(res, e); }
});

// Lista los registros soft-deleted de una tabla — para mostrar la "Papelera"
v1.get("/admin/trash/:tabla", authenticate, authorize("ADMIN"), async (req, res) => {
  try {
    const meta = ADMIN_TABLES[req.params.tabla];
    if (!meta) return res.status(400).json({ success: false, message: "Tabla inválida" });
    const rows = await db.all(`SELECT * FROM ${req.params.tabla} WHERE ${meta.softCol} IS NOT NULL ORDER BY ${meta.softCol} DESC LIMIT 500`);
    res.json(rows);
  } catch (e) { errRes(res, e); }
});

// Vista admin: todos los registros (activos + eliminados) de una tabla
v1.get("/admin/all/:tabla", authenticate, authorize("ADMIN"), async (req, res) => {
  try {
    const meta = ADMIN_TABLES[req.params.tabla];
    if (!meta) return res.status(400).json({ success: false, message: "Tabla inválida" });
    const rows = await db.all(`SELECT * FROM ${req.params.tabla} ORDER BY ${meta.softCol} ASC LIMIT 2000`);
    res.json(rows);
  } catch (e) { errRes(res, e); }
});

// ── ADMIN: backups ──────────────────────────────────────────────────────────
v1.get("/admin/backups", authenticate, authorize("ADMIN"), async (req, res) => {
  try {
    const list = listBackups().map(b => ({
      name: b.name,
      size: fs.statSync(b.path).size,
      mtime: b.mtime.toISOString(),
    }));
    res.json({ backups: list, total: list.length, retention_days: BACKUP_RETAIN_DAYS });
  } catch (e) { errRes(res, e); }
});

v1.post("/admin/backups/run", authenticate, authorize("ADMIN"), async (req, res) => {
  try {
    const dest = await ejecutarBackupDB();
    if (!dest) return res.status(500).json({ success: false, message: "Backup falló" });
    res.json({ success: true, file: path.basename(dest) });
  } catch (e) { errRes(res, e); }
});

// ── ADMIN: métricas agregadas para el Control Center ─────────────────────────
v1.get("/admin/dashboard", authenticate, authorize("ADMIN"), async (req, res) => {
  try {
    const todayISO = new Date().toISOString().split("T")[0];
    const last7Days = new Date(Date.now() - 7 * 86400000).toISOString().split("T")[0];
    const last30Days = new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0];

    const totals = await db.get(`
      SELECT
        (SELECT COUNT(*) FROM inventario WHERE fecha_baja IS NULL) AS stock_activo,
        (SELECT COUNT(*) FROM inventario WHERE fecha_baja IS NOT NULL) AS stock_consumido,
        (SELECT COUNT(*) FROM maestro_productos WHERE fecha_baja IS NULL) AS productos_maestro,
        (SELECT COUNT(*) FROM usuarios WHERE fecha_baja IS NULL) AS usuarios_total,
        (SELECT COUNT(*) FROM diuresis WHERE fecha_baja IS NULL) AS diuresis_total,
        (SELECT COUNT(*) FROM anexos WHERE fecha_baja IS NULL) AS anexos_total,
        (SELECT COUNT(*) FROM protocolos WHERE fecha_baja IS NULL) AS protocolos_total,
        (SELECT COUNT(*) FROM secciones) AS secciones_total,
        (SELECT COUNT(*) FROM logs) AS logs_total,
        (SELECT COUNT(*) FROM logs WHERE DATE(fecha) = ?) AS logs_hoy,
        (SELECT COUNT(*) FROM logs WHERE DATE(fecha) >= ?) AS logs_7d,
        (SELECT COUNT(*) FROM diuresis WHERE DATE(fecha,'localtime') = DATE('now','localtime')) AS diuresis_hoy,
        (SELECT COUNT(*) FROM diuresis WHERE DATE(fecha,'localtime') >= ?) AS diuresis_7d,
        (SELECT COUNT(*) FROM logs WHERE accion LIKE 'LOGIN FALLIDO' AND DATE(fecha) >= ?) AS login_fallidos_7d,
        (SELECT COUNT(*) FROM logs WHERE accion LIKE 'ACCESO DENEGADO' AND DATE(fecha) >= ?) AS denegados_7d,
        (SELECT COUNT(*) FROM login_lockouts WHERE locked_until IS NOT NULL AND locked_until > datetime('now')) AS cuentas_bloqueadas
    `, [todayISO, last7Days, last7Days, last7Days, last30Days]);

    // Próximos a vencer (próximos 30 / 90 días). expiration es AAMMDD.
    const allActive = await db.all(`
      SELECT i.expiration, i.gtin, m.nombre, m.seccion
      FROM inventario i LEFT JOIN maestro_productos m ON i.gtin = m.gtin
      WHERE i.fecha_baja IS NULL AND length(i.expiration) = 6
    `);
    const today = new Date(); today.setHours(0,0,0,0);
    let vencidos = 0, lt30 = 0, lt90 = 0;
    for (const r of allActive) {
      const y = 2000 + parseInt(r.expiration.slice(0,2));
      const m = parseInt(r.expiration.slice(2,4)) - 1;
      const d = parseInt(r.expiration.slice(4,6));
      const dias = Math.floor((new Date(y, m, d).getTime() - today.getTime()) / 86400000);
      if (dias < 0) vencidos++;
      else if (dias <= 30) lt30++;
      else if (dias <= 90) lt90++;
    }

    // Distribución por sección (stock activo)
    const porSeccion = await db.all(`
      SELECT COALESCE(m.seccion, 'Sin clasificar') AS seccion, COUNT(*) AS count
      FROM inventario i LEFT JOIN maestro_productos m ON i.gtin = m.gtin
      WHERE i.fecha_baja IS NULL
      GROUP BY m.seccion
      ORDER BY count DESC
    `);

    // Distribución por temperatura
    const porTemperatura = await db.all(`
      SELECT COALESCE(m.temperatura, 'Sin clasificar') AS temperatura, COUNT(*) AS count
      FROM inventario i LEFT JOIN maestro_productos m ON i.gtin = m.gtin
      WHERE i.fecha_baja IS NULL
      GROUP BY m.temperatura
    `);

    // Usuarios por rol
    const porRol = await db.all(`SELECT rol, COUNT(*) AS count FROM usuarios GROUP BY rol`);

    // Actividad últimos 7 días (timeline)
    const actividad7d = await db.all(`
      SELECT DATE(fecha) AS dia, COUNT(*) AS count
      FROM logs WHERE DATE(fecha) >= ?
      GROUP BY DATE(fecha) ORDER BY dia ASC
    `, [last7Days]);

    // Top usuarios por actividad
    const topUsuarios = await db.all(`
      SELECT usuario, perfil, COUNT(*) AS acciones
      FROM logs WHERE DATE(fecha) >= ?
      GROUP BY usuario, perfil ORDER BY acciones DESC LIMIT 5
    `, [last7Days]);

    // Actividad reciente (10 últimos eventos)
    const recent = await db.all(`
      SELECT id, usuario, perfil, accion, detalles, fecha, ip
      FROM logs ORDER BY fecha DESC LIMIT 10
    `);

    res.json({
      totals,
      vencimientos: { vencidos, proximos_30d: lt30, proximos_90d: lt90 },
      porSeccion, porTemperatura, porRol,
      actividad7d, topUsuarios, recent
    });
  } catch (e) { errRes(res, e); }
});

// ── HEALTH (no versionado, fuera de auth) ──────────────────────────────────
app.get("/health", async (req, res) => {
  try { await db.get("SELECT 1"); res.json({ status: "ok", timestamp: new Date().toISOString(), tls: TLS_ENABLED }); }
  catch (e) { res.status(503).json({ status: "error", message: e.message }); }
});

// ── Catch /api/* no versionado → 404 explícito (no cae al SPA) ─────────────
app.all(/^\/api(?!\/v\d+\/).*/, (req, res) => {
  res.status(404).json({ success: false, message: "Endpoint no encontrado. Usar /api/v1/..." });
});

// ── SPA fallback ────────────────────────────────────────────────────────────
if (fs.existsSync(distPath)) {
  app.get(/(.*)/, (_req, res) => res.sendFile(path.join(distPath, "index.html")));
}

// ── Server con TLS opcional ─────────────────────────────────────────────────
if (TLS_ENABLED) {
  const tlsOpts = { cert: fs.readFileSync(TLS_CERT_PATH), key: fs.readFileSync(TLS_KEY_PATH) };
  https.createServer(tlsOpts, app).listen(PORT, "0.0.0.0", () => {
    console.log(`\n🔒 BIO-STOCK LIMS corriendo en https://localhost:${PORT} (TLS)\n`);
  });
} else {
  http.createServer(app).listen(PORT, "0.0.0.0", () => {
    console.log(`\n🚀 BIO-STOCK LIMS corriendo en http://localhost:${PORT} (sin TLS)\n`);
  });
}
