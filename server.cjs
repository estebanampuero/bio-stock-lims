const express = require("express");
const cors = require("cors");
const sqlite3 = require("sqlite3").verbose();
const { open } = require("sqlite");
const path = require("path");
const fs = require("fs");
const { randomUUID } = require("crypto");
const bcrypt = require("bcryptjs");
const rateLimit = require("express-rate-limit");

const app = express();

// Permite cualquier origen dentro de la LAN — el firewall del hospital es la barrera externa
app.use(cors());
app.use(express.json());

const distPath = path.join(__dirname, "dist");
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
}

let db;

// ── Helpers ───────────────────────────────────────────────────────────────────

function getIP(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded) return forwarded.split(",")[0].trim();
  return req.socket?.remoteAddress || "desconocida";
}

function errRes(res, e, msg = "Error interno del servidor") {
  console.error(msg, e?.message || e);
  res.status(500).json({ success: false, message: msg });
}

// ── Migraciones ───────────────────────────────────────────────────────────────

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
      const pinHash = await bcrypt.hash("1234", 10);
      await db.run("INSERT INTO usuarios (id, nombre, rol, pin) VALUES (?, ?, ?, ?)", ["admin_init", "admin", "ADMIN", pinHash]);
    }
    await db.exec("PRAGMA user_version = 1");
    v = 1;
  }

  if (v < 2) {
    await db.exec(`ALTER TABLE maestro_productos ADD COLUMN preparacion TEXT`);
    await db.exec("PRAGMA user_version = 2");
    v = 2;
  }

  if (v < 3) {
    await db.exec(`CREATE TABLE IF NOT EXISTS protocolos (
      id TEXT PRIMARY KEY,
      titulo TEXT NOT NULL,
      seccion TEXT NOT NULL,
      contenido TEXT NOT NULL,
      autor TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`);
    await db.exec("PRAGMA user_version = 3");
    v = 3;
  }

  if (v < 4) {
    await db.exec(`ALTER TABLE logs ADD COLUMN ip TEXT DEFAULT 'desconocida'`);
    await db.exec("PRAGMA user_version = 4");
    v = 4;
  }

  if (v < 5) {
    await db.exec(`ALTER TABLE logs ADD COLUMN perfil TEXT DEFAULT ''`);
    await db.exec(`CREATE TABLE IF NOT EXISTS anexos (
      id TEXT PRIMARY KEY,
      servicio TEXT NOT NULL,
      salas TEXT,
      numero TEXT NOT NULL,
      creado_por TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`);
    await db.exec(`CREATE TABLE IF NOT EXISTS diuresis (
      id TEXT PRIMARY KEY,
      num_peticion TEXT NOT NULL,
      rut_paciente TEXT,
      nombre_paciente TEXT,
      diuresis_ml TEXT,
      peso TEXT,
      talla TEXT,
      baja_motivo TEXT NOT NULL,
      obs_rechazo TEXT,
      motivo_vih TEXT,
      usuario TEXT NOT NULL,
      fecha TEXT NOT NULL,
      archivado INTEGER DEFAULT 0,
      archivado_at TEXT
    )`);
    await db.exec("PRAGMA user_version = 5");
    v = 5;
  }

  if (v < 6) {
    // Índices para columnas consultadas frecuentemente
    await db.exec(`CREATE INDEX IF NOT EXISTS idx_inv_gtin       ON inventario(gtin)`);
    await db.exec(`CREATE INDEX IF NOT EXISTS idx_inv_expiration ON inventario(expiration)`);
    await db.exec(`CREATE INDEX IF NOT EXISTS idx_inv_baja       ON inventario(fecha_baja)`);
    await db.exec(`CREATE INDEX IF NOT EXISTS idx_logs_fecha     ON logs(fecha)`);
    await db.exec(`CREATE INDEX IF NOT EXISTS idx_diuresis_fecha ON diuresis(fecha)`);
    await db.exec("PRAGMA user_version = 6");
    v = 6;
  }

  if (v < 7) {
    // Migrar PINs plaintext a bcrypt hashes
    const users = await db.all("SELECT id, pin FROM usuarios");
    for (const u of users) {
      if (u.pin && !u.pin.startsWith("$2")) {
        const hash = await bcrypt.hash(u.pin, 10);
        await db.run("UPDATE usuarios SET pin = ? WHERE id = ?", [hash, u.id]);
      }
    }
    await db.exec("PRAGMA user_version = 7");
    v = 7;
  }
}

