import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

const THEME_KEY = "expensesnap.theme";

function preferredTheme() {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function storedTheme() {
  if (typeof window === "undefined") return preferredTheme();
  try {
    const value = window.localStorage.getItem(THEME_KEY);
    return value === "light" || value === "dark" ? value : preferredTheme();
  } catch {
    return preferredTheme();
  }
}

export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const [theme, setTheme] = useState(storedTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", theme === "dark" ? "#101712" : "#f5f7f2");
    try {
      window.localStorage.setItem(THEME_KEY, theme);
    } catch {
      // O tema continua a funcionar quando o armazenamento estiver indisponível.
    }
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
