import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { apiFetch } from "../../../lib/api";
import { DataTable, type Column } from "../components/DataTable";
import { fmtDT } from "../../../lib/format";
import type { ThemeTokens } from "../adminTheme";
import type { DiuresisRow } from "../../../types";

export function DiuresisView({ tokens, onAction }: { tokens: ThemeTokens; onAction: (m: string, k: "success"|"error") => void }) {
  const [rows, setRows] = useState<DiuresisRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"hoy" | "historico">("hoy");

  const load = async () => {
    setLoading(true);
    const url = tab === "hoy" ? "/diuresis/hoy" : "/diuresis/historico";
    const r = await apiFetch(url);
    if (r.ok) {
      const d = await r.json();
      setRows(Array.isArray(d) ? d : d.rows || []);
    }
    setLoading(false);
  };
  useEffect(() => { load(); }, [tab]);

  const eliminar = async (d: DiuresisRow) => {
    if (!confirm(`¿Eliminar registro de petición ${d.num_peticion}?`)) return;
    const r = await apiFetch(`/diuresis/${d.id}`, { method: "DELETE", body: JSON.stringify({}) });
    const j = await r.json();
    if (j.success) { onAction("Registro eliminado", "success"); load(); }
    else onAction(j.message || "Error", "error");
  };

  const columns: Column<DiuresisRow>[] = [
    { key: "fecha", label: "Fecha", accessor: r => r.fecha, render: r => {
      const { fecha, hora } = fmtDT(r.fecha);
      return <div><div style={{ color: tokens.text, fontSize: 12 }}>{fecha}</div><div style={{ color: tokens.text3, fontSize: 11, fontFamily: 'ui-monospace, monospace' }}>{hora}</div></div>;
    }},
    { key: "num_peticion", label: "Petición", mono: true, render: r => <strong style={{ color: tokens.accent }}>{r.num_peticion}</strong> },
    { key: "rut_paciente", label: "RUT", mono: true, render: r => <span style={{ color: tokens.text }}>{r.rut_paciente || "—"}</span> },
    { key: "nombre_paciente", label: "Paciente", render: r => <span style={{ color: tokens.text, fontWeight: 600 }}>{r.nombre_paciente || "—"}</span> },
    { key: "diuresis_ml", label: "Diuresis (ml)", align: "right", render: r => <span style={{ color: tokens.text, fontFamily: 'ui-monospace, monospace', fontWeight: 700 }}>{r.diuresis_ml || "—"}</span> },
    { key: "baja_motivo", label: "Motivo baja", render: r => <span style={{ color: tokens.text2 }}>{r.baja_motivo}</span> },
    { key: "usuario", label: "Registrado por", render: r => <span style={{ color: tokens.text2, fontSize: 12 }}>{r.usuario}</span> },
    { key: "actions", label: "", sortable: false, searchable: false, align: "right", render: r => (
      <button onClick={e => { e.stopPropagation(); eliminar(r); }}
        style={{ padding: 6, background: "transparent", color: tokens.danger, border: `1px solid ${tokens.dangerSoft}`, borderRadius: 6, cursor: "pointer", display: "inline-flex" }}>
        <Trash2 size={12}/>
      </button>
    )},
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", gap: 4, padding: 4, background: tokens.bgElev2, borderRadius: 8, width: "fit-content" }}>
        {(["hoy", "historico"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            style={{ padding: "6px 14px", background: tab === t ? tokens.bgElev : "transparent", color: tab === t ? tokens.text : tokens.text2, border: "none", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer", boxShadow: tab === t ? tokens.shadow : "none" }}>
            {t === "hoy" ? "Hoy" : "Histórico"}
          </button>
        ))}
      </div>
      <DataTable
        tokens={tokens}
        rows={rows}
        columns={columns}
        loading={loading}
        rowKey={r => r.id}
        searchPlaceholder="Buscar por petición, RUT o paciente…"
        exportFilename={`diuresis_${tab}`}
      />
    </div>
  );
}
