// Parser multi-formato de códigos de barras / 2D para reactivos y controles.
// Estrategias en orden: GS1 con paréntesis → GS1 crudo (tokenizador por AI) →
// GTIN solo (EAN-13 / UPC-A / ITF-14 / GTIN-14). Tolerante a parciales: devuelve
// lo que pueda extraer (GTIN siempre presente si matchea); null solo si no hay nada.

export type ScanFormat = "GS1-parens" | "GS1-raw" | "GTIN" | "desconocido";

export interface BioRadProduct {
  gtin: string;
  lot: string;
  expiration: string; // GS1 AAMMDD tal cual viene; "" si no hay
  format?: ScanFormat;
}

// ── Estrategia A: GS1 con paréntesis  (01)...(17)...(10)... ────────────────────
function parseGS1Parens(s: string): BioRadProduct | null {
  if (!s.includes("(")) return null;
  const gtin = (s.match(/\(01\)\s*(\d{14})/) || [])[1] || "";
  if (!gtin) return null;
  // Vencimiento: AI 17 (expiry) o, como respaldo, AI 15 (best-before)
  let expiration = (s.match(/\(17\)\s*(\d{6})/) || [])[1] || "";
  if (!expiration) expiration = (s.match(/\(15\)\s*(\d{6})/) || [])[1] || "";
  // Lote: AI 10, variable, hasta el próximo paréntesis o fin
  const lot = ((s.match(/\(10\)\s*([^(]+)/) || [])[1] || "").trim();
  return { gtin, lot, expiration, format: "GS1-parens" };
}

// ── Estrategia B: GS1 crudo continuo (tokenizador por Application Identifier) ───
// Normaliza FNC1 (\x1D/\x1E/\x1F) y recorre AI por AI. Maneja 01, 17, 15, 11, 16
// (fijos de 6/14) y 10, 21 (variables, terminan en FNC1 o fin de cadena).
function parseGS1Raw(input: string): BioRadProduct | null {
  const s = input.replace(/[\x1D\x1E\x1F]/g, "\x1D");
  const n = s.length;
  let gtin = "", lot = "", expiration = "";
  let i = 0;
  while (i < n) {
    if (s[i] === "\x1D") { i++; continue; }
    const ai = s.substr(i, 2);
    if (ai === "01" && /^\d{14}$/.test(s.substr(i + 2, 14))) {
      gtin = s.substr(i + 2, 14); i += 16;
    } else if ((ai === "17" || ai === "15") && /^\d{6}$/.test(s.substr(i + 2, 6))) {
      if (!expiration) expiration = s.substr(i + 2, 6);
      i += 8;
    } else if ((ai === "11" || ai === "16") && /^\d{6}$/.test(s.substr(i + 2, 6))) {
      i += 8; // fecha de producción / venta — la consumimos pero no la usamos
    } else if (ai === "10" || ai === "21") {
      let j = i + 2;
      while (j < n && s[j] !== "\x1D") j++;
      const val = s.substring(i + 2, j);
      if (ai === "10") lot = val; // 21 = serial, lo ignoramos
      i = j;
    } else {
      break; // AI desconocido → cortar para no parsear basura
    }
  }
  if (!gtin) return null;
  return { gtin, lot, expiration, format: "GS1-raw" };
}

// ── Estrategia C: solo GTIN (EAN-13 / UPC-A / ITF-14 / GTIN-14 / EAN-8) ─────────
// Normaliza a GTIN-14 con padding de ceros, igual que el AI (01).
function parseGTINOnly(s: string): BioRadProduct | null {
  const digits = s.replace(/\D/g, "");
  if (![8, 12, 13, 14].includes(digits.length)) return null;
  const gtin = digits.length === 14 ? digits : digits.padStart(14, "0");
  return { gtin, lot: "", expiration: "", format: "GTIN" };
}

export function parseGS1(codigo: string): BioRadProduct | null {
  if (!codigo) return null;
  const code = codigo.trim();
  if (!code) return null;
  return parseGS1Parens(code) || parseGS1Raw(code) || parseGTINOnly(code) || null;
}
