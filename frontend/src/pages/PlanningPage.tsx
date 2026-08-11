import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  CircleDollarSign,
  Landmark,
  Pause,
  Play,
  Plus,
  Repeat2,
  Target,
  Trash2,
} from 'lucide-react';
import { analyticsApi, categoryApi, incomeApi, recurringExpenseApi, savingsGoalApi } from '../api/resources';
import { errorMessage } from '../api/client';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { NoticeToast } from '../components/NoticeToast';
import { EmptyState, ErrorState, LoadingState, Spinner } from '../components/States';
import { PageHeader } from '../components/PageHeader';
import { CategoryIcon } from '../components/CategoryIcon';
import { useAuth } from '../auth/AuthContext';
import type { AnalyticsSummary, Category, Income, RecurringExpense, SavingsGoal } from '../types';
import { formatCurrency, formatDate, todayInputValue } from '../utils/format';

type DeleteTarget = { type: 'income' | 'goal' | 'recurring'; id: string; label: string } | null;

const initialIncome = { description: '', source: '', amount: '', date: todayInputValue() };
const initialGoal = { name: '', targetAmount: '', currentAmount: '', targetDate: '' };
const initialRecurring = { description: '', location: '', amount: '', categoryId: '', dayOfMonth: '' };

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

function numberFromInput(value: string) {
  return Number(value.replace(',', '.'));
}

function dateOnly(value: string | null | undefined) {
  return value ? value.slice(0, 10) : '';
}

function daysUntil(value: string) {
  const target = new Date(`${dateOnly(value)}T00:00:00Z`).getTime();
  const now = new Date(`${todayInputValue()}T00:00:00Z`).getTime();
  return Math.round((target - now) / 86_400_000);
}

function dueCopy(days: number) {
  if (days < 0) return `Em atraso há ${Math.abs(days)} ${Math.abs(days) === 1 ? 'dia' : 'dias'}`;
  if (days === 0) return 'Vence hoje';
  if (days === 1) return 'Vence amanhã';
  return `Vence em ${days} dias`;
}

