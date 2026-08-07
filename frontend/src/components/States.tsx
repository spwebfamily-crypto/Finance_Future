import { AlertCircle, Inbox, RotateCcw } from 'lucide-react';

export function Spinner({ label = 'A carregar' }: { label?: string }) {
  return <span className="spinner" role="status"><span aria-hidden="true" />{label}</span>;
}

export function FullPageLoader({ label }: { label: string }) {
  return (
    <main className="full-page-loader">
      <div className="loader-ledger" aria-hidden="true"><span /><span /><span /></div>
      <Spinner label={label} />
    </main>
  );
}

export function LoadingState({ label = 'A carregar dados' }: { label?: string }) {
  return (
    <div className="state-panel state-panel--loading" aria-live="polite">
      <div className="skeleton-lines" aria-hidden="true"><span /><span /><span /></div>
      <Spinner label={label} />
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="state-panel state-panel--error" role="alert">
      <AlertCircle aria-hidden="true" />
      <div>
        <h2>Algo não correu como esperado</h2>
        <p>{message}</p>
      </div>
      {onRetry && (
        <button className="button button--secondary button--small" type="button" onClick={onRetry}>
          <RotateCcw size={16} aria-hidden="true" /> Tentar novamente
        </button>
      )}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="state-panel state-panel--empty">
      <Inbox aria-hidden="true" />
      <div>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      {action}
    </div>
  );
}
