import { useState, type FormEvent } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ArrowRight, Eye, EyeOff, LockKeyhole, Mail, ShieldCheck, Sparkles } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { errorMessage } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { AuthFlowVisual } from '../components/AuthFlowVisual';
import { Brand } from '../components/Brand';
import { Spinner } from '../components/States';

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const reduceMotion = useReducedMotion();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      await login(email, password);
      const destination = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname;
      navigate(destination || '/expenses', { replace: true });
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="auth-page auth-page--login">
      <section className="auth-story" aria-label="ExpenseSnap">
        <Brand linked={false} />
        <div className="auth-story__body">
          <div className="auth-story__content">
            <p className="eyebrow"><Sparkles size={14} aria-hidden="true" /> Contas em dia, cabeça leve</p>
            <h1>Veja o seu dinheiro <em>sem ruído.</em></h1>
            <p>Registe cada despesa no momento certo e transforme pequenos movimentos em uma visão clara do mês.</p>
          </div>
          <AuthFlowVisual />
        </div>
        <div className="auth-story__footer"><ShieldCheck size={16} aria-hidden="true" /> Os seus registos ficam sob o seu controlo.</div>
      </section>

      <section className="auth-form-wrap">
        <motion.div
          className="auth-form-panel"
          initial={reduceMotion ? false : { opacity: 0, y: 18 }}
          animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
          transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="auth-form-heading">
            <div>
              <p className="eyebrow">Bem-vindo de volta</p>
              <h2>Entrar na conta</h2>
              <p className="form-intro">Continue de onde ficou.</p>
            </div>
            <span className="form-index" aria-hidden="true">01</span>
          </div>

          <form className="stack-form" onSubmit={handleSubmit} noValidate>
            <AnimatePresence initial={false}>
              {error && (
                <motion.div className="form-alert" role="alert" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}>
                  {error}
                </motion.div>
              )}
            </AnimatePresence>
            <label className="field">
              <span>Email</span>
              <span className="field__control">
                <Mail aria-hidden="true" />
                <input
                  type="email"
                  name="email"
                  autoComplete="email"
                  inputMode="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="nome@exemplo.pt"
                />
              </span>
            </label>
            <label className="field">
              <span>Palavra-passe</span>
              <span className="field__control field__control--password">
                <LockKeyhole aria-hidden="true" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  name="password"
                  autoComplete="current-password"
                  minLength={8}
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="A sua palavra-passe"
                />
                <button className="field__action" type="button" onClick={() => setShowPassword((current) => !current)} aria-label={showPassword ? 'Ocultar palavra-passe' : 'Mostrar palavra-passe'}>
                  {showPassword ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
                </button>
              </span>
            </label>
            <motion.button className="button button--primary button--wide" type="submit" disabled={isSubmitting} whileHover={reduceMotion ? undefined : { y: -2 }} whileTap={reduceMotion ? undefined : { scale: 0.985 }}>
              {isSubmitting ? <Spinner label="A entrar" /> : <>Entrar <ArrowRight aria-hidden="true" /></>}
            </motion.button>
          </form>

          <p className="auth-switch">Ainda não tem conta? <Link to="/register">Criar conta <ArrowRight size={14} aria-hidden="true" /></Link></p>
        </motion.div>
      </section>
    </main>
  );
}
