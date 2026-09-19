import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useReducedMotion } from "framer-motion";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  CalendarClock,
  CheckCircle2,
  CircleHelp,
  Landmark,
  Pencil,
  Plus,
  ReceiptText,
  Repeat2,
  ShieldCheck,
  Trash2,
  WalletCards,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Link } from "react-router-dom";
import { accountApi, analyticsApi, budgetApi, categoryApi, dashboardApi } from "../api/resources";
import { errorMessage } from "../api/client";
import { EmptyState, ErrorState, Spinner } from "../components/States";
import { PageHeader } from "../components/PageHeader";
import { CategoryIcon } from "../components/CategoryIcon";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { NoticeToast } from "../components/NoticeToast";
import { AnimatedCurrency } from "../components/AnimatedCurrency";
import { SpendingHeatmap } from "../components/SpendingHeatmap";
import type {
  AnalyticsSummary,
  Budget,
  Category,
  FinancialAccount,
  SpendingLevelItem,
  TodaySummary,
} from "../types";
import {
  formatCurrency as formatCurrencyValue,
  formatSignedCurrency,
  parseSignedMoney,
  todayInputValue,
} from "../utils/format";
import { useI18n } from "../i18n/I18nContext";
import { accountBalanceValue } from "../utils/accountBalance";

const formatCurrency = formatCurrencyValue;

const palette = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--primary)",
];

function currentMonth() {
  return todayInputValue().slice(0, 7);
}

function monthLabel(month: string, locale = "pt-PT") {
  return new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(
    new Date(`${month}-01T12:00:00`),
  );
}

function shortMonth(month: string, locale = "pt-PT") {
  return new Intl.DateTimeFormat(locale, { month: "short" })
    .format(new Date(`${month}-01T12:00:00`))
    .replace(".", "");
}

const levelMeta = {
  normal: { label: "Normal", text: "Dentro do ritmo esperado.", Icon: CheckCircle2 },
  high: { label: "Elevado", text: "A acompanhar de perto este mês.", Icon: AlertTriangle },
  critical: { label: "Crítico", text: "Acima do limite ou da tendência.", Icon: AlertTriangle },
  insufficient_data: {
    label: "Dados insuficientes",
    text: "Registe mais despesas para comparar.",
    Icon: CircleHelp,
  },
} as const;

