import type { Rol } from "../../types";

const rolColor: Record<string, { bg: string; color: string }> = {
  ADMIN:        { bg: "rgba(16,185,129,0.15)",  color: "#059669" },
  TECNOLOGO:    { bg: "rgba(0,90,156,0.12)",    color: "#005a9c" },
  TECNICO:      { bg: "rgba(99,102,241,0.12)",  color: "#4338ca" },
  TOMA_MUESTRA: { bg: "rgba(245,158,11,0.12)",  color: "#d97706" },
};
const rolLabel: Record<string, string> = {
  ADMIN: "Administrador", TECNOLOGO: "Tecnólogo Médico",
  TECNICO: "Técnico Lab.", TOMA_MUESTRA: "Toma de Muestras",
};

export function RolBadge({ rol }: { rol: string }) {
  const c = rolColor[rol] || { bg: "rgba(0,0,0,0.05)", color: "#64748b" };
  return (
    <span style={{ display:"inline-block", ...c, fontWeight:700, fontSize:"11px", padding:"3px 9px", borderRadius:"6px", whiteSpace:"nowrap" }}>
      {rolLabel[rol] || rol}
    </span>
  );
}

export function EstadoBadge({ estado }: { estado: "activo" | "por-vencer" | "vencido" }) {
  const c = {
    activo:       { l: "Activo",     bg: "rgba(16,185,129,0.12)", co: "#059669" },
    "por-vencer": { l: "Por Vencer", bg: "rgba(245,158,11,0.12)", co: "#d97706" },
    vencido:      { l: "Vencido",    bg: "rgba(239,68,68,0.12)",  co: "#dc2626" },
  }[estado];
  return (
    <span style={{ display:"inline-block", background:c.bg, color:c.co, fontWeight:700, fontSize:"11px", padding:"3px 9px", borderRadius:"6px", whiteSpace:"nowrap" }}>
      {c.l}
    </span>
  );
}

export function TempBadge({ temp }: { temp: string }) {
  const m: Record<string, { bg: string; co: string; l: string }> = {
    Refrigerado: { bg: "rgba(56,189,248,0.12)", co: "#0369a1", l: "Refrig." },
    Congelado:   { bg: "rgba(99,102,241,0.12)", co: "#4338ca", l: "Congel." },
    Ambiente:    { bg: "rgba(16,185,129,0.12)", co: "#059669", l: "Amb." },
  };
  const c = m[temp] || { bg: "rgba(0,0,0,0.05)", co: "#475569", l: temp };
  return (
    <span style={{ display:"inline-block", background:c.bg, color:c.co, fontWeight:700, fontSize:"11px", padding:"3px 9px", borderRadius:"6px" }}>
      {c.l}
    </span>
  );
}

export { rolColor, rolLabel };
export type { Rol };
