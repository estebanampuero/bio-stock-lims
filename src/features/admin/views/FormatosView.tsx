import { useEffect, useState } from "react";
import { apiFetch } from "../../../lib/api";
import { matchRegex, normalizeExp, setCustomScanFormats } from "../../../utils/gs1Parser";
import type { ThemeTokens } from "../adminTheme";
import { FONT } from "../adminTheme";

interface Formato {
  id: string; nombre: string; descripcion: string;
  gtin_regex: string; lot_regex: string; exp_regex: string;
  exp_formato: string; prioridad: number; activo: number;
}

const EMPTY: Formato = {
  id: "", nombre: "", descripcion: "",
  gtin_regex: "", lot_regex: "", exp_regex: "",
  exp_formato: "AAMMDD", prioridad: 100, activo: 1,
};

const FORMATOS_FECHA = ["AAMMDD", "AAAAMMDD", "DDMMAA", "DDMMAAAA", "MMDDAA"];

// Genera una regex de partida a partir de un ejemplo: busca el valor en el crudo
// y arma <prefijo>(clase{largo}). El usuario la afina en el probador.
function sugerirRegex(raw: string, value: string): string {
  if (!raw || !value) return "";
  const idx = raw.indexOf(value);
  if (idx < 0) return "";
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const prefix = raw.slice(Math.max(0, idx - 4), idx);
  const cls = /^\d+$/.test(value) ? "\\d" : "[A-Za-z0-9._\\-]";
  return esc(prefix) + "(" + cls + "{" + value.length + "})";
}

const regexValida = (rx: string) => { if (!rx) return true; try { new RegExp(rx); return true; } catch { return false; } };

