import { useState, useRef, useEffect } from "react";
import { parseGS1 } from "../utils/gs1Parser";

interface DiagRow {
  raw: string;
  gtin: string;
  lot: string;
  expiration: string;
  format: string;
}

const fmtColorMap: Record<string, string> = {
  "GS1-parens": "#059669",
  "GS1-raw": "#005a9c",
  "GTIN": "#d97706",
  "desconocido": "#dc2626",
};
const colorFor = (fmt: string) => fmt.startsWith("custom:") ? "#7c3aed" : (fmtColorMap[fmt] || "#64748b");

// Modo diagnóstico: pistolea cualquier código y muestra el texto crudo + qué
// entendió el parser. Sirve para validar cobertura y juntar muestras de formatos
// nuevos (botón "Copiar crudos").
export function ScanDiagnostic({ onClose }: { onClose: () => void }) {
  const [rows, setRows] = useState<DiagRow[]>([]);
  const [copiado, setCopiado] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const onScan = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const raw = inputRef.current?.value ?? "";
    if (inputRef.current) inputRef.current.value = "";
    if (!raw.trim()) return;
    const p = parseGS1(raw);
    setRows(rs => [{
      raw,
      gtin: p?.gtin || "",
      lot: p?.lot || "",
      expiration: p?.expiration || "",
      format: p?.format || "desconocido",
    }, ...rs]);
  };

  const copiarCrudos = async () => {
    const txt = rows.map(r => r.raw).join("\n");
    try { await navigator.clipboard.writeText(txt); setCopiado(true); setTimeout(() => setCopiado(false), 1500); } catch { /* noop */ }
  };

  const cell: React.CSSProperties = { padding: "7px 10px", fontSize: 12, borderBottom: "1px solid rgba(0,0,0,0.06)", fontFamily: "monospace", whiteSpace: "nowrap" };
  const th: React.CSSProperties = { padding: "8px 10px", fontSize: 11, fontWeight: 800, color: "#64748b", textAlign: "left", textTransform: "uppercase", letterSpacing: 0.3 };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.55)", backdropFilter: "blur(4px)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "white", borderRadius: 16, width: "min(820px, 96vw)", maxHeight: "88vh", display: "flex", flexDirection: "column", boxShadow: "0 24px 60px rgba(0,0,0,0.35)" }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid rgba(0,0,0,0.08)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 16, color: "#0f172a" }}>🔬 Diagnóstico de escáner</div>
            <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>Pistolea cualquier código de barras o QR para ver qué entiende el sistema.</div>
          </div>
          <button onClick={onClose} style={{ border: "none", background: "rgba(0,0,0,0.05)", borderRadius: 8, width: 32, height: 32, cursor: "pointer", fontSize: 18, color: "#64748b" }}>×</button>
        </div>

        <div style={{ padding: "14px 20px" }}>
          <input ref={inputRef} onKeyDown={onScan} placeholder="Apunte aquí y dispare el escáner…" style={{ width: "100%", padding: "12px 14px", borderRadius: 10, border: "2px solid #005a9c", fontSize: 14, fontFamily: "monospace", boxSizing: "border-box", outline: "none" }} />
        </div>

        <div style={{ flex: 1, overflow: "auto", padding: "0 20px" }}>
          {rows.length === 0 ? (
            <div style={{ textAlign: "center", color: "#94a3b8", padding: "40px 0", fontSize: 13 }}>Aún no hay escaneos. Dispara un código arriba.</div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr><th style={th}>Formato</th><th style={th}>GTIN</th><th style={th}>Lote</th><th style={th}>Venc.</th><th style={th}>Texto crudo</th></tr></thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i}>
                    <td style={cell}><span style={{ background: colorFor(r.format) + "22", color: colorFor(r.format), fontWeight: 700, fontSize: 10, padding: "2px 7px", borderRadius: 6 }}>{r.format}</span></td>
                    <td style={cell}>{r.gtin || "—"}</td>
                    <td style={cell}>{r.lot || "—"}</td>
                    <td style={cell}>{r.expiration || "—"}</td>
                    <td style={{ ...cell, color: "#475569", maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis" }} title={r.raw}>{r.raw}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div style={{ padding: "14px 20px", borderTop: "1px solid rgba(0,0,0,0.08)", display: "flex", gap: 10, justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 12, color: "#64748b" }}>{rows.length} escaneo{rows.length !== 1 ? "s" : ""}</span>
          <div style={{ display: "flex", gap: 8 }}>
            {rows.length > 0 && <button onClick={() => setRows([])} style={{ padding: "9px 16px", border: "1px solid rgba(0,0,0,0.12)", background: "white", borderRadius: 9, fontWeight: 700, cursor: "pointer", fontSize: 12, color: "#64748b" }}>Limpiar</button>}
            {rows.length > 0 && <button onClick={copiarCrudos} style={{ padding: "9px 16px", border: "none", background: "#005a9c", color: "white", borderRadius: 9, fontWeight: 800, cursor: "pointer", fontSize: 12 }}>{copiado ? "✓ Copiado" : "Copiar crudos"}</button>}
          </div>
        </div>
      </div>
    </div>
  );
}
