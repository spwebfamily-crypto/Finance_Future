import { useState, type FormEvent } from 'react';
import { ArrowRight, LockKeyhole, Mail } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { errorMessage } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { Brand } from '../components/Brand';
import { Spinner } from '../components/States';

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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
    <main className="auth-page">
      <section className="auth-story" aria-label="ExpenseSnap">
        <Brand linked={false} />
        <div className="auth-story__content">
          <p className="eyebrow">Contas em dia, cabeça leve</p>
          <h1>Veja o seu dinheiro <em>sem ruído.</em></h1>
          <p>Registe cada despesa no momento certo e mantenha uma visão limpa do que saiu.</p>
        </div>
        <div className="auth-story__ledger" aria-hidden="true">
          <span>€</span><span>08.26</span><span>///</span>
        </div>
      </section>

      <section className="auth-form-wrap">
        <div className="auth-form-panel">
          <p className="form-index" aria-hidden="true">01</p>
          <div>
            <p className="eyebrow">Bem-vindo de volta</p>
            <h2>Entrar na conta</h2>
            <p className="form-intro">Continue de onde ficou.</p>
          </div>

          <form className="stack-form" onSubmit={handleSubmit} noValidate>
            {error && <div className="form-alert" role="alert">{error}</div>}
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
              <span className="field__control">
                <LockKeyhole aria-hidden="true" />
                <input
                  type="password"
                  name="password"
                  autoComplete="current-password"
                  minLength={8}
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="A sua palavra-passe"
                />
              </span>
            </label>
            <button className="button button--primary button--wide" type="submit" disabled={isSubmitting}>
              {isSubmitting ? <Spinner label="A entrar" /> : <>Entrar <ArrowRight aria-hidden="true" /></>}
            </button>
          </form>

          <p className="auth-switch">Ainda não tem conta? <Link to="/register">Criar conta</Link></p>
        </div>
      </section>
    </main>
  );
}
