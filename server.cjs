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

// ── Lockout por usuario (in-memory, complemento del rate-limit por IP) ──────
const failedLogins = new Map(); // nombre → { count, lockedUntil }
const LOCK_AFTER       = 5;
const LOCK_DURATION_MS = 30 * 60 * 1000;

function registerLoginAttempt(nombre, success) {
  if (success) {
    failedLogins.delete(nombre);
    return { locked: false };
  }
  const entry = failedLogins.get(nombre) || { count: 0, lockedUntil: 0 };
  entry.count++;
  if (entry.count >= LOCK_AFTER) {
    entry.lockedUntil = Date.now() + LOCK_DURATION_MS;
    entry.count = 0;
  }
  failedLogins.set(nombre, entry);
  return { locked: entry.lockedUntil > Date.now() };
}
function isLocked(nombre) {
  const entry = failedLogins.get(nombre);
  if (!entry || !entry.lockedUntil) return false;
  if (entry.lockedUntil <= Date.now()) { failedLogins.delete(nombre); return false; }
  return true;
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
}

// ── Rotación del PIN admin por defecto al primer arranque post-install ──────
async function rotateDefaultAdminPin() {
  const admin = await db.get("SELECT id, pin FROM usuarios WHERE nombre = 'admin'");
  if (!admin) return;
  const isDefault = await bcrypt.compare("1234", admin.pin).catch(() => false);
  if (!isDefault) return;

  const newPin = crypto.randomInt(10000000, 99999999).toString(); // 8 dígitos
  const hash = await bcrypt.hash(newPin, 10);
  await db.run("UPDATE usuarios SET pin = ?, must_change_pin = 1 WHERE id = ?", [hash, admin.id]);

  const pinFile = path.join(BASE_DIR, "INITIAL_PIN.txt");
  const content =
`BIO-STOCK LIMS — PIN Inicial del Administrador
================================================

Usuario:  admin
PIN:      ${newPin}

INSTRUCCIONES PARA IT DEL HOSPITAL:

1. Entregar este PIN al quimico responsable del laboratorio.
2. En el primer login, el sistema le forzara a cambiar el PIN.
3. Una vez confirmado el cambio, ELIMINAR este archivo.

Generado: ${new Date().toISOString()}
`;
  try { fs.writeFileSync(pinFile, content, { mode: 0o600 }); } catch (_) {}
  console.log(`🔐 PIN admin default rotado. Nuevo PIN escrito en: ${pinFile}`);
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

    if (isLocked(nombre)) {
      await registrarLog(nombre, "LOGIN BLOQUEADO", `Usuario en lockout temporal`, ip);
      return res.status(429).json({ success: false, message: "Cuenta bloqueada temporalmente. Intente en 30 minutos." });
    }

    const user = await db.get("SELECT id, nombre, rol, pin, must_change_pin FROM usuarios WHERE nombre = ?", [nombre]);
    const valid = user && await bcrypt.compare(pin, user.pin);
    registerLoginAttempt(nombre, !!valid);

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
    const rows = await db.all(`SELECT i.*, m.nombre, m.detalle, m.pack, m.seccion, m.temperatura, m.preparacion
      FROM inventario i LEFT JOIN maestro_productos m ON i.gtin = m.gtin
      WHERE i.fecha_baja IS NULL ORDER BY i.expiration ASC`);
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
  try { res.json(await db.all("SELECT * FROM protocolos ORDER BY seccion ASC, titulo ASC")); }
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
v1.delete("/protocolos/:id", authenticate, authorize("ADMIN"), async (req, res) => {
  try {
    const p = await db.get("SELECT titulo FROM protocolos WHERE id = ?", [req.params.id]);
    await db.run("DELETE FROM protocolos WHERE id = ?", [req.params.id]);
    await registrarLog(req.user.nombre, "ELIMINAR PROTOCOLO", `"${p?.titulo}"`, getIP(req));
    res.json({ success: true });
  } catch (e) { errRes(res, e); }
});

// ── ANEXOS ──────────────────────────────────────────────────────────────────
v1.get("/anexos", authenticate, async (req, res) => {
  try { res.json(await db.all("SELECT * FROM anexos ORDER BY servicio ASC, salas ASC")); }
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
    await db.run("DELETE FROM anexos WHERE id = ?", [req.params.id]);
    await registrarLog(req.user.nombre, "ELIMINAR ANEXO", `${a?.servicio} — ${a?.numero}`, getIP(req));
    res.json({ success: true });
  } catch (e) { errRes(res, e); }
});

// ── DIURESIS ────────────────────────────────────────────────────────────────
function diuresisToClient(r) {
  return { ...r, rut_paciente: decPII(r.rut_paciente), nombre_paciente: decPII(r.nombre_paciente) };
}

