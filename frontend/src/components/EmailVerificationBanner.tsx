import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { MailCheck, RefreshCw, X } from "lucide-react";
import { errorMessage } from "../api/client";
import { authApi } from "../api/resources";
import { useAuth } from "../auth/AuthContext";
import { Spinner } from "./States";

const DISMISS_KEY = "expensesnap.verify-banner-dismissed";

type ResendState = "idle" | "sending" | "sent" | "failed";

function wasDismissed() {
  if (typeof window === "undefined") return false;
  try {
    return window.sessionStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

export function EmailVerificationBanner() {
  const { user } = useAuth();
  const reduceMotion = useReducedMotion();
  const [isDismissed, setIsDismissed] = useState(wasDismissed);
  const [resendState, setResendState] = useState<ResendState>("idle");
  const [message, setMessage] = useState("");

  // `emailVerified` só existe em sessões criadas depois desta funcionalidade:
  // undefined não é tratado como "não verificado" para não alarmar sem dados.
  const needsVerification = user?.emailVerified === false;
  if (!needsVerification || isDismissed) return null;

  function dismiss() {
    try {
      window.sessionStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // Sem sessionStorage o aviso reaparece na navegação seguinte.
    }
    setIsDismissed(true);
  }

  async function handleResend() {
    setResendState("sending");
    setMessage("");
    try {
      await authApi.resendVerification();
      setResendState("sent");
    } catch (error) {
      setResendState("failed");
      setMessage(errorMessage(error));
    }
  }

  return (
    <AnimatePresence initial={false}>
      <motion.aside
        className="verify-banner"
        role="status"
        initial={reduceMotion ? false : { opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={reduceMotion ? undefined : { opacity: 0, y: -8 }}
        transition={{ duration: reduceMotion ? 0 : 0.2, ease: [0.22, 1, 0.36, 1] }}
      >
        <span className="verify-banner__icon" aria-hidden="true">
          <MailCheck />
        </span>
        <div className="verify-banner__text">
          <strong>
            {resendState === "sent" ? "Novo email enviado" : "Confirme o seu email"}
          </strong>
          <span>
            {resendState === "sent"
              ? `Verifique a caixa de entrada de ${user?.email} e a pasta de spam.`
              : resendState === "failed"
                ? message
                : `Enviámos um link para ${user?.email}. Confirmar protege o acesso à sua conta.`}
          </span>
        </div>
        <div className="verify-banner__actions">
          <button
            className="button button--secondary button--small"
            type="button"
            onClick={handleResend}
            disabled={resendState === "sending" || resendState === "sent"}
          >
            {resendState === "sending" ? (
              <Spinner label="A enviar" />
            ) : (
              <>
                <RefreshCw size={15} aria-hidden="true" /> Reenviar
              </>
            )}
          </button>
          <button
            className="icon-button icon-button--quiet"
            type="button"
            onClick={dismiss}
            aria-label="Dispensar aviso de verificação"
            title="Dispensar"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>
      </motion.aside>
    </AnimatePresence>
  );
}
