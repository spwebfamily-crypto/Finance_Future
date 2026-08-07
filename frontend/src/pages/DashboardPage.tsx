import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { AlertTriangle, ArrowDownRight, ArrowUpRight, CheckCircle2, CircleHelp, Info, Pencil, Plus, Sparkles, Tag, Trash2 } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { analyticsApi, budgetApi, categoryApi, notesApi } from '../api/resources';
import { errorMessage } from '../api/client';
import { EmptyState, ErrorState, LoadingState, Spinner } from '../components/States';
import { PageHeader } from '../components/PageHeader';
import type { AnalyticsSummary, Budget, Category, FinancialNote, SpendingLevelItem } from '../types';
import { formatCurrency, formatDate } from '../utils/format';

const palette = ['#f06a50', '#171914', '#caed62', '#b83d29', '#8a887e', '#2e6547'];

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

function monthLabel(month: string) {
  return new Intl.DateTimeFormat('pt-PT', { month: 'long', year: 'numeric' }).format(new Date(`${month}-01T12:00:00`));
}

function shortMonth(month: string) {
  return new Intl.DateTimeFormat('pt-PT', { month: 'short' }).format(new Date(`${month}-01T12:00:00`)).replace('.', '');
}

const levelMeta = {
  normal: { label: 'Normal', text: 'Dentro do ritmo esperado.', Icon: CheckCircle2 },
  high: { label: 'Elevado', text: 'A acompanhar de perto este mês.', Icon: AlertTriangle },
  critical: { label: 'Crítico', text: 'Acima do limite ou da tendência.', Icon: AlertTriangle },
  insufficient_data: { label: 'Dados insuficientes', text: 'Registe mais despesas para comparar.', Icon: CircleHelp },
} as const;

const noteMeta = {
  info: { label: 'Informação', Icon: Info },
  warning: { label: 'Atenção', Icon: AlertTriangle },
  critical: { label: 'Prioridade', Icon: AlertTriangle },
} as const;

