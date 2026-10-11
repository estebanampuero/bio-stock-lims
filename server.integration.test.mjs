// Tests de integración: arrancan el server.cjs real sobre una DB temporal.
// Ejecutar con: npm test

import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import net from "node:net";
import { fileURLToPath } from "node:url";
import { describe, it, expect, afterAll } from "vitest";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const tmpDirs = [];

function newDataDir() {
  const dir = mkdtempSync(path.join(tmpdir(), "biostock-it-"));
  tmpDirs.push(dir);
  return dir;
}

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

async function startServer(dataDir) {
  const port = await freePort();
  const child = spawn(process.execPath, ["server.cjs"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      DB_PATH: path.join(dataDir, "test.db"),
      SECRETS_DIR: path.join(dataDir, "secrets"),
      BACKUPS_DIR: path.join(dataDir, "backups"),
      // HTTP aunque existan cert.pem/key.pem en el repo (entorno de desarrollo)
      TLS_CERT: path.join(dataDir, "sin-cert.pem"),
      TLS_KEY: path.join(dataDir, "sin-key.pem"),
      AUTO_ROTATE_DEFAULT_PIN: "",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", d => { output += d; });
  child.stderr.on("data", d => { output += d; });

  // /health responde apenas abre la DB; "API lista" se imprime tras migraciones y seeds.
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 150; i++) {
    if (child.exitCode !== null) throw new Error(`server.cjs terminó al arrancar:\n${output}`);
    if (output.includes("API lista")) {
      try { if ((await fetch(`${base}/health`)).ok) return { child, base }; } catch { /* aún no escucha */ }
    }
    await new Promise(r => setTimeout(r, 200));
  }
  child.kill();
  throw new Error(`server.cjs no quedó listo:\n${output}`);
}

function stopServer({ child }) {
  return new Promise(resolve => {
    if (child.exitCode !== null) return resolve();
    child.once("exit", () => resolve());
    child.kill();
  });
}

async function api(base, method, route, { token, body } = {}) {
  const res = await fetch(`${base}/api/v1${route}`, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

const login = (base, nombre, pin) => api(base, "POST", "/login", { body: { nombre, pin } });

describe("server.cjs — PIN inicial del admin", () => {
  it("con el PIN de fábrica exige cambiarlo y bloquea la API, también tras reiniciar", async () => {
    const dir = newDataDir();
    let s = await startServer(dir);
    try {
      const l = await login(s.base, "admin", "1234");
      expect(l.status).toBe(200);
      expect(l.body.user.must_change_pin).toBe(true);
      expect((await api(s.base, "GET", "/inventario", { token: l.body.token })).status).toBe(403);
    } finally { await stopServer(s); }

    s = await startServer(dir);
    try {
      const l = await login(s.base, "admin", "1234");
      expect(l.body.user.must_change_pin).toBe(true);
    } finally { await stopServer(s); }
  }, 60_000);

  it("tras cambiar el PIN, reiniciar el servidor no vuelve a forzar el cambio", async () => {
    const dir = newDataDir();
    let s = await startServer(dir);
    try {
      const l = await login(s.base, "admin", "1234");
      const c = await api(s.base, "POST", "/cambiar-pin", { token: l.body.token, body: { pinActual: "1234", pinNuevo: "8642" } });
      expect(c.status).toBe(200);
    } finally { await stopServer(s); }

    s = await startServer(dir);
    try {
      const l = await login(s.base, "admin", "8642");
      expect(l.status).toBe(200);
      expect(l.body.user.must_change_pin).toBe(false);
      expect((await api(s.base, "GET", "/inventario", { token: l.body.token })).status).toBe(200);
    } finally { await stopServer(s); }
  }, 60_000);
});

afterAll(() => {
  for (const d of tmpDirs) {
    try { rmSync(d, { recursive: true, force: true }); } catch { /* Windows puede retener el archivo un instante */ }
  }
});