export function DashboardPage() {
  const { locale, t } = useI18n();
  const reduceMotion = useReducedMotion();
  const [month, setMonth] = useState(currentMonth);
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [today, setToday] = useState<TodaySummary | null>(null);
  const [accounts, setAccounts] = useState<FinancialAccount[]>([]);
  const [levels, setLevels] = useState<SpendingLevelItem[]>([]);
  const [trend, setTrend] = useState<{ month: string; total: number }[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [newCategoryId, setNewCategoryId] = useState("");
  const [newLimit, setNewLimit] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingLimit, setEditingLimit] = useState("");
  const [budgetDeleteTarget, setBudgetDeleteTarget] = useState<Budget | null>(null);
  const [hasLinkedBank, setHasLinkedBank] = useState(false);
  const [budgetFieldErrors, setBudgetFieldErrors] = useState<{
    categoryId?: string;
    limit?: string;
  }>({});
  const [budgetEditError, setBudgetEditError] = useState("");
  const newCategoryRef = useRef<HTMLSelectElement>(null);
  const newLimitRef = useRef<HTMLInputElement>(null);
  const editingLimitRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      try {
        const overview = await dashboardApi.overview(month);
        setSummary(overview.summary);
        setToday(overview.today);
        setLevels(overview.levels);
        setTrend(overview.trend.series);
        setBudgets(overview.budgets);
        setCategories(overview.categories);
        setAccounts(overview.accounts);
        setHasLinkedBank(
          overview.accounts.some(
            (account) =>
              account.source === "bank" &&
              account.connectionStatus &&
              account.connectionStatus !== "disconnected",
          ),
        );
        setError(
          overview.partialErrors.length
            ? t("Alguns dados não puderam ser atualizados. Tente novamente.")
            : "",
        );
        return;
      } catch {
        // New endpoint unavailable or interrupted: legacy requests are kept as
        // a compatibility fallback while rolling out the aggregate module.
      }
      const results = await Promise.allSettled([
        analyticsApi.summary(month),
        analyticsApi.today(),
        analyticsApi.levels(month),
        analyticsApi.trend(6, month),
        budgetApi.list(),
        categoryApi.list(),
        accountApi.list(),
      ]);
      const [
        nextSummary,
        nextToday,
        nextLevels,
        nextTrend,
        nextBudgets,
        nextCategories,
        nextAccounts,
      ] = results;
      if (nextSummary.status === "fulfilled") setSummary(nextSummary.value);
      if (nextToday.status === "fulfilled") setToday(nextToday.value);
      if (nextLevels.status === "fulfilled") setLevels(nextLevels.value);
      if (nextTrend.status === "fulfilled") setTrend(nextTrend.value.series);
      if (nextBudgets.status === "fulfilled") setBudgets(nextBudgets.value);
      if (nextCategories.status === "fulfilled") setCategories(nextCategories.value);
      const accountsValue = nextAccounts.status === "fulfilled" ? nextAccounts.value : [];
      if (nextAccounts.status === "fulfilled") setAccounts(accountsValue);
      setHasLinkedBank(
        accountsValue.some(
          (account) =>
            account.source === "bank" &&
            account.connectionStatus &&
            account.connectionStatus !== "disconnected",
        ),
      );
      const failure = results.find((result) => result.status === "rejected");
      setError(failure && failure.status === "rejected" ? errorMessage(failure.reason) : "");
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }, [month, t]);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (active) void load();
    });
    return () => {
      active = false;
    };
  }, [load]);

  const currency = summary?.currency || "EUR";
  const visibleAccounts = useMemo(
    () =>
      accounts.filter(
        (account) =>
          account.source !== "bank" ||
          (Boolean(account.connectionStatus) && account.connectionStatus !== "disconnected"),
      ),
    [accounts],
  );
  const accountTotals = useMemo(() => {
    const totals = new Map<string, number>();
    const unavailableCurrencies = new Set<string>();
    for (const account of visibleAccounts) {
      const accountCurrency = account.currency || currency;
      const balance = accountBalanceValue(account);
      if (balance === null) {
        unavailableCurrencies.add(accountCurrency);
        continue;
      }
      totals.set(accountCurrency, (totals.get(accountCurrency) ?? 0) + balance);
    }
    return [...totals.entries()].filter(
      ([accountCurrency]) => !unavailableCurrencies.has(accountCurrency),
    );
  }, [currency, visibleAccounts]);
  const unbudgetedCategories = useMemo(
    () =>
      categories.filter((category) => !budgets.some((budget) => budget.categoryId === category.id)),
    [budgets, categories],
  );
  const selectedMonth = summary?.month || month;
  const categoryData = (summary?.byCategory || [])
    .filter((item) => item.amount > 0)
    .map((item, index) => ({
      ...item,
      name: item.category.name,
      fill: palette[index % palette.length],
    }));
  const formatCurrency = (value: string | number, currency?: string) =>
    formatCurrencyValue(value, currency, locale);
  const trendData = trend.map((item) => ({ ...item, label: shortMonth(item.month, locale) }));
  const hasTrendData = trendData.some((item) => item.total > 0);
  const monthPulse = useMemo(() => {
    const monitored = levels.filter((item) => item.budget);
    const limit = monitored.reduce((total, item) => total + (item.budget?.monthlyLimit ?? 0), 0);
    const spent = monitored.reduce((total, item) => total + item.currentAmount, 0);
    const critical = levels.filter((item) => item.level === "critical").length;
    const high = levels.filter((item) => item.level === "high").length;
    const usage = limit > 0 ? (spent / limit) * 100 : null;

    if (critical > 0)
      return {
        tone: "critical",
        Icon: AlertTriangle,
        title: t("Requer atenção"),
        description: t(
          critical === 1
            ? "Uma categoria ultrapassou o limite ou o ritmo previsto."
            : "{count} categorias ultrapassaram o limite ou o ritmo previsto.",
          { count: critical },
        ),
        limit,
        spent,
        usage,
      };
    if (high > 0)
      return {
        tone: "high",
        Icon: AlertTriangle,
        title: t("A acompanhar"),
        description: t(
          high === 1
            ? "Uma categoria está acima do ritmo habitual."
            : "{count} categorias estão acima do ritmo habitual.",
          { count: high },
        ),
        limit,
        spent,
        usage,
      };
    if (limit > 0)
      return {
        tone: "normal",
        Icon: ShieldCheck,
        title: t("Mês sob controlo"),
        description: t("Os limites definidos estão dentro do ritmo esperado."),
        limit,
        spent,
        usage,
      };
    return {
      tone: "neutral",
      Icon: CircleHelp,
      title: t("Defina um limite"),
      description: t("Os orçamentos tornam os sinais deste mês mais úteis."),
      limit,
      spent,
      usage,
    };
  }, [levels, t]);
  const MonthPulseIcon = monthPulse.Icon;

  // Gasto atual por categoria, para as barras de progresso dos orçamentos.
  const spentByCategory = useMemo(() => {
    const map = new Map<string, { amount: number; level: string }>();
    for (const item of levels)
      map.set(item.category.id, { amount: item.currentAmount, level: item.level });
    return map;
  }, [levels]);

  async function saveBudget(event: FormEvent) {
    event.preventDefault();
    const monthlyLimit = parseSignedMoney(newLimit);
    const nextErrors: { categoryId?: string; limit?: string } = {};
    if (!newCategoryId) nextErrors.categoryId = "Escolha uma categoria.";
    if (!Number.isFinite(monthlyLimit) || monthlyLimit <= 0)
      nextErrors.limit = "Indique um limite maior do que zero.";
    setBudgetFieldErrors(nextErrors);
    if (nextErrors.categoryId || nextErrors.limit) {
      (nextErrors.categoryId ? newCategoryRef : newLimitRef).current?.focus();
      return;
    }
    setSaving(true);
    try {
      const created = await budgetApi.create({ categoryId: newCategoryId, monthlyLimit });
      setBudgets((items) => [...items, created]);
      setNewCategoryId("");
      setNewLimit("");
      setNotice("Orçamento criado.");
      void load();
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setSaving(false);
    }
  }

  async function updateBudget(budget: Budget) {
    const monthlyLimit = parseSignedMoney(editingLimit);
    if (!Number.isFinite(monthlyLimit) || monthlyLimit <= 0) {
      setBudgetEditError("Indique um limite maior do que zero.");
      editingLimitRef.current?.focus();
      return;
    }
    setBudgetEditError("");
    setSaving(true);
    try {
      const updated = await budgetApi.update(budget.id, monthlyLimit);
      setBudgets((items) => items.map((item) => (item.id === updated.id ? updated : item)));
      setEditingId(null);
      setNotice("Orçamento atualizado.");
      void load();
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setSaving(false);
    }
  }

  async function removeBudget(budget: Budget) {
    setSaving(true);
    try {
      await budgetApi.remove(budget.id);
      setBudgets((items) => items.filter((item) => item.id !== budget.id));
      setBudgetDeleteTarget(null);
      setNotice("Orçamento removido.");
      void load();
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="page page--dashboard">
      <NoticeToast message={notice} onClose={() => setNotice("")} />
      <PageHeader
        eyebrow={t("Visão geral")}
        title={t("Hoje, sem complicações")}
        description={t("Veja o movimento do dia, os saldos e o mês no mesmo lugar.")}
        action={
          <label className="month-picker">
            <span>{t("Mês em análise")}</span>
            <input
              aria-label={t("Mês em análise")}
              type="month"
              value={month}
              onChange={(event) => setMonth(event.target.value)}
            />
          </label>
        }
      />
      {loading ? (
        <div className="dashboard-skeleton" aria-hidden="true">
          <span className="dashboard-skeleton__shortcuts">
            {[0, 1, 2, 3].map((index) => (
              <span key={index} className="skeleton-block skeleton-block--shortcut" />
            ))}
          </span>
          <span className="skeleton-block skeleton-block--hero" />
          <span className="skeleton-block skeleton-block--pulse" />
          <span className="dashboard-skeleton__charts">
            <span className="skeleton-block skeleton-block--chart" />
            <span className="skeleton-block skeleton-block--chart" />
          </span>
        </div>
      ) : error && !summary && !today ? (
        <ErrorState message={error} onRetry={() => void load()} />
      ) : !summary && !today ? (
        <EmptyState
          title={t("Ainda sem resumo")}
          description={t("Adicione despesas para começar a ver a análise mensal.")}
        />
      ) : (
        <>
          {error && (
            <div className="form-alert" role="alert">
              {error}
            </div>
          )}
          <section className="dashboard-shortcuts" aria-label={t("Ações principais")}>
            <Link className="dashboard-shortcut dashboard-shortcut--primary" to="/expenses/new">
              <span>
                <Plus aria-hidden="true" />
              </span>
              <div>
                <strong>{t("Registar despesa")}</strong>
                <small>{t("Adicionar um movimento em poucos passos.")}</small>
              </div>
            </Link>
            <Link className="dashboard-shortcut" to="/expenses">
              <span>
                <ReceiptText aria-hidden="true" />
              </span>
              <div>
                <strong>{t("Rever movimentos")}</strong>
                <small>{t("Pesquisar, editar, importar ou exportar.")}</small>
              </div>
            </Link>
            <Link className="dashboard-shortcut" to="/planning">
              <span>
                <CalendarClock aria-hidden="true" />
              </span>
              <div>
                <strong>{t("Preparar o mês")}</strong>
                <small>{t("Ver vencimentos, metas e alertas.")}</small>
              </div>
            </Link>
            <Link
              className="dashboard-shortcut dashboard-shortcut--account"
              to={hasLinkedBank ? "/accounts" : "/accounts/connect"}
            >
              <span>
                <Landmark aria-hidden="true" />
              </span>
              <div>
                <strong>{t(hasLinkedBank ? "Ver contas" : "Ligar banco")}</strong>
                <small>
                  {t(
                    hasLinkedBank
                      ? "Gastos do banco já estão neste total."
                      : "Os gastos entram sozinhos nas despesas.",
                  )}
                </small>
              </div>
            </Link>
          </section>
          {today && (
            <section className="today-overview" aria-labelledby="today-title">
              <div className="today-overview__summary">
                <div className="section-heading today-overview__heading">
                  <div>
                    <p className="eyebrow">{t("Movimento do dia")}</p>
                    <h2 id="today-title">{t("Hoje")}</h2>
                  </div>
                  <Link className="text-button" to="/expenses">
                    {t("Ver todos")}
                  </Link>
                </div>
                <div className="today-metrics">
                  <article>
                    <span>{t("Entradas")}</span>
                    <strong className="is-positive">
                      {formatSignedCurrency(today.incomeTotal, today.currency, locale)}
                    </strong>
                  </article>
                  <article>
                    <span>{t("Saídas")}</span>
                    <strong className="is-negative">
                      {formatSignedCurrency(-today.expenseTotal, today.currency, locale)}
                    </strong>
                  </article>
                  <article className="today-metrics__net">
                    <span>{t("Resultado do dia")}</span>
                    <strong className={today.netTotal >= 0 ? "is-positive" : "is-negative"}>
                      {formatSignedCurrency(today.netTotal, today.currency, locale)}
                    </strong>
                  </article>
                </div>
                <div className="today-balance">
                  <span className="today-balance__icon" aria-hidden="true">
                    <WalletCards />
                  </span>
                  <div>
                    <span>{t("Saldo das contas")}</span>
                    {accountTotals.length ? (
                      <div className="today-balance__values">
                        {accountTotals.map(([accountCurrency, total]) => (
                          <strong key={accountCurrency}>
                            {formatCurrency(total, accountCurrency)}
                          </strong>
                        ))}
                      </div>
                    ) : visibleAccounts.length ? (
                      <span>{t("Ainda sem sincronização")}</span>
                    ) : (
                      <Link to="/accounts/connect">{t("Adicionar ou ligar uma conta")}</Link>
                    )}
                  </div>
                </div>
              </div>
              <div className="today-overview__activity">
                <div className="today-overview__activity-title">
                  <span>{t("Atividade")}</span>
                  <small>
                    {t(today.items.length === 1 ? "{count} movimento" : "{count} movimentos", {
                      count: today.items.length,
                    })}
                  </small>
                </div>
                {today.items.length ? (
                  <ul className="today-activity-list">
                    {today.items.slice(0, 6).map((item) => (
                      <li key={`${item.type}-${item.id}`}>
                        <span className={`today-activity-list__icon is-${item.type}`}>
                          {item.type === "expense" ? (
                            <ArrowDownRight aria-hidden="true" />
                          ) : item.type === "income" ? (
                            <ArrowUpRight aria-hidden="true" />
                          ) : (
                            <Repeat2 aria-hidden="true" />
                          )}
                        </span>
                        <div>
                          <strong>{item.description}</strong>
                          <small>
                            {[
                              item.categoryName,
                              item.accountName,
                              item.source === "bank" ? t("Banco") : null,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </small>
                        </div>
                        <strong className={`today-activity-list__amount is-${item.type}`}>
                          {item.type === "expense" ? "−" : item.type === "income" ? "+" : ""}
                          {formatCurrency(item.amount, item.currency || today.currency)}
                        </strong>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="today-empty">
                    <p>{t("Ainda não há movimentos hoje.")}</p>
                    <Link to="/expenses/new">{t("Registar uma despesa")}</Link>
                  </div>
                )}
              </div>
            </section>
          )}
          {summary && (
            <>
              <section className="dashboard-total" aria-labelledby="total-title">
                <div>
                  <p className="eyebrow">
                    {t("Total em {month}", { month: monthLabel(selectedMonth, locale) })}
                  </p>
                  <h2 id="total-title">
                    <AnimatedCurrency value={summary.total} currency={currency} />
                  </h2>
                  <p className="dashboard-total__source">
                    {hasLinkedBank
                      ? t("Inclui os gastos das contas ligadas ao banco.")
                      : t("Ligue um banco para os gastos contabilizados entrarem sozinhos.")}
                  </p>
                </div>
                <div
                  className={`dashboard-total__compare ${summary.changeAmount > 0 ? "is-up" : "is-down"}`}
                >
                  <span>
                    {summary.changeAmount > 0 ? (
                      <ArrowUpRight aria-hidden="true" />
                    ) : (
                      <ArrowDownRight aria-hidden="true" />
                    )}
                    {summary.changePercent === null
                      ? t("Sem comparação")
                      : `${Math.abs(summary.changePercent).toFixed(1)}%`}
                  </span>
                  <p>
                    {summary.changeAmount === 0
                      ? t("Igual ao mês anterior")
                      : t("{amount} face ao mês anterior", {
                          amount: formatCurrency(Math.abs(summary.changeAmount), currency),
                        })}
                  </p>
                </div>
              </section>

              <section
                className={`month-pulse month-pulse--${monthPulse.tone}`}
                aria-labelledby="month-pulse-title"
              >
                <span className="month-pulse__icon" aria-hidden="true">
                  <MonthPulseIcon />
                </span>
                <div className="month-pulse__copy">
                  <p className="eyebrow">{t("Estado do mês")}</p>
                  <h2 id="month-pulse-title">{t(monthPulse.title)}</h2>
                  <p>{t(monthPulse.description)}</p>
                </div>
                {monthPulse.usage !== null ? (
                  <div className="month-pulse__budget">
                    <div>
                      <span>{t("Orçamento acompanhado")}</span>
                      <strong>
                        {formatCurrency(monthPulse.spent, currency)} /{" "}
                        {formatCurrency(monthPulse.limit, currency)}
                      </strong>
                    </div>
                    <div
                      className="month-pulse__bar"
                      role="progressbar"
                      aria-label={t("Utilização do orçamento acompanhado")}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={Math.min(100, Math.round(monthPulse.usage))}
                    >
                      <span style={{ width: `${Math.min(100, monthPulse.usage)}%` }} />
                    </div>
                    <small>
                      {t("{percent}% utilizado", { percent: monthPulse.usage.toFixed(0) })}
                    </small>
                  </div>
                ) : (
                  <a className="text-button month-pulse__action" href="#budgets-title">
                    {t("Definir limites")}
                  </a>
                )}
              </section>

              <div className="dashboard-grid">
                <section
                  className="dashboard-panel dashboard-panel--categories"
                  aria-labelledby="categories-chart-title"
                >
                  <div className="section-heading">
                    <div>
                      <p className="eyebrow">{t("Distribuição")}</p>
                      <h2 id="categories-chart-title">{t("Por categoria")}</h2>
                    </div>
                  </div>
                  {categoryData.length ? (
                    <>
                      <div
                        className="dashboard-chart"
                        role="img"
                        aria-label="Gráfico de barras das despesas por categoria"
                      >
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart
                            data={categoryData}
                            layout="vertical"
                            margin={{ top: 4, right: 12, left: 0, bottom: 4 }}
                          >
                            <XAxis type="number" hide />
                            <YAxis
                              type="category"
                              dataKey="name"
                              width={82}
                              tickLine={false}
                              axisLine={false}
                              tick={{ fill: "var(--chart-tick)", fontSize: 12 }}
                            />
                            <Tooltip
                              formatter={(value) =>
                                formatCurrency(
                                  Number(Array.isArray(value) ? value[0] : (value ?? 0)),
                                  currency,
                                )
                              }
                              cursor={{ fill: "var(--chart-cursor)" }}
                              isAnimationActive={!reduceMotion}
                            />
                            <Bar
                              dataKey="amount"
                              radius={[0, 6, 6, 0]}
                              isAnimationActive={!reduceMotion}
                            >
                              {categoryData.map((entry) => (
                                <Cell key={entry.category.id} fill={entry.fill} />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                      <CategoryTable data={categoryData} currency={currency} />
                    </>
                  ) : (
                    <EmptyState
                      title={t("Sem despesas neste mês")}
                      description={t("As categorias aparecerão aqui quando existirem movimentos.")}
                    />
                  )}
                </section>
                <section
                  className="dashboard-panel dashboard-panel--trend"
                  aria-labelledby="trend-chart-title"
                >
                  <div className="section-heading">
                    <div>
                      <p className="eyebrow">{t("Últimos 6 meses")}</p>
                      <h2 id="trend-chart-title">{t("Evolução mensal")}</h2>
                    </div>
                  </div>
                  {hasTrendData ? (
                    <>
                      <div
                        className="dashboard-chart"
                        role="img"
                        aria-label="Gráfico de linha do total mensal"
                      >
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart
                            data={trendData}
                            margin={{ top: 10, right: 10, left: -22, bottom: 0 }}
                          >
                            <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
                            <XAxis
                              dataKey="label"
                              tickLine={false}
                              axisLine={false}
                              tick={{ fill: "var(--chart-tick)", fontSize: 12 }}
                            />
                            <YAxis
                              tickFormatter={(value: number) => `${value}€`}
                              tickLine={false}
                              axisLine={false}
                              tick={{ fill: "var(--chart-tick-muted)", fontSize: 11 }}
                            />
                            <Tooltip
                              formatter={(value) =>
                                formatCurrency(
                                  Number(Array.isArray(value) ? value[0] : (value ?? 0)),
                                  currency,
                                )
                              }
                              isAnimationActive={!reduceMotion}
                            />
                            <Line
                              type="monotone"
                              dataKey="total"
                              stroke="var(--brand)"
                              strokeWidth={3}
                              dot={{
                                fill: "var(--accent)",
                                stroke: "var(--brand-dark)",
                                strokeWidth: 2,
                                r: 3,
                              }}
                              activeDot={{ r: 5 }}
                              isAnimationActive={!reduceMotion}
                            />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                      <TrendTable data={trendData} currency={currency} locale={locale} />
                    </>
                  ) : (
                    <EmptyState
                      title={t("Tendência indisponível")}
                      description={t("São necessários movimentos para construir a série mensal.")}
                    />
                  )}
                </section>
              </div>

              <SpendingHeatmap
                month={selectedMonth}
                byDay={summary.byDay ?? []}
                currency={currency}
              />
            </>
          )}

          <section className="dashboard-section" aria-labelledby="levels-title">
            <div className="section-heading">
              <div>
                <p className="eyebrow">{t("Sinais")}</p>
                <h2 id="levels-title">{t("Níveis de gasto")}</h2>
              </div>
              <p>{levels.length} categorias analisadas</p>
            </div>
            {levels.length ? (
              <div className="level-list">
                {levels.map((item) => {
                  const meta = levelMeta[item.level];
                  const Icon = meta.Icon;
                  return (
                    <article
                      className={`level-row level-row--${item.level}`}
                      key={item.category.id}
                    >
                      <span className="level-row__icon" aria-hidden="true">
                        <Icon />
                      </span>
                      <div>
                        <h3>
                          <CategoryIcon
                            icon={item.category.icon}
                            categoryName={item.category.name}
                          />
                          {item.category.name}
                        </h3>
                        <p>
                          <strong>{meta.label}</strong> — {meta.text}
                        </p>
                      </div>
                      <span className="level-row__amount">
                        {formatCurrency(item.currentAmount, currency)}
                        <small>
                          {item.basis === "budget" && item.baselineAmount !== null
                            ? ` de ${formatCurrency(item.baselineAmount, currency)}`
                            : item.basis === "history"
                              ? " projetado"
                              : ""}
                        </small>
                      </span>
                    </article>
                  );
                })}
              </div>
            ) : (
              <EmptyState
                title={t("Dados insuficientes")}
                description={t("Quando houver histórico, avaliamos o ritmo de cada categoria.")}
              />
            )}
          </section>

          <section className="dashboard-section dashboard-budgets" aria-labelledby="budgets-title">
            <div className="section-heading">
              <div>
                <p className="eyebrow">{t("Limites mensais")}</p>
                <h2 id="budgets-title">{t("Orçamentos por categoria")}</h2>
              </div>
            </div>
            <div className="budgets-layout">
              <form className="budget-create" onSubmit={saveBudget} noValidate>
                <label className="field">
                  <span>{t("Categoria")}</span>
                  <select
                    ref={newCategoryRef}
                    value={newCategoryId}
                    onChange={(event) => {
                      setNewCategoryId(event.target.value);
                      setBudgetFieldErrors((current) => ({ ...current, categoryId: undefined }));
                    }}
                    aria-invalid={Boolean(budgetFieldErrors.categoryId)}
                    aria-describedby={
                      budgetFieldErrors.categoryId ? "budget-category-error" : undefined
                    }
                  >
                    <option value="">{t("Escolher categoria")}</option>
                    {unbudgetedCategories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                  {budgetFieldErrors.categoryId && (
                    <small className="field__error" id="budget-category-error">
                      {budgetFieldErrors.categoryId}
                    </small>
                  )}
                </label>
                <label className="field">
                  <span>{t("Limite por mês")}</span>
                  <input
                    ref={newLimitRef}
                    inputMode="decimal"
                    value={newLimit}
                    onChange={(event) => {
                      setNewLimit(event.target.value);
                      setBudgetFieldErrors((current) => ({ ...current, limit: undefined }));
                    }}
                    placeholder="0,00"
                    aria-invalid={Boolean(budgetFieldErrors.limit)}
                    aria-describedby={budgetFieldErrors.limit ? "budget-limit-error" : undefined}
                  />
                  {budgetFieldErrors.limit && (
                    <small className="field__error" id="budget-limit-error">
                      {budgetFieldErrors.limit}
                    </small>
                  )}
                </label>
                <button
                  className="button button--accent"
                  disabled={saving || !unbudgetedCategories.length}
                  type="submit"
                >
                  {saving ? (
                    <Spinner label={t("A guardar")} />
                  ) : (
                    <>
                      <Plus aria-hidden="true" /> {t("Definir limite")}
                    </>
                  )}
                </button>
              </form>
              <div className="budget-list">
                {budgets.length ? (
                  budgets.map((budget) => (
                    <article className="budget-row" key={budget.id}>
                      <span className="budget-row__icon">
                        <CategoryIcon
                          icon={budget.category.icon}
                          categoryName={budget.category.name}
                        />
                      </span>
                      <h3>{budget.category.name}</h3>
                      {editingId === budget.id ? (
                        <div className="budget-row__edit">
                          <label className="sr-only" htmlFor={`budget-${budget.id}`}>
                            Limite mensal de {budget.category.name}
                          </label>
                          <input
                            id={`budget-${budget.id}`}
                            ref={editingLimitRef}
                            inputMode="decimal"
                            value={editingLimit}
                            onChange={(event) => {
                              setEditingLimit(event.target.value);
                              setBudgetEditError("");
                            }}
                            aria-invalid={Boolean(budgetEditError)}
                            aria-describedby={budgetEditError ? "budget-edit-error" : undefined}
                          />
                          {budgetEditError && (
                            <small className="field__error" id="budget-edit-error">
                              {budgetEditError}
                            </small>
                          )}
                          <button
                            className="button button--small button--primary"
                            type="button"
                            disabled={saving}
                            onClick={() => void updateBudget(budget)}
                          >
                            Guardar
                          </button>
                        </div>
                      ) : (
                        <>
                          <strong>{formatCurrency(budget.monthlyLimit, currency)}</strong>
                          <BudgetUsage
                            spent={spentByCategory.get(budget.categoryId)?.amount ?? 0}
                            limit={budget.monthlyLimit}
                            level={spentByCategory.get(budget.categoryId)?.level ?? "normal"}
                            currency={currency}
                          />
                          <div className="budget-row__actions">
                            <button
                              className="icon-button"
                              type="button"
                              aria-label={`Editar orçamento de ${budget.category.name}`}
                              onClick={() => {
                                setEditingId(budget.id);
                                setEditingLimit(String(budget.monthlyLimit));
                              }}
                            >
                              <Pencil />
                            </button>
                            <button
                              className="icon-button icon-button--danger"
                              type="button"
                              aria-label={`Remover orçamento de ${budget.category.name}`}
                              disabled={saving}
                              onClick={() => setBudgetDeleteTarget(budget)}
                            >
                              <Trash2 />
                            </button>
                          </div>
                        </>
                      )}
                    </article>
                  ))
                ) : (
                  <EmptyState
                    title={t("Sem limites definidos")}
                    description={t("Defina um orçamento para receber sinais mais precisos.")}
                  />
                )}
              </div>
            </div>
          </section>
        </>
      )}
      <ConfirmDialog
        open={Boolean(budgetDeleteTarget)}
        title={t("Remover este orçamento?")}
        description={
          budgetDeleteTarget
            ? `O limite mensal de “${budgetDeleteTarget.category.name}” será removido.`
            : ""
        }
        confirmLabel={t("Remover orçamento")}
        busy={saving}
        onCancel={() => setBudgetDeleteTarget(null)}
        onConfirm={() => budgetDeleteTarget && void removeBudget(budgetDeleteTarget)}
      />
    </div>
  );
}

function CategoryTable({
  data,
  currency,
}: {
  data: Array<{ category: Category; amount: number; sharePercent: number }>;
  currency: string;
}) {
  const { t } = useI18n();
  return (
    <details className="chart-summary">
      <summary>{t("Ver resumo acessível por categoria")}</summary>
      <table>
        <thead>
          <tr>
            <th>{t("Categoria")}</th>
            <th>{t("Valor")}</th>
            <th>{t("Percentagem")}</th>
          </tr>
        </thead>
        <tbody>
          {data.map((item) => (
            <tr key={item.category.id}>
              <td>{item.category.name}</td>
              <td>{formatCurrency(item.amount, currency)}</td>
              <td>{item.sharePercent.toFixed(1)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}

function TrendTable({
  data,
  currency,
  locale,
}: {
  data: Array<{ month: string; total: number }>;
  currency: string;
  locale: string;
}) {
  const { t } = useI18n();
  return (
    <details className="chart-summary">
      <summary>{t("Ver resumo acessível da tendência")}</summary>
      <table>
        <thead>
          <tr>
            <th>{t("Mês")}</th>
            <th>{t("Total")}</th>
          </tr>
        </thead>
        <tbody>
          {data.map((item) => (
            <tr key={item.month}>
              <td>{monthLabel(item.month, locale)}</td>
              <td>{formatCurrency(item.total, currency)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}

function BudgetUsage({
  spent,
  limit,
  level,
  currency,
}: {
  spent: number;
  limit: number;
  level: string;
  currency: string;
}) {
  const usage = limit > 0 ? Math.min(100, (spent / limit) * 100) : 0;
  return (
    <div className="budget-row__usage">
      <div
        className={`budget-row__bar budget-row__bar--${level}`}
        role="progressbar"
        aria-label={`Utilização do orçamento de ${limit > 0 ? `${usage.toFixed(0)}%` : "categoria sem limite"}`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(usage)}
      >
        <span style={{ width: `${usage}%` }} />
      </div>
      <small>
        {formatCurrency(spent, currency)} · {usage.toFixed(0)}%
      </small>
    </div>
  );
}