export function DashboardPage() {
  const [month, setMonth] = useState(currentMonth);
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [levels, setLevels] = useState<SpendingLevelItem[]>([]);
  const [trend, setTrend] = useState<{ month: string; total: number }[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [notes, setNotes] = useState<FinancialNote[]>([]);
  const [notesError, setNotesError] = useState('');
  const [isGeneratingNote, setIsGeneratingNote] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [newCategoryId, setNewCategoryId] = useState('');
  const [newLimit, setNewLimit] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingLimit, setEditingLimit] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    setNotesError('');
    try {
      const noteRequest = notesApi.list().catch((requestError) => {
        setNotesError(errorMessage(requestError));
        return [];
      });
      const [nextSummary, nextLevels, nextTrend, nextBudgets, nextCategories, nextNotes] = await Promise.all([
        analyticsApi.summary(month), analyticsApi.levels(month), analyticsApi.trend(6, month), budgetApi.list(), categoryApi.list(), noteRequest,
      ]);
      setSummary(nextSummary);
      setLevels(nextLevels);
      setTrend(nextTrend.series);
      setBudgets(nextBudgets);
      setCategories(nextCategories);
      setNotes(nextNotes);
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => { void load(); }, [load]);

  const currency = summary?.currency || 'EUR';
  const unbudgetedCategories = useMemo(() => categories.filter((category) => !budgets.some((budget) => budget.categoryId === category.id)), [budgets, categories]);
  const selectedMonth = summary?.month || month;
  const categoryData = (summary?.byCategory || []).map((item, index) => ({ ...item, name: item.category.name, fill: palette[index % palette.length] }));
  const trendData = trend.map((item) => ({ ...item, label: shortMonth(item.month) }));

  async function saveBudget(event: FormEvent) {
    event.preventDefault();
    const monthlyLimit = Number(newLimit.replace(',', '.'));
    if (!newCategoryId || !Number.isFinite(monthlyLimit) || monthlyLimit <= 0) return;
    setSaving(true);
    try {
      const created = await budgetApi.create({ categoryId: newCategoryId, monthlyLimit });
      setBudgets((items) => [...items, created]);
      setNewCategoryId(''); setNewLimit(''); setNotice('Orçamento criado.');
      void load();
    } catch (requestError) { setError(errorMessage(requestError)); }
    finally { setSaving(false); }
  }

  async function updateBudget(budget: Budget) {
    const monthlyLimit = Number(editingLimit.replace(',', '.'));
    if (!Number.isFinite(monthlyLimit) || monthlyLimit <= 0) return;
    setSaving(true);
    try {
      const updated = await budgetApi.update(budget.id, monthlyLimit);
      setBudgets((items) => items.map((item) => item.id === updated.id ? updated : item));
      setEditingId(null); setNotice('Orçamento atualizado.'); void load();
    } catch (requestError) { setError(errorMessage(requestError)); }
    finally { setSaving(false); }
  }

  async function removeBudget(budget: Budget) {
    if (!window.confirm(`Remover o orçamento de ${budget.category.name}?`)) return;
    setSaving(true);
    try {
      await budgetApi.remove(budget.id);
      setBudgets((items) => items.filter((item) => item.id !== budget.id));
      setNotice('Orçamento removido.'); void load();
    } catch (requestError) { setError(errorMessage(requestError)); }
    finally { setSaving(false); }
  }

  async function generateNote() {
    setIsGeneratingNote(true);
    setNotesError('');
    try {
      const note = await notesApi.generate();
      setNotes((items) => [note, ...items.filter((item) => item.id !== note.id)]);
    } catch (requestError) {
      setNotesError(errorMessage(requestError));
    } finally {
      setIsGeneratingNote(false);
    }
  }

  return (
    <div className="page page--dashboard">
      {notice && <div className="toast" role="status">{notice}<button type="button" onClick={() => setNotice('')} aria-label="Fechar aviso">×</button></div>}
      <PageHeader eyebrow={`Análise / ${selectedMonth.replace('-', '.')}`} title="O pulso das suas despesas" description="Leitura mensal, tendências e limites por categoria." action={<label className="month-picker"><span>Mês em análise</span><input aria-label="Mês em análise" type="month" value={month} onChange={(event) => setMonth(event.target.value)} /></label>} />
      {loading ? <LoadingState label="A preparar a sua visão geral" /> : error && !summary ? <ErrorState message={error} onRetry={() => void load()} /> : !summary ? <EmptyState title="Ainda sem resumo" description="Adicione despesas para começar a ver a análise mensal." /> : <>
        {error && <div className="form-alert" role="alert">{error}</div>}
        <section className="dashboard-total" aria-labelledby="total-title">
          <div><p className="eyebrow">Total em {monthLabel(selectedMonth)}</p><h2 id="total-title">{formatCurrency(summary.total, currency)}</h2></div>
          <div className={`dashboard-total__compare ${summary.changeAmount > 0 ? 'is-up' : 'is-down'}`}><span>{summary.changeAmount > 0 ? <ArrowUpRight aria-hidden="true" /> : <ArrowDownRight aria-hidden="true" />}{summary.changePercent === null ? 'Sem comparação' : `${Math.abs(summary.changePercent).toFixed(1)}%`}</span><p>{summary.changeAmount === 0 ? 'Igual ao mês anterior' : `${formatCurrency(Math.abs(summary.changeAmount), currency)} face ao mês anterior`}</p></div>
        </section>

        <div className="dashboard-grid">
          <section className="dashboard-panel dashboard-panel--categories" aria-labelledby="categories-chart-title"><div className="section-heading"><div><p className="eyebrow">Distribuição</p><h2 id="categories-chart-title">Onde foi o dinheiro</h2></div></div>{categoryData.length ? <><div className="dashboard-chart" role="img" aria-label="Gráfico de barras das despesas por categoria"><ResponsiveContainer width="100%" height="100%"><BarChart data={categoryData} layout="vertical" margin={{ top: 4, right: 12, left: 0, bottom: 4 }}><XAxis type="number" hide /><YAxis type="category" dataKey="name" width={82} tickLine={false} axisLine={false} tick={{ fill: '#35372f', fontSize: 12 }} /><Tooltip formatter={(value) => formatCurrency(Number(Array.isArray(value) ? value[0] : value ?? 0), currency)} cursor={{ fill: '#e6e0d2' }} /><Bar dataKey="amount" radius={[0, 4, 4, 0]}>{categoryData.map((entry) => <Cell key={entry.category.id} fill={entry.fill} />)}</Bar></BarChart></ResponsiveContainer></div><CategoryTable data={categoryData} currency={currency} /></> : <EmptyState title="Sem despesas neste mês" description="As categorias aparecerão aqui quando existirem movimentos." />}</section>
          <section className="dashboard-panel dashboard-panel--trend" aria-labelledby="trend-chart-title"><div className="section-heading"><div><p className="eyebrow">Últimos 6 meses</p><h2 id="trend-chart-title">Ritmo mensal</h2></div></div>{trendData.length ? <><div className="dashboard-chart" role="img" aria-label="Gráfico de linha do total mensal"><ResponsiveContainer width="100%" height="100%"><LineChart data={trendData} margin={{ top: 10, right: 10, left: -22, bottom: 0 }}><CartesianGrid vertical={false} stroke="#c7c1b3" /><XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: '#64645b', fontSize: 12 }} /><YAxis tickFormatter={(value: number) => `${value}€`} tickLine={false} axisLine={false} tick={{ fill: '#64645b', fontSize: 11 }} /><Tooltip formatter={(value) => formatCurrency(Number(Array.isArray(value) ? value[0] : value ?? 0), currency)} /><Line type="monotone" dataKey="total" stroke="#f06a50" strokeWidth={3} dot={{ fill: '#171914', r: 3 }} activeDot={{ r: 5 }} /></LineChart></ResponsiveContainer></div><TrendTable data={trendData} currency={currency} /></> : <EmptyState title="Tendência indisponível" description="São necessários movimentos para construir a série mensal." />}</section>
        </div>

        <section className="dashboard-section" aria-labelledby="levels-title"><div className="section-heading"><div><p className="eyebrow">Sinais</p><h2 id="levels-title">Níveis de gasto</h2></div><p>{levels.length} categorias analisadas</p></div>{levels.length ? <div className="level-list">{levels.map((item) => { const meta = levelMeta[item.level]; const Icon = meta.Icon; return <article className={`level-row level-row--${item.level}`} key={item.category.id}><span className="level-row__icon" aria-hidden="true"><Icon /></span><div><h3>{item.category.icon && <span aria-hidden="true">{item.category.icon} </span>}{item.category.name}</h3><p><strong>{meta.label}</strong> — {meta.text}</p></div><span className="level-row__amount">{formatCurrency(item.currentAmount, currency)}<small>{item.basis === 'budget' && item.baselineAmount !== null ? ` de ${formatCurrency(item.baselineAmount, currency)}` : item.basis === 'history' ? ' projetado' : ''}</small></span></article>; })}</div> : <EmptyState title="Dados insuficientes" description="Quando houver histórico, avaliamos o ritmo de cada categoria." />}</section>

        <section className="dashboard-section dashboard-notes" aria-labelledby="notes-title"><div className="section-heading"><div><p className="eyebrow">Leitura financeira</p><h2 id="notes-title">Notas para decidir melhor</h2></div><button className="button button--secondary button--small" type="button" onClick={() => void generateNote()} disabled={isGeneratingNote}>{isGeneratingNote ? <Spinner label="A gerar" /> : <><Sparkles aria-hidden="true" /> Gerar nota</>}</button></div>{notesError ? <ErrorState message={notesError} onRetry={() => void generateNote()} /> : notes.length ? <div className="notes-list">{notes.map((note) => { const meta = noteMeta[note.severity]; const Icon = meta.Icon; return <article className={`note-row note-row--${note.severity}`} key={note.id}><span className="note-row__icon" aria-hidden="true"><Icon /></span><div><p className="note-row__meta"><strong>{meta.label}</strong><time dateTime={note.createdAt}>{formatDate(note.createdAt)}</time></p><p>{note.content}</p></div></article>; })}</div> : <EmptyState title="Sem notas ainda" description="Gere uma nota quando quiser uma leitura breve das suas despesas." action={<button className="button button--primary button--small" type="button" onClick={() => void generateNote()} disabled={isGeneratingNote}><Sparkles aria-hidden="true" /> Gerar primeira nota</button>} />}</section>

        <section className="dashboard-section dashboard-budgets" aria-labelledby="budgets-title"><div className="section-heading"><div><p className="eyebrow">Limites mensais</p><h2 id="budgets-title">Orçamentos por categoria</h2></div></div><div className="budgets-layout"><form className="budget-create" onSubmit={saveBudget}><label className="field"><span>Categoria</span><select value={newCategoryId} onChange={(event) => setNewCategoryId(event.target.value)}><option value="">Escolher categoria</option>{unbudgetedCategories.map((category) => <option key={category.id} value={category.id}>{category.icon ? `${category.icon} ` : ''}{category.name}</option>)}</select></label><label className="field"><span>Limite por mês</span><input inputMode="decimal" value={newLimit} onChange={(event) => setNewLimit(event.target.value)} placeholder="0,00" /></label><button className="button button--accent" disabled={saving || !unbudgetedCategories.length} type="submit">{saving ? <Spinner label="A guardar" /> : <><Plus aria-hidden="true" /> Definir limite</>}</button></form><div className="budget-list">{budgets.length ? budgets.map((budget) => <article className="budget-row" key={budget.id}><span className="budget-row__icon" aria-hidden="true">{budget.category.icon || <Tag />}</span><h3>{budget.category.name}</h3>{editingId === budget.id ? <div className="budget-row__edit"><label className="sr-only" htmlFor={`budget-${budget.id}`}>Limite mensal de {budget.category.name}</label><input id={`budget-${budget.id}`} inputMode="decimal" value={editingLimit} onChange={(event) => setEditingLimit(event.target.value)} /><button className="button button--small button--primary" type="button" disabled={saving} onClick={() => void updateBudget(budget)}>Guardar</button></div> : <><strong>{formatCurrency(budget.monthlyLimit, currency)}</strong><div className="budget-row__actions"><button className="icon-button" type="button" aria-label={`Editar orçamento de ${budget.category.name}`} onClick={() => { setEditingId(budget.id); setEditingLimit(String(budget.monthlyLimit)); }}><Pencil /></button><button className="icon-button icon-button--danger" type="button" aria-label={`Remover orçamento de ${budget.category.name}`} disabled={saving} onClick={() => void removeBudget(budget)}><Trash2 /></button></div></>}</article>) : <EmptyState title="Sem limites definidos" description="Defina um orçamento para receber sinais mais precisos." />}</div></div></section>
      </>}
    </div>
  );
}

function CategoryTable({ data, currency }: { data: Array<{ category: Category; amount: number; sharePercent: number }>; currency: string }) {
  return <details className="chart-summary"><summary>Ver resumo acessível por categoria</summary><table><thead><tr><th>Categoria</th><th>Valor</th><th>Percentagem</th></tr></thead><tbody>{data.map((item) => <tr key={item.category.id}><td>{item.category.name}</td><td>{formatCurrency(item.amount, currency)}</td><td>{item.sharePercent.toFixed(1)}%</td></tr>)}</tbody></table></details>;
}

function TrendTable({ data, currency }: { data: Array<{ month: string; total: number }>; currency: string }) {
  return <details className="chart-summary"><summary>Ver resumo acessível da tendência</summary><table><thead><tr><th>Mês</th><th>Total</th></tr></thead><tbody>{data.map((item) => <tr key={item.month}><td>{monthLabel(item.month)}</td><td>{formatCurrency(item.total, currency)}</td></tr>)}</tbody></table></details>;
}
