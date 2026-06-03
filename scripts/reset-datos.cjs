"use strict";

// ════════════════════════════════════════════════════════════════════════════
// reset-datos.cjs — Vacía TODOS los datos operativos y usuarios (empezar de cero).
// NO toca el esquema ni las migraciones (user_version se mantiene).
//
// Uso (requiere --confirm para evitar accidentes):
//   node scripts/reset-datos.cjs --confirm
//
// ⚠ Destructivo e irreversible. Hacé un backup antes si los datos importan.
//   La DB se toma de DB_PATH o, por defecto, inventario_biorad.db en la raíz.
// ════════════════════════════════════════════════════════════════════════════

const path = require("path");
const sqlite3 = require("sqlite3").verbose();
const { open } = require("sqlite");

const TABLAS = [
  "inventario", "maestro_productos", "secciones", "protocolos",
  "anexos", "diuresis", "logs", "pii_access_log", "login_lockouts", "usuarios",
];

async function main() {
  if (!process.argv.includes("--confirm")) {
    console.error("✖ Operación destructiva. Para confirmar: node scripts/reset-datos.cjs --confirm");
    process.exit(1);
  }

  const DB_PATH = process.env.DB_PATH || path.join(__dirname, "..", "inventario_biorad.db");
  const db = await open({ filename: DB_PATH, driver: sqlite3.Database });

  await db.exec("BEGIN");
  try {
    for (const t of TABLAS) {
      const existe = await db.get("SELECT name FROM sqlite_master WHERE type='table' AND name=?", [t]);
      if (existe) {
        const { c } = await db.get(`SELECT COUNT(*) AS c FROM ${t}`);
        await db.run(`DELETE FROM ${t}`);
        console.log(`  ✓ ${t}: ${c} filas borradas`);
      }
    }
    await db.exec("COMMIT");
  } catch (e) {
    await db.exec("ROLLBACK");
    throw e;
  }

  // Compactar el archivo tras el borrado masivo
  await db.exec("VACUUM");
  await db.close();
  console.log(`\n✓ Reset completo. DB vacía y compactada: ${DB_PATH}`);
}

main().catch((e) => { console.error("✖ Error:", e.message); process.exit(1); });
