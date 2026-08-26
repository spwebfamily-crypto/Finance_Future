import { useEffect, useRef, useState, type FormEvent } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowRight, Eye, EyeOff, LockKeyhole, Mail, UserRound } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { errorMessage } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { AuthStory } from "../components/AuthStory";
import { Spinner } from "../components/States";
import { preloadFinancialOnboardingPage } from "../routePreloads";

export function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const reduceMotion = useReducedMotion();
  const nameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{
    name?: string;
    email?: string;
    password?: string;
  }>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => preloadFinancialOnboardingPage(), []);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    const nextErrors: { name?: string; email?: string; password?: string } = {};
    if (name.trim().length < 2) nextErrors.name = "Introduza pelo menos 2 caracteres.";
    if (!email.trim()) nextErrors.email = "Introduza o seu email.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
      nextErrors.email = "Introduza um email válido.";
    if (password.length < 8) nextErrors.password = "Use pelo menos 8 caracteres.";
    setFieldErrors(nextErrors);
    if (nextErrors.name || nextErrors.email || nextErrors.password) {
      (nextErrors.name ? nameRef : nextErrors.email ? emailRef : passwordRef).current?.focus();
      return;
    }
    setIsSubmitting(true);

    try {
      await register(name, email, password);
      navigate("/onboarding", { replace: true });
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="auth-page auth-page--register">
      <AuthStory variant="register" />

      <section className="auth-form-wrap">
        <motion.div
          className="auth-form-panel"
          initial={reduceMotion ? false : { opacity: 0, y: 8 }}
          animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.22, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="auth-form-heading">
            <div>
              <p className="eyebrow">A sua conta</p>
              <h1>Criar conta</h1>
              <p className="form-intro">Demora menos de um minuto.</p>
            </div>
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
                  {error}
                </motion.div>
              )}
            </AnimatePresence>
            <label className="field">
              <span>Nome</span>
              <span className="field__control">
                <UserRound aria-hidden="true" />
                <input
                  ref={nameRef}
                  type="text"
                  name="name"
                  autoComplete="name"
                  required
                  value={name}
                  onChange={(event) => {
                    setName(event.target.value);
                    setFieldErrors((current) => ({ ...current, name: undefined }));
                  }}
                  placeholder="Como quer ser tratado?"
                  aria-invalid={Boolean(fieldErrors.name)}
                  aria-describedby={fieldErrors.name ? "register-name-error" : undefined}
                />
              </span>
              {fieldErrors.name && (
                <small className="field__error" id="register-name-error">
                  {fieldErrors.name}
                </small>
              )}
            </label>
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
                    setFieldErrors((current) => ({ ...current, email: undefined }));
                  }}
                  placeholder="nome@exemplo.pt"
                  aria-invalid={Boolean(fieldErrors.email)}
                  aria-describedby={fieldErrors.email ? "register-email-error" : undefined}
                />
              </span>
              {fieldErrors.email && (
                <small className="field__error" id="register-email-error">
                  {fieldErrors.email}
                </small>
              )}
            </label>
            <label className="field">
              <span>Palavra-passe</span>
              <span className="field__control field__control--password">
                <LockKeyhole aria-hidden="true" />
                <input
                  ref={passwordRef}
                  type={showPassword ? "text" : "password"}
                  name="password"
                  autoComplete="new-password"
                  minLength={8}
                  required
                  value={password}
                  onChange={(event) => {
                    setPassword(event.target.value);
                    setFieldErrors((current) => ({ ...current, password: undefined }));
                  }}
                  placeholder="Mínimo de 8 caracteres"
                  aria-invalid={Boolean(fieldErrors.password)}
                  aria-describedby={
                    fieldErrors.password ? "register-password-error password-help" : "password-help"
                  }
                />
                <button
                  className="field__action"
                  type="button"
                  onClick={() => setShowPassword((current) => !current)}
                  aria-label={showPassword ? "Ocultar palavra-passe" : "Mostrar palavra-passe"}
                >
                  {showPassword ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
                </button>
              </span>
              {fieldErrors.password && (
                <small className="field__error" id="register-password-error">
                  {fieldErrors.password}
                </small>
              )}
              <small id="password-help">Use 8 ou mais caracteres.</small>
            </label>
            <button
              className="button button--primary button--wide"
              type="submit"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <Spinner label="A criar conta" />
              ) : (
                <>
                  Criar conta <ArrowRight aria-hidden="true" />
                </>
              )}
            </button>
          </form>

          <p className="auth-switch">
            Já tem conta?{" "}
            <Link to="/login">
              Entrar <ArrowRight size={14} aria-hidden="true" />
            </Link>
          </p>
        </motion.div>
      </section>
    </main>
  );
}
