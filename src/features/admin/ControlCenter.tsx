import { useState, lazy, Suspense, type ReactNode } from "react";
import {
  LayoutDashboard, Users, Package, FlaskConical, Layers, FileText,
  Phone, Droplets, ClipboardList, Shield, Moon, Sun, ArrowLeft,
} from "lucide-react";
import { useTheme } from "./hooks/useTheme";
import { Breadcrumbs } from "./components/Breadcrumbs";
import { Skeleton } from "./components/Skeleton";
import type { User } from "../../types";
import type { Theme, ThemeTokens } from "./adminTheme";
import { FONT } from "./adminTheme";

// Lazy load de cada view para mantener el bundle inicial liviano
const DashboardView   = lazy(() => import("./views/DashboardView").then(m => ({ default: m.DashboardView })));
const UsuariosView    = lazy(() => import("./views/UsuariosView").then(m => ({ default: m.UsuariosView })));
const InventarioView  = lazy(() => import("./views/InventarioView").then(m => ({ default: m.InventarioView })));
const MaestroView     = lazy(() => import("./views/MaestroView").then(m => ({ default: m.MaestroView })));
const SeccionesView   = lazy(() => import("./views/SeccionesView").then(m => ({ default: m.SeccionesView })));
const ProtocolosView  = lazy(() => import("./views/ProtocolosView").then(m => ({ default: m.ProtocolosView })));
const AnexosView      = lazy(() => import("./views/AnexosView").then(m => ({ default: m.AnexosView })));
const DiuresisView    = lazy(() => import("./views/DiuresisView").then(m => ({ default: m.DiuresisView })));
const LogsView        = lazy(() => import("./views/LogsView").then(m => ({ default: m.LogsView })));
const SecurityView    = lazy(() => import("./views/SecurityView").then(m => ({ default: m.SecurityView })));

type Section =
  | "dashboard" | "usuarios" | "inventario" | "maestro" | "secciones"
  | "protocolos" | "anexos" | "diuresis" | "logs" | "security";

interface NavItem {
  id: Section;
  label: string;
  icon: ReactNode;
  group: "overview" | "operations" | "data" | "security";
  description?: string;
}

const NAV: NavItem[] = [
  { id: "dashboard",  label: "Dashboard",  icon: <LayoutDashboard size={15}/>, group: "overview",  description: "Vista general del sistema" },

  { id: "inventario", label: "Inventario", icon: <Package size={15}/>,         group: "operations", description: "Stock activo en tiempo real" },
  { id: "maestro",    label: "Maestro de productos", icon: <FlaskConical size={15}/>, group: "operations", description: "Catálogo de controles" },
  { id: "secciones",  label: "Secciones",  icon: <Layers size={15}/>,          group: "operations", description: "Áreas del laboratorio" },
  { id: "protocolos", label: "Protocolos", icon: <FileText size={15}/>,        group: "operations", description: "SOPs del laboratorio" },
  { id: "anexos",     label: "Anexos",     icon: <Phone size={15}/>,           group: "operations", description: "Directorio telefónico" },
  { id: "diuresis",   label: "Diuresis",   icon: <Droplets size={15}/>,        group: "operations", description: "Registros de pacientes" },

  { id: "usuarios",   label: "Usuarios",   icon: <Users size={15}/>,           group: "data",       description: "Personal del laboratorio" },
  { id: "logs",       label: "Auditoría",  icon: <ClipboardList size={15}/>,   group: "data",       description: "Registro completo de eventos" },
  { id: "security",   label: "Seguridad",  icon: <Shield size={15}/>,          group: "security",   description: "Eventos de seguridad" },
];

const GROUP_LABELS: Record<string, string> = {
  overview: "Vista general",
  operations: "Operaciones",
  data: "Administración",
  security: "Seguridad",
};

export function ControlCenter({ currentUser, onExit, onToast }: {
  currentUser: User;
  onExit: () => void;
  onToast: (msg: string, kind: "success"|"error"|"info") => void;
}) {
  const { theme, tokens, toggle } = useTheme();
  const [section, setSection] = useState<Section>("dashboard");

  const current = NAV.find(n => n.id === section)!;

  return (
    <div data-theme={theme} style={{
      position: "fixed", inset: 0, display: "flex",
      background: tokens.bg, color: tokens.text, fontFamily: FONT.sans,
    }}>
      <AdminSidebar tokens={tokens} active={section} onSelect={setSection} onExit={onExit} theme={theme} onToggleTheme={toggle} currentUser={currentUser} />

      <main style={{ flex: 1, overflowY: "auto", padding: "32px 40px" }}>
        <Breadcrumbs tokens={tokens} items={[
          { label: "Control Center", onClick: () => setSection("dashboard") },
          { label: GROUP_LABELS[current.group] },
          { label: current.label },
        ]}/>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 28, flexWrap: "wrap", gap: 12 }}>
          <div>
            <h1 style={{ margin: 0, color: tokens.text, fontSize: 24, fontWeight: 700, letterSpacing: -0.4 }}>
              {current.label}
            </h1>
            {current.description && (
              <p style={{ margin: "4px 0 0", color: tokens.text2, fontSize: 13 }}>{current.description}</p>
            )}
          </div>
        </div>

        <Suspense fallback={<ViewSkeleton tokens={tokens} />}>
          {section === "dashboard"  && <DashboardView tokens={tokens} />}
          {section === "usuarios"   && <UsuariosView tokens={tokens} currentUserId={currentUser.id} onUserAction={(m, k) => onToast(m, k)} />}
          {section === "inventario" && <InventarioView tokens={tokens} />}
          {section === "maestro"    && <MaestroView tokens={tokens} />}
          {section === "secciones"  && <SeccionesView tokens={tokens} />}
          {section === "protocolos" && <ProtocolosView tokens={tokens} />}
          {section === "anexos"     && <AnexosView tokens={tokens} />}
          {section === "diuresis"   && <DiuresisView tokens={tokens} onAction={(m, k) => onToast(m, k)} />}
          {section === "logs"       && <LogsView tokens={tokens} />}
          {section === "security"   && <SecurityView tokens={tokens} />}
        </Suspense>
      </main>
    </div>
  );
}

