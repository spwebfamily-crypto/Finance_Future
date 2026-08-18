import { useEffect, useId, useRef, type FormEvent } from 'react';
import { Landmark } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { formatCurrency } from '../utils/format';

interface BalanceCorrectionDialogProps {
  open: boolean;
  accountName: string;
  currentBalance: number;
  currency: string;
  value: string;
  errorMessage?: string;
  busy?: boolean;
  onValueChange: (value: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}

export function BalanceCorrectionDialog({
  open,
  accountName,
  currentBalance,
  currency,
  value,
  errorMessage = '',
  busy = false,
  onValueChange,
  onConfirm,
  onCancel,
}: BalanceCorrectionDialogProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const frame = window.requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
    return () => {
      window.cancelAnimationFrame(frame);
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) {
        event.preventDefault();
        onCancel();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ) ?? []);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, busy, onCancel]);

  function submit(event: FormEvent) {
    event.preventDefault();
    onConfirm();
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="dialog-backdrop"
          role="presentation"
          initial={reduceMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={reduceMotion ? undefined : { opacity: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.18 }}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !busy) onCancel();
          }}
        >
          <motion.section
            ref={dialogRef}
            className="confirm-dialog balance-correction-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={descriptionId}
            initial={reduceMotion ? false : { opacity: 0, scale: 0.97, y: 14 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={reduceMotion ? undefined : { opacity: 0, scale: 0.98, y: 8 }}
            transition={{ duration: reduceMotion ? 0 : 0.24, ease: [0.16, 1, 0.3, 1] }}
          >
            <span className="confirm-dialog__icon balance-correction-dialog__icon" aria-hidden="true"><Landmark /></span>
            <h2 id={titleId}>Corrigir valor da conta</h2>
            <p id={descriptionId}>Defina o saldo atual de “{accountName}”. Os movimentos existentes não serão alterados.</p>
            <form onSubmit={submit}>
              {errorMessage && <div className="form-alert" role="alert">{errorMessage}</div>}
              <label className="field">
                <span>Novo saldo</span>
                <input
                  ref={inputRef}
                  inputMode="decimal"
                  value={value}
                  onChange={(event) => onValueChange(event.target.value)}
                  placeholder="0,00"
                  required
                  aria-describedby={`${descriptionId}-current`}
                />
              </label>
              <small id={`${descriptionId}-current`} className="balance-correction-dialog__current">
                Saldo apresentado: {formatCurrency(currentBalance, currency)}
              </small>
              <div className="confirm-dialog__actions">
                <button className="button button--secondary" type="button" onClick={onCancel} disabled={busy}>Cancelar</button>
                <button className="button button--primary" type="submit" disabled={busy}>{busy ? 'A corrigir…' : 'Guardar correção'}</button>
              </div>
            </form>
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