(async () => {
  const dbPath = process.env.DB_PATH || path.join(__dirname, "inventario_biorad.db");
  db = await open({ filename: dbPath, driver: sqlite3.Database });
  await db.exec("PRAGMA journal_mode = WAL");
  await db.exec("PRAGMA synchronous = NORMAL");
  await db.exec("PRAGMA cache_size = -64000");
  await db.exec("PRAGMA temp_store = memory");
  await db.exec("PRAGMA foreign_keys = ON");
  await runMigrations(db);
  console.log(`✅ BIO-STOCK API lista. DB: ${dbPath}`);
  programarArchivoDiuresis();
})();

// ── Log con perfil automático ─────────────────────────────────────────────────

async function registrarLog(usuario, accion, detalles, ip = "desconocida") {
  try {
    let perfil = "";
    try {
      const u = await db.get("SELECT rol FROM usuarios WHERE nombre = ?", [usuario]);
      if (u) perfil = u.rol;
    } catch (_) {}
    await db.run(
      "INSERT INTO logs (usuario, perfil, accion, detalles, fecha, ip) VALUES (?, ?, ?, ?, ?, ?)",
      [usuario, perfil, accion, detalles, new Date().toISOString(), ip]
    );
  } catch (_) {}
}

// ── Archivo automático Diuresis a las 23:00 ───────────────────────────────────

function programarArchivoDiuresis() {
  const ahora = new Date();
  const objetivo = new Date();
  objetivo.setHours(23, 0, 0, 0);
  if (ahora >= objetivo) objetivo.setDate(objetivo.getDate() + 1);
  const diff = objetivo - ahora;
  setTimeout(async () => {
    try {
      const hoy = new Date().toISOString().split("T")[0];
      const res = await db.run(
        "UPDATE diuresis SET archivado = 1, archivado_at = ? WHERE DATE(fecha, 'localtime') = ? AND archivado = 0",
        [new Date().toISOString(), hoy]
      );
      console.log(`✅ Diuresis archivada — ${hoy} (${res.changes} registros)`);
    } catch (e) {
      console.error("Error archivando diuresis:", e.message);
    }
    programarArchivoDiuresis();
  }, diff);
}

// ── Rate limiting ─────────────────────────────────────────────────────────────

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Demasiados intentos. Espere 15 minutos." },
});

// ── INVENTARIO ────────────────────────────────────────────────────────────────

app.get("/api/inventario", async (req, res) => {
  try {
    const rows = await db.all(`
      SELECT i.*, m.nombre, m.detalle, m.pack, m.seccion, m.temperatura, m.preparacion
      FROM inventario i
      LEFT JOIN maestro_productos m ON i.gtin = m.gtin
      WHERE i.fecha_baja IS NULL
      ORDER BY i.expiration ASC
    `);
    res.json(rows);
  } catch (e) { errRes(res, e); }
});

app.post("/api/inventario", async (req, res) => {
  try {
    const { gtin, lot, expiration, scanDate, usuario } = req.body;
    if (!gtin || !lot || !expiration || !usuario) return res.status(400).json({ success: false, message: "Faltan campos obligatorios" });
    const id = randomUUID();
    await db.run(
      "INSERT INTO inventario (id, gtin, lot, expiration, scanDate, usuario) VALUES (?, ?, ?, ?, ?, ?)",
      [id, gtin, lot, expiration, scanDate, usuario]
    );
    await registrarLog(usuario, "INGRESO STOCK", `GTIN: ${gtin} | Lote: ${lot}`, getIP(req));
    res.json({ success: true });
  } catch (e) { errRes(res, e); }
});

