import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { CalendarDays, ChevronDown, Download, Edit3, FolderKanban, Landmark, MapPin, Plus, Receipt, Search, SlidersHorizontal, Trash2 } from 'lucide-react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { errorMessage } from '../api/client';
import { accountApi, categoryApi, expenseApi } from '../api/resources';
import { useAuth } from '../auth/AuthContext';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { CategoryIcon } from '../components/CategoryIcon';
import { EmptyState, ErrorState, LoadingState } from '../components/States';
import { PageHeader } from '../components/PageHeader';
import { AuthenticatedReceiptImage } from '../components/AuthenticatedReceiptImage';
import { NoticeToast } from '../components/NoticeToast';
import { CsvExpenseImport } from '../components/CsvExpenseImport';
import { preloadExpenseFormPage } from '../routePreloads';
import type { Category, Expense, ExpenseFilters, FinancialAccount } from '../types';
import { formatCurrency, formatDate } from '../utils/format';

interface FilterDraft {
  category: string;
  from: string;
  to: string;
}

interface PeriodShortcut {
  label: string;
  from: string;
  to: string;
}

function inputDate(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function periodShortcuts(): PeriodShortcut[] {
  const today = new Date();
  const sevenDaysAgo = new Date(today);
  sevenDaysAgo.setDate(today.getDate() - 6);
  const thisMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const previousMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const previousMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0);
  return [
    { label: 'Este mês', from: inputDate(thisMonth), to: inputDate(today) },
    { label: 'Últimos 7 dias', from: inputDate(sevenDaysAgo), to: inputDate(today) },
    { label: 'Mês passado', from: inputDate(previousMonthStart), to: inputDate(previousMonthEnd) },
  ];
}

function csvCell(value: string | number) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

