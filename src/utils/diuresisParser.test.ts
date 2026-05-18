import { describe, it, expect } from "vitest";
import { parseDiuresisBarcode } from "./diuresisParser";

describe("parseDiuresisBarcode", () => {
  it("parsea formato pipe-delimited peticion|rut|nombre", () => {
    const r = parseDiuresisBarcode("12345|11.111.111-1|PEREZ, JUAN");
    expect(r).toEqual({ peticion: "12345", rut: "11.111.111-1", nombre: "PEREZ, JUAN" });
  });

  it("parsea formato semicolon-delimited", () => {
    const r = parseDiuresisBarcode("99999;22.222.222-2;LOPEZ, MARIA");
    expect(r).toEqual({ peticion: "99999", rut: "22.222.222-2", nombre: "LOPEZ, MARIA" });
  });

  it("trims whitespace en todos los campos", () => {
    const r = parseDiuresisBarcode("  12345 | 11-1  |  CRUZ ");
    expect(r.peticion).toBe("12345");
    expect(r.rut).toBe("11-1");
    expect(r.nombre).toBe("CRUZ");
  });

  it("trata código sin separadores como solo petición", () => {
    const r = parseDiuresisBarcode("88776655");
    expect(r).toEqual({ peticion: "88776655", rut: "", nombre: "" });
  });

  it("requiere 3 partes para considerar pipe válido", () => {
    const r = parseDiuresisBarcode("12345|11-1"); // solo 2 partes
    expect(r.peticion).toBe("12345|11-1"); // cae al fallback
  });
});
