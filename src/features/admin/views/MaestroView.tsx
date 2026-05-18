import { useEffect, useState } from "react";
import { apiFetch } from "../../../lib/api";
import { DataTable, type Column } from "../components/DataTable";
import { StatusPill } from "../components/StatusPill";
import type { ThemeTokens } from "../adminTheme";

interface Producto {
  gtin: string; nombre: string; detalle: string; pack: string;
  seccion: string; temperatura: string; preparacion: string;
}

export function MaestroView({ tokens }: { tokens: ThemeTokens }) {
  const [rows, setRows] = useState<Producto[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // No hay endpoint que liste todos los productos; derivamos del inventario activo + config
    Promise.all([
      apiFetch("/inventario").then(r => r.json()),
      apiFetch("/config").then(r => r.json()),
    ]).then(([inv]) => {
      const seen = new Map<string, Producto>();
      for (const i of inv) {
        if (i.gtin && i.nombre && !seen.has(i.gtin)) {
          seen.set(i.gtin, {
            gtin: i.gtin, nombre: i.nombre, detalle: i.detalle || "",
            pack: i.pack || "", seccion: i.seccion || "",
            temperatura: i.temperatura || "Refrigerado", preparacion: i.preparacion || "",
          });
        }
      }
      setRows(Array.from(seen.values()));
      setLoading(false);
    });
  }, []);

  const columns: Column<Producto>[] = [
    { key: "nombre", label: "Producto", render: r => <strong style={{ color: tokens.text }}>{r.nombre}</strong> },
    { key: "seccion", label: "Sección", render: r => <StatusPill tokens={tokens} kind="accent">{r.seccion}</StatusPill> },
    { key: "gtin", label: "GTIN", mono: true, render: r => <span style={{ color: tokens.text2, fontSize: 12 }}>{r.gtin}</span> },
    { key: "detalle", label: "Detalle", render: r => <span style={{ color: tokens.text2 }}>{r.detalle || "—"}</span> },
    { key: "temperatura", label: "Temp.", render: r => <StatusPill tokens={tokens} kind="neutral">{r.temperatura}</StatusPill> },
    { key: "preparacion", label: "Preparación", render: r => r.preparacion
      ? <span style={{ color: tokens.text2, fontSize: 12 }}>{r.preparacion.slice(0, 60)}{r.preparacion.length > 60 ? "…" : ""}</span>
      : <span style={{ color: tokens.text3 }}>Sin instrucciones</span>
    },
  ];

  return <DataTable tokens={tokens} rows={rows} columns={columns} loading={loading} rowKey={r => r.gtin}
    searchPlaceholder="Buscar por nombre, sección o GTIN…" exportFilename="maestro_productos" />;
}
