import { useState, type FormEvent } from 'react';
import { ArrowRight, LockKeyhole, Mail, UserRound } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { errorMessage } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { Brand } from '../components/Brand';
import { Spinner } from '../components/States';

export function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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
        <div className="auth-story__content">
          <p className="eyebrow">Comece pelo essencial</p>
          <h1>Menos contas soltas. <em>Mais clareza.</em></h1>
          <p>Crie o seu arquivo pessoal de despesas — simples, visual e sempre consigo.</p>
        </div>
        <div className="auth-story__ledger" aria-hidden="true">
          <span>+</span><span>CLARO</span><span>///</span>
        </div>
      </section>

      <section className="auth-form-wrap">
        <div className="auth-form-panel">
          <p className="form-index" aria-hidden="true">02</p>
          <div>
            <p className="eyebrow">A sua conta</p>
            <h2>Criar conta</h2>
            <p className="form-intro">Demora menos de um minuto.</p>
          </div>

          <form className="stack-form" onSubmit={handleSubmit} noValidate>
            {error && <div className="form-alert" role="alert">{error}</div>}
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
              <span className="field__control">
                <LockKeyhole aria-hidden="true" />
                <input type="password" name="password" autoComplete="new-password" minLength={8} required value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Mínimo de 8 caracteres" aria-describedby="password-help" />
              </span>
              <small id="password-help">Use 8 ou mais caracteres.</small>
            </label>
            <button className="button button--primary button--wide" type="submit" disabled={isSubmitting}>
              {isSubmitting ? <Spinner label="A criar conta" /> : <>Criar conta <ArrowRight aria-hidden="true" /></>}
            </button>
          </form>

          <p className="auth-switch">Já tem conta? <Link to="/login">Entrar</Link></p>
        </div>
      </section>
    </main>
  );
}
