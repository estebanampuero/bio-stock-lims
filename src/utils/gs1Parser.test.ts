import { describe, it, expect } from "vitest";
import { parseGS1 } from "./gs1Parser";

describe("parseGS1", () => {
  it("retorna null si el código es vacío", () => {
    expect(parseGS1("")).toBeNull();
    expect(parseGS1("   ")).toBeNull();
  });

  it("parsea formato con paréntesis (01)(10)(17)", () => {
    const r = parseGS1("(01)07898000000017(10)LOTE123(17)260531");
    expect(r).toMatchObject({ gtin: "07898000000017", lot: "LOTE123", expiration: "260531", format: "GS1-parens" });
  });

  it("parsea formato crudo continuo", () => {
    const r = parseGS1("01078980000000171726053110LOTE123");
    expect(r?.gtin).toBe("07898000000017");
    expect(r?.expiration).toBe("260531");
    expect(r?.lot).toBe("LOTE123");
    expect(r?.format).toBe("GS1-raw");
  });

  it("normaliza separadores FNC1 (\\x1D) y corta el lote ahí (ignora serial AI 21)", () => {
    const r = parseGS1("01078980000000171726053110LOTE123\x1D21SERIAL999");
    expect(r?.gtin).toBe("07898000000017");
    expect(r?.lot).toBe("LOTE123");
  });

  it("tolera parciales: solo GTIN+lote sin vencimiento", () => {
    const r = parseGS1("(01)07898000000017(10)LOTE123");
    expect(r).toMatchObject({ gtin: "07898000000017", lot: "LOTE123", expiration: "" });
  });

  it("tolera parciales: solo GTIN", () => {
    const r = parseGS1("(01)07898000000017");
    expect(r).toMatchObject({ gtin: "07898000000017", lot: "", expiration: "" });
  });

  it("acepta lote alfanumérico con guiones y guion bajo", () => {
    const r = parseGS1("(01)07898000000017(10)A-123_X(17)270101");
    expect(r?.lot).toBe("A-123_X");
  });

  it("EAN-13 simple → GTIN-14 con padding", () => {
    const r = parseGS1("7898000000017");
    expect(r).toMatchObject({ gtin: "07898000000017", lot: "", expiration: "", format: "GTIN" });
  });

  it("GTIN-14 crudo (ITF-14)", () => {
    const r = parseGS1("07898000000017");
    expect(r).toMatchObject({ gtin: "07898000000017", format: "GTIN" });
  });

  it("retorna null para texto no reconocible", () => {
    expect(parseGS1("hola mundo")).toBeNull();
  });
});
