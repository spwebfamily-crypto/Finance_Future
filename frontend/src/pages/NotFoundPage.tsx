import { ArrowRight, LayoutDashboard, Plus, ReceiptText } from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

const shortcuts = [
  { to: "/expenses", label: "Ver movimentos", Icon: ReceiptText },
  { to: "/expenses/new", label: "Registar despesa", Icon: Plus },
];

export function NotFoundPage() {
  const { isAuthenticated } = useAuth();

  return (
    <main className="not-found">
      <p className="not-found__number" aria-hidden="true">
        404
      </p>
      <p className="eyebrow">Página não encontrada</p>
      <h1>Esta conta não fecha.</h1>
      <p>O endereço pode ter mudado ou já não estar disponível.</p>
      <div className="not-found__actions">
        {isAuthenticated ? (
          <>
            <Link className="button button--primary" to="/dashboard">
              <LayoutDashboard aria-hidden="true" /> Ir para Hoje
            </Link>
            {shortcuts.map(({ to, label, Icon }) => (
              <Link key={to} className="button button--secondary" to={to}>
                <Icon aria-hidden="true" /> {label}
              </Link>
            ))}
          </>
        ) : (
          <>
            <Link className="button button--primary" to="/login">
              Entrar na conta <ArrowRight aria-hidden="true" />
            </Link>
            <Link className="button button--secondary" to="/register">
              Criar conta
            </Link>
          </>
        )}
      </div>
    </main>
  );
}
