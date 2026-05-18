import { useEffect, useState } from "react";
import { apiFetch } from "../../../lib/api";
import { DataTable, type Column } from "../components/DataTable";
import { StatusPill } from "../components/StatusPill";
import { fmtDT } from "../../../lib/format";
import type { ThemeTokens } from "../adminTheme";

interface LogRow { id: number; usuario: string; perfil: string; accion: string; detalles: string; fecha: string; ip: string; }

export function LogsView({ tokens }: { tokens: ThemeTokens }) {
  const [rows, setRows] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);

  const load = async (cur?: string | null, append = false) => {
    setLoading(true);
    const url = cur ? `/logs?cursor=${encodeURIComponent(cur)}` : "/logs";
    const r = await apiFetch(url);
    if (r.ok) {
      const d = await r.json();
      const fresh = d.rows || [];
      setRows(prev => append ? [...prev, ...fresh] : fresh);
      setCursor(d.nextCursor);
      setHasMore(!!d.nextCursor);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const columns: Column<LogRow>[] = [
    { key: "fecha", label: "Fecha", accessor: r => r.fecha, render: r => {
      const { fecha, hora } = fmtDT(r.fecha);
      return <div>
        <div style={{ color: tokens.text, fontSize: 12 }}>{fecha}</div>
        <div style={{ color: tokens.text3, fontSize: 11, fontFamily: 'ui-monospace, "SF Mono", monospace' }}>{hora}</div>
      </div>;
    }},
    { key: "usuario", label: "Usuario", render: r => <strong style={{ color: tokens.text }}>{r.usuario}</strong> },
    { key: "perfil", label: "Perfil", render: r => r.perfil ? <StatusPill tokens={tokens} kind="accent">{r.perfil}</StatusPill> : <span style={{ color: tokens.text3 }}>—</span> },
    { key: "accion", label: "Evento", render: r => {
      const isCrit = r.accion.includes("FALLIDO") || r.accion.includes("ELIMIN") || r.accion.includes("DENEGADO") || r.accion.includes("BLOQUEADO");
      const isNeut = r.accion === "LOGIN" || r.accion === "LOGOUT" || r.accion.includes("VER");
      const k = isCrit ? "danger" : isNeut ? "neutral" : "success";
      return <StatusPill tokens={tokens} kind={k as any}>{r.accion}</StatusPill>;
    }},
    { key: "detalles", label: "Detalles", render: r => <span style={{ color: tokens.text2 }}>{r.detalles}</span> },
    { key: "ip", label: "IP / equipo", mono: true, render: r => <span style={{ color: tokens.text3, fontSize: 11 }}>{r.ip || "—"}</span> },
  ];

  return (
    <DataTable
      tokens={tokens}
      rows={rows}
      columns={columns}
      loading={loading && rows.length === 0}
      rowKey={r => String(r.id)}
      searchPlaceholder="Buscar por usuario, evento o detalle…"
      exportFilename="auditoria"
      pageSize={50}
      toolbar={
        hasMore && (
          <button onClick={() => load(cursor, true)} disabled={loading}
            style={{ padding: "8px 14px", background: tokens.bgElev, color: tokens.text2, border: `1px solid ${tokens.border}`, borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
            {loading ? "Cargando…" : "Cargar más antiguos"}
          </button>
        )
      }
    />
  );
}
