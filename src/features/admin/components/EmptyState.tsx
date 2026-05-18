import type { ReactNode } from "react";
import type { ThemeTokens } from "../adminTheme";

export function EmptyState({ tokens, icon, title, hint, action }: {
  tokens: ThemeTokens;
  icon?: ReactNode;
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div style={{
      padding: 48, textAlign: "center", border: `1px dashed ${tokens.border}`,
      borderRadius: 12, background: tokens.bgElev2,
    }}>
      {icon && <div style={{ color: tokens.text3, marginBottom: 12, display: "flex", justifyContent: "center" }}>{icon}</div>}
      <div style={{ color: tokens.text, fontWeight: 600, fontSize: 14, marginBottom: hint ? 4 : 0 }}>{title}</div>
      {hint && <div style={{ color: tokens.text2, fontSize: 13 }}>{hint}</div>}
      {action && <div style={{ marginTop: 16 }}>{action}</div>}
    </div>
  );
}
