import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { CalendarDays, Edit3, MapPin, Plus, Receipt, Search, SlidersHorizontal, Trash2, X } from 'lucide-react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { errorMessage } from '../api/client';
import { categoryApi, expenseApi } from '../api/resources';
import { useAuth } from '../auth/AuthContext';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { CategoryIcon } from '../components/CategoryIcon';
import { EmptyState, ErrorState, LoadingState } from '../components/States';
import { PageHeader } from '../components/PageHeader';
import { AuthenticatedReceiptImage } from '../components/AuthenticatedReceiptImage';
import type { Category, Expense, ExpenseFilters } from '../types';
import { formatCurrency, formatDate } from '../utils/format';

interface FilterDraft {
  category: string;
  from: string;
  to: string;
}

export function ExpensesPage() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<Expense | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [notice, setNotice] = useState(() => (location.state as { notice?: string } | null)?.notice || '');

  const activeFilters = useMemo<ExpenseFilters>(() => ({
    category: searchParams.get('category') || undefined,
    from: searchParams.get('from') || undefined,
    to: searchParams.get('to') || undefined,
  }), [searchParams]);
  const [filterDraft, setFilterDraft] = useState<FilterDraft>({
    category: activeFilters.category || '',
    from: activeFilters.from || '',
    to: activeFilters.to || '',
  });

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      const [expenseList, categoryList] = await Promise.all([
        expenseApi.list(activeFilters),
        categoryApi.list(),
      ]);
      setExpenses(expenseList);
      setCategories(categoryList);
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setIsLoading(false);
    }
  }, [activeFilters]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(''), 4500);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  function applyFilters(event: FormEvent) {
    event.preventDefault();
    const next = new URLSearchParams();
    if (filterDraft.category) next.set('category', filterDraft.category);
    if (filterDraft.from) next.set('from', filterDraft.from);
    if (filterDraft.to) next.set('to', filterDraft.to);
    setSearchParams(next);
  }

  function clearFilters() {
    setFilterDraft({ category: '', from: '', to: '' });
    setSearchParams({});
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await expenseApi.remove(deleteTarget.id);
      setExpenses((current) => current.filter((expense) => expense.id !== deleteTarget.id));
      setDeleteTarget(null);
      setNotice('Despesa eliminada.');
    } catch (requestError) {
      setDeleteTarget(null);
      setError(errorMessage(requestError));
    } finally {
      setIsDeleting(false);
    }
  }

  const hasFilters = Boolean(activeFilters.category || activeFilters.from || activeFilters.to);

  return (
    <div className="page page--expenses">
      {notice && <div className="toast" role="status">{notice}<button type="button" onClick={() => setNotice('')} aria-label="Fechar aviso"><X aria-hidden="true" /></button></div>}
      <PageHeader
        eyebrow="Arquivo / Despesas"
        title="Os seus movimentos"
        description="Registos claros para saber exatamente onde ficou cada euro."
        action={<Link className="button button--primary" to="/expenses/new"><Plus aria-hidden="true" /> Nova despesa</Link>}
      />

      <section className="filter-panel" aria-labelledby="filters-title">
        <div className="filter-panel__heading">
          <SlidersHorizontal aria-hidden="true" />
          <div><h2 id="filters-title">Filtrar arquivo</h2><p>Afine por categoria ou período.</p></div>
        </div>
        <form className="filter-form" onSubmit={applyFilters}>
          <label className="field field--compact">
            <span>Categoria</span>
            <select value={filterDraft.category} onChange={(event) => setFilterDraft((current) => ({ ...current, category: event.target.value }))}>
              <option value="">Todas as categorias</option>
              {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
            </select>
          </label>
          <label className="field field--compact"><span>De</span><input type="date" value={filterDraft.from} max={filterDraft.to || undefined} onChange={(event) => setFilterDraft((current) => ({ ...current, from: event.target.value }))} /></label>
          <label className="field field--compact"><span>Até</span><input type="date" value={filterDraft.to} min={filterDraft.from || undefined} onChange={(event) => setFilterDraft((current) => ({ ...current, to: event.target.value }))} /></label>
          <button className="button button--secondary filter-form__submit" type="submit"><Search aria-hidden="true" /> Aplicar</button>
          {hasFilters && <button className="text-button" type="button" onClick={clearFilters}>Limpar</button>}
        </form>
      </section>

      <section className="expense-section" aria-labelledby="expense-list-title">
        <div className="section-heading">
          <h2 id="expense-list-title">Movimentos</h2>
          {!isLoading && !error && <p>{expenses.length} {expenses.length === 1 ? 'registo' : 'registos'}</p>}
        </div>

        {isLoading ? (
          <LoadingState label="A carregar despesas" />
        ) : error ? (
          <ErrorState message={error} onRetry={() => void loadData()} />
        ) : expenses.length === 0 ? (
          <EmptyState
            title={hasFilters ? 'Sem resultados neste recorte' : 'Ainda não há despesas'}
            description={hasFilters ? 'Experimente alargar o período ou remover um filtro.' : 'O primeiro registo é o início de uma visão mais clara.'}
            action={hasFilters
              ? <button className="button button--secondary" type="button" onClick={clearFilters}>Limpar filtros</button>
              : <Link className="button button--primary" to="/expenses/new"><Plus aria-hidden="true" /> Registar primeira despesa</Link>}
          />
        ) : (
          <div className="expense-list">
            {expenses.map((expense, index) => (
              <article className="expense-row" key={expense.id}>
                <span className="expense-row__index" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
                <div className="expense-row__receipt">
                  {expense.receiptImageUrl
                    ? <AuthenticatedReceiptImage receiptUrl={expense.receiptImageUrl} alt={`Recibo de ${expense.description}`} />
                    : <Receipt aria-hidden="true" />}
                </div>
                <div className="expense-row__main">
              <span className="category-tag"><CategoryIcon icon={expense.category?.icon} categoryName={expense.category?.name} />{expense.category?.name || 'Sem categoria'}</span>
                  <h3>{expense.description}</h3>
                  <div className="expense-row__meta">
                    <span><MapPin aria-hidden="true" /> {expense.location}</span>
                    <span><CalendarDays aria-hidden="true" /> {formatDate(expense.date)}</span>
                  </div>
                </div>
                <p className="expense-row__amount">{formatCurrency(expense.amount, user?.currency)}</p>
                <div className="expense-row__actions">
                  <Link className="icon-button" to={`/expenses/${expense.id}/edit`} aria-label={`Editar ${expense.description}`} title="Editar"><Edit3 aria-hidden="true" /></Link>
                  <button className="icon-button icon-button--danger" type="button" onClick={() => setDeleteTarget(expense)} aria-label={`Eliminar ${expense.description}`} title="Eliminar"><Trash2 aria-hidden="true" /></button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Eliminar esta despesa?"
        description={deleteTarget ? `“${deleteTarget.description}” será removida definitivamente do seu arquivo.` : ''}
        confirmLabel="Eliminar despesa"
        busy={isDeleting}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => void confirmDelete()}
      />
    </div>
  );
}
