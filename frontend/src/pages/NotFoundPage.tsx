import { ArrowLeft, LayoutDashboard, Plus, ReceiptText } from "lucide-react";
import { Link } from "react-router-dom";

const shortcuts = [
  { to: "/dashboard", label: "Ir para Hoje", Icon: LayoutDashboard },
  { to: "/expenses", label: "Ver movimentos", Icon: ReceiptText },
  { to: "/expenses/new", label: "Registar despesa", Icon: Plus },
];

export function NotFoundPage() {
  return (
    <main className="not-found">
      <p className="not-found__number" aria-hidden="true">
        404
      </p>
      <p className="eyebrow">Página não encontrada</p>
      <h1>Esta conta não fecha.</h1>
      <p>O endereço pode ter mudado ou já não estar disponível.</p>
      <div className="not-found__actions">
        <Link className="button button--primary" to="/dashboard">
          <ArrowLeft aria-hidden="true" /> Voltar ao início
        </Link>
        {shortcuts.slice(1).map(({ to, label, Icon }) => (
          <Link key={to} className="button button--secondary" to={to}>
            <Icon aria-hidden="true" /> {label}
          </Link>
        ))}
      </div>
    </main>
  );
}
