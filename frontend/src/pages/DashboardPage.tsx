import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
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
  ShieldCheck,
  Trash2,
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
import { analyticsApi, budgetApi, categoryApi } from "../api/resources";
import { errorMessage } from "../api/client";
import { EmptyState, ErrorState, Spinner } from "../components/States";
import { PageHeader } from "../components/PageHeader";
import { CategoryIcon } from "../components/CategoryIcon";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { NoticeToast } from "../components/NoticeToast";
import { AnimatedCurrency } from "../components/AnimatedCurrency";
import { SpendingHeatmap } from "../components/SpendingHeatmap";
import type { AnalyticsSummary, Budget, Category, SpendingLevelItem } from "../types";
import { formatCurrency, parseSignedMoney, todayInputValue } from "../utils/format";

const palette = ["var(--brand)", "#8fbe5f", "#d5a443", "#698076", "#8d74b7", "#d97864"];

function currentMonth() {
  return todayInputValue().slice(0, 7);
}

function monthLabel(month: string) {
  return new Intl.DateTimeFormat("pt-PT", { month: "long", year: "numeric" }).format(
    new Date(`${month}-01T12:00:00`),
  );
}

function shortMonth(month: string) {
  return new Intl.DateTimeFormat("pt-PT", { month: "short" })
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
  const reduceMotion = useReducedMotion();
  const [month, setMonth] = useState(currentMonth);
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
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

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [nextSummary, nextLevels, nextTrend, nextBudgets, nextCategories] = await Promise.all([
        analyticsApi.summary(month),
        analyticsApi.levels(month),
        analyticsApi.trend(6, month),
        budgetApi.list(),
        categoryApi.list(),
      ]);
      setSummary(nextSummary);
      setLevels(nextLevels);
      setTrend(nextTrend.series);
      setBudgets(nextBudgets);
      setCategories(nextCategories);
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => {
    void load();
  }, [load]);

  const currency = summary?.currency || "EUR";
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
  const trendData = trend.map((item) => ({ ...item, label: shortMonth(item.month) }));
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
        title: "Requer aten\u00e7\u00e3o",
        description: `${critical} ${critical === 1 ? "categoria ultrapassou" : "categorias ultrapassaram"} o limite ou o ritmo previsto.`,
        limit,
        spent,
        usage,
      };
    if (high > 0)
      return {
        tone: "high",
        Icon: AlertTriangle,
        title: "A acompanhar",
        description: `${high} ${high === 1 ? "categoria est\u00e1" : "categorias est\u00e3o"} acima do ritmo habitual.`,
        limit,
        spent,
        usage,
      };
    if (limit > 0)
      return {
        tone: "normal",
        Icon: ShieldCheck,
        title: "M\u00eas sob controlo",
        description: "Os limites definidos est\u00e3o dentro do ritmo esperado.",
        limit,
        spent,
        usage,
      };
    return {
      tone: "neutral",
      Icon: CircleHelp,
      title: "Defina um limite",
      description: "Os or\u00e7amentos tornam os sinais deste m\u00eas mais \u00fateis.",
      limit,
      spent,
      usage,
    };
  }, [levels]);
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
    if (!newCategoryId || !Number.isFinite(monthlyLimit) || monthlyLimit <= 0) return;
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
    if (!Number.isFinite(monthlyLimit) || monthlyLimit <= 0) return;
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
        eyebrow={`Visão geral / ${selectedMonth.replace("-", ".")}`}
        title="O seu mês, num relance"
        description="Totais, tendências e limites sem distrações."
        action={
          <label className="month-picker">
            <span>Mês em análise</span>
            <input
              aria-label="Mês em análise"
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
      ) : error && !summary ? (
        <ErrorState message={error} onRetry={() => void load()} />
      ) : !summary ? (
        <EmptyState
          title="Ainda sem resumo"
          description="Adicione despesas para começar a ver a análise mensal."
        />
      ) : (
        <>
          {error && (
            <div className="form-alert" role="alert">
              {error}
            </div>
          )}
          <section className="dashboard-shortcuts" aria-label="Ações principais">
            <Link className="dashboard-shortcut dashboard-shortcut--primary" to="/expenses/new">
              <span>
                <Plus aria-hidden="true" />
              </span>
              <div>
                <strong>Registar despesa</strong>
                <small>Adicionar um movimento em poucos passos.</small>
              </div>
            </Link>
            <Link className="dashboard-shortcut" to="/expenses">
              <span>
                <ReceiptText aria-hidden="true" />
              </span>
              <div>
                <strong>Rever movimentos</strong>
                <small>Pesquisar, editar, importar ou exportar.</small>
              </div>
            </Link>
            <Link className="dashboard-shortcut" to="/planning">
              <span>
                <CalendarClock aria-hidden="true" />
              </span>
              <div>
                <strong>Preparar o mês</strong>
                <small>Ver vencimentos, metas e alertas.</small>
              </div>
            </Link>
            <Link className="dashboard-shortcut dashboard-shortcut--account" to="/accounts">
              <span>
                <Landmark aria-hidden="true" />
              </span>
              <div>
                <strong>Ver contas</strong>
                <small>Conferir o saldo e transferir dinheiro.</small>
              </div>
            </Link>
          </section>
          <section className="dashboard-total" aria-labelledby="total-title">
            <div>
              <p className="eyebrow">Total em {monthLabel(selectedMonth)}</p>
              <h2 id="total-title">
                <AnimatedCurrency value={summary.total} currency={currency} />
              </h2>
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
                  ? "Sem comparação"
                  : `${Math.abs(summary.changePercent).toFixed(1)}%`}
              </span>
              <p>
                {summary.changeAmount === 0
                  ? "Igual ao mês anterior"
                  : `${formatCurrency(Math.abs(summary.changeAmount), currency)} face ao mês anterior`}
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
              <p className="eyebrow">Estado do mês</p>
              <h2 id="month-pulse-title">{monthPulse.title}</h2>
              <p>{monthPulse.description}</p>
            </div>
            {monthPulse.usage !== null ? (
              <div className="month-pulse__budget">
                <div>
                  <span>Orçamento acompanhado</span>
                  <strong>
                    {formatCurrency(monthPulse.spent, currency)} /{" "}
                    {formatCurrency(monthPulse.limit, currency)}
                  </strong>
                </div>
                <div
                  className="month-pulse__bar"
                  role="progressbar"
                  aria-label="Utilização do orçamento acompanhado"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.min(100, Math.round(monthPulse.usage))}
                >
                  <span style={{ width: `${Math.min(100, monthPulse.usage)}%` }} />
                </div>
                <small>{monthPulse.usage.toFixed(0)}% utilizado</small>
              </div>
            ) : (
              <a className="text-button month-pulse__action" href="#budgets-title">
                Definir limites
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
                  <p className="eyebrow">Distribuição</p>
                  <h2 id="categories-chart-title">Por categoria</h2>
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
                  title="Sem despesas neste mês"
                  description="As categorias aparecerão aqui quando existirem movimentos."
                />
              )}
            </section>
            <section
              className="dashboard-panel dashboard-panel--trend"
              aria-labelledby="trend-chart-title"
            >
              <div className="section-heading">
                <div>
                  <p className="eyebrow">Últimos 6 meses</p>
                  <h2 id="trend-chart-title">Evolução mensal</h2>
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
                  <TrendTable data={trendData} currency={currency} />
                </>
              ) : (
                <EmptyState
                  title="Tendência indisponível"
                  description="São necessários movimentos para construir a série mensal."
                />
              )}
            </section>
          </div>

          <SpendingHeatmap month={selectedMonth} byDay={summary.byDay ?? []} currency={currency} />

          <section className="dashboard-section" aria-labelledby="levels-title">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Sinais</p>
                <h2 id="levels-title">Níveis de gasto</h2>
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
                title="Dados insuficientes"
                description="Quando houver histórico, avaliamos o ritmo de cada categoria."
              />
            )}
          </section>

          <section className="dashboard-section dashboard-budgets" aria-labelledby="budgets-title">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Limites mensais</p>
                <h2 id="budgets-title">Orçamentos por categoria</h2>
              </div>
            </div>
            <div className="budgets-layout">
              <form className="budget-create" onSubmit={saveBudget}>
                <label className="field">
                  <span>Categoria</span>
                  <select
                    value={newCategoryId}
                    onChange={(event) => setNewCategoryId(event.target.value)}
                  >
                    <option value="">Escolher categoria</option>
                    {unbudgetedCategories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>Limite por mês</span>
                  <input
                    inputMode="decimal"
                    value={newLimit}
                    onChange={(event) => setNewLimit(event.target.value)}
                    placeholder="0,00"
                  />
                </label>
                <button
                  className="button button--accent"
                  disabled={saving || !unbudgetedCategories.length}
                  type="submit"
                >
                  {saving ? (
                    <Spinner label="A guardar" />
                  ) : (
                    <>
                      <Plus aria-hidden="true" /> Definir limite
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
                            inputMode="decimal"
                            value={editingLimit}
                            onChange={(event) => setEditingLimit(event.target.value)}
                          />
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
                    title="Sem limites definidos"
                    description="Defina um orçamento para receber sinais mais precisos."
                  />
                )}
              </div>
            </div>
          </section>
        </>
      )}
      <ConfirmDialog
        open={Boolean(budgetDeleteTarget)}
        title="Remover este orçamento?"
        description={
          budgetDeleteTarget
            ? `O limite mensal de “${budgetDeleteTarget.category.name}” será removido.`
            : ""
        }
        confirmLabel="Remover orçamento"
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
  return (
    <details className="chart-summary">
      <summary>Ver resumo acessível por categoria</summary>
      <table>
        <thead>
          <tr>
            <th>Categoria</th>
            <th>Valor</th>
            <th>Percentagem</th>
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
}: {
  data: Array<{ month: string; total: number }>;
  currency: string;
}) {
  return (
    <details className="chart-summary">
      <summary>Ver resumo acessível da tendência</summary>
      <table>
        <thead>
          <tr>
            <th>Mês</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          {data.map((item) => (
            <tr key={item.month}>
              <td>{monthLabel(item.month)}</td>
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
