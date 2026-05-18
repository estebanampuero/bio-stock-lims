import type { ReactNode } from "react";
import { TrendingUp, TrendingDown } from "lucide-react";
import type { ThemeTokens } from "../adminTheme";

export function MetricCard({ tokens, label, value, hint, icon, delta, kind = "default" }: {
  tokens: ThemeTokens;
  label: string;
  value: string | number;
  hint?: string;
  icon?: ReactNode;
  delta?: { value: number; direction: "up" | "down"; label?: string };
  kind?: "default" | "success" | "warning" | "danger";
}) {
  const accent = {
    default: tokens.accent,
    success: tokens.success,
    warning: tokens.warning,
    danger:  tokens.danger,
  }[kind];

  return (
    <div style={{
      background: tokens.bgElev, border: `1px solid ${tokens.border}`,
      borderRadius: 12, padding: 20, boxShadow: tokens.shadow,
      transition: "all 150ms cubic-bezier(0.4, 0, 0.2, 1)",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
        <span style={{ color: tokens.text2, fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>
          {label}
        </span>
        {icon && (
          <span style={{
            display: "flex", padding: 6, borderRadius: 8,
            background: accent + "20", color: accent,
          }}>{icon}</span>
        )}
      </div>
      <div style={{ color: tokens.text, fontSize: 28, fontWeight: 700, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
        {value}
      </div>
      {(hint || delta) && (
        <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
          {delta && (
            <span style={{
              display: "inline-flex", alignItems: "center", gap: 3,
              color: delta.direction === "up" ? tokens.success : tokens.danger,
              fontWeight: 600,
            }}>
              {delta.direction === "up" ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
              {delta.value}%
            </span>
          )}
          {hint && <span style={{ color: tokens.text2 }}>{hint}</span>}
        </div>
      )}
    </div>
  );
}
