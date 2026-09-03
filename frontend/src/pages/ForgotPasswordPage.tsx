import { useRef, useState, type FormEvent } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowLeft, ArrowRight, Mail } from "lucide-react";
import { Link } from "react-router-dom";
import { errorMessage } from "../api/client";
import { authApi } from "../api/resources";
import { AuthStory } from "../components/AuthStory";
import { Spinner } from "../components/States";

export function ForgotPasswordPage() {
  const reduceMotion = useReducedMotion();
  const emailRef = useRef<HTMLInputElement>(null);
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [fieldError, setFieldError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (!email.trim()) {
      setFieldError("Introduza o seu email.");
      emailRef.current?.focus();
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setFieldError("Introduza um email válido.");
      emailRef.current?.focus();
      return;
    }
    setFieldError("");
    setIsSubmitting(true);
    try {
      await authApi.forgotPassword(email);
      setSent(true);
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="auth-page auth-page--login">
      <AuthStory variant="forgot" />

      <section className="auth-form-wrap">
        <motion.div
          className="auth-form-panel"
          initial={reduceMotion ? false : { opacity: 0, y: 8 }}
          animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.22, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="auth-form-heading">
            <div>
              <p className="eyebrow">Recuperar acesso</p>
              <h1>Esqueceu a palavra-passe?</h1>
              <p className="form-intro">
                {sent
                  ? "Se existir uma conta com este email, enviámos um link para repor a palavra-passe."
                  : "Indique o email da conta. Se existir, enviamos um link de reposição."}
              </p>
            </div>
          </div>

          {sent ? (
            <div className="auth-status__actions">
              <Link className="button button--primary button--wide" to="/login">
                Voltar a entrar <ArrowRight aria-hidden="true" />
              </Link>
              <p className="auth-status__hint" role="status">
                Verifique a caixa de entrada e o spam. O link expira ao fim de uma hora.
              </p>
            </div>
          ) : (
            <form className="stack-form" onSubmit={handleSubmit} noValidate>
              <AnimatePresence initial={false}>
                {error && (
                  <motion.div
                    className="form-alert"
                    role="alert"
                    initial={reduceMotion ? false : { opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={reduceMotion ? undefined : { opacity: 0, y: -6 }}
                    transition={{ duration: reduceMotion ? 0 : 0.16, ease: "easeOut" }}
                  >
                    {error}
                  </motion.div>
                )}
              </AnimatePresence>
              <label className="field">
                <span>Email</span>
                <span className="field__control">
                  <Mail aria-hidden="true" />
                  <input
                    ref={emailRef}
                    type="email"
                    name="email"
                    autoComplete="email"
                    inputMode="email"
                    required
                    value={email}
                    onChange={(event) => {
                      setEmail(event.target.value);
                      setFieldError("");
                    }}
                    placeholder="nome@exemplo.pt"
                    aria-invalid={Boolean(fieldError)}
                    aria-describedby={fieldError ? "forgot-email-error" : undefined}
                  />
                </span>
                {fieldError && (
                  <small className="field__error" id="forgot-email-error">
                    {fieldError}
                  </small>
                )}
              </label>
              <button
                className="button button--primary button--wide"
                type="submit"
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <Spinner label="A enviar" />
                ) : (
                  <>
                    Enviar link <ArrowRight aria-hidden="true" />
                  </>
                )}
              </button>
            </form>
          )}

          <p className="auth-switch">
            <Link to="/login">
              <ArrowLeft size={14} aria-hidden="true" /> Voltar ao início de sessão
            </Link>
          </p>
        </motion.div>
      </section>
    </main>
  );
}
