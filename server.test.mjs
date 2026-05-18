// Tests del backend — crypto + auth helpers
// Ejecutar con: npm test

import crypto from "crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { describe, it, expect } from "vitest";

const KEY = crypto.randomBytes(32);

function encPII(plain) {
  if (plain === null || plain === undefined || plain === "") return "";
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", KEY, iv);
  const enc = Buffer.concat([cipher.update(String(plain), "utf8"), cipher.final()]);
  return `enc:v1:${iv.toString("hex")}:${cipher.getAuthTag().toString("hex")}:${enc.toString("hex")}`;
}
function decPII(stored) {
  if (!stored) return "";
  if (typeof stored !== "string" || !stored.startsWith("enc:v1:")) return stored;
  const parts = stored.split(":");
  if (parts.length !== 5) return "";
  try {
    const decipher = crypto.createDecipheriv("aes-256-gcm", KEY, Buffer.from(parts[2], "hex"));
    decipher.setAuthTag(Buffer.from(parts[3], "hex"));
    return Buffer.concat([decipher.update(Buffer.from(parts[4], "hex")), decipher.final()]).toString("utf8");
  } catch (_) { return ""; }
}

describe("AES-256-GCM PII roundtrip", () => {
  it("cifra y descifra strings simples", () => {
    const orig = "12.345.678-9";
    const enc = encPII(orig);
    expect(enc).toMatch(/^enc:v1:/);
    expect(decPII(enc)).toBe(orig);
  });

  it("cifra y descifra strings unicode/acentos", () => {
    const orig = "GONZÁLEZ, JOSÉ MARÍA";
    expect(decPII(encPII(orig))).toBe(orig);
  });

  it("retorna '' para entradas vacías/null/undefined", () => {
    expect(encPII("")).toBe("");
    expect(encPII(null)).toBe("");
    expect(encPII(undefined)).toBe("");
  });

  it("retorna plaintext legacy sin cifrar (compat hacia atrás)", () => {
    expect(decPII("plaintext-legacy")).toBe("plaintext-legacy");
  });

  it("retorna '' si el cifrado está corrupto", () => {
    expect(decPII("enc:v1:badbad:badbad:badbad")).toBe("");
  });

  it("genera un IV distinto cada vez (no determinístico)", () => {
    const a = encPII("test");
    const b = encPII("test");
    expect(a).not.toBe(b);
    expect(decPII(a)).toBe("test");
    expect(decPII(b)).toBe("test");
  });
});

describe("bcrypt PIN hashing", () => {
  it("hashea y verifica el PIN correctamente", async () => {
    const pin = "8421";
    const hash = await bcrypt.hash(pin, 10);
    expect(hash).toMatch(/^\$2/);
    expect(await bcrypt.compare(pin, hash)).toBe(true);
    expect(await bcrypt.compare("wrong", hash)).toBe(false);
  });

  it("hashes diferentes para el mismo PIN (salt random)", async () => {
    const a = await bcrypt.hash("1234", 10);
    const b = await bcrypt.hash("1234", 10);
    expect(a).not.toBe(b);
    expect(await bcrypt.compare("1234", a)).toBe(true);
    expect(await bcrypt.compare("1234", b)).toBe(true);
  });
});

describe("JWT signing", () => {
  const SECRET = "test-secret-do-not-use-in-prod";

  it("firma y verifica un token válido", () => {
    const token = jwt.sign({ sub: "user1", rol: "ADMIN" }, SECRET, { expiresIn: "1h" });
    const decoded = jwt.verify(token, SECRET);
    expect(decoded.sub).toBe("user1");
    expect(decoded.rol).toBe("ADMIN");
  });

  it("rechaza token con secret incorrecto", () => {
    const token = jwt.sign({ sub: "user1" }, SECRET);
    expect(() => jwt.verify(token, "wrong-secret")).toThrow();
  });

  it("rechaza token malformado", () => {
    expect(() => jwt.verify("not.a.token", SECRET)).toThrow();
  });
});