v1.get("/diuresis/hoy", authenticate, async (req, res) => {
  try {
    const rows = await db.all("SELECT * FROM diuresis WHERE DATE(fecha, 'localtime') = DATE('now', 'localtime') ORDER BY fecha DESC");
    const out = rows.map(diuresisToClient);
    await registrarAccesoPII(req, "diuresis", "hoy", out.length); // throttled internamente
    res.json(out);
  } catch (e) { errRes(res, e); }
});

v1.get("/diuresis/historico", authenticate, authorize("ADMIN", "TECNOLOGO"), async (req, res) => {
  try {
    const { fecha, peticion, nombre, cursor } = req.query;
    const LIMIT = 200;
    let q = "SELECT * FROM diuresis WHERE 1=1"; const params = [];
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
    await db.run("DELETE FROM diuresis WHERE id = ?", [req.params.id]);
    await registrarLog(req.user.nombre, "ELIMINAR DIURESIS", `Petición: ${d?.num_peticion}`, getIP(req));
    res.json({ success: true });
  } catch (e) { errRes(res, e); }
});

// ── MAESTRO ────────────────────────────────────────────────────────────────
v1.get("/producto/:gtin", authenticate, async (req, res) => {
  try {
    const row = await db.get("SELECT * FROM maestro_productos WHERE gtin = ? AND nombre IS NOT NULL AND nombre != ''", [req.params.gtin]);
    res.json(row || null);
  } catch (e) { errRes(res, e); }
});
v1.post("/producto", authenticate, canInv, async (req, res) => {
  try {
    const { gtin, nombre, detalle, pack, seccion, temperatura, preparacion } = req.body;
    if (!gtin || !nombre || !seccion) return res.status(400).json({ success: false, message: "GTIN, nombre y sección obligatorios" });
    await db.run("INSERT OR IGNORE INTO secciones (nombre) VALUES (?)", [seccion]);
    await db.run("INSERT OR REPLACE INTO maestro_productos (gtin, nombre, detalle, pack, seccion, temperatura, preparacion) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [gtin, nombre, detalle || "", pack || "", seccion, temperatura || "Refrigerado", preparacion || ""]);
    await registrarLog(req.user.nombre, "NUEVO MAESTRO", `${nombre} → ${seccion} | GTIN: ${gtin}`, getIP(req));
    res.json({ success: true });
  } catch (e) { errRes(res, e); }
});
v1.put("/producto/:gtin", authenticate, canInv, async (req, res) => {
  try {
    const { nombre, detalle, pack, seccion, temperatura, preparacion } = req.body;
    await db.run("INSERT OR IGNORE INTO secciones (nombre) VALUES (?)", [seccion]);
    await db.run("UPDATE maestro_productos SET nombre=?, detalle=?, pack=?, seccion=?, temperatura=?, preparacion=? WHERE gtin=?",
      [nombre, detalle || "", pack || "", seccion, temperatura || "Refrigerado", preparacion || "", req.params.gtin]);
    await registrarLog(req.user.nombre, "EDITAR MAESTRO", `${nombre} (GTIN: ${req.params.gtin})`, getIP(req));
    res.json({ success: true });
  } catch (e) { errRes(res, e); }
});
v1.delete("/producto/:gtin", authenticate, authorize("ADMIN"), async (req, res) => {
  try {
    const prod = await db.get("SELECT nombre FROM maestro_productos WHERE gtin = ?", [req.params.gtin]);
    await db.run("UPDATE inventario SET fecha_baja = ? WHERE gtin = ? AND fecha_baja IS NULL", [new Date().toISOString(), req.params.gtin]);
    await db.run("DELETE FROM maestro_productos WHERE gtin = ?", [req.params.gtin]);
    await registrarLog(req.user.nombre, "ELIMINAR MAESTRO", `${prod?.nombre}`, getIP(req));
    res.json({ success: true });
  } catch (e) { errRes(res, e); }
});

// ── CONFIG / LOGS / USERS ──────────────────────────────────────────────────
v1.get("/config", authenticate, async (req, res) => {
  try {
    const secciones = await db.all("SELECT * FROM secciones WHERE nombre IS NOT NULL ORDER BY nombre ASC");
    const usuarios  = await db.all("SELECT id, nombre, rol FROM usuarios");
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
    await db.run("DELETE FROM usuarios WHERE id = ?", [req.params.id]);
    await registrarLog(req.user.nombre, "ELIMINAR USUARIO", `${user.nombre} (${user.rol})`, getIP(req));
    res.json({ success: true });
  } catch (e) { errRes(res, e); }
});

// Montar el router versionado
app.use("/api/v1", v1);

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
