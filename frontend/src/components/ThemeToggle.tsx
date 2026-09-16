import { Monitor, Moon, Sun } from "lucide-react";
import { useI18n } from "../i18n/I18nContext";
import { useTheme } from "./ThemeProvider";

export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const { translate } = useI18n();
  const { preference, theme, setPreference } = useTheme();
  const dark = theme === "dark";
  const label = preference === "system" ? translate("theme.system") : dark ? translate("theme.dark") : translate("theme.light");

  return (
    <label
      className={compact ? "theme-toggle theme-toggle--compact" : "theme-toggle"}
      title={translate("theme.label")}
    >
      {preference === "system" ? <Monitor aria-hidden="true" /> : dark ? <Moon aria-hidden="true" /> : <Sun aria-hidden="true" />}
      {!compact && <span className="theme-toggle__label">{label}</span>}
      <select
        value={preference}
        onChange={(event) => setPreference(event.target.value as "system" | "light" | "dark")}
        aria-label={translate("theme.label")}
      >
        <option value="system">{translate("theme.system")}</option>
        <option value="light">{translate("theme.light")}</option>
        <option value="dark">{translate("theme.dark")}</option>
      </select>
    </label>
  );
}
