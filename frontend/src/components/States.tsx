import { AlertCircle, Inbox, RotateCcw } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { Brand } from "./Brand";

export function Spinner({ label = "A carregar" }: { label?: string }) {
  return (
    <span className="spinner" role="status">
      <span aria-hidden="true" />
      {label}
    </span>
  );
}

export function FullPageLoader({ label }: { label: string }) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      className="full-page-loader"
      role="status"
      aria-live="polite"
      aria-busy="true"
      initial={false}
      animate={{ opacity: 1 }}
      exit={
        reduceMotion
          ? { opacity: 0, transition: { duration: 0 } }
          : { opacity: 0, transition: { duration: 0.08, ease: "easeOut" } }
      }
    >
      <Brand linked={false} phase="loading" />
      <div className="loader-progress" aria-hidden="true">
        <motion.span
          initial={reduceMotion ? false : { x: "-100%" }}
          animate={reduceMotion ? { x: "0%" } : { x: ["-120%", "340%"] }}
          transition={
            reduceMotion ? { duration: 0 } : { duration: 0.85, repeat: Infinity, ease: "easeInOut" }
          }
        />
      </div>
      <span className="full-page-loader__label">{label}</span>
    </motion.div>
  );
}

export function LoadingState({ label = "A carregar dados" }: { label?: string }) {
  return (
    <div className="state-panel state-panel--loading" aria-live="polite">
      <div className="skeleton-lines" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
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
