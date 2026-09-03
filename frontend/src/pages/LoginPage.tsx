import { useRef, useState, type FormEvent } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowRight, CircleAlert, Eye, EyeOff, LockKeyhole, Mail } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { errorMessage } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { AuthStory } from "../components/AuthStory";
import { Spinner } from "../components/States";

export function LoginPage() {
  const { login } = useAuth();
  const location = useLocation();
  const reduceMotion = useReducedMotion();
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    const nextErrors: { email?: string; password?: string } = {};
    if (!email.trim()) nextErrors.email = "Introduza o seu email.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
      nextErrors.email = "Introduza um email válido.";
    if (!password) nextErrors.password = "Introduza a sua palavra-passe.";
    setFieldErrors(nextErrors);
    if (nextErrors.email || nextErrors.password) {
      (nextErrors.email ? emailRef : passwordRef).current?.focus();
      return;
    }
    setIsSubmitting(true);

    try {
      const destination =
        (location.state as { from?: { pathname?: string } } | null)?.from?.pathname ||
        "/dashboard";
      await login(email, password, destination);
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="auth-page auth-page--login">
      <AuthStory variant="login" />

      <section className="auth-form-wrap">
        <motion.div
          className="auth-form-panel"
          initial={reduceMotion ? false : { opacity: 0, y: 8 }}
          animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.22, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="auth-form-heading">
            <p className="eyebrow">Bem-vindo de volta</p>
            <h1>Entrar na conta</h1>
            <p className="form-intro">Continue de onde ficou.</p>
          </div>

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
                  <CircleAlert size={18} aria-hidden="true" />
                  <span>{error}</span>
                </motion.div>
              )}
            </AnimatePresence>
            <label className="field" htmlFor="login-email">
              <span>Email</span>
              <span className="field__control">
                <Mail aria-hidden="true" />
                <input
                  id="login-email"
                  ref={emailRef}
                  type="email"
                  name="email"
                  autoComplete="email"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  inputMode="email"
                  required
                  value={email}
                  onChange={(event) => {
                    setEmail(event.target.value);
                    setFieldErrors((current) => ({ ...current, email: undefined }));
                  }}
                  placeholder="nome@exemplo.pt"
                  aria-invalid={Boolean(fieldErrors.email)}
                  aria-describedby={fieldErrors.email ? "login-email-error" : undefined}
                />
              </span>
              {fieldErrors.email && (
                <small className="field__error" id="login-email-error">
                  {fieldErrors.email}
                </small>
              )}
            </label>
            <div className="field">
              <span className="field__header">
                <label htmlFor="login-password">Palavra-passe</label>
                <Link className="auth-forgot" to="/forgot-password">
                  Esqueceu a palavra-passe?
                </Link>
              </span>
              <span className="field__control field__control--password">
                <LockKeyhole aria-hidden="true" />
                <input
                  id="login-password"
                  ref={passwordRef}
                  type={showPassword ? "text" : "password"}
                  name="password"
                  autoComplete="current-password"
                  minLength={8}
                  required
                  value={password}
                  onChange={(event) => {
                    setPassword(event.target.value);
                    setFieldErrors((current) => ({ ...current, password: undefined }));
                  }}
                  placeholder="A sua palavra-passe"
                  aria-invalid={Boolean(fieldErrors.password)}
                  aria-describedby={fieldErrors.password ? "login-password-error" : undefined}
                />
                <button
                  className="field__action"
                  type="button"
                  onClick={() => setShowPassword((current) => !current)}
                  aria-pressed={showPassword}
                  aria-label={showPassword ? "Ocultar palavra-passe" : "Mostrar palavra-passe"}
                >
                  {showPassword ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
                </button>
              </span>
              {fieldErrors.password && (
                <small className="field__error" id="login-password-error">
                  {fieldErrors.password}
                </small>
              )}
            </div>
            <button
              className="button button--primary button--wide"
              type="submit"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <Spinner label="A entrar" />
              ) : (
                <>
                  Entrar <ArrowRight aria-hidden="true" />
                </>
              )}
            </button>
          </form>

          <p className="auth-switch">
            Ainda não tem conta?{" "}
            <Link to="/register">
              Criar conta <ArrowRight size={14} aria-hidden="true" />
            </Link>
          </p>
        </motion.div>
      </section>
    </main>
  );
}
