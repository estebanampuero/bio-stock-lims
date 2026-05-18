import { useEffect, useState } from "react";
import { apiFetch } from "../../../lib/api";
import { DataTable, type Column } from "../components/DataTable";
import { StatusPill } from "../components/StatusPill";
import { formatExp, getEstado } from "../../../lib/format";
import type { ThemeTokens } from "../adminTheme";
import type { InvRow } from "../../../types";

export function InventarioView({ tokens }: { tokens: ThemeTokens }) {
  const [rows, setRows] = useState<InvRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const r = await apiFetch("/inventario");
      if (r.ok) setRows(await r.json());
      setLoading(false);
    };
    load();
    const id = setInterval(load, 15_000);
    return () => clearInterval(id);
  }, []);

  const columns: Column<InvRow>[] = [
    { key: "nombre", label: "Producto", render: r => (
      <div>
        <div style={{ color: tokens.text, fontWeight: 600 }}>{r.nombre || <span style={{ color: tokens.text3 }}>Sin clasificar</span>}</div>
        {r.detalle && <div style={{ color: tokens.text3, fontSize: 11, marginTop: 2 }}>{r.detalle}</div>}
      </div>
    )},
    { key: "seccion", label: "Sección", render: r => r.seccion ? <StatusPill tokens={tokens} kind="accent">{r.seccion}</StatusPill> : <span style={{ color: tokens.text3 }}>—</span> },
    { key: "gtin", label: "GTIN", mono: true, render: r => <span style={{ color: tokens.text2, fontSize: 12 }}>{r.gtin}</span> },
    { key: "lot", label: "Lote", mono: true, render: r => <span style={{ color: tokens.text, fontSize: 12 }}>{r.lot}</span> },
    { key: "expiration", label: "Vencimiento", accessor: r => r.expiration, render: r => formatExp(r.expiration) },
    { key: "estado", label: "Estado", accessor: r => getEstado(r.expiration), sortable: true, render: r => {
      const e = getEstado(r.expiration);
      const k = e === "vencido" ? "danger" : e === "por-vencer" ? "warning" : "success";
      const l = e === "vencido" ? "Vencido" : e === "por-vencer" ? "Por vencer" : "Activo";
      return <StatusPill tokens={tokens} kind={k as any}>{l}</StatusPill>;
    }},
    { key: "temperatura", label: "Temp.", render: r => r.temperatura ? <StatusPill tokens={tokens} kind="neutral">{r.temperatura}</StatusPill> : <span style={{ color: tokens.text3 }}>—</span> },
    { key: "usuario", label: "Ingresado por", render: r => <span style={{ color: tokens.text2, fontSize: 12 }}>{r.usuario}</span> },
  ];

  return <DataTable
    tokens={tokens}
    rows={rows}
    columns={columns}
    loading={loading}
    rowKey={r => r.id}
    searchPlaceholder="Buscar por producto, lote o GTIN…"
    exportFilename="inventario"
    pageSize={50}
  />;
}
