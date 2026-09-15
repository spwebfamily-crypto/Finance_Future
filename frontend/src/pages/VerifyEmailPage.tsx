import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, BadgeCheck, MailWarning, RefreshCw, ShieldQuestion } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { errorMessage } from "../api/client";
import { authApi } from "../api/resources";
import { useAuth } from "../auth/AuthContext";
import { AuthStory } from "../components/AuthStory";
import { Spinner } from "../components/States";
import { useI18n } from "../i18n/I18nContext";

type Status = "verifying" | "success" | "error" | "missing";
type ResendState = "idle" | "sending" | "sent" | "failed";

export function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token")?.trim() ?? "";
  const { isAuthenticated, applyUser } = useAuth();
  const { t } = useI18n();
  const reduceMotion = useReducedMotion();
  const [status, setStatus] = useState<Status>(token ? "verifying" : "missing");
  const [message, setMessage] = useState("");
  const [resendState, setResendState] = useState<ResendState>("idle");
  const [resendMessage, setResendMessage] = useState("");
  const requestedRef = useRef(false);

  useEffect(() => {
    if (!token || requestedRef.current) return;
    // Guard explícito: o efeito corre duas vezes em StrictMode e o token é
    // consumido no servidor à primeira chamada.
    requestedRef.current = true;
    let active = true;

    authApi
      .verifyEmail(token)
      .then((user) => {
        if (!active) return;
        // Só sincronizamos o utilizador guardado se houver sessão local: o
        // link pode ser aberto num dispositivo onde ninguém tem sessão.
        if (isAuthenticated) applyUser(user);
        setStatus("success");
      })
      .catch((error) => {
        if (!active) return;
        setMessage(errorMessage(error));
        setStatus("error");
      });

    return () => {
      active = false;
    };
  }, [token, isAuthenticated, applyUser]);

  async function handleResend() {
    setResendState("sending");
    setResendMessage("");
    try {
      await authApi.resendVerification();
      setResendState("sent");
    } catch (error) {
      setResendState("failed");
      setResendMessage(errorMessage(error));
    }
  }

  const view = {
    verifying: {
      icon: <Spinner hideLabel label={t("verify.verifyingTitle")} />,
      tone: "neutral" as const,
      eyebrow: t("verify.verificationEyebrow"),
      title: t("verify.verifyingTitle"),
      description: t("verify.verifyingDescription"),
    },
    success: {
      icon: <BadgeCheck aria-hidden="true" />,
      tone: "success" as const,
      eyebrow: t("verify.confirmedEyebrow"),
      title: t("verify.confirmedTitle"),
      description: t("verify.confirmedDescription"),
    },
    error: {
      icon: <MailWarning aria-hidden="true" />,
      tone: "danger" as const,
      eyebrow: t("verify.invalidEyebrow"),
      title: t("verify.invalidTitle"),
      description: message || t("verify.invalidDescription"),
    },
    missing: {
      icon: <ShieldQuestion aria-hidden="true" />,
      tone: "warning" as const,
      eyebrow: t("verify.verificationEyebrow"),
      title: t("reset.missingEyebrow"),
      description: t("verify.missingDescription"),
    },
  }[status];

  return (
    <main className="auth-page auth-page--verify">
      <AuthStory variant="verify" />

      <section className="auth-form-wrap">
        <motion.div
          className="auth-form-panel"
          initial={reduceMotion ? false : { opacity: 0, y: 8 }}
          animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.22, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className={`auth-status auth-status--${view.tone}`}>
            <motion.span
              className="auth-status__icon"
              aria-hidden={status !== "verifying"}
              initial={reduceMotion ? false : { scale: 0.82, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{
                duration: reduceMotion ? 0 : 0.32,
                ease: [0.22, 1, 0.36, 1],
                delay: reduceMotion ? 0 : 0.05,
              }}
            >
              {view.icon}
            </motion.span>
            <p className="eyebrow">{view.eyebrow}</p>
            <h1>{view.title}</h1>
            <p className="form-intro" role={status === "error" ? "alert" : undefined}>
              {view.description}
            </p>
          </div>

          <div className="auth-status__actions">
            {status === "success" &&
              (isAuthenticated ? (
                <Link className="button button--primary button--wide" to="/dashboard">
                  {t("verify.dashboard")} <ArrowRight aria-hidden="true" />
                </Link>
              ) : (
                <Link className="button button--primary button--wide" to="/login">
                  {t("reset.signIn")} <ArrowRight aria-hidden="true" />
                </Link>
              ))}

            {(status === "error" || status === "missing") &&
              (isAuthenticated ? (
                <>
                  <button
                    className="button button--primary button--wide"
                    type="button"
                    onClick={handleResend}
                    disabled={resendState === "sending" || resendState === "sent"}
                  >
                    {resendState === "sending" ? (
                      <Spinner label={t("verify.sending")} />
                    ) : (
                      <>
                        <RefreshCw aria-hidden="true" />
                        {resendState === "sent" ? t("verify.sent") : t("verify.newEmail")}
                      </>
                    )}
                  </button>
                  {resendState === "sent" && (
                    <p className="auth-status__hint" role="status">
                      {t("verify.sent")}
                    </p>
                  )}
                  {resendState === "failed" && (
                    <p className="form-alert" role="alert">
                      {resendMessage}
                    </p>
                  )}
                  <Link className="button button--ghost button--wide" to="/dashboard">
                    {t("verify.continueUnverified")}
                  </Link>
                </>
              ) : (
                <>
                  <Link className="button button--primary button--wide" to="/login">
                    {t("verify.signInToResend")} <ArrowRight aria-hidden="true" />
                  </Link>
                  <p className="auth-status__hint">{t("verify.afterSignInHint")}</p>
                </>
              ))}
          </div>

          {status !== "success" && (
            <p className="auth-switch">
              {t("verify.noAccount")}{" "}
              <Link to="/register">
                {t("notFound.register")} <ArrowRight size={14} aria-hidden="true" />
              </Link>
            </p>
          )}
        </motion.div>
      </section>
    </main>
  );
}
