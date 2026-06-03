"use strict";

// ════════════════════════════════════════════════════════════════════════════
// crear-admin.cjs — Crea o actualiza un usuario del sistema (rol ADMIN por defecto)
//
// Uso:
//   node scripts/crear-admin.cjs <nombre> <clave> [ROL]
//
// Ejemplos:
//   node scripts/crear-admin.cjs MMA 'Laboratorio12345_'
//   node scripts/crear-admin.cjs juan 'ClaveSegura1' TECNOLOGO
//
// - La clave se hashea con bcrypt (cost 10). NUNCA se guarda en texto plano.
// - Si el usuario ya existe, actualiza su clave/rol y lo reactiva (fecha_baja=NULL).
// - must_change_pin queda en 0 (no se fuerza cambio: tú elegiste la clave).
// - La DB se toma de DB_PATH o, por defecto, inventario_biorad.db en la raíz del proyecto.
//   En el servidor del hospital: set DB_PATH=C:\BioStock\inventario_biorad.db
// ════════════════════════════════════════════════════════════════════════════

const path = require("path");
const { randomUUID } = require("crypto");
const sqlite3 = require("sqlite3").verbose();
const { open } = require("sqlite");
const bcrypt = require("bcryptjs");

const ROLES_VALIDOS = ["ADMIN", "TECNOLOGO", "TECNICO"];

async function main() {
  const [, , nombre, clave, rolArg] = process.argv;
  const rol = (rolArg || "ADMIN").toUpperCase();

  if (!nombre || !clave) {
    console.error("Uso: node scripts/crear-admin.cjs <nombre> <clave> [ROL]");
    process.exit(1);
  }
  if (clave.length < 4) {
    console.error("✖ La clave debe tener al menos 4 caracteres.");
    process.exit(1);
  }
  if (!ROLES_VALIDOS.includes(rol)) {
    console.error(`✖ Rol inválido: ${rol}. Válidos: ${ROLES_VALIDOS.join(", ")}`);
    process.exit(1);
  }

  const DB_PATH = process.env.DB_PATH || path.join(__dirname, "..", "inventario_biorad.db");
  const db = await open({ filename: DB_PATH, driver: sqlite3.Database });

  const tabla = await db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='usuarios'");
  if (!tabla) {
    console.error("✖ La tabla 'usuarios' no existe. Arranca el servidor una vez para inicializar la DB.");
    process.exit(1);
  }

  const hash = await bcrypt.hash(clave, 10);
  const existente = await db.get("SELECT id FROM usuarios WHERE nombre = ?", [nombre]);

  if (existente) {
    await db.run(
      "UPDATE usuarios SET pin = ?, rol = ?, must_change_pin = 0, fecha_baja = NULL WHERE id = ?",
      [hash, rol, existente.id]
    );
    console.log(`✓ Usuario actualizado: ${nombre} (${rol}) — clave restablecida, sin forzar cambio.`);
  } else {
    await db.run(
      "INSERT INTO usuarios (id, nombre, rol, pin, must_change_pin) VALUES (?, ?, ?, ?, 0)",
      [randomUUID(), nombre, rol, hash]
    );
    console.log(`✓ Usuario creado: ${nombre} (${rol}).`);
  }

  await db.run(
    "INSERT INTO logs (usuario, perfil, accion, detalles, fecha, ip) VALUES (?, ?, ?, ?, ?, ?)",
    ["system", "ADMIN", existente ? "RESET ADMIN (script)" : "CREAR ADMIN (script)", `${nombre} (${rol})`, new Date().toISOString(), "localhost"]
  ).catch(() => {});

  await db.close();
  console.log(`  DB: ${DB_PATH}`);
}

main().catch((e) => { console.error("✖ Error:", e.message); process.exit(1); });
