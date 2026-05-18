import type { ThemeTokens } from "../adminTheme";

export type PillKind = "neutral" | "success" | "warning" | "danger" | "accent";

export function StatusPill({ tokens, kind = "neutral", children, mono = false }: {
  tokens: ThemeTokens; kind?: PillKind; children: React.ReactNode; mono?: boolean;
}) {
  const colors = {
    neutral: { bg: tokens.bgElev2, fg: tokens.text2 },
    success: { bg: tokens.successSoft, fg: tokens.success },
    warning: { bg: tokens.warningSoft, fg: tokens.warning },
    danger:  { bg: tokens.dangerSoft,  fg: tokens.danger },
    accent:  { bg: tokens.accentSoft,  fg: tokens.accent },
  }[kind];
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      padding: "3px 9px", borderRadius: 999,
      background: colors.bg, color: colors.fg,
      fontSize: 11, fontWeight: 600,
      fontFamily: mono ? 'ui-monospace, "SF Mono", monospace' : undefined,
      whiteSpace: "nowrap",
    }}>{children}</span>
  );
}
