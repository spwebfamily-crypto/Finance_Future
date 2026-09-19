import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useNavigate } from "react-router-dom";
import {
  Building2,
  CalendarClock,
  Command,
  FolderOpen,
  Landmark,
  LayoutDashboard,
  Monitor,
  Moon,
  Plus,
  ReceiptText,
  Search,
  Shield,
  Sun,
  TrendingUp,
} from "lucide-react";
import { useTheme } from "./ThemeProvider";
import { useI18n } from "../i18n/I18nContext";
import { routes } from "../routes";

interface CommandItem {
  id: string;
  label: string;
  hint?: string;
  to?: string;
  action?: () => void;
  Icon: typeof Plus;
}

interface CommandPaletteContextValue {
  open: () => void;
  shortcutLabel: string;
}

const CommandPaletteContext = createContext<CommandPaletteContextValue | null>(null);

function isApplePlatform() {
  if (typeof navigator === "undefined") return false;
  return (
    /Mac|iPhone|iPad|iPod/i.test(navigator.platform || "") ||
    /Mac OS X|iPhone|iPad/i.test(navigator.userAgent)
  );
}

export function shortcutLabel() {
  return isApplePlatform() ? "⌘K" : "Ctrl+K";
}

export function CommandPaletteProvider({ children }: { children?: ReactNode }) {
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const { preference, theme, setPreference, toggle } = useTheme();
  const { locale, translate } = useI18n();
  const platformShortcut = shortcutLabel();

  const close = useCallback(() => {
    setIsOpen(false);
    setQuery("");
    setActiveIndex(0);
  }, []);

  const open = useCallback(() => {
    setIsOpen(true);
    setQuery("");
    setActiveIndex(0);
  }, []);

  const commands = useMemo<CommandItem[]>(() => {
    const base: CommandItem[] = [
      {
        id: "dashboard",
        label: translate("command.dashboard"),
        to: routes.dashboard,
        Icon: LayoutDashboard,
      },
      {
        id: "expenses",
        label: translate("command.expenses"),
        to: routes.expenses,
        Icon: ReceiptText,
      },
      { id: "accounts", label: translate("command.accounts"), to: routes.accounts, Icon: Landmark },
      {
        id: "planning",
        label: translate("command.planning"),
        to: routes.planning,
        Icon: CalendarClock,
      },
      {
        id: "investments",
        label: translate("command.investments"),
        to: routes.investments,
        Icon: TrendingUp,
      },
      {
        id: "banks",
        label: translate("command.banks"),
        to: routes.bankConnections,
        Icon: Building2,
      },
      { id: "privacy", label: translate("command.privacy"), to: routes.privacy, Icon: Shield },
      {
        id: "categories",
        label: translate("command.categories"),
        to: routes.categories,
        Icon: FolderOpen,
      },
      {
        id: "new-expense",
        label: translate("command.newExpense"),
        hint: translate("command.fullForm"),
        to: routes.newExpense,
        Icon: Plus,
      },
      {
        id: "toggle-theme",
        label:
          theme === "dark" ? translate("command.enableLight") : translate("command.enableDark"),
        Icon: theme === "dark" ? Sun : Moon,
        action: toggle,
      },
      {
        id: "theme-system",
        label:
          preference === "system"
            ? translate("command.systemCurrent")
            : translate("command.useSystem"),
        Icon: Monitor,
        action: () => setPreference("system"),
      },
    ];
    const needle = query.trim().toLocaleLowerCase(locale);
    if (!needle) return base;
    return base.filter((item) =>
      `${item.label} ${item.hint ?? ""}`.toLocaleLowerCase(locale).includes(needle),
    );
  }, [locale, preference, query, setPreference, theme, toggle, translate]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setIsOpen((current) => !current);
        setQuery("");
        setActiveIndex(0);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const frame = window.requestAnimationFrame(() => inputRef.current?.focus());
    return () => {
      window.cancelAnimationFrame(frame);
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      );
      if (!focusable.length) {
        event.preventDefault();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !dialogRef.current?.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [close, isOpen]);

  useEffect(() => {
    listRef.current
      ?.querySelectorAll<HTMLElement>("[data-index]")
      [activeIndex]?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  function choose(item: CommandItem) {
    close();
    if (item.to) navigate(item.to);
    else item.action?.();
  }

  function handleKeyDown(event: React.KeyboardEvent) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => (index + 1) % Math.max(1, commands.length));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => (index - 1 + commands.length) % Math.max(1, commands.length));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const item = commands[activeIndex];
      if (item) choose(item);
    }
  }

  return (
    <CommandPaletteContext.Provider value={{ open, shortcutLabel: platformShortcut }}>
      {children}
      {isOpen && (
        <div className="command-overlay" role="presentation" onClick={close}>
          <div
            ref={dialogRef}
            className="command-palette"
            role="dialog"
            aria-modal="true"
            aria-label={translate("command.dialog")}
            onClick={(event) => event.stopPropagation()}
            onKeyDown={handleKeyDown}
          >
            <div className="command-palette__input">
              <Command size={16} aria-hidden="true" />
              <input
                ref={inputRef}
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setActiveIndex(0);
                }}
                placeholder={translate("command.input")}
                aria-label={translate("command.search")}
                autoComplete="off"
              />
              <kbd aria-hidden="true">esc</kbd>
            </div>
            <div
              className="command-palette__list"
              ref={listRef}
              role="listbox"
              aria-label={translate("command.list")}
            >
              {commands.length ? (
                commands.map((item, index) => (
                  <button
                    key={item.id}
                    type="button"
                    data-index={index}
                    role="option"
                    aria-selected={index === activeIndex}
                    className={`command-item${index === activeIndex ? " is-active" : ""}`}
                    onPointerEnter={() => setActiveIndex(index)}
                    onClick={() => choose(item)}
                  >
                    <item.Icon size={16} aria-hidden="true" />
                    <span>{item.label}</span>
                    {item.hint && <small>{item.hint}</small>}
                  </button>
                ))
              ) : (
                <p className="command-palette__empty">{translate("command.empty", { query })}</p>
              )}
            </div>
          </div>
        </div>
      )}
    </CommandPaletteContext.Provider>
  );
}

export function CommandPaletteTrigger({ compact = false }: { compact?: boolean }) {
  const context = useContext(CommandPaletteContext);
  const { translate } = useI18n();
  const label = context?.shortcutLabel ?? shortcutLabel();
  return (
    <button
      type="button"
      className={
        compact
          ? "command-palette-trigger command-palette-trigger--compact"
          : "command-palette-trigger"
      }
      onClick={() => context?.open()}
      aria-label={translate("command.open", { shortcut: label })}
      title={translate("command.title", { shortcut: label })}
    >
      <Search size={15} aria-hidden="true" />
      {!compact && <kbd aria-hidden="true">{label}</kbd>}
    </button>
  );
}

export function CommandPalette() {
  return (
    <CommandPaletteProvider>
      <CommandPaletteTrigger />
    </CommandPaletteProvider>
  );
}
