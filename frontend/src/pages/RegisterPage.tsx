import { useState, type FormEvent } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ArrowRight, Eye, EyeOff, LockKeyhole, Mail, ShieldCheck, UserRound } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { errorMessage } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { AuthFlowVisual } from '../components/AuthFlowVisual';
import { Brand } from '../components/Brand';
import { Spinner } from '../components/States';

export function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const reduceMotion = useReducedMotion();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError('');
    if (password.length < 8) {
      setError('A palavra-passe deve ter, pelo menos, 8 caracteres.');
      return;
    }
    setIsSubmitting(true);

    try {
      await register(name, email, password);
      navigate('/expenses', { replace: true });
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="auth-page auth-page--register">
      <section className="auth-story" aria-label="ExpenseSnap">
        <Brand linked={false} />
        <div className="auth-story__body">
          <div className="auth-story__content">
            <p className="eyebrow"><ShieldCheck size={14} aria-hidden="true" /> Comece pelo essencial</p>
            <h1>Menos contas soltas. <em>Mais clareza.</em></h1>
            <p>Crie o seu arquivo pessoal de despesas — simples, visual e sempre consigo.</p>
          </div>
          <AuthFlowVisual />
        </div>
        <div className="auth-story__footer"><LockKeyhole size={16} aria-hidden="true" /> Sem publicidade. Sem ruído.</div>
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
              <p className="eyebrow">A sua conta</p>
              <h2>Criar conta</h2>
              <p className="form-intro">Demora menos de um minuto.</p>
            </div>
            <span className="form-index" aria-hidden="true">02</span>
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
              <span>Nome</span>
              <span className="field__control">
                <UserRound aria-hidden="true" />
                <input type="text" name="name" autoComplete="name" required value={name} onChange={(event) => setName(event.target.value)} placeholder="Como quer ser tratado?" />
              </span>
            </label>
            <label className="field">
              <span>Email</span>
              <span className="field__control">
                <Mail aria-hidden="true" />
                <input type="email" name="email" autoComplete="email" inputMode="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="nome@exemplo.pt" />
              </span>
            </label>
            <label className="field">
              <span>Palavra-passe</span>
              <span className="field__control field__control--password">
                <LockKeyhole aria-hidden="true" />
                <input type={showPassword ? 'text' : 'password'} name="password" autoComplete="new-password" minLength={8} required value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Mínimo de 8 caracteres" aria-describedby="password-help" />
                <button className="field__action" type="button" onClick={() => setShowPassword((current) => !current)} aria-label={showPassword ? 'Ocultar palavra-passe' : 'Mostrar palavra-passe'}>
                  {showPassword ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
                </button>
              </span>
              <small id="password-help">Use 8 ou mais caracteres.</small>
            </label>
            <motion.button className="button button--primary button--wide" type="submit" disabled={isSubmitting} whileHover={reduceMotion ? undefined : { y: -2 }} whileTap={reduceMotion ? undefined : { scale: 0.985 }}>
              {isSubmitting ? <Spinner label="A criar conta" /> : <>Criar conta <ArrowRight aria-hidden="true" /></>}
            </motion.button>
          </form>

          <p className="auth-switch">Já tem conta? <Link to="/login">Entrar <ArrowRight size={14} aria-hidden="true" /></Link></p>
        </motion.div>
      </section>
    </main>
  );
}
