import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { formatExp, validarFechaGS1, getEstado } from "./format";

describe("formatExp", () => {
  it("formatea AAMMDD a DD/MM/AAAA", () => {
    expect(formatExp("260531")).toBe("31/05/2026");
  });
  it("retorna em-dash si el código es vacío", () => {
    expect(formatExp("")).toBe("—");
  });
  it("retorna el input si no tiene 6 dígitos", () => {
    expect(formatExp("123")).toBe("123");
  });
});

describe("validarFechaGS1", () => {
  it("acepta fecha válida", () => {
    expect(validarFechaGS1("260531")).toBeNull();
  });
  it("rechaza fechas con menos de 6 dígitos", () => {
    expect(validarFechaGS1("12345")).toMatch(/AAMMDD/);
  });
  it("rechaza mes inválido", () => {
    expect(validarFechaGS1("261331")).toMatch(/Mes inválido/);
  });
  it("rechaza día inválido (30 de febrero)", () => {
    expect(validarFechaGS1("260230")).toMatch(/Día inválido/);
  });
  it("acepta 29-feb en año bisiesto", () => {
    expect(validarFechaGS1("280229")).toBeNull(); // 2028 es bisiesto
  });
});

describe("getEstado", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
  });
  afterEach(() => { vi.useRealTimers(); });

  it("retorna vencido si la fecha es claramente pasada", () => {
    expect(getEstado("250601")).toBe("vencido"); // 1/6/2025, claramente antes de 2026-01-01
  });
  it("retorna por-vencer si vence en <90 días", () => {
    expect(getEstado("260201")).toBe("por-vencer"); // 1/2/2026, ~30 días
  });
  it("retorna activo si vence en >90 días", () => {
    expect(getEstado("270101")).toBe("activo");
  });
});
