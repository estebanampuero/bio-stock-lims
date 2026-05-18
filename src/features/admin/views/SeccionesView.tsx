import { useEffect, useState } from "react";
import { apiFetch } from "../../../lib/api";
import { DataTable, type Column } from "../components/DataTable";
import { StatusPill } from "../components/StatusPill";
import type { ThemeTokens } from "../adminTheme";

interface Seccion {
  nombre: string; productos: number; stock: number;
}

export function SeccionesView({ tokens }: { tokens: ThemeTokens }) {
  const [rows, setRows] = useState<Seccion[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      apiFetch("/config").then(r => r.json()),
      apiFetch("/inventario").then(r => r.json()),
    ]).then(([cfg, inv]) => {
      const sec = cfg.secciones || [];
      const out = sec.map((s: any) => {
        const activos = inv.filter((i: any) => i.seccion === s.nombre);
        const productos = new Set(activos.map((i: any) => i.gtin));
        return { nombre: s.nombre, productos: productos.size, stock: activos.length };
      });
      setRows(out);
      setLoading(false);
    });
  }, []);

  const columns: Column<Seccion>[] = [
    { key: "nombre", label: "Sección", render: r => <strong style={{ color: tokens.text }}>{r.nombre}</strong> },
    { key: "productos", label: "Productos distintos", align: "right", render: r => <StatusPill tokens={tokens} kind="accent">{r.productos}</StatusPill> },
    { key: "stock", label: "Unidades en stock", align: "right", render: r => <span style={{ color: tokens.text, fontWeight: 700, fontFamily: 'ui-monospace, monospace' }}>{r.stock}</span> },
  ];

  return <DataTable tokens={tokens} rows={rows} columns={columns} loading={loading} rowKey={r => r.nombre}
    searchPlaceholder="Buscar sección…" exportFilename="secciones" />;
}
