// Tests del backend — auth helpers
// Ejecutar con: npm test

import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { describe, it, expect } from "vitest";

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
