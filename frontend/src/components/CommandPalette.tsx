import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  CalendarClock,
  Command,
  Landmark,
  LayoutDashboard,
  Moon,
  Plus,
  ReceiptText,
  Search,
  Sun,
  TrendingUp,
} from "lucide-react";

interface CommandItem {
  id: string;
  label: string;
  hint?: string;
  to?: string;
  action?: () => void;
  Icon: typeof Plus;
}

function currentTheme() {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

export function CommandPalette() {
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const theme = currentTheme();

  const close = useCallback(() => {
    setIsOpen(false);
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
    document.documentElement.dataset.theme = next;
    window.localStorage.setItem("expensesnap.theme", next);
  }, []);

  const commands = useMemo<CommandItem[]>(() => {
    const base: CommandItem[] = [
      { id: "dashboard", label: "Ir para Hoje", to: "/dashboard", Icon: LayoutDashboard },
      { id: "expenses", label: "Ir para Movimentos", to: "/expenses", Icon: ReceiptText },
      { id: "accounts", label: "Ir para Contas", to: "/accounts", Icon: Landmark },
      { id: "planning", label: "Ir para Plano", to: "/planning", Icon: CalendarClock },
      { id: "investments", label: "Ir para Investir", to: "/investments", Icon: TrendingUp },
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
        setIsOpen((open) => !open);
        setQuery("");
        setActiveIndex(0);
      }
      if (event.key === "Escape") setIsOpen(false);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    if (isOpen) {
      const timer = window.setTimeout(() => inputRef.current?.focus(), 20);
      return () => window.clearTimeout(timer);
    }
  }, [isOpen]);

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

  if (!isOpen) {
    return (
      <button
        type="button"
        className="command-palette-trigger"
        onClick={() => setIsOpen(true)}
        aria-label="Abrir pesquisa rápida de comandos"
        title="Pesquisa rápida (Ctrl/⌘+K)"
      >
        <Search size={15} aria-hidden="true" />
        <kbd aria-hidden="true">⌘K</kbd>
      </button>
    );
  }

  return (
    <div className="command-overlay" role="presentation" onClick={close}>
      <div
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
        <div className="command-palette__list" ref={listRef} role="listbox" aria-label="Comandos">
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
  );
}