app.patch("/api/inventario/:id", async (req, res) => {
  try {
    const { usuario } = req.body;
    const item = await db.get("SELECT gtin, lot FROM inventario WHERE id = ?", [req.params.id]);
    if (!item) return res.status(404).json({ success: false, message: "Item no encontrado" });
    await db.run("UPDATE inventario SET fecha_baja = ? WHERE id = ?", [new Date().toISOString(), req.params.id]);
    await registrarLog(usuario, "BAJA STOCK", `GTIN: ${item.gtin} | Lote: ${item.lot}`, getIP(req));
    res.json({ success: true });
  } catch (e) { errRes(res, e); }
});

app.put("/api/inventario/lote", async (req, res) => {
  try {
    const { gtin, lotActual, nuevoLot, nuevaExp, usuario } = req.body;
    await db.run(
      "UPDATE inventario SET lot = ?, expiration = ? WHERE gtin = ? AND lot = ? AND fecha_baja IS NULL",
      [nuevoLot, nuevaExp, gtin, lotActual]
    );
    await registrarLog(usuario, "EDITAR LOTE", `GTIN: ${gtin} | ${lotActual} → ${nuevoLot}`, getIP(req));
    res.json({ success: true });
  } catch (e) { errRes(res, e); }
});

// ── PROTOCOLOS ────────────────────────────────────────────────────────────────

app.get("/api/protocolos", async (req, res) => {
  try {
    const rows = await db.all("SELECT * FROM protocolos ORDER BY seccion ASC, titulo ASC");
    res.json(rows);
  } catch (e) { errRes(res, e); }
});

app.post("/api/protocolos", async (req, res) => {
  try {
    const { titulo, seccion, contenido, usuario } = req.body;
    if (!titulo || !seccion || !contenido) return res.status(400).json({ success: false, message: "Faltan campos obligatorios" });
    const id = randomUUID();
    const now = new Date().toISOString();
    await db.run(
      "INSERT INTO protocolos (id, titulo, seccion, contenido, autor, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [id, titulo, seccion, contenido, usuario, now, now]
    );
    await registrarLog(usuario, "NUEVO PROTOCOLO", `"${titulo}" → ${seccion}`, getIP(req));
    res.json({ success: true, id });
  } catch (e) { errRes(res, e); }
});

app.put("/api/protocolos/:id", async (req, res) => {
  try {
    const { titulo, seccion, contenido, usuario } = req.body;
    const now = new Date().toISOString();
    await db.run(
      "UPDATE protocolos SET titulo=?, seccion=?, contenido=?, updated_at=? WHERE id=?",
      [titulo, seccion, contenido, now, req.params.id]
    );
    await registrarLog(usuario, "EDITAR PROTOCOLO", `"${titulo}" (${seccion})`, getIP(req));
    res.json({ success: true });
  } catch (e) { errRes(res, e); }
});

app.delete("/api/protocolos/:id", async (req, res) => {
  try {
    const { usuario } = req.body;
    const proto = await db.get("SELECT titulo FROM protocolos WHERE id = ?", [req.params.id]);
    await db.run("DELETE FROM protocolos WHERE id = ?", [req.params.id]);
    await registrarLog(usuario, "ELIMINAR PROTOCOLO", `"${proto?.titulo}"`, getIP(req));
    res.json({ success: true });
  } catch (e) { errRes(res, e); }
});

// ── ANEXOS ────────────────────────────────────────────────────────────────────

app.get("/api/anexos", async (req, res) => {
  try {
    const rows = await db.all("SELECT * FROM anexos ORDER BY servicio ASC, salas ASC");
    res.json(rows);
  } catch (e) { errRes(res, e); }
});

