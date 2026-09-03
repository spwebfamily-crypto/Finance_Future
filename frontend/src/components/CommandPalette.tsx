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
  Moon,
  Plus,
  ReceiptText,
  Search,
  Shield,
  Sun,
  TrendingUp,
} from "lucide-react";
import { applyTheme } from "./ThemeToggle";

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

function currentTheme() {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

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
  const theme = currentTheme();
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

  const toggleTheme = useCallback(() => {
    const toggle = document.querySelector<HTMLButtonElement>(".theme-toggle");
    if (toggle) {
      toggle.click();
      return;
    }

    const next = currentTheme() === "dark" ? "light" : "dark";
    applyTheme(next);
  }, []);

  const commands = useMemo<CommandItem[]>(() => {
    const base: CommandItem[] = [
      { id: "dashboard", label: "Ir para Hoje", to: "/dashboard", Icon: LayoutDashboard },
      { id: "expenses", label: "Ir para Movimentos", to: "/expenses", Icon: ReceiptText },
      { id: "accounts", label: "Ir para Contas", to: "/accounts", Icon: Landmark },
      { id: "planning", label: "Ir para Plano", to: "/planning", Icon: CalendarClock },
      { id: "investments", label: "Ir para Investir", to: "/investments", Icon: TrendingUp },
      { id: "banks", label: "Ir para Bancos", to: "/accounts/connections", Icon: Building2 },
      { id: "privacy", label: "Ir para Privacidade", to: "/privacy", Icon: Shield },
      { id: "categories", label: "Ir para Categorias", to: "/categories", Icon: FolderOpen },
      {
        id: "new-expense",
        label: "Registar despesa",
        hint: "formulário completo",
        to: "/expenses/new",
        Icon: Plus,
      },
      {
        id: "toggle-theme",
        label: theme === "dark" ? "Ativar tema claro" : "Ativar tema escuro",
        Icon: theme === "dark" ? Sun : Moon,
        action: toggleTheme,
      },
    ];
    const needle = query.trim().toLocaleLowerCase("pt-PT");
    if (!needle) return base;
    return base.filter((item) =>
      `${item.label} ${item.hint ?? ""}`.toLocaleLowerCase("pt-PT").includes(needle),
    );
  }, [query, theme, toggleTheme]);

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
            aria-label="Pesquisa rápida"
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
                placeholder="Para onde ir? O que fazer?"
                aria-label="Pesquisar comandos"
                autoComplete="off"
              />
              <kbd aria-hidden="true">esc</kbd>
            </div>
            <div
              className="command-palette__list"
              ref={listRef}
              role="listbox"
              aria-label="Comandos"
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
                <p className="command-palette__empty">Nada encontrado para “{query}”.</p>
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
      aria-label={`Abrir pesquisa rápida de comandos (${label})`}
      title={`Pesquisa rápida (${label})`}
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
