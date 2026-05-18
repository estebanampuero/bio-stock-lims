import { useEffect, useState } from "react";
import { apiFetch } from "../../../lib/api";
import { DataTable, type Column } from "../components/DataTable";
import { StatusPill } from "../components/StatusPill";
import type { ThemeTokens } from "../adminTheme";
import type { Anexo } from "../../../types";

export function AnexosView({ tokens }: { tokens: ThemeTokens }) {
  const [rows, setRows] = useState<Anexo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const r = await apiFetch("/anexos");
      if (r.ok) setRows(await r.json());
      setLoading(false);
    };
    load();
  }, []);

  const columns: Column<Anexo>[] = [
    { key: "servicio", label: "Servicio", render: r => <strong style={{ color: tokens.text }}>{r.servicio}</strong> },
    { key: "salas", label: "Sala / área", render: r => r.salas ? <span style={{ color: tokens.text2 }}>{r.salas}</span> : <span style={{ color: tokens.text3 }}>—</span> },
    { key: "numero", label: "N° anexo", mono: true, render: r => <span style={{ color: tokens.accent, fontWeight: 700, fontSize: 15, fontFamily: 'ui-monospace, monospace' }}>{r.numero}</span> },
    { key: "creado_por", label: "Creado por", render: r => <StatusPill tokens={tokens} kind="neutral">{r.creado_por}</StatusPill> },
  ];

  return <DataTable tokens={tokens} rows={rows} columns={columns} loading={loading} rowKey={r => r.id}
    searchPlaceholder="Buscar por servicio, sala o número…" exportFilename="anexos" />;
}