export function PlanningPage() {
  const { user } = useAuth();
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [incomes, setIncomes] = useState<Income[]>([]);
  const [goals, setGoals] = useState<SavingsGoal[]>([]);
  const [recurring, setRecurring] = useState<RecurringExpense[]>([]);
  const [goalProgress, setGoalProgress] = useState<Record<string, string>>({});
  const [incomeForm, setIncomeForm] = useState(initialIncome);
  const [goalForm, setGoalForm] = useState(initialGoal);
  const [recurringForm, setRecurringForm] = useState(initialRecurring);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      const [nextSummary, nextCategories, nextIncomes, nextGoals, nextRecurring] = await Promise.all([
        analyticsApi.summary(currentMonth()),
        categoryApi.list(),
        incomeApi.list(),
        savingsGoalApi.list(),
        recurringExpenseApi.list(),
      ]);
      setSummary(nextSummary);
      setCategories(nextCategories);
      setIncomes(nextIncomes);
      setGoals(nextGoals);
      setRecurring(nextRecurring);
      setGoalProgress(Object.fromEntries(nextGoals.map((goal) => [goal.id, String(goal.currentAmount)])));
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const currency = user?.currency || summary?.currency || 'EUR';
  const monthlyIncome = useMemo(
    () => incomes.filter((income) => dateOnly(income.date).startsWith(currentMonth())).reduce((total, income) => total + income.amount, 0),
    [incomes],
  );
  const monthlyExpenses = summary?.total || 0;
  const monthlyAvailable = monthlyIncome - monthlyExpenses;
  const upcoming = useMemo(
    () => recurring.filter((item) => item.isActive).map((item) => ({ ...item, days: daysUntil(item.nextDueDate) })).sort((a, b) => a.days - b.days),
    [recurring],
  );
  const alerts = useMemo(() => {
    const items: string[] = [];
    const overdueGoals = goals.filter((goal) => goal.targetDate && daysUntil(goal.targetDate) < 0 && goal.currentAmount < goal.targetAmount);
    const urgentPayments = upcoming.filter((item) => item.days <= 3);
    if (overdueGoals.length) items.push(`${overdueGoals.length} ${overdueGoals.length === 1 ? 'meta está' : 'metas estão'} fora do prazo.`);
    if (urgentPayments.length) items.push(`${urgentPayments.length} ${urgentPayments.length === 1 ? 'pagamento vence' : 'pagamentos vencem'} nos próximos 3 dias.`);
    if (monthlyIncome > 0 && monthlyAvailable < 0) items.push('As despesas deste mês já superam os rendimentos registados.');
    return items;
  }, [goals, monthlyAvailable, monthlyIncome, upcoming]);

  async function createIncome(event: FormEvent) {
    event.preventDefault();
    const amount = numberFromInput(incomeForm.amount);
    if (!incomeForm.description.trim() || !incomeForm.date || !Number.isFinite(amount) || amount <= 0) return;
    setIsSaving(true);
    try {
      const created = await incomeApi.create({ description: incomeForm.description, source: incomeForm.source || undefined, amount, date: incomeForm.date });
      setIncomes((items) => [created, ...items]);
      setIncomeForm(initialIncome);
      setNotice('Rendimento registado.');
    } catch (requestError) { setError(errorMessage(requestError)); }
    finally { setIsSaving(false); }
  }

  async function createGoal(event: FormEvent) {
    event.preventDefault();
    const targetAmount = numberFromInput(goalForm.targetAmount);
    const currentAmount = goalForm.currentAmount ? numberFromInput(goalForm.currentAmount) : 0;
    if (!goalForm.name.trim() || !Number.isFinite(targetAmount) || targetAmount <= 0 || !Number.isFinite(currentAmount) || currentAmount < 0) return;
    setIsSaving(true);
    try {
      const created = await savingsGoalApi.create({ name: goalForm.name, targetAmount, currentAmount, targetDate: goalForm.targetDate || undefined });
      setGoals((items) => [...items, created].sort((a, b) => (a.targetDate || '9999').localeCompare(b.targetDate || '9999')));
      setGoalProgress((items) => ({ ...items, [created.id]: String(created.currentAmount) }));
      setGoalForm(initialGoal);
      setNotice('Meta criada.');
    } catch (requestError) { setError(errorMessage(requestError)); }
    finally { setIsSaving(false); }
  }

  async function createRecurring(event: FormEvent) {
    event.preventDefault();
    const amount = numberFromInput(recurringForm.amount);
    const dayOfMonth = Number(recurringForm.dayOfMonth);
    if (!recurringForm.description.trim() || !recurringForm.location.trim() || !recurringForm.categoryId || !Number.isFinite(amount) || amount <= 0 || !Number.isInteger(dayOfMonth) || dayOfMonth < 1 || dayOfMonth > 31) return;
    setIsSaving(true);
    try {
      const created = await recurringExpenseApi.create({ ...recurringForm, amount, dayOfMonth });
      setRecurring((items) => [...items, created].sort((a, b) => a.nextDueDate.localeCompare(b.nextDueDate)));
      setRecurringForm(initialRecurring);
      setNotice('Despesa recorrente agendada.');
    } catch (requestError) { setError(errorMessage(requestError)); }
    finally { setIsSaving(false); }
  }

  async function saveGoalProgress(goal: SavingsGoal) {
    const currentAmount = numberFromInput(goalProgress[goal.id] || '');
    if (!Number.isFinite(currentAmount) || currentAmount < 0) return;
    setIsSaving(true);
    try {
      const updated = await savingsGoalApi.update(goal.id, { currentAmount });
      setGoals((items) => items.map((item) => item.id === updated.id ? updated : item));
      setGoalProgress((items) => ({ ...items, [updated.id]: String(updated.currentAmount) }));
      setNotice('Progresso da meta atualizado.');
    } catch (requestError) { setError(errorMessage(requestError)); }
    finally { setIsSaving(false); }
  }

  async function recordRecurring(item: RecurringExpense) {
    setIsSaving(true);
    try {
      const updated = await recurringExpenseApi.record(item.id);
      setRecurring((items) => items.map((current) => current.id === updated.id ? updated : current));
      setNotice(`“${item.description}” foi registada como paga.`);
      void load();
    } catch (requestError) { setError(errorMessage(requestError)); }
    finally { setIsSaving(false); }
  }

  async function toggleRecurring(item: RecurringExpense) {
    setIsSaving(true);
    try {
      const updated = await recurringExpenseApi.update(item.id, { isActive: !item.isActive });
      setRecurring((items) => items.map((current) => current.id === updated.id ? updated : current));
      setNotice(item.isActive ? 'Recorrência colocada em pausa.' : 'Recorrência reativada.');
    } catch (requestError) { setError(errorMessage(requestError)); }
    finally { setIsSaving(false); }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setIsSaving(true);
    try {
      if (deleteTarget.type === 'income') {
        await incomeApi.remove(deleteTarget.id);
        setIncomes((items) => items.filter((item) => item.id !== deleteTarget.id));
      }
      if (deleteTarget.type === 'goal') {
        await savingsGoalApi.remove(deleteTarget.id);
        setGoals((items) => items.filter((item) => item.id !== deleteTarget.id));
      }
      if (deleteTarget.type === 'recurring') {
        await recurringExpenseApi.remove(deleteTarget.id);
        setRecurring((items) => items.filter((item) => item.id !== deleteTarget.id));
      }
      setNotice('Registo removido.');
      setDeleteTarget(null);
    } catch (requestError) { setError(errorMessage(requestError)); }
    finally { setIsSaving(false); }
  }

  if (isLoading) return <div className="page"><LoadingState label="A preparar o seu plano financeiro" /></div>;
  if (error && !summary) return <div className="page"><ErrorState message={error} onRetry={() => void load()} /></div>;

  return (
    <div className="page page--planning">
      <NoticeToast message={notice} onClose={() => setNotice('')} />
      <PageHeader eyebrow="Plano financeiro" title="Planeie antes de gastar" description="Ligue rendimentos, metas e compromissos mensais para saber o que está realmente disponível." />
      {error && <div className="form-alert form-alert--page" role="alert">{error}</div>}

      <section className="planning-overview" aria-label="Resumo financeiro do mês">
        <article><span><CircleDollarSign aria-hidden="true" /> Rendimentos</span><strong>{formatCurrency(monthlyIncome, currency)}</strong><small>Registados este mês</small></article>
        <article><span><Landmark aria-hidden="true" /> Despesas</span><strong>{formatCurrency(monthlyExpenses, currency)}</strong><small>Registadas este mês</small></article>
        <article className={monthlyAvailable < 0 ? 'planning-overview__available planning-overview__available--negative' : 'planning-overview__available'}><span><CheckCircle2 aria-hidden="true" /> Disponível</span><strong>{formatCurrency(monthlyAvailable, currency)}</strong><small>Rendimentos menos despesas</small></article>
      </section>

      {alerts.length > 0 && <section className="planning-alerts" aria-label="Alertas do plano"><AlertTriangle aria-hidden="true" /><div><strong>Vale a pena olhar para isto</strong>{alerts.map((alert) => <p key={alert}>{alert}</p>)}</div></section>}

      <div className="planning-grid">
        <section className="planning-panel planning-panel--goals" aria-labelledby="goals-title">
          <div className="section-heading"><div><p className="eyebrow">Poupança</p><h2 id="goals-title">Metas</h2></div><Target aria-hidden="true" /></div>
          <form className="planning-form" onSubmit={createGoal}>
            <label className="field"><span>Nome da meta</span><input value={goalForm.name} onChange={(event) => setGoalForm((form) => ({ ...form, name: event.target.value }))} placeholder="Ex.: Fundo de emergência" maxLength={100} /></label>
            <div className="planning-form__split"><label className="field"><span>Objetivo</span><input inputMode="decimal" value={goalForm.targetAmount} onChange={(event) => setGoalForm((form) => ({ ...form, targetAmount: event.target.value }))} placeholder="3 000" /></label><label className="field"><span>Já poupado</span><input inputMode="decimal" value={goalForm.currentAmount} onChange={(event) => setGoalForm((form) => ({ ...form, currentAmount: event.target.value }))} placeholder="0" /></label></div>
            <label className="field"><span>Data-alvo <em>opcional</em></span><input type="date" value={goalForm.targetDate} onChange={(event) => setGoalForm((form) => ({ ...form, targetDate: event.target.value }))} /></label>
            <button className="button button--accent" type="submit" disabled={isSaving}>{isSaving ? <Spinner label="A guardar" /> : <><Plus aria-hidden="true" /> Criar meta</>}</button>
          </form>
          <div className="planning-list">
            {goals.length ? goals.map((goal) => {
              const ratio = Math.min(100, (goal.currentAmount / goal.targetAmount) * 100);
              const overdue = Boolean(goal.targetDate && daysUntil(goal.targetDate) < 0 && goal.currentAmount < goal.targetAmount);
              return <article className="goal-card" key={goal.id}><div className="goal-card__header"><span className="goal-card__icon"><Target aria-hidden="true" /></span><div><h3>{goal.name}</h3><p>{goal.targetDate ? `${overdue ? 'Prazo ultrapassado' : `Até ${formatDate(goal.targetDate)}`}` : 'Sem data-alvo'}</p></div><button className="icon-button icon-button--danger" type="button" aria-label={`Remover meta ${goal.name}`} onClick={() => setDeleteTarget({ type: 'goal', id: goal.id, label: goal.name })}><Trash2 aria-hidden="true" /></button></div><div className="goal-card__amount"><strong>{formatCurrency(goal.currentAmount, currency)}</strong><span>de {formatCurrency(goal.targetAmount, currency)}</span></div><div className="goal-card__progress" role="progressbar" aria-label={`Progresso da meta ${goal.name}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(ratio)}><span style={{ width: `${ratio}%` }} /></div><div className="goal-card__update"><label><span className="sr-only">Valor poupado em {goal.name}</span><input inputMode="decimal" value={goalProgress[goal.id] || ''} onChange={(event) => setGoalProgress((items) => ({ ...items, [goal.id]: event.target.value }))} /></label><button className="button button--secondary button--small" type="button" disabled={isSaving} onClick={() => void saveGoalProgress(goal)}>Atualizar</button></div></article>;
            }) : <EmptyState title="Ainda sem metas" description="Crie uma meta com valor e prazo para acompanhar a sua poupança." />}
          </div>
        </section>

        <section className="planning-panel" aria-labelledby="income-title">
          <div className="section-heading"><div><p className="eyebrow">Entradas</p><h2 id="income-title">Rendimentos</h2></div><CircleDollarSign aria-hidden="true" /></div>
          <form className="planning-form" onSubmit={createIncome}>
            <label className="field"><span>Descrição</span><input value={incomeForm.description} onChange={(event) => setIncomeForm((form) => ({ ...form, description: event.target.value }))} placeholder="Ex.: Salário" maxLength={160} /></label>
            <div className="planning-form__split"><label className="field"><span>Valor</span><input inputMode="decimal" value={incomeForm.amount} onChange={(event) => setIncomeForm((form) => ({ ...form, amount: event.target.value }))} placeholder="1 500" /></label><label className="field"><span>Data</span><input type="date" value={incomeForm.date} onChange={(event) => setIncomeForm((form) => ({ ...form, date: event.target.value }))} /></label></div>
            <label className="field"><span>Origem <em>opcional</em></span><input value={incomeForm.source} onChange={(event) => setIncomeForm((form) => ({ ...form, source: event.target.value }))} placeholder="Ex.: Empresa" maxLength={120} /></label>
            <button className="button button--primary" type="submit" disabled={isSaving}>{isSaving ? <Spinner label="A guardar" /> : <><Plus aria-hidden="true" /> Registar rendimento</>}</button>
          </form>
          <div className="planning-list planning-list--compact">
            {incomes.length ? incomes.slice(0, 6).map((income) => <article className="planning-row" key={income.id}><span className="planning-row__icon"><CircleDollarSign aria-hidden="true" /></span><div><h3>{income.description}</h3><p>{income.source || formatDate(income.date)}{income.source ? ` · ${formatDate(income.date)}` : ''}</p></div><strong>{formatCurrency(income.amount, currency)}</strong><button className="icon-button icon-button--danger" type="button" aria-label={`Remover rendimento ${income.description}`} onClick={() => setDeleteTarget({ type: 'income', id: income.id, label: income.description })}><Trash2 aria-hidden="true" /></button></article>) : <EmptyState title="Sem rendimentos registados" description="Registe entradas para calcular o valor disponível deste mês." />}
          </div>
        </section>
      </div>

      <section className="planning-panel planning-panel--recurring" aria-labelledby="recurring-title">
        <div className="section-heading"><div><p className="eyebrow">Compromissos</p><h2 id="recurring-title">Despesas recorrentes</h2></div><Repeat2 aria-hidden="true" /></div>
        <form className="planning-form planning-form--recurring" onSubmit={createRecurring}>
          <label className="field"><span>Descrição</span><input value={recurringForm.description} onChange={(event) => setRecurringForm((form) => ({ ...form, description: event.target.value }))} placeholder="Ex.: Renda" maxLength={160} /></label>
          <label className="field"><span>Local</span><input value={recurringForm.location} onChange={(event) => setRecurringForm((form) => ({ ...form, location: event.target.value }))} placeholder="Ex.: Senhorio" maxLength={160} /></label>
          <label className="field"><span>Categoria</span><select value={recurringForm.categoryId} onChange={(event) => setRecurringForm((form) => ({ ...form, categoryId: event.target.value }))}><option value="">Escolher categoria</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
          <label className="field"><span>Valor</span><input inputMode="decimal" value={recurringForm.amount} onChange={(event) => setRecurringForm((form) => ({ ...form, amount: event.target.value }))} placeholder="0,00" /></label>
          <label className="field"><span>Dia do mês</span><input inputMode="numeric" value={recurringForm.dayOfMonth} onChange={(event) => setRecurringForm((form) => ({ ...form, dayOfMonth: event.target.value }))} placeholder="Ex.: 1" min="1" max="31" /></label>
          <button className="button button--accent" type="submit" disabled={isSaving || !categories.length}>{isSaving ? <Spinner label="A guardar" /> : <><Plus aria-hidden="true" /> Agendar</>}</button>
        </form>
        <div className="recurring-layout"><div className="planning-list">{recurring.length ? recurring.map((item) => <article className={`recurring-card ${item.isActive ? '' : 'recurring-card--paused'}`} key={item.id}><span className="recurring-card__icon"><CategoryIcon icon={item.category.icon} categoryName={item.category.name} /></span><div><h3>{item.description}</h3><p>{item.category.name} · {item.location}</p><small><CalendarClock aria-hidden="true" /> {item.isActive ? `${dueCopy(daysUntil(item.nextDueDate))} · ${formatDate(item.nextDueDate)}` : 'Em pausa'}</small></div><strong>{formatCurrency(item.amount, currency)}</strong><div className="recurring-card__actions">{item.isActive && <button className="button button--primary button--small" type="button" disabled={isSaving} onClick={() => void recordRecurring(item)}>Marcar paga</button>}<button className="icon-button" type="button" disabled={isSaving} aria-label={item.isActive ? `Pausar ${item.description}` : `Reativar ${item.description}`} onClick={() => void toggleRecurring(item)}>{item.isActive ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}</button><button className="icon-button icon-button--danger" type="button" disabled={isSaving} aria-label={`Remover ${item.description}`} onClick={() => setDeleteTarget({ type: 'recurring', id: item.id, label: item.description })}><Trash2 aria-hidden="true" /></button></div></article>) : <EmptyState title="Sem despesas recorrentes" description="Agende renda, seguros ou subscrições para antecipar os próximos vencimentos." />}</div><aside className="upcoming-card"><p className="eyebrow">Próximos vencimentos</p><h3>O que se aproxima</h3>{upcoming.length ? <ol>{upcoming.slice(0, 5).map((item) => <li key={item.id}><span>{dateOnly(item.nextDueDate).slice(8)}</span><div><strong>{item.description}</strong><small>{dueCopy(item.days)}</small></div><b>{formatCurrency(item.amount, currency)}</b></li>)}</ol> : <p>Quando criar recorrências ativas, os vencimentos aparecem aqui.</p>}</aside></div>
      </section>

      <ConfirmDialog open={Boolean(deleteTarget)} title="Remover este registo?" description={deleteTarget ? `“${deleteTarget.label}” será removido permanentemente.` : ''} confirmLabel="Remover" busy={isSaving} onCancel={() => setDeleteTarget(null)} onConfirm={() => void confirmDelete()} />
    </div>
  );
}