app.post("/api/anexos", async (req, res) => {
  try {
    const { servicio, salas, numero, usuario } = req.body;
    if (!servicio || !numero) return res.status(400).json({ success: false, message: "Servicio y número son obligatorios" });
    const id = randomUUID();
    const now = new Date().toISOString();
    await db.run(
      "INSERT INTO anexos (id, servicio, salas, numero, creado_por, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [id, servicio, salas || "", numero, usuario, now, now]
    );
    await registrarLog(usuario, "NUEVO ANEXO", `${servicio}${salas ? " / " + salas : ""} — ${numero}`, getIP(req));
    res.json({ success: true, id });
  } catch (e) { errRes(res, e); }
});

app.put("/api/anexos/:id", async (req, res) => {
  try {
    const { servicio, salas, numero, usuario } = req.body;
    const now = new Date().toISOString();
    await db.run(
      "UPDATE anexos SET servicio=?, salas=?, numero=?, updated_at=? WHERE id=?",
      [servicio, salas || "", numero, now, req.params.id]
    );
    await registrarLog(usuario, "EDITAR ANEXO", `${servicio}${salas ? " / " + salas : ""} — ${numero}`, getIP(req));
    res.json({ success: true });
  } catch (e) { errRes(res, e); }
});

app.delete("/api/anexos/:id", async (req, res) => {
  try {
    const { usuario } = req.body;
    const a = await db.get("SELECT servicio, numero FROM anexos WHERE id = ?", [req.params.id]);
    await db.run("DELETE FROM anexos WHERE id = ?", [req.params.id]);
    await registrarLog(usuario, "ELIMINAR ANEXO", `${a?.servicio} — ${a?.numero}`, getIP(req));
    res.json({ success: true });
  } catch (e) { errRes(res, e); }
});

// ── DIURESIS Y BAJAS DE EXAMEN ────────────────────────────────────────────────

app.get("/api/diuresis/hoy", async (req, res) => {
  try {
    const rows = await db.all(
      "SELECT * FROM diuresis WHERE DATE(fecha, 'localtime') = DATE('now', 'localtime') ORDER BY fecha DESC"
    );
    res.json(rows);
  } catch (e) { errRes(res, e); }
});

app.get("/api/diuresis/historico", async (req, res) => {
  try {
    const { fecha, peticion, nombre } = req.query;
    let q = "SELECT * FROM diuresis WHERE 1=1";
    const params = [];
    if (fecha)    { q += " AND DATE(fecha, 'localtime') = ?"; params.push(fecha); }
    if (peticion) { q += " AND num_peticion LIKE ?";          params.push(`%${peticion}%`); }
    if (nombre)   { q += " AND nombre_paciente LIKE ?";       params.push(`%${nombre}%`); }
    q += " ORDER BY fecha DESC LIMIT 500";
    const rows = await db.all(q, params);
    res.json(rows);
  } catch (e) { errRes(res, e); }
});

