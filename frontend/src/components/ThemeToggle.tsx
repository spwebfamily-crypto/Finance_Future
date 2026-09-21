import { Moon, Sun } from "lucide-react";
import { useI18n } from "../i18n/I18nContext";
import { useTheme } from "./ThemeProvider";

export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const { translate } = useI18n();
  const { theme, toggle } = useTheme();
  const dark = theme === "dark";
  const nextLabel = dark ? translate("theme.light") : translate("theme.dark");

  return (
    <button
      type="button"
      className={compact ? "theme-toggle theme-toggle--compact" : "theme-toggle"}
      aria-label={`${translate("theme.label")}: ${nextLabel}`}
      title={`${translate("theme.label")}: ${nextLabel}`}
      onClick={toggle}
    >
      {dark ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
      {!compact && <span className="theme-toggle__label">{nextLabel}</span>}
    </button>
  );
}
