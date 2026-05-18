import { describe, it, expect } from "vitest";
import { parseGS1 } from "./gs1Parser";

describe("parseGS1", () => {
  it("retorna null si el código es vacío", () => {
    expect(parseGS1("")).toBeNull();
  });

  it("parsea formato con paréntesis (01)(10)(17)", () => {
    const r = parseGS1("(01)07898000000017(10)LOTE123(17)260531");
    expect(r).toEqual({ gtin: "07898000000017", lot: "LOTE123", expiration: "260531" });
  });

  it("parsea formato crudo continuo", () => {
    const r = parseGS1("01078980000000171726053110LOTE123");
    expect(r?.gtin).toBe("07898000000017");
    expect(r?.expiration).toBe("260531");
    expect(r?.lot).toBe("LOTE123");
  });

  it("normaliza separadores GS (\\x1D) a pipe", () => {
    const r = parseGS1("01078980000000171726053110LOTE123\x1D");
    expect(r?.lot).toBe("LOTE123");
  });

  it("retorna null si falta alguno de los 3 campos", () => {
    expect(parseGS1("(01)07898000000017(10)LOTE123")).toBeNull(); // sin exp
    expect(parseGS1("(01)07898000000017")).toBeNull();             // solo GTIN
  });

  it("acepta lote alfanumérico con guiones", () => {
    const r = parseGS1("(01)07898000000017(10)A-123_X(17)270101");
    expect(r?.lot).toBe("A-123_X");
  });
});