app.post("/api/diuresis", async (req, res) => {
  try {
    const { num_peticion, rut_paciente, nombre_paciente, diuresis_ml,
            peso, talla, baja_motivo, obs_rechazo, motivo_vih, usuario } = req.body;
    if (!num_peticion || !baja_motivo || !usuario) return res.status(400).json({ success: false, message: "Faltan campos obligatorios" });
    const id = randomUUID();
    const now = new Date().toISOString();
    await db.run(
      `INSERT INTO diuresis (id, num_peticion, rut_paciente, nombre_paciente, diuresis_ml,
        peso, talla, baja_motivo, obs_rechazo, motivo_vih, usuario, fecha)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, num_peticion, rut_paciente || "", nombre_paciente || "", diuresis_ml || "",
       peso || "", talla || "", baja_motivo, obs_rechazo || "", motivo_vih || "", usuario, now]
    );
    await registrarLog(usuario, "INGRESO DIURESIS", `Petición: ${num_peticion} | ${nombre_paciente || "sin nombre"}`, getIP(req));
    res.json({ success: true, id });
  } catch (e) { errRes(res, e); }
});

app.delete("/api/diuresis/:id", async (req, res) => {
  try {
    const { usuario } = req.body;
    const d = await db.get("SELECT num_peticion, nombre_paciente FROM diuresis WHERE id = ?", [req.params.id]);
    await db.run("DELETE FROM diuresis WHERE id = ?", [req.params.id]);
    await registrarLog(usuario, "ELIMINAR DIURESIS", `Petición: ${d?.num_peticion} | ${d?.nombre_paciente || "—"}`, getIP(req));
    res.json({ success: true });
  } catch (e) { errRes(res, e); }
});

// ── MAESTRO DE PRODUCTOS ──────────────────────────────────────────────────────

app.get("/api/producto/:gtin", async (req, res) => {
  try {
    const row = await db.get(
      "SELECT * FROM maestro_productos WHERE gtin = ? AND nombre IS NOT NULL AND nombre != ''",
      [req.params.gtin]
    );
    res.json(row || null);
  } catch (e) { errRes(res, e); }
});

app.post("/api/producto", async (req, res) => {
  try {
    const { gtin, nombre, detalle, pack, seccion, temperatura, preparacion, usuario } = req.body;
    if (!gtin || !nombre || !seccion) return res.status(400).json({ success: false, message: "GTIN, nombre y sección son obligatorios" });
    await db.run("INSERT OR IGNORE INTO secciones (nombre) VALUES (?)", [seccion]);
    await db.run(
      "INSERT OR REPLACE INTO maestro_productos (gtin, nombre, detalle, pack, seccion, temperatura, preparacion) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [gtin, nombre, detalle || "", pack || "", seccion, temperatura || "Refrigerado", preparacion || ""]
    );
    await registrarLog(usuario, "NUEVO MAESTRO", `${nombre} → ${seccion} | GTIN: ${gtin}`, getIP(req));
    res.json({ success: true });
  } catch (e) { errRes(res, e); }
});

app.put("/api/producto/:gtin", async (req, res) => {
  try {
    const { nombre, detalle, pack, seccion, temperatura, preparacion, usuario } = req.body;
    await db.run("INSERT OR IGNORE INTO secciones (nombre) VALUES (?)", [seccion]);
    await db.run(
      "UPDATE maestro_productos SET nombre=?, detalle=?, pack=?, seccion=?, temperatura=?, preparacion=? WHERE gtin=?",
      [nombre, detalle || "", pack || "", seccion, temperatura || "Refrigerado", preparacion || "", req.params.gtin]
    );
    await registrarLog(usuario, "EDITAR MAESTRO", `${nombre} (GTIN: ${req.params.gtin})`, getIP(req));
    res.json({ success: true });
  } catch (e) { errRes(res, e); }
});

app.delete("/api/producto/:gtin", async (req, res) => {
  try {
    const { usuario } = req.body;
    const prod = await db.get("SELECT nombre FROM maestro_productos WHERE gtin = ?", [req.params.gtin]);
    await db.run("UPDATE inventario SET fecha_baja = ? WHERE gtin = ? AND fecha_baja IS NULL", [new Date().toISOString(), req.params.gtin]);
    await db.run("DELETE FROM maestro_productos WHERE gtin = ?", [req.params.gtin]);
    await registrarLog(usuario, "ELIMINAR MAESTRO", `${prod?.nombre} (GTIN: ${req.params.gtin})`, getIP(req));
    res.json({ success: true });
  } catch (e) { errRes(res, e); }
});

// ── CONFIG, LOGS, AUTH, USUARIOS ─────────────────────────────────────────────

app.get("/api/config", async (req, res) => {
  try {
    const secciones = await db.all("SELECT * FROM secciones WHERE nombre IS NOT NULL ORDER BY nombre ASC");
    const usuarios = await db.all("SELECT id, nombre, rol FROM usuarios");
    res.json({ secciones, usuarios });
  } catch (e) { errRes(res, e); }
});

app.get("/api/logs", async (req, res) => {
  try {
    const logs = await db.all("SELECT * FROM logs ORDER BY fecha DESC LIMIT 500");
    res.json(logs);
  } catch (e) { errRes(res, e); }
});

app.post("/api/login", loginLimiter, async (req, res) => {
  try {
    const { nombre, pin } = req.body;
    const ip = getIP(req);
    if (!nombre || !pin) return res.status(400).json({ success: false, message: "Nombre y PIN son obligatorios" });
    const user = await db.get("SELECT id, nombre, rol, pin FROM usuarios WHERE nombre = ?", [nombre]);
    const valid = user && await bcrypt.compare(pin, user.pin);
    if (valid) {
      await registrarLog(user.nombre, "LOGIN", `Sesión iniciada — rol: ${user.rol}`, ip);
      res.json({ success: true, user: { id: user.id, nombre: user.nombre, rol: user.rol } });
    } else {
      await registrarLog(nombre || "desconocido", "LOGIN FALLIDO", `Intento de acceso denegado`, ip);
      res.status(401).json({ success: false, message: "Usuario o PIN incorrecto" });
    }
  } catch (e) { errRes(res, e, "Error en autenticación"); }
});

app.post("/api/logout", async (req, res) => {
  try {
    const { usuario } = req.body;
    await registrarLog(usuario, "LOGOUT", "Sesión cerrada", getIP(req));
    res.json({ success: true });
  } catch (e) { errRes(res, e); }
});

app.post("/api/log-accion", async (req, res) => {
  try {
    const { usuario, accion, detalles } = req.body;
    await registrarLog(usuario, accion, detalles, getIP(req));
    res.json({ success: true });
  } catch (e) { errRes(res, e); }
});

app.post("/api/usuarios", async (req, res) => {
  try {
    const { nombre, rol, pin, adminUser } = req.body;
    if (!nombre || !rol || !pin) return res.status(400).json({ success: false, message: "Faltan campos obligatorios" });
    const rolesValidos = ["ADMIN", "TECNOLOGO", "TECNICO", "TOMA_MUESTRA"];
    if (!rolesValidos.includes(rol)) return res.status(400).json({ success: false, message: "Rol inválido" });
    const existe = await db.get("SELECT id FROM usuarios WHERE nombre = ?", [nombre]);
    if (existe) return res.status(409).json({ success: false, message: "El usuario ya existe" });
    const id = randomUUID();
    const pinHash = await bcrypt.hash(pin, 10);
    await db.run("INSERT INTO usuarios (id, nombre, rol, pin) VALUES (?, ?, ?, ?)", [id, nombre, rol, pinHash]);
    await registrarLog(adminUser, "CREAR USUARIO", `${nombre} (${rol})`, getIP(req));
    res.json({ success: true });
  } catch (e) { errRes(res, e); }
});

app.delete("/api/usuarios/:id", async (req, res) => {
  try {
    const { adminUser } = req.body;
    const user = await db.get("SELECT nombre, rol FROM usuarios WHERE id = ?", [req.params.id]);
    if (!user) return res.status(404).json({ success: false, message: "Usuario no encontrado" });
    await db.run("DELETE FROM usuarios WHERE id = ?", [req.params.id]);
    await registrarLog(adminUser, "ELIMINAR USUARIO", `${user.nombre} (${user.rol})`, getIP(req));
    res.json({ success: true });
  } catch (e) { errRes(res, e); }
});

app.get("/health", async (req, res) => {
  try {
    await db.get("SELECT 1");
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  } catch (e) {
    res.status(503).json({ status: "error", message: e.message });
  }
});

// ── SPA fallback ──────────────────────────────────────────────────────────────

if (fs.existsSync(distPath)) {
  app.get(/(.*)/, (_req, res) => {
    res.sendFile(path.join(distPath, "index.html"));
  });
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`\n🚀 BIO-STOCK LIMS corriendo en http://localhost:${PORT}\n`);
});
