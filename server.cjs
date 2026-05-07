const express = require("express");
const cors = require("cors");
const sqlite3 = require("sqlite3").verbose();
const { open } = require("sqlite");

const app = express();
app.use(cors());
app.use(express.json());

let db;

// MIGRACIONES PROFESIONALES
async function runMigrations(db) {
  const { user_version } = await db.get("PRAGMA user_version");
  let currentVersion = user_version;

  if (currentVersion < 1) {
    await db.exec(`CREATE TABLE IF NOT EXISTS inventario (id TEXT PRIMARY KEY, gtin TEXT, lot TEXT, expiration TEXT, scanDate TEXT, usuario TEXT, fecha_baja TEXT DEFAULT NULL)`);
    await db.exec(`CREATE TABLE IF NOT EXISTS maestro_productos (gtin TEXT PRIMARY KEY, nombre TEXT, detalle TEXT, pack TEXT, seccion TEXT, temperatura TEXT)`);
    await db.exec(`CREATE TABLE IF NOT EXISTS secciones (nombre TEXT PRIMARY KEY)`);
    await db.exec(`CREATE TABLE IF NOT EXISTS usuarios (id TEXT PRIMARY KEY, nombre TEXT, rol TEXT, pin TEXT)`);
    await db.exec(`CREATE TABLE IF NOT EXISTS logs (id INTEGER PRIMARY KEY AUTOINCREMENT, usuario TEXT, accion TEXT, detalles TEXT, fecha TEXT)`);

    const userCount = await db.get("SELECT COUNT(*) as c FROM usuarios");
    if (userCount.c === 0) {
      await db.run("INSERT INTO usuarios (id, nombre, rol, pin) VALUES (?, ?, ?, ?)", ["admin_init", "admin", "ADMIN", "1234"]);
    }
    await db.exec("PRAGMA user_version = 1");
  }
}

(async () => {
  db = await open({ filename: "./inventario_biorad.db", driver: sqlite3.Database });
  await runMigrations(db);
  console.log("✅ Servidor con Láser Multicaja Online.");
})();

async function registrarLog(usuario, accion, detalles) {
  await db.run("INSERT INTO logs (usuario, accion, detalles, fecha) VALUES (?, ?, ?, ?)", [usuario, accion, detalles, new Date().toISOString()]);
}

app.get("/api/inventario", async (req, res) => {
  const rows = await db.all("SELECT i.*, m.nombre, m.detalle, m.pack, m.seccion, m.temperatura FROM inventario i LEFT JOIN maestro_productos m ON i.gtin = m.gtin WHERE i.fecha_baja IS NULL ORDER BY i.expiration ASC");
  res.json(rows);
});

// ¡CANDADO DE DUPLICADOS ELIMINADO! AHORA PUEDES SCANEAR LA MISMA CAJA MÚLTIPLES VECES
app.post("/api/inventario", async (req, res) => {
  const { gtin, lot, expiration, scanDate, usuario } = req.body;
  const id = Math.random().toString(36).substr(2,9); // Cada caja recibe un ID único aunque sea el mismo lote
  await db.run("INSERT INTO inventario (id, gtin, lot, expiration, scanDate, usuario) VALUES (?, ?, ?, ?, ?, ?)", [id, gtin, lot, expiration, scanDate, usuario]);
  await registrarLog(usuario, "INGRESO STOCK", `Caja añadida | GTIN: ${gtin}, Lote: ${lot}`);
  res.json({ success: true });
});

app.patch("/api/inventario/:id", async (req, res) => {
  const { usuario } = req.body;
  const item = await db.get("SELECT gtin, lot FROM inventario WHERE id = ?", [req.params.id]);
  await db.run("UPDATE inventario SET fecha_baja = ? WHERE id = ?", [new Date().toISOString(), req.params.id]);
  await registrarLog(usuario, "BAJA STOCK", `Caja retirada | GTIN: ${item.gtin}, Lote: ${item.lot}`);
  res.json({ success: true });
});

app.get("/api/producto/:gtin", async (req, res) => {
  const row = await db.get("SELECT * FROM maestro_productos WHERE gtin = ?", [req.params.gtin]);
  res.json(row || null);
});

app.post("/api/producto", async (req, res) => {
  const { gtin, nombre, seccion, usuario } = req.body;
  await db.run("INSERT OR IGNORE INTO secciones (nombre) VALUES (?)", [seccion]);
  await db.run("INSERT OR REPLACE INTO maestro_productos VALUES (?, ?, ?, ?, ?, ?)", [gtin, nombre, req.body.detalle, req.body.pack, seccion, req.body.temperatura]);
  await registrarLog(usuario, "NUEVO MAESTRO", `Clasificado: ${nombre} -> ${seccion}`);
  res.json({ success: true });
});

app.get("/api/config", async (req, res) => {
  const secciones = await db.all("SELECT * FROM secciones ORDER BY nombre ASC");
  const usuarios = await db.all("SELECT id, nombre, rol FROM usuarios");
  res.json({ secciones, usuarios });
});

app.get("/api/logs", async (req, res) => {
  const logs = await db.all("SELECT * FROM logs ORDER BY fecha DESC LIMIT 200");
  res.json(logs);
});

app.post("/api/login", async (req, res) => {
  const { nombre, pin } = req.body;
  const user = await db.get("SELECT id, nombre, rol FROM usuarios WHERE nombre = ? AND pin = ?", [nombre, pin]);
  if (user) {
    await registrarLog(user.nombre, "LOGIN", "Sistema accedido");
    res.json({ success: true, user });
  } else {
    res.status(401).json({ success: false, message: "Denegado" });
  }
});

app.post("/api/usuarios", async (req, res) => {
  const { nombre, rol, pin, adminUser } = req.body;
  const id = "u_" + Math.random().toString(36).substr(2,5);
  await db.run("INSERT INTO usuarios (id, nombre, rol, pin) VALUES (?, ?, ?, ?)", [id, nombre, rol, pin]);
  await registrarLog(adminUser, "CREAR USUARIO", `Añadido: ${nombre}`);
  res.json({ success: true });
});

app.delete("/api/usuarios/:id", async (req, res) => {
  const { adminUser } = req.body;
  const user = await db.get("SELECT nombre FROM usuarios WHERE id = ?", [req.params.id]);
  await db.run("DELETE FROM usuarios WHERE id = ?", [req.params.id]);
  await registrarLog(adminUser, "ELIMINAR USUARIO", `Revocado: ${user.nombre}`);
  res.json({ success: true });
});

app.listen(3000, "0.0.0.0", () => console.log("🚀 Server API V9 Online"));