function ViewSkeleton({ tokens }: { tokens: ThemeTokens }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Skeleton tokens={tokens} width={240} height={14} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} tokens={tokens} height={100} radius={12} />)}
      </div>
      <Skeleton tokens={tokens} height={320} radius={12} />
    </div>
  );
}

function AdminSidebar({ tokens, active, onSelect, onExit, theme, onToggleTheme, currentUser }: {
  tokens: ThemeTokens;
  active: Section;
  onSelect: (s: Section) => void;
  onExit: () => void;
  theme: Theme;
  onToggleTheme: () => void;
  currentUser: User;
}) {
  const grouped: Record<string, NavItem[]> = {};
  for (const n of NAV) {
    if (!grouped[n.group]) grouped[n.group] = [];
    grouped[n.group].push(n);
  }

  return (
    <aside style={{
      width: 248, background: tokens.bgElev, borderRight: `1px solid ${tokens.border}`,
      display: "flex", flexDirection: "column", flexShrink: 0,
    }}>
      {/* Header */}
      <div style={{ padding: "20px 18px 16px", borderBottom: `1px solid ${tokens.border}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 8,
            background: `linear-gradient(135deg, ${tokens.accent}, ${tokens.accentHover})`,
            display: "flex", alignItems: "center", justifyContent: "center", color: "white",
            fontWeight: 800, fontSize: 13, letterSpacing: 0.5,
          }}>BS</div>
          <div>
            <div style={{ color: tokens.text, fontSize: 13, fontWeight: 700 }}>BIO-STOCK</div>
            <div style={{ color: tokens.text2, fontSize: 11 }}>Control Center</div>
          </div>
        </div>
      </div>

      {/* Nav groups */}
      <nav style={{ flex: 1, overflowY: "auto", padding: "12px 8px" }}>
        {(["overview", "operations", "data", "security"] as const).map(g => (
          <div key={g} style={{ marginBottom: 14 }}>
            <div style={{
              padding: "6px 10px 4px", color: tokens.text3, fontSize: 10,
              fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.8,
            }}>{GROUP_LABELS[g]}</div>
            {grouped[g]?.map(n => {
              const isActive = active === n.id;
              return (
                <button key={n.id} onClick={() => onSelect(n.id)} style={{
                  width: "100%", display: "flex", alignItems: "center", gap: 10,
                  padding: "8px 10px", borderRadius: 7, border: "none",
                  background: isActive ? tokens.accentSoft : "transparent",
                  color: isActive ? tokens.accent : tokens.text2,
                  fontSize: 13, fontWeight: isActive ? 600 : 500,
                  cursor: "pointer", textAlign: "left", transition: "all 100ms",
                }}
                  onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = tokens.bgHover; }}
                  onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
                >
                  <span style={{ display: "flex", color: isActive ? tokens.accent : tokens.text3 }}>{n.icon}</span>
                  {n.label}
                </button>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Footer: user + theme toggle + exit */}
      <div style={{ padding: 12, borderTop: `1px solid ${tokens.border}`, display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ padding: "8px 10px", background: tokens.bgElev2, borderRadius: 8 }}>
          <div style={{ color: tokens.text2, fontSize: 10, fontWeight: 600, textTransform: "uppercase", marginBottom: 2 }}>Sesión</div>
          <div style={{ color: tokens.text, fontSize: 13, fontWeight: 700 }}>{currentUser.nombre}</div>
          <div style={{ color: tokens.text3, fontSize: 11 }}>{currentUser.rol}</div>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button onClick={onToggleTheme}
            style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "8px 10px", background: tokens.bgElev2, color: tokens.text2, border: "none", borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
            {theme === "dark" ? <Sun size={13}/> : <Moon size={13}/>}
            {theme === "dark" ? "Light" : "Dark"}
          </button>
          <button onClick={onExit}
            style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "8px 10px", background: tokens.bgElev2, color: tokens.text2, border: "none", borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
            <ArrowLeft size={13}/> Salir
          </button>
        </div>
      </div>
    </aside>
  );
}
