import { Monitor, Moon, Sun } from "lucide-react";
import { useI18n } from "../i18n/I18nContext";
import { useTheme } from "./ThemeProvider";

export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const { t } = useI18n();
  const { preference, theme, setPreference } = useTheme();
  const dark = theme === "dark";
  const label = preference === "system" ? "Sistema" : dark ? t("Tema escuro") : t("Tema claro");

  return (
    <label
      className={compact ? "theme-toggle theme-toggle--compact" : "theme-toggle"}
      title={t("Tema")}
    >
      {preference === "system" ? <Monitor aria-hidden="true" /> : dark ? <Moon aria-hidden="true" /> : <Sun aria-hidden="true" />}
      {!compact && <span className="theme-toggle__label">{label}</span>}
      <select
        value={preference}
        onChange={(event) => setPreference(event.target.value as "system" | "light" | "dark")}
        aria-label={t("Tema")}
      >
        <option value="system">Sistema</option>
        <option value="light">{t("Tema claro")}</option>
        <option value="dark">{t("Tema escuro")}</option>
      </select>
    </label>
  );
}