export function FormatosView({ tokens, onAction }: { tokens: ThemeTokens; onAction?: (m: string, k?: "success" | "error" | "info") => void }) {
  const [formats, setFormats] = useState<Formato[]>([]);
  const [editing, setEditing] = useState<Formato | null>(null);
  const [testCode, setTestCode] = useState("");
  const [ex, setEx] = useState({ raw: "", gtin: "", lot: "", exp: "" });

  const load = async () => {
    const r = await apiFetch("/scan-formats/all");
    const all: Formato[] = r.ok ? await r.json() : [];
    setFormats(all);
    setCustomScanFormats(all.filter(f => f.activo) as any); // refresca el parser en vivo
  };
  useEffect(() => { load(); }, []);

  const set = (k: keyof Formato, v: any) => setEditing(e => e ? { ...e, [k]: v } : e);

  const guardar = async () => {
    if (!editing) return;
    if (!editing.nombre || !editing.gtin_regex) { onAction?.("Nombre y regex de GTIN son obligatorios", "error"); return; }
    if (!regexValida(editing.gtin_regex) || !regexValida(editing.lot_regex) || !regexValida(editing.exp_regex)) {
      onAction?.("Hay una regex inválida — revisa los campos marcados", "error"); return;
    }
    const body = JSON.stringify(editing);
    const r = editing.id
      ? await apiFetch(`/scan-formats/${editing.id}`, { method: "PUT", body })
      : await apiFetch(`/scan-formats`, { method: "POST", body });
    const d = await r.json().catch(() => ({} as any));
    if (!r.ok || !d.success) { onAction?.(d.message || "No se pudo guardar", "error"); return; }
    onAction?.(editing.id ? "Formato actualizado" : "Formato creado", "success");
    setEditing(null); setTestCode(""); setEx({ raw: "", gtin: "", lot: "", exp: "" });
    await load();
  };

  const eliminar = async (f: Formato) => {
    if (!window.confirm(`¿Eliminar el formato "${f.nombre}"?`)) return;
    const r = await apiFetch(`/scan-formats/${f.id}`, { method: "DELETE" });
    if (r.ok) { onAction?.("Formato eliminado", "success"); await load(); }
    else onAction?.("No se pudo eliminar", "error");
  };

  const toggle = async (f: Formato) => {
    await apiFetch(`/scan-formats/${f.id}`, { method: "PUT", body: JSON.stringify({ ...f, activo: f.activo ? 0 : 1 }) });
    await load();
  };

  // Probador en vivo
  const tGtin = editing ? matchRegex(editing.gtin_regex, testCode) : "";
  const tLot = editing ? matchRegex(editing.lot_regex, testCode) : "";
  const tExpRaw = editing ? matchRegex(editing.exp_regex, testCode) : "";
  const tExp = tExpRaw ? normalizeExp(tExpRaw, editing!.exp_formato) : "";

  const inp = (bad = false): React.CSSProperties => ({
    width: "100%", padding: "9px 11px", borderRadius: 8, fontSize: 13, boxSizing: "border-box",
    border: `1.5px solid ${bad ? tokens.danger : tokens.border}`, background: tokens.bgElev, color: tokens.text,
    fontFamily: FONT.mono, outline: "none",
  });
  const lbl: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: tokens.text2, marginBottom: 4, display: "block" };
  const card: React.CSSProperties = { background: tokens.bgElev, border: `1px solid ${tokens.border}`, borderRadius: 12, padding: 18 };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, fontFamily: FONT.sans }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h3 style={{ margin: 0, color: tokens.text, fontSize: 15 }}>Formatos de escáner</h3>
          <p style={{ margin: "4px 0 0", color: tokens.text2, fontSize: 12 }}>Reglas (regex) para leer códigos de barras de cualquier laboratorio. Aplican a todos.</p>
        </div>
        {!editing && <button onClick={() => setEditing({ ...EMPTY })} style={{ padding: "9px 16px", background: tokens.accent, color: "white", border: "none", borderRadius: 9, fontWeight: 700, cursor: "pointer", fontSize: 13 }}>+ Nuevo formato</button>}
      </div>

      {editing && (
        <div style={card}>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12, marginBottom: 12 }}>
            <div><label style={lbl}>Nombre *</label><input value={editing.nombre} onChange={e => set("nombre", e.target.value)} placeholder="Reactivos Fabricante X" style={{ ...inp(), fontFamily: FONT.sans }} /></div>
            <div><label style={lbl}>Prioridad</label><input type="number" value={editing.prioridad} onChange={e => set("prioridad", parseInt(e.target.value) || 100)} style={{ ...inp(), fontFamily: FONT.sans }} /></div>
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={lbl}>Regex GTIN * (grupo de captura 1)</label>
            <input value={editing.gtin_regex} onChange={e => set("gtin_regex", e.target.value)} placeholder="ej: 01(\d{14})" style={inp(!regexValida(editing.gtin_regex))} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
            <div><label style={lbl}>Regex Lote</label><input value={editing.lot_regex} onChange={e => set("lot_regex", e.target.value)} placeholder="ej: 10([A-Za-z0-9-]+)" style={inp(!regexValida(editing.lot_regex))} /></div>
            <div>
              <label style={lbl}>Regex Vencimiento</label>
              <div style={{ display: "flex", gap: 8 }}>
                <input value={editing.exp_regex} onChange={e => set("exp_regex", e.target.value)} placeholder="ej: 17(\d{6})" style={inp(!regexValida(editing.exp_regex))} />
                <select value={editing.exp_formato} onChange={e => set("exp_formato", e.target.value)} style={{ ...inp(), width: 130, fontFamily: FONT.sans }}>
                  {FORMATOS_FECHA.map(f => <option key={f} value={f}>{f}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* Sugerir desde ejemplo */}
          <details style={{ marginBottom: 12, background: tokens.bgElev2, borderRadius: 8, padding: "10px 12px" }}>
            <summary style={{ cursor: "pointer", fontSize: 12, fontWeight: 700, color: tokens.text2 }}>💡 Sugerir regex desde un ejemplo</summary>
            <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
              <input value={ex.raw} onChange={e => setEx(s => ({ ...s, raw: e.target.value }))} placeholder="Pega el código crudo que te mandó el laboratorio" style={inp()} />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                <input value={ex.gtin} onChange={e => setEx(s => ({ ...s, gtin: e.target.value }))} placeholder="GTIN esperado" style={inp()} />
                <input value={ex.lot} onChange={e => setEx(s => ({ ...s, lot: e.target.value }))} placeholder="Lote esperado" style={inp()} />
                <input value={ex.exp} onChange={e => setEx(s => ({ ...s, exp: e.target.value }))} placeholder="Venc. esperado" style={inp()} />
              </div>
              <button onClick={() => setEditing(ed => ed ? { ...ed, gtin_regex: sugerirRegex(ex.raw, ex.gtin) || ed.gtin_regex, lot_regex: sugerirRegex(ex.raw, ex.lot) || ed.lot_regex, exp_regex: sugerirRegex(ex.raw, ex.exp) || ed.exp_regex } : ed)}
                style={{ justifySelf: "start", padding: "7px 14px", background: tokens.accentSoft, color: tokens.accent, border: "none", borderRadius: 8, fontWeight: 700, cursor: "pointer", fontSize: 12 }}>Generar regex</button>
            </div>
          </details>

          {/* Probador en vivo */}
          <div style={{ background: tokens.bgElev2, borderRadius: 8, padding: "10px 12px", marginBottom: 14 }}>
            <label style={lbl}>🔬 Código de prueba</label>
            <input value={testCode} onChange={e => setTestCode(e.target.value)} placeholder="Pega un código y mira qué extrae" style={inp()} />
            {testCode && (
              <div style={{ marginTop: 8, display: "flex", gap: 16, fontSize: 12, fontFamily: FONT.mono, flexWrap: "wrap" }}>
                <span style={{ color: tGtin ? tokens.success : tokens.text3 }}>GTIN: <b>{tGtin || "—"}</b></span>
                <span style={{ color: tLot ? tokens.success : tokens.text3 }}>Lote: <b>{tLot || "—"}</b></span>
                <span style={{ color: tExp ? tokens.success : tokens.text3 }}>Venc: <b>{tExp || "—"}</b>{tExpRaw ? ` (crudo ${tExpRaw})` : ""}</span>
              </div>
            )}
          </div>

          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button onClick={() => { setEditing(null); setTestCode(""); }} style={{ padding: "9px 16px", border: `1px solid ${tokens.border}`, background: tokens.bgElev, color: tokens.text2, borderRadius: 9, fontWeight: 700, cursor: "pointer", fontSize: 13 }}>Cancelar</button>
            <button onClick={guardar} style={{ padding: "9px 20px", background: tokens.accent, color: "white", border: "none", borderRadius: 9, fontWeight: 800, cursor: "pointer", fontSize: 13 }}>Guardar</button>
          </div>
        </div>
      )}

      {/* Lista */}
      <div style={card}>
        {formats.length === 0
          ? <div style={{ textAlign: "center", color: tokens.text3, padding: "30px 0", fontSize: 13 }}>Sin formatos personalizados. El sistema usa los built-in (GS1 / EAN). Agrega uno cuando un laboratorio reporte un código que no lee.</div>
          : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead><tr>{["Nombre", "GTIN", "Lote", "Venc.", "Prio.", "Estado", ""].map(h => <th key={h} style={{ textAlign: "left", padding: "8px 10px", fontSize: 11, color: tokens.text3, fontWeight: 700, textTransform: "uppercase" }}>{h}</th>)}</tr></thead>
              <tbody>
                {formats.map(f => (
                  <tr key={f.id} style={{ borderTop: `1px solid ${tokens.border}` }}>
                    <td style={{ padding: "9px 10px", color: tokens.text, fontWeight: 700 }}>{f.nombre}</td>
                    <td style={{ padding: "9px 10px", color: tokens.text2, fontFamily: FONT.mono, fontSize: 11 }}>{f.gtin_regex}</td>
                    <td style={{ padding: "9px 10px", color: tokens.text2, fontFamily: FONT.mono, fontSize: 11 }}>{f.lot_regex || "—"}</td>
                    <td style={{ padding: "9px 10px", color: tokens.text2, fontFamily: FONT.mono, fontSize: 11 }}>{f.exp_regex || "—"}</td>
                    <td style={{ padding: "9px 10px", color: tokens.text2 }}>{f.prioridad}</td>
                    <td style={{ padding: "9px 10px" }}>
                      <button onClick={() => toggle(f)} style={{ cursor: "pointer", border: "none", borderRadius: 6, padding: "3px 9px", fontSize: 11, fontWeight: 700, background: f.activo ? tokens.successSoft : tokens.bgElev2, color: f.activo ? tokens.success : tokens.text3 }}>{f.activo ? "Activo" : "Inactivo"}</button>
                    </td>
                    <td style={{ padding: "9px 10px", textAlign: "right", whiteSpace: "nowrap" }}>
                      <button onClick={() => { setEditing(f); setTestCode(""); }} style={{ cursor: "pointer", border: "none", background: "transparent", color: tokens.accent, fontWeight: 700, fontSize: 12, marginRight: 10 }}>Editar</button>
                      <button onClick={() => eliminar(f)} style={{ cursor: "pointer", border: "none", background: "transparent", color: tokens.danger, fontWeight: 700, fontSize: 12 }}>Eliminar</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
      </div>
    </div>
  );
}
