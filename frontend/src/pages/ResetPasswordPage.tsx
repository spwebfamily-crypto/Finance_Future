import { useRef, useState, type FormEvent } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowRight, Eye, EyeOff, LockKeyhole, ShieldQuestion } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { errorMessage } from "../api/client";
import { authApi } from "../api/resources";
import { useAuth } from "../auth/AuthContext";
import { AuthStory } from "../components/AuthStory";
import { Spinner } from "../components/States";

export function ResetPasswordPage() {
  const { logout } = useAuth();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token")?.trim() ?? "";
  const tokenLooksValid = /^[0-9a-f]{64}$/i.test(token);
  const reduceMotion = useReducedMotion();
  const passwordRef = useRef<HTMLInputElement>(null);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [fieldError, setFieldError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (password.length < 8) {
      setFieldError("Use pelo menos 8 caracteres.");
      passwordRef.current?.focus();
      return;
    }
    if (password.length > 128) {
      setFieldError("Use no máximo 128 caracteres.");
      passwordRef.current?.focus();
      return;
    }
    setFieldError("");
    setIsSubmitting(true);
    try {
      await authApi.resetPassword(token, password);
      logout();
      setDone(true);
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="auth-page auth-page--login">
      <AuthStory variant="reset" />

      <section className="auth-form-wrap">
        <motion.div
          className="auth-form-panel"
          initial={reduceMotion ? false : { opacity: 0, y: 8 }}
          animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.22, ease: [0.22, 1, 0.36, 1] }}
        >
          {!tokenLooksValid ? (
            <div className="auth-status auth-status--warning">
              <span className="auth-status__icon" aria-hidden="true">
                <ShieldQuestion />
              </span>
              <p className="eyebrow">Link incompleto</p>
              <h1>Falta o código de reposição</h1>
              <p className="form-intro">
                Abra o link diretamente a partir do email que recebeu, ou peça um novo.
              </p>
              <div className="auth-status__actions">
                <Link className="button button--primary button--wide" to="/forgot-password">
                  Pedir novo link <ArrowRight aria-hidden="true" />
                </Link>
              </div>
            </div>
          ) : done ? (
            <div className="auth-status auth-status--success">
              <p className="eyebrow">Palavra-passe atualizada</p>
              <h1>Já pode entrar</h1>
              <p className="form-intro">
                A nova palavra-passe está ativa. As sessões anteriores foram encerradas.
              </p>
              <div className="auth-status__actions">
                <Link className="button button--primary button--wide" to="/login">
                  Entrar na conta <ArrowRight aria-hidden="true" />
                </Link>
              </div>
            </div>
          ) : (
            <>
              <div className="auth-form-heading">
                <div>
                  <p className="eyebrow">Nova palavra-passe</p>
                  <h1>Escolha uma palavra-passe</h1>
                  <p className="form-intro">Use pelo menos 8 caracteres.</p>
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
                  <span>Nova palavra-passe</span>
                  <span className="field__control field__control--password">
                    <LockKeyhole aria-hidden="true" />
                    <input
                      ref={passwordRef}
                      type={showPassword ? "text" : "password"}
                      name="password"
                      autoComplete="new-password"
                      minLength={8}
                      maxLength={128}
                      required
                      value={password}
                      onChange={(event) => {
                        setPassword(event.target.value);
                        setFieldError("");
                      }}
                      placeholder="Pelo menos 8 caracteres"
                      aria-invalid={Boolean(fieldError)}
                      aria-describedby={fieldError ? "reset-password-error" : undefined}
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
                  {fieldError && (
                    <small className="field__error" id="reset-password-error">
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
                    <Spinner label="A gravar" />
                  ) : (
                    <>
                      Guardar palavra-passe <ArrowRight aria-hidden="true" />
                    </>
                  )}
                </button>
              </form>
            </>
          )}

          <p className="auth-switch">
            <Link to="/login">Voltar ao início de sessão</Link>
          </p>
        </motion.div>
      </section>
    </main>
  );
}
