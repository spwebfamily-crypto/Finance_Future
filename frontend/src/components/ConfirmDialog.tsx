import { useEffect, useRef } from 'react';
import { AlertTriangle } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (open) cancelButtonRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onCancel();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, busy, onCancel]);

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
            className="confirm-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
            aria-describedby="confirm-description"
            initial={reduceMotion ? false : { opacity: 0, scale: 0.97, y: 14 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={reduceMotion ? undefined : { opacity: 0, scale: 0.98, y: 8 }}
            transition={{ duration: reduceMotion ? 0 : 0.24, ease: [0.16, 1, 0.3, 1] }}
          >
            <span className="confirm-dialog__icon" aria-hidden="true"><AlertTriangle /></span>
            <h2 id="confirm-title">{title}</h2>
            <p id="confirm-description">{description}</p>
            <div className="confirm-dialog__actions">
              <button ref={cancelButtonRef} className="button button--secondary" type="button" onClick={onCancel} disabled={busy}>Cancelar</button>
              <button className="button button--danger" type="button" onClick={onConfirm} disabled={busy}>{busy ? 'A eliminar…' : confirmLabel}</button>
            </div>
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
