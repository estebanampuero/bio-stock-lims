import { useEffect, useState } from "react";
import { apiFetch } from "../../../lib/api";
import type { ThemeTokens } from "../adminTheme";
import { FONT } from "../adminTheme";

interface Backup { name: string; size: number; mtime: string; }

const fmtKB = (b: number) => `${(b / 1024).toFixed(0)} KB`;
const fmtFecha = (iso: string) => { try { return new Date(iso).toLocaleString("es-CL"); } catch { return iso; } };

export function RespaldosView({ tokens, onAction }: { tokens: ThemeTokens; onAction?: (m: string, k?: "success" | "error" | "info") => void }) {
  const [backups, setBackups] = useState<Backup[]>([]);
  const [retention, setRetention] = useState(30);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const r = await apiFetch("/admin/backups");
    if (r.ok) { const d = await r.json(); setBackups(d.backups || []); setRetention(d.retention_days || 30); }
  };
  useEffect(() => { load(); }, []);

  const exportar = async () => {
    setBusy(true);
    try {
      const r = await apiFetch("/admin/export-db");
      if (!r.ok) { onAction?.("No se pudo exportar la base", "error"); return; }
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
      a.href = url; a.download = `biostock_${ts}.db`; document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
      onAction?.("Base de datos descargada", "success");
    } catch { onAction?.("Error al exportar", "error"); }
    finally { setBusy(false); }
  };

  const crearBackup = async () => {
    setBusy(true);
    try {
      const r = await apiFetch("/admin/backups/run", { method: "POST", body: JSON.stringify({}) });
      const d = await r.json().catch(() => ({} as any));
      if (r.ok && d.success) { onAction?.("Backup creado", "success"); await load(); }
      else onAction?.(d.message || "No se pudo crear el backup", "error");
    } finally { setBusy(false); }
  };

  const card: React.CSSProperties = { background: tokens.bgElev, border: `1px solid ${tokens.border}`, borderRadius: 12, padding: 18 };
  const btn = (bg: string): React.CSSProperties => ({ padding: "10px 18px", background: bg, color: "white", border: "none", borderRadius: 9, fontWeight: 700, cursor: busy ? "wait" : "pointer", fontSize: 13, opacity: busy ? 0.6 : 1 });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, fontFamily: FONT.sans }}>
      <div style={card}>
        <h3 style={{ margin: 0, color: tokens.text, fontSize: 15 }}>Exportar base de datos</h3>
        <p style={{ margin: "6px 0 14px", color: tokens.text2, fontSize: 13, lineHeight: 1.5 }}>
          Descarga <b>toda la base</b> en un solo archivo (inventario, productos, usuarios con sus claves, protocolos, anexos, formatos).
          Úsalo para llevar los datos al instalar el sistema on-premise en el laboratorio — sin perder nada.
        </p>
        <button onClick={exportar} disabled={busy} style={btn(tokens.accent)}>⬇ Descargar base de datos</button>
        <p style={{ margin: "12px 0 0", color: tokens.text3, fontSize: 11.5 }}>
          Se genera una copia consistente (no se interrumpe el servicio). En el PC del laboratorio: instalar BIO-STOCK,
          detener el servicio, reemplazar <code>inventario_biorad.db</code> por este archivo, reiniciar.
        </p>
      </div>

      <div style={card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div>
            <h3 style={{ margin: 0, color: tokens.text, fontSize: 15 }}>Backups automáticos</h3>
            <p style={{ margin: "4px 0 0", color: tokens.text2, fontSize: 12 }}>Diarios a las 02:00 · retención {retention} días</p>
          </div>
          <button onClick={crearBackup} disabled={busy} style={btn(tokens.success)}>+ Crear backup ahora</button>
        </div>
        {backups.length === 0
          ? <div style={{ textAlign: "center", color: tokens.text3, padding: "24px 0", fontSize: 13 }}>Aún no hay backups.</div>
          : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead><tr>{["Archivo", "Tamaño", "Fecha"].map(h => <th key={h} style={{ textAlign: "left", padding: "7px 10px", fontSize: 11, color: tokens.text3, fontWeight: 700, textTransform: "uppercase" }}>{h}</th>)}</tr></thead>
              <tbody>
                {backups.map(b => (
                  <tr key={b.name} style={{ borderTop: `1px solid ${tokens.border}` }}>
                    <td style={{ padding: "8px 10px", color: tokens.text, fontFamily: FONT.mono, fontSize: 12 }}>{b.name}</td>
                    <td style={{ padding: "8px 10px", color: tokens.text2 }}>{fmtKB(b.size)}</td>
                    <td style={{ padding: "8px 10px", color: tokens.text2 }}>{fmtFecha(b.mtime)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
      </div>
    </div>
  );
}
