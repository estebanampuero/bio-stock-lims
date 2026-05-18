import { useState, useEffect } from "react";
import { Trash2, RotateCcw, AlertTriangle } from "lucide-react";
import { apiFetch } from "../../../lib/api";
import { DataTable, type Column } from "../components/DataTable";
import { StatusPill } from "../components/StatusPill";
import type { ThemeTokens } from "../adminTheme";

type TablaPapelera = "inventario" | "maestro_productos" | "protocolos" | "anexos" | "diuresis" | "usuarios";

const TABLE_OPTS: { value: TablaPapelera; label: string; pk: string; nameKey: string }[] = [
  { value: "inventario",        label: "Inventario",        pk: "id",   nameKey: "gtin" },
  { value: "maestro_productos", label: "Maestro productos", pk: "gtin", nameKey: "nombre" },
  { value: "protocolos",        label: "Protocolos",        pk: "id",   nameKey: "titulo" },
  { value: "anexos",            label: "Anexos",            pk: "id",   nameKey: "servicio" },
  { value: "diuresis",          label: "Diuresis",          pk: "id",   nameKey: "num_peticion" },
  { value: "usuarios",          label: "Usuarios",          pk: "id",   nameKey: "nombre" },
];

export function PapeleraView({ tokens, onAction }: { tokens: ThemeTokens; onAction: (m: string, k: "success"|"error"|"info") => void }) {
  const [tabla, setTabla] = useState<TablaPapelera>("maestro_productos");
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const r = await apiFetch(`/admin/trash/${tabla}`);
    if (r.ok) setRows(await r.json());
    setLoading(false);
  };
  useEffect(() => { load(); }, [tabla]);

  const opt = TABLE_OPTS.find(o => o.value === tabla)!;

  const restaurar = async (row: any) => {
    const r = await apiFetch(`/admin/restore/${tabla}/${row[opt.pk]}`, { method: "POST", body: JSON.stringify({}) });
    const d = await r.json();
    if (d.success) { onAction(`Restaurado: ${row[opt.nameKey]}`, "success"); load(); }
    else onAction(d.message || "Error al restaurar", "error");
  };

  const hardDelete = async (row: any) => {
    if (!confirm(`⚠ HARD DELETE permanente de "${row[opt.nameKey]}". ¿Continuar?`)) return;
    const r = await apiFetch(`/admin/hard-delete/${tabla}/${row[opt.pk]}`, { method: "DELETE", body: JSON.stringify({}) });
    const d = await r.json();
    if (d.success) { onAction(`Eliminado permanentemente`, "success"); load(); }
    else onAction(d.message || "Error", "error");
  };

  const columns: Column<any>[] = [
    { key: opt.nameKey, label: TABLE_OPTS.find(o => o.value === tabla)!.nameKey === "gtin" ? "GTIN" : "Identificador",
      render: r => <strong style={{ color: tokens.text }}>{r[opt.nameKey]}</strong> },
    { key: "fecha_baja", label: "Eliminado", render: r => <StatusPill tokens={tokens} kind="danger">{new Date(r.fecha_baja).toLocaleString("es-CL")}</StatusPill> },
    { key: "id", label: "ID", mono: true, render: r => <span style={{ color: tokens.text3, fontSize: 11 }}>{(r[opt.pk] || "").slice(0, 12)}</span> },
    { key: "actions", label: "", sortable: false, align: "right", render: row => (
      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }} onClick={e => e.stopPropagation()}>
        <button onClick={() => restaurar(row)}
          style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "5px 10px", background: tokens.successSoft, color: tokens.success, border: `1px solid ${tokens.success}30`, borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
          <RotateCcw size={11}/> Restaurar
        </button>
        <button onClick={() => hardDelete(row)}
          style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "5px 10px", background: tokens.dangerSoft, color: tokens.danger, border: `1px solid ${tokens.danger}30`, borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
          <Trash2 size={11}/> Hard delete
        </button>
      </div>
    )},
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Warning banner */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", background: tokens.warningSoft, border: `1px solid ${tokens.warning}30`, borderRadius: 10 }}>
        <AlertTriangle size={16} color={tokens.warning}/>
        <span style={{ color: tokens.text, fontSize: 13 }}>
          <strong>Hard delete es irreversible.</strong> Los registros eliminados permanentemente no aparecerán en auditoría más allá del propio log de la acción. Usá <strong>Restaurar</strong> si dudás.
        </span>
      </div>

      {/* Selector de tabla */}
      <div style={{ display: "flex", gap: 4, padding: 4, background: tokens.bgElev2, borderRadius: 8, width: "fit-content", flexWrap: "wrap" }}>
        {TABLE_OPTS.map(o => (
          <button key={o.value} onClick={() => setTabla(o.value)}
            style={{ padding: "6px 14px", background: tabla === o.value ? tokens.bgElev : "transparent", color: tabla === o.value ? tokens.text : tokens.text2, border: "none", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer", boxShadow: tabla === o.value ? tokens.shadow : "none" }}>
            {o.label}
          </button>
        ))}
      </div>

      <DataTable
        tokens={tokens}
        rows={rows}
        columns={columns}
        loading={loading}
        rowKey={r => r[opt.pk]}
        searchPlaceholder={`Buscar en ${opt.label} eliminados…`}
        emptyTitle={`Sin registros eliminados en ${opt.label}`}
        emptyHint="Los registros soft-deleted aparecen aquí"
        exportFilename={`papelera_${tabla}`}
      />
    </div>
  );
}
