import { ChevronRight } from "lucide-react";
import type { ThemeTokens } from "../adminTheme";

export function Breadcrumbs({ tokens, items }: { tokens: ThemeTokens; items: { label: string; onClick?: () => void }[] }) {
  return (
    <nav style={{ display: "flex", alignItems: "center", gap: 6, color: tokens.text2, fontSize: 12, marginBottom: 16 }}>
      {items.map((item, i) => (
        <span key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {i > 0 && <ChevronRight size={12} style={{ color: tokens.text3 }} />}
          {item.onClick ? (
            <button
              onClick={item.onClick}
              style={{
                border: "none", background: "transparent",
                color: i === items.length - 1 ? tokens.text : tokens.text2,
                fontSize: 12, fontWeight: i === items.length - 1 ? 600 : 500,
                cursor: "pointer", padding: 0,
              }}
            >{item.label}</button>
          ) : (
            <span style={{ color: i === items.length - 1 ? tokens.text : tokens.text2, fontWeight: i === items.length - 1 ? 600 : 500 }}>
              {item.label}
            </span>
          )}
        </span>
      ))}
    </nav>
  );
}
