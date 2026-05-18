// Helpers de formato y validación

export function formatExp(exp: string): string {
  if (!exp || exp.length !== 6) return exp || "—";
  return `${exp.slice(4, 6)}/${exp.slice(2, 4)}/${2000 + parseInt(exp.slice(0, 2))}`;
}

export function validarFechaGS1(v: string): string | null {
  if (!v) return "Obligatorio";
  if (!/^\d{6}$/.test(v)) return "6 dígitos AAMMDD";
  const m = parseInt(v.slice(2, 4));
  const d = parseInt(v.slice(4, 6));
  const y = 2000 + parseInt(v.slice(0, 2));
  if (m < 1 || m > 12) return `Mes inválido: ${m}`;
  if (d < 1 || d > new Date(y, m, 0).getDate()) return `Día inválido: ${d}`;
  return null;
}

export function getEstado(exp: string): "activo" | "por-vencer" | "vencido" {
  if (!exp || exp.length !== 6) return "activo";
  const y = 2000 + parseInt(exp.slice(0, 2));
  const m = parseInt(exp.slice(2, 4)) - 1;
  const d = parseInt(exp.slice(4, 6));
  const dias = Math.floor((new Date(y, m, d).getTime() - new Date().setHours(0,0,0,0)) / 86400000);
  return dias < 0 ? "vencido" : dias <= 90 ? "por-vencer" : "activo";
}

export function fmtDT(iso: string): { fecha: string; hora: string } {
  if (!iso) return { fecha: "—", hora: "—" };
  const d = new Date(iso);
  return {
    fecha: d.toLocaleDateString("es-CL"),
    hora: d.toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" }),
  };
}
