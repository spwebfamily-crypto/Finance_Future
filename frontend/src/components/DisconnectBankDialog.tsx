import { useEffect, useId, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { AlertTriangle } from "lucide-react";
import type { BankRetention } from "../types";

/**
 * Confirmação da desconexão. A eliminação dos dados importados exige uma
 * segunda confirmação explícita (escrever ELIMINAR).
 */
export function DisconnectBankDialog({
  open,
  institutionName,
  busy = false,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  institutionName: string;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: (retention: BankRetention) => void;
}) {
  const [retention, setRetention] = useState<BankRetention>("keep_imported");
  const [confirmation, setConfirmation] = useState("");
  const cancelRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();
  const keepId = useId();
  const deleteId = useId();

  useEffect(() => {
    if (!open) return;
    setRetention("keep_imported");
    setConfirmation("");
    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const frame = window.requestAnimationFrame(() => cancelRef.current?.focus());
    return () => {
      window.cancelAnimationFrame(frame);
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) {
        event.preventDefault();
        onCancel();
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
  }, [busy, onCancel, open]);

  const requiresConfirmation = retention === "delete_imported";
  const canConfirm =
    !busy && (!requiresConfirmation || confirmation.trim().toUpperCase() === "ELIMINAR");

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="dialog-backdrop"
          role="presentation"
          initial={reduceMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={reduceMotion ? undefined : { opacity: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.12 }}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !busy) onCancel();
          }}
        >
          <motion.div
            ref={dialogRef}
            className="confirm-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="disconnect-title"
            initial={reduceMotion ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduceMotion ? undefined : { opacity: 0, y: 6 }}
            transition={{ duration: reduceMotion ? 0 : 0.14 }}
          >
            <h2 id="disconnect-title">Desligar {institutionName}?</h2>
            <p className="confirm-dialog__description">
              A ligação ao banco é encerrada. Escolha o que acontece aos dados já importados.
            </p>

            <fieldset className="retention-options">
              <legend>O que fazer aos dados importados</legend>
              <label htmlFor={keepId} className="retention-option">
                <input
                  id={keepId}
                  type="radio"
                  name="retention"
                  checked={retention === "keep_imported"}
                  onChange={() => setRetention("keep_imported")}
                />
                <span>
                  <strong>Conservar os dados</strong>
                  <small>
                    As contas passam a manuais com o último saldo conhecido. Despesas, rendimentos e
                    movimentos importados ficam na aplicação.
                  </small>
                </span>
              </label>
              <label htmlFor={deleteId} className="retention-option retention-option--danger">
                <input
                  id={deleteId}
                  type="radio"
                  name="retention"
                  checked={retention === "delete_imported"}
                  onChange={() => setRetention("delete_imported")}
                />
                <span>
                  <strong>Eliminar os dados importados</strong>
                  <small>
                    Remove os movimentos bancários e as despesas, rendimentos e transferências
                    criadas por esta ligação. Os registos manuais não são apagados.
                  </small>
                </span>
              </label>
            </fieldset>

            {requiresConfirmation && (
              <label className="field">
                <span>
                  Escreva <strong>ELIMINAR</strong> para confirmar
                </span>
                <input
                  value={confirmation}
                  onChange={(event) => setConfirmation(event.target.value)}
                  autoComplete="off"
                />
              </label>
            )}

            {requiresConfirmation && (
              <p className="form-alert" role="alert">
                <AlertTriangle aria-hidden="true" /> Esta ação não pode ser anulada.
              </p>
            )}

            <div className="confirm-dialog__actions">
              <button
                type="button"
                className="button"
                ref={cancelRef}
                onClick={onCancel}
                disabled={busy}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="button button--danger"
                disabled={!canConfirm}
                onClick={() => onConfirm(retention)}
              >
                {busy
                  ? "A desligar…"
                  : requiresConfirmation
                    ? "Eliminar e desligar"
                    : "Desligar e conservar"}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
