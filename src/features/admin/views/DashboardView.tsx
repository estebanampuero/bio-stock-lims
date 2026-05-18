import { useEffect, useState } from "react";
import {
  Package, Users, FlaskConical, Activity, AlertTriangle, Shield, Droplets,
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, PieChart, Pie, Cell } from "recharts";
import { apiFetch } from "../../../lib/api";
import { MetricCard } from "../components/MetricCard";
import { StatusPill } from "../components/StatusPill";
import { Skeleton } from "../components/Skeleton";
import { EmptyState } from "../components/EmptyState";
import type { ThemeTokens } from "../adminTheme";

interface DashboardData {
  totals: Record<string, number>;
  vencimientos: { vencidos: number; proximos_30d: number; proximos_90d: number };
  porSeccion: { seccion: string; count: number }[];
  porTemperatura: { temperatura: string; count: number }[];
  porRol: { rol: string; count: number }[];
  actividad7d: { dia: string; count: number }[];
  topUsuarios: { usuario: string; perfil: string; acciones: number }[];
  recent: any[];
}

const PIE_COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#84cc16"];

export function DashboardView({ tokens }: { tokens: ThemeTokens }) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const r = await apiFetch("/admin/dashboard");
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const d = await r.json();
        if (mounted) { setData(d); setError(null); }
      } catch (e: any) { if (mounted) setError(e.message); }
      finally { if (mounted) setLoading(false); }
    };
    load();
    const id = setInterval(load, 30_000); // refresh cada 30s
    return () => { mounted = false; clearInterval(id); };
  }, []);

  if (loading) {
    return (
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} style={{ background: tokens.bgElev, border: `1px solid ${tokens.border}`, borderRadius: 12, padding: 20 }}>
            <Skeleton tokens={tokens} width={80} height={11} />
            <div style={{ height: 12 }} />
            <Skeleton tokens={tokens} width={120} height={28} />
            <div style={{ height: 8 }} />
            <Skeleton tokens={tokens} width={60} height={10} />
          </div>
        ))}
      </div>
    );
  }

  if (error || !data) {
    return <EmptyState tokens={tokens} title="No se pudo cargar el dashboard" hint={error || "Reintenta"} icon={<AlertTriangle size={36}/>} />;
  }

  const t = data.totals;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* KPIs principales */}
      <div>
        <h3 style={{ color: tokens.text, fontSize: 13, fontWeight: 600, margin: "0 0 12px", textTransform: "uppercase", letterSpacing: 0.4 }}>Inventario y catálogo</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>
          <MetricCard tokens={tokens} label="Stock activo" value={t.stock_activo}      icon={<Package size={18}/>} hint={`${t.stock_consumido} consumidos`} />
          <MetricCard tokens={tokens} label="Productos en maestro" value={t.productos_maestro} icon={<FlaskConical size={18}/>} hint={`${t.secciones_total} secciones`} />
          <MetricCard tokens={tokens} label="Por vencer 90d" value={data.vencimientos.proximos_90d} icon={<AlertTriangle size={18}/>} kind="warning" hint={`${data.vencimientos.proximos_30d} en <30 días`} />
          <MetricCard tokens={tokens} label="Vencidos" value={data.vencimientos.vencidos} icon={<AlertTriangle size={18}/>} kind="danger" hint="Acción inmediata" />
        </div>
      </div>

      <div>
        <h3 style={{ color: tokens.text, fontSize: 13, fontWeight: 600, margin: "0 0 12px", textTransform: "uppercase", letterSpacing: 0.4 }}>Actividad y seguridad</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>
          <MetricCard tokens={tokens} label="Usuarios" value={t.usuarios_total} icon={<Users size={18}/>} hint={data.porRol.map(r => `${r.count} ${r.rol.toLowerCase()}`).slice(0,2).join(" · ")} />
          <MetricCard tokens={tokens} label="Diuresis hoy" value={t.diuresis_hoy} icon={<Droplets size={18}/>} hint={`${t.diuresis_7d} esta semana`} />
          <MetricCard tokens={tokens} label="Eventos hoy" value={t.logs_hoy} icon={<Activity size={18}/>} hint={`${t.logs_7d} esta semana`} />
          <MetricCard tokens={tokens}
            label="Alertas de seguridad"
            value={(t.login_fallidos_7d || 0) + (t.denegados_7d || 0) + (t.cuentas_bloqueadas || 0)}
            icon={<Shield size={18}/>}
            kind={(t.login_fallidos_7d || t.cuentas_bloqueadas) ? "warning" : "default"}
            hint={`${t.cuentas_bloqueadas} cuenta(s) bloqueada(s)`}
          />
        </div>
      </div>

      {/* Gráficos */}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 2fr) minmax(0, 1fr)", gap: 16 }}>
        {/* Actividad timeline */}
        <div style={{ background: tokens.bgElev, border: `1px solid ${tokens.border}`, borderRadius: 12, padding: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
            <h3 style={{ margin: 0, color: tokens.text, fontSize: 14, fontWeight: 700 }}>Actividad últimos 7 días</h3>
            <span style={{ color: tokens.text2, fontSize: 12 }}>{t.logs_7d} eventos</span>
          </div>
          {data.actividad7d.length === 0 ? (
            <EmptyState tokens={tokens} title="Sin actividad" hint="Aún no se registran eventos esta semana" />
          ) : (
            <div style={{ height: 240 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.actividad7d}>
                  <CartesianGrid strokeDasharray="3 3" stroke={tokens.border} vertical={false} />
                  <XAxis dataKey="dia" tick={{ fontSize: 11, fill: tokens.text2 }} axisLine={false} tickLine={false}
                    tickFormatter={(d) => new Date(d).toLocaleDateString("es-CL", { day: "2-digit", month: "short" })} />
                  <YAxis tick={{ fontSize: 11, fill: tokens.text2 }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip contentStyle={{ background: tokens.bgElev, border: `1px solid ${tokens.border}`, borderRadius: 8, fontSize: 12 }} />
                  <Bar dataKey="count" fill={tokens.accent} radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Distribución por sección */}
        <div style={{ background: tokens.bgElev, border: `1px solid ${tokens.border}`, borderRadius: 12, padding: 20 }}>
          <h3 style={{ margin: "0 0 16px", color: tokens.text, fontSize: 14, fontWeight: 700 }}>Stock por sección</h3>
          {data.porSeccion.length === 0 ? (
            <EmptyState tokens={tokens} title="Sin stock" hint="Escanea un control para empezar" />
          ) : (
            <div style={{ height: 240 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={data.porSeccion} dataKey="count" nameKey="seccion" cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={2}>
                    {data.porSeccion.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={{ background: tokens.bgElev, border: `1px solid ${tokens.border}`, borderRadius: 8, fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      {/* Tablas: top usuarios + actividad reciente */}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 16 }}>
        <div style={{ background: tokens.bgElev, border: `1px solid ${tokens.border}`, borderRadius: 12, padding: 20 }}>
          <h3 style={{ margin: "0 0 16px", color: tokens.text, fontSize: 14, fontWeight: 700 }}>Top usuarios — últimos 7 días</h3>
          {data.topUsuarios.length === 0 ? (
            <EmptyState tokens={tokens} title="Sin actividad reciente" />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {data.topUsuarios.map((u, i) => {
                const max = data.topUsuarios[0].acciones;
                return (
                  <div key={u.usuario} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ color: tokens.text3, width: 16, fontSize: 12, fontWeight: 700 }}>#{i + 1}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                        <span style={{ color: tokens.text, fontSize: 13, fontWeight: 600 }}>{u.usuario}</span>
                        <span style={{ color: tokens.text2, fontSize: 12, fontVariantNumeric: "tabular-nums" }}>{u.acciones}</span>
                      </div>
                      <div style={{ height: 4, background: tokens.bgElev2, borderRadius: 2, overflow: "hidden" }}>
                        <div style={{ width: `${(u.acciones / max) * 100}%`, height: "100%", background: tokens.accent, borderRadius: 2 }} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div style={{ background: tokens.bgElev, border: `1px solid ${tokens.border}`, borderRadius: 12, padding: 20 }}>
          <h3 style={{ margin: "0 0 16px", color: tokens.text, fontSize: 14, fontWeight: 700 }}>Actividad reciente</h3>
          {data.recent.length === 0 ? (
            <EmptyState tokens={tokens} title="Sin eventos" />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10, maxHeight: 280, overflowY: "auto" }}>
              {data.recent.map((e: any) => {
                const isCrit = e.accion.includes("FALLIDO") || e.accion.includes("ELIMIN") || e.accion.includes("BLOQUEADO") || e.accion.includes("DENEGADO");
                const kind = isCrit ? "danger" : e.accion === "LOGIN" || e.accion === "LOGOUT" ? "neutral" : "success";
                return (
                  <div key={e.id} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                    <div style={{ paddingTop: 2 }}>
                      <StatusPill tokens={tokens} kind={kind as any}>{e.accion.split(" ")[0]}</StatusPill>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ color: tokens.text, fontSize: 13, fontWeight: 600 }}>{e.detalles}</div>
                      <div style={{ color: tokens.text3, fontSize: 11, marginTop: 2 }}>
                        {e.usuario} · {new Date(e.fecha).toLocaleString("es-CL")}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
