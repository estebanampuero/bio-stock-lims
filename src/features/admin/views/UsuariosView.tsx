import { useEffect, useState } from "react";
import { UserPlus, Trash2, Shield } from "lucide-react";
import { apiFetch } from "../../../lib/api";
import { DataTable, type Column } from "../components/DataTable";
import { StatusPill } from "../components/StatusPill";
import { Drawer } from "../components/Drawer";
import type { ThemeTokens } from "../adminTheme";
import type { User, Rol } from "../../../types";

const ROL_LABEL: Record<string, string> = {
  ADMIN: "Administrador", TECNOLOGO: "Tecnólogo", TECNICO: "Técnico", TOMA_MUESTRA: "Toma muestras",
};

export function UsuariosView({ tokens, currentUserId, onUserAction }: {
  tokens: ThemeTokens; currentUserId: string; onUserAction: (msg: string, kind: "success"|"error") => void;
}) {
  const [usuarios, setUsuarios] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [drawer, setDrawer] = useState<"new" | "view" | null>(null);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [form, setForm] = useState({ nombre: "", rol: "TECNICO" as Rol, pin: "" });

  const load = async () => {
    const r = await apiFetch("/config");
    if (r.ok) {
      const d = await r.json();
      setUsuarios(d.usuarios || []);
    }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const crear = async () => {
    if (!form.nombre || !form.pin) { onUserAction("Faltan campos", "error"); return; }
    const r = await apiFetch("/usuarios", { method: "POST", body: JSON.stringify(form) });
    const d = await r.json();
    if (d.success) {
      onUserAction(`Usuario "${form.nombre}" creado`, "success");
      setDrawer(null); setForm({ nombre: "", rol: "TECNICO", pin: "" });
      load();
    } else onUserAction(d.message || "Error", "error");
  };

  const eliminar = async (u: User) => {
    if (!confirm(`¿Eliminar acceso de "${u.nombre}"?`)) return;
    const r = await apiFetch(`/usuarios/${u.id}`, { method: "DELETE", body: JSON.stringify({}) });
    const d = await r.json();
    if (d.success) { onUserAction(`Usuario "${u.nombre}" eliminado`, "success"); load(); }
    else onUserAction(d.message || "Error", "error");
  };

  const columns: Column<User>[] = [
    { key: "nombre", label: "Nombre", render: r => <strong style={{ color: tokens.text }}>{r.nombre}</strong> },
    { key: "rol", label: "Rol", render: r => {
        const kind = r.rol === "ADMIN" ? "success" : r.rol === "TECNOLOGO" ? "accent" : r.rol === "TOMA_MUESTRA" ? "warning" : "neutral";
        return <StatusPill tokens={tokens} kind={kind as any}>{ROL_LABEL[r.rol] || r.rol}</StatusPill>;
    }},
    { key: "id", label: "ID", mono: true, render: r => <span style={{ color: tokens.text3, fontSize: 11 }}>{r.id.slice(0, 8)}</span> },
    { key: "actions", label: "", sortable: false, searchable: false, align: "right",
      render: r => r.id === currentUserId ? <span style={{ color: tokens.text3, fontSize: 11 }}>Tú</span> : (
        <button onClick={e => { e.stopPropagation(); eliminar(r); }}
          style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "4px 8px", background: "transparent", color: tokens.danger, border: `1px solid ${tokens.dangerSoft}`, borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
          <Trash2 size={11}/> Revocar
        </button>
    )},
  ];

  return (
    <>
      <DataTable
        tokens={tokens}
        rows={usuarios}
        columns={columns}
        loading={loading}
        rowKey={u => u.id}
        searchPlaceholder="Buscar por nombre o rol…"
        exportFilename="usuarios"
        onRowClick={u => { setSelectedUser(u); setDrawer("view"); }}
        toolbar={
          <button onClick={() => { setForm({ nombre: "", rol: "TECNICO", pin: "" }); setDrawer("new"); }}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", background: tokens.accent, color: "white", border: "none", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
            <UserPlus size={14}/> Nuevo usuario
          </button>
        }
      />

      <Drawer tokens={tokens} open={drawer === "new"} title="Crear usuario" subtitle="Se forzará cambio de PIN al primer login" onClose={() => setDrawer(null)}>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <Field tokens={tokens} label="Nombre de usuario">
            <input value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} style={inp(tokens)} placeholder="ej: jpaez" />
          </Field>
          <Field tokens={tokens} label="Rol">
            <select value={form.rol} onChange={e => setForm(f => ({ ...f, rol: e.target.value as Rol }))} style={inp(tokens)}>
              <option value="ADMIN">Administrador</option>
              <option value="TECNOLOGO">Tecnólogo Médico</option>
              <option value="TECNICO">Técnico de Laboratorio</option>
              <option value="TOMA_MUESTRA">Toma de Muestras</option>
            </select>
          </Field>
          <Field tokens={tokens} label="PIN inicial (mínimo 4 dígitos)">
            <input type="password" value={form.pin} onChange={e => setForm(f => ({ ...f, pin: e.target.value }))} style={inp(tokens)} />
          </Field>
          <button onClick={crear} style={btnPrimary(tokens)}>CREAR USUARIO</button>
        </div>
      </Drawer>

      <Drawer tokens={tokens} open={drawer === "view"} title={selectedUser?.nombre || ""} subtitle={selectedUser ? ROL_LABEL[selectedUser.rol] : ""} onClose={() => setDrawer(null)}>
        {selectedUser && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <Field tokens={tokens} label="ID">
              <code style={{ color: tokens.text2, fontSize: 12 }}>{selectedUser.id}</code>
            </Field>
            <Field tokens={tokens} label="Rol">
              <StatusPill tokens={tokens} kind="accent"><Shield size={11}/> {ROL_LABEL[selectedUser.rol]}</StatusPill>
            </Field>
            {selectedUser.id !== currentUserId && (
              <button onClick={() => { eliminar(selectedUser); setDrawer(null); }} style={btnDanger(tokens)}>
                <Trash2 size={13}/> Revocar acceso
              </button>
            )}
          </div>
        )}
      </Drawer>
    </>
  );
}

function Field({ tokens, label, children }: { tokens: ThemeTokens; label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ color: tokens.text2, fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 6, display: "block" }}>{label}</label>
      {children}
    </div>
  );
}
function inp(tokens: ThemeTokens): React.CSSProperties {
  return { width: "100%", padding: "10px 12px", background: tokens.bgElev2, color: tokens.text, border: `1px solid ${tokens.border}`, borderRadius: 8, fontSize: 13, outline: "none", boxSizing: "border-box" };
}
function btnPrimary(tokens: ThemeTokens): React.CSSProperties {
  return { padding: "10px 16px", background: tokens.accent, color: "white", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer" };
}
function btnDanger(tokens: ThemeTokens): React.CSSProperties {
  return { display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "10px 16px", background: tokens.dangerSoft, color: tokens.danger, border: `1px solid ${tokens.danger}40`, borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer" };
}
