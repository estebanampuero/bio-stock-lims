import express from "express";
import cors from "cors";
import sqlite3 from "sqlite3";
import { open } from "sqlite";

const sqlite = sqlite3.verbose();
const app = express();
app.use(cors());
app.use(express.json());

let db;

(async () => {
  db = await open({ filename: "./inventario_biorad.db", driver: sqlite.Database });

  // 1. Crear tablas base si no existen
  await db.exec(`
    CREATE TABLE IF NOT EXISTS inventario (id TEXT PRIMARY KEY, gtin TEXT, lot TEXT, expiration TEXT, scanDate TEXT, fecha_baja TEXT DEFAULT NULL, usuario_registro TEXT DEFAULT NULL);
    CREATE TABLE IF NOT EXISTS maestro_productos (gtin TEXT PRIMARY KEY, nombre TEXT, detalle TEXT, pack TEXT, seccion TEXT, temperatura TEXT DEFAULT 'Refrigerado');
    CREATE TABLE IF NOT EXISTS logs (id INTEGER PRIMARY KEY AUTOINCREMENT, accion TEXT, gtin TEXT, lote TEXT, usuario TEXT, fecha TEXT, detalles TEXT);
    CREATE TABLE IF NOT EXISTS usuarios (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE, password TEXT, rol TEXT DEFAULT 'admin');
  `);

  // 2. MIGRACIÓN AUTOMÁTICA: Agregar columnas faltantes si se usa una DB antigua
  const tableInfoInv = await db.all("PRAGMA table_info(inventario)");
  if (!tableInfoInv.some(c => c.name === 'fecha_baja')) await db.exec("ALTER TABLE inventario ADD COLUMN fecha_baja TEXT DEFAULT NULL");
  if (!tableInfoInv.some(c => c.name === 'usuario_registro')) await db.exec("ALTER TABLE inventario ADD COLUMN usuario_registro TEXT DEFAULT NULL");

  const tableInfoMaestro = await db.all("PRAGMA table_info(maestro_productos)");
  if (!tableInfoMaestro.some(c => c.name === 'temperatura')) await db.exec("ALTER TABLE maestro_productos ADD COLUMN temperatura TEXT DEFAULT 'Refrigerado'");

  await db.run("INSERT OR IGNORE INTO usuarios (username, password, rol) VALUES ('admin', 'LAB_ADMIN_2024', 'admin')");
  
  console.log("✅ Servidor Lab y Base de Datos (Versión Módulos ES) listos.");
})();

async function registrarLog(accion, gtin, lote, usuario, detalles) {
  await db.run("INSERT INTO logs (accion, gtin, lote, usuario, fecha, detalles) VALUES (?, ?, ?, ?, ?, ?)",[accion, gtin, lote, usuario || 'SISTEMA', new Date().toISOString(), detalles]);
}

app.get("/api/inventario", async (req, res) => {
  try {
    const rows = await db.all(`
      SELECT i.*, m.nombre, m.detalle, m.pack, m.seccion, m.temperatura 
      FROM inventario i 
      LEFT JOIN maestro_productos m ON i.gtin = m.gtin 
      WHERE i.fecha_baja IS NULL 
      ORDER BY i.scanDate DESC`);
    res.json(rows);
  } catch (e) { res.status(500).json({error: e.message}); }
});

app.post("/api/inventario", async (req, res) => {
  const { id, gtin, lot, expiration, scanDate, usuario } = req.body;
  await db.run("INSERT INTO inventario (id, gtin, lot, expiration, scanDate, usuario_registro) VALUES (?, ?, ?, ?, ?, ?)", 
    [id, gtin, lot, expiration, scanDate, usuario]);
  await registrarLog("ENTRADA", gtin, lot, usuario, "Ingreso a stock");
  res.json({ success: true });
});

app.patch("/api/inventario/:id", async (req, res) => {
  const { usuario } = req.body;
  const item = await db.get("SELECT gtin, lot FROM inventario WHERE id = ?", req.params.id);
  await db.run("UPDATE inventario SET fecha_baja = ? WHERE id = ?", [new Date().toISOString(), req.params.id]);
  await registrarLog("SALIDA", item.gtin, item.lot, usuario, "Baja de stock");
  res.json({ success: true });
});

app.get("/api/producto/:gtin", async (req, res) => {
  res.json(await db.get("SELECT * FROM maestro_productos WHERE gtin = ?", req.params.gtin) || null);
});

app.post("/api/producto", async (req, res) => {
  const { gtin, nombre, detalle, pack, seccion, temperatura, usuario } = req.body;
  await db.run("INSERT OR REPLACE INTO maestro_productos (gtin, nombre, detalle, pack, seccion, temperatura) VALUES (?, ?, ?, ?, ?, ?)", 
    [gtin, nombre, detalle, pack, seccion, temperatura]);
  await registrarLog("MAESTRO_UPDATE", gtin, "N/A", usuario, `Actualización Maestro`);
  res.json({ success: true });
});

app.get("/api/logs", async (req, res) => {
  res.json(await db.all("SELECT l.*, m.nombre FROM logs l LEFT JOIN maestro_productos m ON l.gtin = m.gtin ORDER BY l.fecha DESC LIMIT 100"));
});

app.listen(3000, "0.0.0.0", () => console.log("🚀 Servidor Lab escuchando en http://localhost:3000"));
