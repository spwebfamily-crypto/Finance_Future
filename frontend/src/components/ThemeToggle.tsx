import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

const THEME_KEY = "expensesnap.theme";
const THEME_COLORS = { light: "#ffffff", dark: "#0c0c09" } as const;

type Theme = "light" | "dark";

function preferredTheme(): Theme {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function storedTheme(): Theme {
  if (typeof window === "undefined") return preferredTheme();
  try {
    const value = window.localStorage.getItem(THEME_KEY);
    return value === "light" || value === "dark" ? value : preferredTheme();
  } catch {
    return preferredTheme();
  }
}

export function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", THEME_COLORS[theme]);
  try {
    window.localStorage.setItem(THEME_KEY, theme);
  } catch {
    // O tema continua a funcionar quando o armazenamento estiver indisponível.
  }
}

export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const [theme, setTheme] = useState<Theme>(storedTheme);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const dark = theme === "dark";
  const nextLabel = dark ? "Ativar tema claro" : "Ativar tema escuro";

  return (
    <button
      className={compact ? "theme-toggle theme-toggle--compact" : "theme-toggle"}
      type="button"
      aria-label={nextLabel}
      title={nextLabel}
      onClick={() => setTheme(dark ? "light" : "dark")}
    >
      {dark ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
      {!compact && <span>{dark ? "Tema claro" : "Tema escuro"}</span>}
    </button>
  );
}
