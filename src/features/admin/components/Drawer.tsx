import { useEffect } from "react";
import { X } from "lucide-react";
import type { ThemeTokens } from "../adminTheme";

export function Drawer({ tokens, open, title, subtitle, onClose, children, width = 480 }: {
  tokens: ThemeTokens;
  open: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
  width?: number;
}) {
  useEffect(() => {
    if (!open) return;
    const onEsc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
          backdropFilter: "blur(2px)", zIndex: 6000,
          animation: "drawerFadeIn 200ms ease-out",
        }}
      />
      <aside style={{
        position: "fixed", top: 0, right: 0, bottom: 0, width,
        background: tokens.bgElev, borderLeft: `1px solid ${tokens.border}`,
        zIndex: 6001, display: "flex", flexDirection: "column",
        boxShadow: tokens.shadowLg,
        animation: "drawerSlideIn 250ms cubic-bezier(0.16, 1, 0.3, 1)",
      }}>
        <header style={{
          padding: "20px 24px", borderBottom: `1px solid ${tokens.border}`,
          display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12,
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={{ margin: 0, color: tokens.text, fontSize: 16, fontWeight: 700 }}>{title}</h2>
            {subtitle && <p style={{ margin: "4px 0 0", color: tokens.text2, fontSize: 12 }}>{subtitle}</p>}
          </div>
          <button onClick={onClose} aria-label="Cerrar" style={{
            border: "none", background: tokens.bgElev2, color: tokens.text2,
            width: 32, height: 32, borderRadius: 8, cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}><X size={16} /></button>
        </header>
        <div style={{ flex: 1, overflowY: "auto", padding: 24 }}>{children}</div>
      </aside>
    </>
  );
}

if (typeof document !== "undefined" && !document.getElementById("drawer-keyframes")) {
  const style = document.createElement("style");
  style.id = "drawer-keyframes";
  style.textContent = `
    @keyframes drawerFadeIn { from { opacity: 0; } to { opacity: 1; } }
    @keyframes drawerSlideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }
  `;
  document.head.appendChild(style);
}
