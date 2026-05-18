import { useEffect, useState } from "react";
import { FileText } from "lucide-react";
import { apiFetch } from "../../../lib/api";
import { DataTable, type Column } from "../components/DataTable";
import { StatusPill } from "../components/StatusPill";
import { Drawer } from "../components/Drawer";
import type { ThemeTokens } from "../adminTheme";
import type { Protocolo } from "../../../types";

export function ProtocolosView({ tokens }: { tokens: ThemeTokens }) {
  const [rows, setRows] = useState<Protocolo[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewing, setViewing] = useState<Protocolo | null>(null);

  useEffect(() => {
    const load = async () => {
      const r = await apiFetch("/protocolos");
      if (r.ok) setRows(await r.json());
      setLoading(false);
    };
    load();
  }, []);

  const columns: Column<Protocolo>[] = [
    { key: "titulo", label: "Título", render: r => (
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <FileText size={14} color={tokens.accent}/>
        <strong style={{ color: tokens.text }}>{r.titulo}</strong>
      </div>
    )},
    { key: "seccion", label: "Sección", render: r => <StatusPill tokens={tokens} kind="accent">{r.seccion}</StatusPill> },
    { key: "autor", label: "Autor", render: r => <span style={{ color: tokens.text2 }}>{r.autor}</span> },
    { key: "updated_at", label: "Actualizado", accessor: r => r.updated_at, render: r => <span style={{ color: tokens.text2, fontSize: 12 }}>{new Date(r.updated_at).toLocaleDateString("es-CL")}</span> },
  ];

  return (
    <>
      <DataTable tokens={tokens} rows={rows} columns={columns} loading={loading} rowKey={r => r.id}
        searchPlaceholder="Buscar por título, sección o autor…" exportFilename="protocolos"
        onRowClick={p => setViewing(p)}
      />
      <Drawer tokens={tokens} open={!!viewing} title={viewing?.titulo || ""} subtitle={viewing ? `${viewing.seccion} · ${viewing.autor}` : ""} onClose={() => setViewing(null)} width={580}>
        {viewing && (
          <div style={{ color: tokens.text, fontSize: 14, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>
            {viewing.contenido}
          </div>
        )}
      </Drawer>
    </>
  );
}
