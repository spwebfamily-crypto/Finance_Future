import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, BadgeCheck, MailWarning, RefreshCw, ShieldQuestion } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { errorMessage } from "../api/client";
import { authApi } from "../api/resources";
import { useAuth } from "../auth/AuthContext";
import { AuthStory } from "../components/AuthStory";
import { Spinner } from "../components/States";

type Status = "verifying" | "success" | "error" | "missing";
type ResendState = "idle" | "sending" | "sent" | "failed";

export function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token")?.trim() ?? "";
  const { isAuthenticated, applyUser } = useAuth();
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
      icon: <Spinner hideLabel label="A confirmar o email" />,
      tone: "neutral" as const,
      eyebrow: "Verificação",
      title: "A confirmar o seu email",
      description: "Só um instante — estamos a validar o link.",
    },
    success: {
      icon: <BadgeCheck aria-hidden="true" />,
      tone: "success" as const,
      eyebrow: "Conta confirmada",
      title: "Email verificado",
      description:
        "Obrigado. A sua conta está confirmada e pode continuar a organizar as suas finanças.",
    },
    error: {
      icon: <MailWarning aria-hidden="true" />,
      tone: "danger" as const,
      eyebrow: "Link inválido",
      title: "Não conseguimos confirmar",
      description: message || "O link é inválido ou já expirou. Peça um novo email de confirmação.",
    },
    missing: {
      icon: <ShieldQuestion aria-hidden="true" />,
      tone: "warning" as const,
      eyebrow: "Verificação",
      title: "Link incompleto",
      description:
        "Este endereço não inclui um código de verificação. Abra o link diretamente a partir do email que recebeu.",
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
                  Ir para o painel <ArrowRight aria-hidden="true" />
                </Link>
              ) : (
                <Link className="button button--primary button--wide" to="/login">
                  Entrar na conta <ArrowRight aria-hidden="true" />
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
                      <Spinner label="A enviar" />
                    ) : (
                      <>
                        <RefreshCw aria-hidden="true" />
                        {resendState === "sent" ? "Email enviado" : "Enviar novo email"}
                      </>
                    )}
                  </button>
                  {resendState === "sent" && (
                    <p className="auth-status__hint" role="status">
                      Enviámos um novo link. Verifique a caixa de entrada e o spam.
                    </p>
                  )}
                  {resendState === "failed" && (
                    <p className="form-alert" role="alert">
                      {resendMessage}
                    </p>
                  )}
                  <Link className="button button--ghost button--wide" to="/dashboard">
                    Continuar sem verificar
                  </Link>
                </>
              ) : (
                <>
                  <Link className="button button--primary button--wide" to="/login">
                    Entrar para reenviar <ArrowRight aria-hidden="true" />
                  </Link>
                  <p className="auth-status__hint">
                    Depois de entrar, pode pedir um novo email de confirmação a partir do aviso no
                    topo da aplicação.
                  </p>
                </>
              ))}
          </div>

          {status !== "success" && (
            <p className="auth-switch">
              Ainda não tem conta?{" "}
              <Link to="/register">
                Criar conta <ArrowRight size={14} aria-hidden="true" />
              </Link>
            </p>
          )}
        </motion.div>
      </section>
    </main>
  );
}
