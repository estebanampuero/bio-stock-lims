import { useEffect, useState } from "react";
import { Shield, AlertTriangle, Eye } from "lucide-react";
import { apiFetch } from "../../../lib/api";
import { MetricCard } from "../components/MetricCard";
import { DataTable, type Column } from "../components/DataTable";
import { StatusPill } from "../components/StatusPill";
import { fmtDT } from "../../../lib/format";
import type { ThemeTokens } from "../adminTheme";

interface LogRow { id: number; usuario: string; perfil: string; accion: string; detalles: string; fecha: string; ip: string; }

export function SecurityView({ tokens }: { tokens: ThemeTokens }) {
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const r = await apiFetch("/logs");
      if (r.ok) {
        const d = await r.json();
        setLogs(d.rows || []);
      }
      setLoading(false);
    };
    load();
  }, []);

  // Filtrar solo eventos de seguridad
  const securityLogs = logs.filter(l =>
    l.accion.includes("FALLIDO") ||
    l.accion.includes("DENEGADO") ||
    l.accion.includes("BLOQUEADO") ||
    l.accion === "LOGIN" || l.accion === "LOGOUT" ||
    l.accion === "CAMBIO PIN" ||
    l.accion.includes("USUARIO")
  );

  const fallidos = securityLogs.filter(l => l.accion.includes("FALLIDO")).length;
  const denegados = securityLogs.filter(l => l.accion.includes("DENEGADO")).length;
  const bloqueados = securityLogs.filter(l => l.accion.includes("BLOQUEADO")).length;
  const cambiosPin = securityLogs.filter(l => l.accion === "CAMBIO PIN").length;

  const columns: Column<LogRow>[] = [
    { key: "fecha", label: "Fecha", accessor: r => r.fecha, render: r => {
      const { fecha, hora } = fmtDT(r.fecha);
      return <div><div style={{ color: tokens.text, fontSize: 12 }}>{fecha}</div><div style={{ color: tokens.text3, fontSize: 11, fontFamily: 'ui-monospace, monospace' }}>{hora}</div></div>;
    }},
    { key: "usuario", label: "Usuario", render: r => <strong style={{ color: tokens.text }}>{r.usuario}</strong> },
    { key: "accion", label: "Evento", render: r => {
      const isCrit = r.accion.includes("FALLIDO") || r.accion.includes("DENEGADO") || r.accion.includes("BLOQUEADO");
      return <StatusPill tokens={tokens} kind={isCrit ? "danger" : "neutral"}>{r.accion}</StatusPill>;
    }},
    { key: "detalles", label: "Detalles", render: r => <span style={{ color: tokens.text2 }}>{r.detalles}</span> },
    { key: "ip", label: "IP", mono: true, render: r => <span style={{ color: tokens.text3, fontSize: 11 }}>{r.ip || "—"}</span> },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* KPIs de seguridad */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16 }}>
        <MetricCard tokens={tokens} label="Login fallidos" value={fallidos} icon={<AlertTriangle size={18}/>} kind={fallidos > 5 ? "warning" : "default"} hint="Total en histórico cargado" />
        <MetricCard tokens={tokens} label="Accesos denegados" value={denegados} icon={<Shield size={18}/>} kind={denegados > 0 ? "warning" : "default"} hint="Permisos insuficientes" />
        <MetricCard tokens={tokens} label="Cuentas bloqueadas" value={bloqueados} icon={<Shield size={18}/>} kind={bloqueados > 0 ? "danger" : "default"} hint="Lockouts disparados" />
        <MetricCard tokens={tokens} label="Cambios de PIN" value={cambiosPin} icon={<Eye size={18}/>} kind="success" hint="Rotaciones registradas" />
      </div>

      <div>
        <h3 style={{ color: tokens.text, fontSize: 14, fontWeight: 700, margin: "0 0 12px" }}>Eventos de seguridad</h3>
        <DataTable tokens={tokens} rows={securityLogs} columns={columns} loading={loading} rowKey={r => String(r.id)}
          searchPlaceholder="Buscar evento, usuario o IP…" exportFilename="security" pageSize={25} />
      </div>
    </div>
  );
}
