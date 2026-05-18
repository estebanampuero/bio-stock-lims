// Design tokens del Admin Control Center — soporte light + dark
// Aplicar al <html> elemento: data-theme="light" | "dark"
// Los valores son funciones para permitir cambios reactivos en runtime sin refresh.

export type Theme = "light" | "dark";

export interface ThemeTokens {
  bg: string; bgElev: string; bgElev2: string; bgHover: string;
  border: string; borderHover: string;
  text: string; text2: string; text3: string;
  accent: string; accentHover: string; accentSoft: string;
  success: string; successSoft: string;
  warning: string; warningSoft: string;
  danger: string; dangerSoft: string;
  shadow: string; shadowLg: string;
}

export const TOKENS: Record<Theme, ThemeTokens> = {
  light: {
    bg:           "#fafafa",
    bgElev:       "#ffffff",
    bgElev2:      "#f4f4f5",
    bgHover:      "rgba(0,0,0,0.04)",
    border:       "rgba(0,0,0,0.08)",
    borderHover:  "rgba(0,0,0,0.16)",
    text:         "#0a0a0a",
    text2:        "#525252",
    text3:        "#a3a3a3",
    accent:       "#2563eb",
    accentHover:  "#1d4ed8",
    accentSoft:   "rgba(37,99,235,0.1)",
    success:      "#10b981",
    successSoft:  "rgba(16,185,129,0.12)",
    warning:      "#f59e0b",
    warningSoft:  "rgba(245,158,11,0.12)",
    danger:       "#ef4444",
    dangerSoft:   "rgba(239,68,68,0.12)",
    shadow:       "0 1px 2px rgba(0,0,0,0.04), 0 1px 3px rgba(0,0,0,0.04)",
    shadowLg:     "0 4px 6px rgba(0,0,0,0.05), 0 10px 15px rgba(0,0,0,0.06)",
  },
  dark: {
    bg:           "#0a0a0a",
    bgElev:       "#141414",
    bgElev2:      "#1f1f1f",
    bgHover:      "rgba(255,255,255,0.04)",
    border:       "rgba(255,255,255,0.08)",
    borderHover:  "rgba(255,255,255,0.16)",
    text:         "#fafafa",
    text2:        "#a3a3a3",
    text3:        "#525252",
    accent:       "#3b82f6",
    accentHover:  "#60a5fa",
    accentSoft:   "rgba(59,130,246,0.15)",
    success:      "#10b981",
    successSoft:  "rgba(16,185,129,0.16)",
    warning:      "#f59e0b",
    warningSoft:  "rgba(245,158,11,0.16)",
    danger:       "#ef4444",
    dangerSoft:   "rgba(239,68,68,0.16)",
    shadow:       "0 1px 2px rgba(0,0,0,0.3)",
    shadowLg:     "0 8px 24px rgba(0,0,0,0.4)",
  },
};

export const SPACE = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };
export const RADIUS = { sm: 6, md: 8, lg: 12, xl: 16, pill: 999 };
export const TRANS = "all 150ms cubic-bezier(0.4, 0, 0.2, 1)";

export const FONT = {
  sans: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  mono: 'ui-monospace, "SF Mono", "Roboto Mono", Menlo, monospace',
};
