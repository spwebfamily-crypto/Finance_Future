import { useRef, useState, type FormEvent } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowRight, CircleAlert, Eye, EyeOff, LockKeyhole, Mail, ShieldCheck } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { errorMessage } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { AuthStory } from "../components/AuthStory";
import { Spinner } from "../components/States";
import { useI18n } from "../i18n/I18nContext";

export function LoginPage() {
  const { t } = useI18n();
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
    if (!email.trim()) nextErrors.email = t("Introduza o seu email.");
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
      nextErrors.email = t("Introduza um email válido.");
    if (!password) nextErrors.password = t("Introduza a sua palavra-passe.");
    setFieldErrors(nextErrors);
    if (nextErrors.email || nextErrors.password) {
      (nextErrors.email ? emailRef : passwordRef).current?.focus();
      return;
    }
    setIsSubmitting(true);

    try {
      const destination =
        (location.state as { from?: { pathname?: string } } | null)?.from?.pathname || "/dashboard";
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
          <div className="auth-login-security">
            <span className="auth-login-security__icon" aria-hidden="true">
              <ShieldCheck />
            </span>
            <span>
              <strong>{t("Acesso protegido")}</strong>
              <small>{t("Sessão privada e segura")}</small>
            </span>
          </div>

          <div className="auth-form-heading">
            <p className="eyebrow">{t("Bem-vindo de volta")}</p>
            <h1>{t("Entrar na conta")}</h1>
            <p className="form-intro">{t("Continue de onde ficou.")}</p>
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
              <span>{t("Email")}</span>
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
                <label htmlFor="login-password">{t("Palavra-passe")}</label>
                <Link className="auth-forgot" to="/forgot-password">
                  {t("Esqueceu a palavra-passe?")}
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
                  placeholder={t("A sua palavra-passe")}
                  aria-invalid={Boolean(fieldErrors.password)}
                  aria-describedby={fieldErrors.password ? "login-password-error" : undefined}
                />
                <button
                  className="field__action"
                  type="button"
                  onClick={() => setShowPassword((current) => !current)}
                  aria-pressed={showPassword}
                  aria-label={t(showPassword ? "Ocultar palavra-passe" : "Mostrar palavra-passe")}
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
                <Spinner label={t("A entrar")} />
              ) : (
                <>
                  {t("Entrar")} <ArrowRight aria-hidden="true" />
                </>
              )}
            </button>
          </form>

          <p className="auth-switch">
            {t("Ainda não tem conta?")}{" "}
            <Link to="/register">
              {t("Criar conta")} <ArrowRight size={14} aria-hidden="true" />
            </Link>
          </p>

          <p className="auth-login-note">
            <LockKeyhole aria-hidden="true" />
            {t("Os seus dados financeiros nunca são partilhados.")}
          </p>
        </motion.div>
      </section>
    </main>
  );
}
