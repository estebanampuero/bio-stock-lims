import { useState, useEffect, useCallback } from "react";
import { TOKENS, type Theme, type ThemeTokens } from "../adminTheme";

const STORAGE = "biostock_admin_theme";

function detectInitial(): Theme {
  if (typeof window === "undefined") return "light";
  const saved = localStorage.getItem(STORAGE) as Theme | null;
  if (saved === "light" || saved === "dark") return saved;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function useTheme(): { theme: Theme; tokens: ThemeTokens; toggle: () => void } {
  const [theme, setTheme] = useState<Theme>(detectInitial);

  useEffect(() => {
    localStorage.setItem(STORAGE, theme);
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  const toggle = useCallback(() => setTheme(t => (t === "light" ? "dark" : "light")), []);

  return { theme, tokens: TOKENS[theme], toggle };
}