export function ExpensesPage() {
  const { user } = useAuth();
  const reduceMotion = useReducedMotion();
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [accounts, setAccounts] = useState<FinancialAccount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<Expense | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [notice, setNotice] = useState(() => (location.state as { notice?: string } | null)?.notice || '');
  const shortcuts = useMemo(periodShortcuts, []);

  const categoryFilter = searchParams.get('category') || undefined;
  const fromFilter = searchParams.get('from') || undefined;
  const toFilter = searchParams.get('to') || undefined;
  const searchTerm = searchParams.get('search') || '';
  const receiptsOnly = searchParams.get('hasReceipt') === 'true';

  const activeFilters = useMemo<ExpenseFilters>(() => ({
    category: categoryFilter,
    from: fromFilter,
    to: toFilter,
  }), [categoryFilter, fromFilter, toFilter]);
  const hasFilters = Boolean(activeFilters.category || activeFilters.from || activeFilters.to || searchTerm || receiptsOnly);
  const [filtersOpen, setFiltersOpen] = useState(hasFilters);
  const [filterDraft, setFilterDraft] = useState<FilterDraft>({
    category: activeFilters.category || '',
    from: activeFilters.from || '',
    to: activeFilters.to || '',
  });

  const visibleExpenses = useMemo(() => {
    const query = searchTerm.trim().toLocaleLowerCase('pt-PT');
    return expenses.filter((expense) => {
      if (receiptsOnly && !expense.receiptImageUrl) return false;
      if (!query) return true;
      return [expense.description, expense.location, expense.category?.name || '']
        .some((value) => value.toLocaleLowerCase('pt-PT').includes(query));
    });
  }, [expenses, receiptsOnly, searchTerm]);
  const visibleTotal = useMemo(
    () => visibleExpenses.reduce((total, expense) => total + Number(expense.amount), 0),
    [visibleExpenses],
  );

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      const [expenseList, categoryList, accountList] = await Promise.all([
        expenseApi.list(activeFilters),
        categoryApi.list(),
        accountApi.list(),
      ]);
      setExpenses(expenseList);
      setCategories(categoryList);
      setAccounts(accountList);
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

  useEffect(() => {
    if (hasFilters) setFiltersOpen(true);
  }, [hasFilters]);

  function applyFilters(event: FormEvent) {
    event.preventDefault();
    const next = new URLSearchParams(searchParams);
    next.delete('category');
    next.delete('from');
    next.delete('to');
    if (filterDraft.category) next.set('category', filterDraft.category);
    if (filterDraft.from) next.set('from', filterDraft.from);
    if (filterDraft.to) next.set('to', filterDraft.to);
    setSearchParams(next);
  }

  function clearFilters() {
    setFilterDraft({ category: '', from: '', to: '' });
    setSearchParams({});
  }

  function applyPeriod({ from, to }: Pick<PeriodShortcut, 'from' | 'to'>) {
    const next = new URLSearchParams(searchParams);
    next.delete('from');
    next.delete('to');
    if (from) next.set('from', from);
    if (to) next.set('to', to);
    setFilterDraft((current) => ({ ...current, from, to }));
    setSearchParams(next);
  }

  function updateClientFilter(name: 'search' | 'hasReceipt', value: string) {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(name, value);
    else next.delete(name);
    setSearchParams(next, { replace: true });
  }

  function exportCsv() {
    if (!visibleExpenses.length) return;
    const rows = [
      ['Data', 'Descrição', 'Local', 'Categoria', 'Valor', 'Moeda', 'Comprovativo'],
      ...visibleExpenses.map((expense) => [
        formatDate(expense.date), expense.description, expense.location, expense.category?.name || '',
        Number(expense.amount).toFixed(2), user?.currency || 'EUR', expense.receiptImageUrl ? 'Sim' : 'Não',
      ]),
    ];
    const csv = `\ufeff${rows.map((row) => row.map(csvCell).join(';')).join('\r\n')}`;
    const file = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(file);
    const link = document.createElement('a');
    link.href = url;
    link.download = `expensesnap-despesas-${inputDate(new Date())}.csv`;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setNotice(`${visibleExpenses.length} ${visibleExpenses.length === 1 ? 'movimento exportado' : 'movimentos exportados'} em CSV.`);
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

  return (
    <div className="page page--expenses">
      <NoticeToast message={notice} onClose={() => setNotice('')} />
      <PageHeader
        eyebrow="Arquivo"
        title="Despesas"
        description="Todos os movimentos, organizados num só lugar."
        action={(
          <div className="page-actions">
            <Link className="button button--secondary" to="/categories"><FolderKanban aria-hidden="true" /> Categorias</Link>
            <Link
              className="button button--primary"
              to="/expenses/new"
              onPointerEnter={preloadExpenseFormPage}
              onPointerDown={preloadExpenseFormPage}
              onFocus={preloadExpenseFormPage}
            >
              <Plus aria-hidden="true" /> Registar despesa
            </Link>
          </div>
        )}
      />

      <section className="filter-panel" aria-labelledby="filters-title">
        <div className="filter-panel__heading">
          <SlidersHorizontal aria-hidden="true" />
          <div><h2 id="filters-title">Filtrar arquivo</h2><p>Afine por categoria ou período.</p></div>
          <button
            className="icon-button"
            type="button"
            aria-expanded={filtersOpen}
            aria-controls="expense-filters"
            aria-label={filtersOpen ? 'Recolher filtros' : 'Mostrar filtros'}
            onClick={() => setFiltersOpen((current) => !current)}
            style={{ marginLeft: 'auto', flex: '0 0 auto' }}
          >
            <motion.span
              animate={{ rotate: filtersOpen ? 180 : 0 }}
              transition={reduceMotion ? { duration: 0 } : { duration: 0.18, ease: 'easeOut' }}
              style={{ display: 'grid', placeItems: 'center' }}
            >
              <ChevronDown aria-hidden="true" />
            </motion.span>
          </button>
        </div>
        <div className="filter-shortcuts" aria-label="Períodos rápidos">
          <button className={`filter-chip ${!activeFilters.from && !activeFilters.to ? 'filter-chip--active' : ''}`} type="button" onClick={() => applyPeriod({ from: '', to: '' })}>Todos os períodos</button>
          {shortcuts.map((shortcut) => {
            const active = activeFilters.from === shortcut.from && activeFilters.to === shortcut.to;
            return <button className={`filter-chip ${active ? 'filter-chip--active' : ''}`} type="button" key={shortcut.label} aria-pressed={active} onClick={() => applyPeriod(shortcut)}>{shortcut.label}</button>;
          })}
          <button className={`filter-chip ${receiptsOnly ? 'filter-chip--active' : ''}`} type="button" aria-pressed={receiptsOnly} onClick={() => updateClientFilter('hasReceipt', receiptsOnly ? '' : 'true')}>Com comprovativo</button>
        </div>
        <AnimatePresence initial={false}>
          {filtersOpen && (
            <motion.div
              key="expense-filters"
              initial={reduceMotion ? false : { opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduceMotion ? undefined : { opacity: 0, y: -4 }}
              transition={reduceMotion ? { duration: 0 } : { duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
              style={{ minWidth: 0 }}
            >
              <form id="expense-filters" className="filter-form" onSubmit={applyFilters}>
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
            </motion.div>
          )}
        </AnimatePresence>
        <label className="archive-search">
          <Search aria-hidden="true" />
          <span className="sr-only">Pesquisar movimentos</span>
          <input value={searchTerm} onChange={(event) => updateClientFilter('search', event.target.value)} placeholder="Pesquisar por descrição, local ou categoria" type="search" />
          {searchTerm && <button type="button" onClick={() => updateClientFilter('search', '')} aria-label="Limpar pesquisa">Limpar</button>}
        </label>
      </section>

      <div className="expense-import-row">
        <span>Tem um extrato bancário?</span>
        <CsvExpenseImport
          categories={categories}
          accounts={accounts}
          onImported={(result) => {
            setNotice(`${result.imported} movimento${result.imported === 1 ? '' : 's'} importado${result.imported === 1 ? '' : 's'}${result.skipped ? `; ${result.skipped} duplicado${result.skipped === 1 ? '' : 's'} ignorado${result.skipped === 1 ? '' : 's'}.` : '.'}`);
            void loadData();
          }}
        />
      </div>

      <section className="expense-section" aria-labelledby="expense-list-title">
        <div className="section-heading">
          <div><h2 id="expense-list-title">Movimentos</h2>
          {!isLoading && !error && <p>{visibleExpenses.length} {visibleExpenses.length === 1 ? 'registo' : 'registos'} · {formatCurrency(visibleTotal, user?.currency)}</p>}</div>
          {!isLoading && !error && visibleExpenses.length > 0 && <button className="button button--secondary button--small expense-export" type="button" onClick={exportCsv}><Download aria-hidden="true" /> Exportar CSV</button>}
        </div>

        {isLoading ? (
          <LoadingState label="A carregar despesas" />
        ) : error ? (
          <ErrorState message={error} onRetry={() => void loadData()} />
        ) : visibleExpenses.length === 0 ? (
          <EmptyState
            title={hasFilters ? 'Sem resultados neste recorte' : 'Ainda não há despesas'}
            description={hasFilters ? 'Experimente alargar o período, pesquisar outro termo ou remover um filtro.' : 'O primeiro registo é o início de uma visão mais clara.'}
            action={hasFilters
              ? <button className="button button--secondary" type="button" onClick={clearFilters}>Limpar filtros</button>
              : (
                <Link
                  className="button button--primary"
                  to="/expenses/new"
                  onPointerEnter={preloadExpenseFormPage}
                  onPointerDown={preloadExpenseFormPage}
                  onFocus={preloadExpenseFormPage}
                >
                  <Plus aria-hidden="true" /> Registar primeira despesa
                </Link>
              )}
          />
        ) : (
          <div className="expense-list">
            <AnimatePresence initial={false} mode="popLayout">
              {visibleExpenses.map((expense, index) => (
              <motion.article
                className="expense-row"
                key={expense.id}
                layout="position"
                initial={reduceMotion ? false : { opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduceMotion ? undefined : { opacity: 0, scale: 0.985 }}
                transition={reduceMotion ? { duration: 0 } : { duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
              >
                <span className="expense-row__index" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
                <div className="expense-row__receipt">
                  {expense.receiptImageUrl
                    ? <AuthenticatedReceiptImage receiptUrl={expense.receiptImageUrl} receiptMimeType={expense.receiptMimeType} alt={`Recibo de ${expense.description}`} />
                    : <Receipt aria-hidden="true" />}
                </div>
                <div className="expense-row__main">
              <span className="category-tag"><CategoryIcon icon={expense.category?.icon} categoryName={expense.category?.name} />{expense.category?.name || 'Sem categoria'}</span>
                  <h3>{expense.description}</h3>
                  <div className="expense-row__meta">
                    <span><MapPin aria-hidden="true" /> {expense.location}</span>
                    <span><CalendarDays aria-hidden="true" /> {formatDate(expense.date)}</span>
                    {expense.account && <span><Landmark aria-hidden="true" /> {expense.account.name}</span>}
                  </div>
                </div>
                <p className="expense-row__amount">{formatCurrency(expense.amount, user?.currency)}</p>
                <div className="expense-row__actions">
                  <Link className="icon-button" to={`/expenses/${expense.id}/edit`} aria-label={`Editar ${expense.description}`} title="Editar"><Edit3 aria-hidden="true" /></Link>
                  <button className="icon-button icon-button--danger" type="button" onClick={() => setDeleteTarget(expense)} aria-label={`Eliminar ${expense.description}`} title="Eliminar"><Trash2 aria-hidden="true" /></button>
                </div>
              </motion.article>
              ))}
            </AnimatePresence>
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
