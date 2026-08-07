import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <main className="not-found">
      <p className="not-found__number" aria-hidden="true">404</p>
      <p className="eyebrow">Página não encontrada</p>
      <h1>Esta conta não fecha.</h1>
      <p>O endereço pode ter mudado ou já não estar disponível.</p>
      <Link className="button button--primary" to="/expenses"><ArrowLeft aria-hidden="true" /> Voltar às despesas</Link>
    </main>
  );
}
