import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  Bell,
  CalendarDays,
  CalendarClock,
  CheckCircle2,
  CircleDollarSign,
  CreditCard,
  Landmark,
  Pause,
  Play,
  Plus,
  Repeat2,
  Target,
  Trash2,
} from "lucide-react";
import {
  accountApi,
  analyticsApi,
  categoryApi,
  debtApi,
  incomeApi,
  recurringExpenseApi,
  recurringIncomeApi,
  savingsGoalApi,
} from "../api/resources";
import { errorMessage } from "../api/client";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { NoticeToast } from "../components/NoticeToast";
import { EmptyState, ErrorState, LoadingState, Spinner } from "../components/States";
import { PageHeader } from "../components/PageHeader";
import { CategoryIcon } from "../components/CategoryIcon";
import { useAuth } from "../auth/AuthContext";
import type {
  AnalyticsSummary,
  Category,
  Debt,
  FinancialAccount,
  Income,
  RecurringExpense,
  RecurringIncome,
  SavingsGoal,
} from "../types";
import { formatCurrency, formatDate, parseSignedMoney, todayInputValue } from "../utils/format";

type DeleteTarget = {
  type: "income" | "goal" | "recurring" | "recurringIncome" | "debt";
  id: string;
  label: string;
} | null;

const initialIncome = {
  description: "",
  source: "",
  amount: "",
  date: todayInputValue(),
  accountId: "",
};
const initialGoal = { name: "", targetAmount: "", currentAmount: "", targetDate: "" };
const initialRecurring = {
  description: "",
  location: "",
  amount: "",
  categoryId: "",
  accountId: "",
  dayOfMonth: "",
};
const initialRecurringIncome = {
  description: "",
  source: "",
  amount: "",
  accountId: "",
  dayOfMonth: "",
};
const initialDebt = {
  name: "",
  lender: "",
  currentBalance: "",
  annualInterestRate: "",
  monthlyPayment: "",
  nextPaymentDate: "",
};

function currentMonth() {
  return todayInputValue().slice(0, 7);
}

function numberFromInput(value: string) {
  return parseSignedMoney(value);
}

function dateOnly(value: string | null | undefined) {
  return value ? value.slice(0, 10) : "";
}

function daysUntil(value: string) {
  const target = new Date(`${dateOnly(value)}T00:00:00Z`).getTime();
  const now = new Date(`${todayInputValue()}T00:00:00Z`).getTime();
  return Math.round((target - now) / 86_400_000);
}

function dueCopy(days: number) {
  if (days < 0) return `Em atraso há ${Math.abs(days)} ${Math.abs(days) === 1 ? "dia" : "dias"}`;
  if (days === 0) return "Vence hoje";
  if (days === 1) return "Vence amanhã";
  return `Vence em ${days} dias`;
}

type CalendarItem = {
  id: string;
  date: string;
  kind: "expense" | "income" | "debt" | "goal";
  title: string;
  detail: string;
  amount?: number;
};

export function PlanningPage() {
  const { user } = useAuth();
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [accounts, setAccounts] = useState<FinancialAccount[]>([]);
  const [incomes, setIncomes] = useState<Income[]>([]);
  const [goals, setGoals] = useState<SavingsGoal[]>([]);
  const [recurring, setRecurring] = useState<RecurringExpense[]>([]);
  const [recurringIncomes, setRecurringIncomes] = useState<RecurringIncome[]>([]);
  const [debts, setDebts] = useState<Debt[]>([]);
  const [goalProgress, setGoalProgress] = useState<Record<string, string>>({});
  const [debtBalances, setDebtBalances] = useState<Record<string, string>>({});
  const [incomeForm, setIncomeForm] = useState(initialIncome);
  const [goalForm, setGoalForm] = useState(initialGoal);
  const [recurringForm, setRecurringForm] = useState(initialRecurring);
  const [recurringIncomeForm, setRecurringIncomeForm] = useState(initialRecurringIncome);
  const [debtForm, setDebtForm] = useState(initialDebt);
  const [notificationPermission, setNotificationPermission] = useState<
    NotificationPermission | "unsupported"
  >(() => (typeof Notification === "undefined" ? "unsupported" : Notification.permission));
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError("");
    try {
      const [
        nextSummary,
        nextCategories,
        nextAccounts,
        nextIncomes,
        nextGoals,
        nextRecurring,
        nextRecurringIncomes,
        nextDebts,
      ] = await Promise.all([
        analyticsApi.summary(currentMonth()),
        categoryApi.list(),
        accountApi.list(),
        incomeApi.list(),
        savingsGoalApi.list(),
        recurringExpenseApi.list(),
        recurringIncomeApi.list(),
        debtApi.list(),
      ]);
      setSummary(nextSummary);
      setCategories(nextCategories);
      setAccounts(nextAccounts);
      setIncomes(nextIncomes);
      setGoals(nextGoals);
      setRecurring(nextRecurring);
      setRecurringIncomes(nextRecurringIncomes);
      setDebts(nextDebts);
      setGoalProgress(
        Object.fromEntries(nextGoals.map((goal) => [goal.id, String(goal.currentAmount)])),
      );
      setDebtBalances(
        Object.fromEntries(nextDebts.map((debt) => [debt.id, String(debt.currentBalance)])),
      );
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const currency = user?.currency || summary?.currency || "EUR";
  const monthlyIncome = useMemo(
    () =>
      incomes
        .filter((income) => dateOnly(income.date).startsWith(currentMonth()))
        .reduce((total, income) => total + income.amount, 0),
    [incomes],
  );
  const monthlyExpenses = summary?.total || 0;
  const monthlyAvailable = monthlyIncome - monthlyExpenses;
  const totalAccountBalance = useMemo(
    () =>
      accounts.reduce(
        (total, account) => total + (account.currentBalance ?? account.openingBalance),
        0,
      ),
    [accounts],
  );
  const upcoming = useMemo(
    () =>
      recurring
        .filter((item) => item.isActive)
        .map((item) => ({ ...item, days: daysUntil(item.nextDueDate) }))
        .sort((a, b) => a.days - b.days),
    [recurring],
  );
  const upcomingIncomes = useMemo(
    () =>
      recurringIncomes
        .filter((item) => item.isActive)
        .map((item) => ({ ...item, days: daysUntil(item.nextDueDate) }))
        .sort((a, b) => a.days - b.days),
    [recurringIncomes],
  );
  const calendarItems = useMemo<CalendarItem[]>(() => {
    const horizon = 45;
    const entries: CalendarItem[] = [
      ...upcoming
        .filter((item) => item.days <= horizon)
        .map((item) => ({
          id: `expense-${item.id}`,
          date: item.nextDueDate,
          kind: "expense" as const,
          title: item.description,
          detail: `Despesa recorrente · ${dueCopy(item.days)}`,
          amount: item.amount,
        })),
      ...upcomingIncomes
        .filter((item) => item.days <= horizon)
        .map((item) => ({
          id: `income-${item.id}`,
          date: item.nextDueDate,
          kind: "income" as const,
          title: item.description,
          detail: `Rendimento previsto · ${dueCopy(item.days)}`,
          amount: item.amount,
        })),
      ...debts
        .filter((debt) => debt.nextPaymentDate && daysUntil(debt.nextPaymentDate) <= horizon)
        .map((debt) => ({
          id: `debt-${debt.id}`,
          date: debt.nextPaymentDate!,
          kind: "debt" as const,
          title: debt.name,
          detail: `${debt.lender} · ${dueCopy(daysUntil(debt.nextPaymentDate!))}`,
          amount: debt.monthlyPayment,
        })),
      ...goals
        .filter(
          (goal) =>
            goal.targetDate &&
            goal.currentAmount < goal.targetAmount &&
            daysUntil(goal.targetDate) <= horizon,
        )
        .map((goal) => ({
          id: `goal-${goal.id}`,
          date: goal.targetDate!,
          kind: "goal" as const,
          title: goal.name,
          detail: `Meta · ${dueCopy(daysUntil(goal.targetDate!))}`,
        })),
    ];
    return entries.sort((left, right) => left.date.localeCompare(right.date));
  }, [debts, goals, upcoming, upcomingIncomes]);
  const alerts = useMemo(() => {
    const items: string[] = [];
    const overdueGoals = goals.filter(
      (goal) =>
        goal.targetDate && daysUntil(goal.targetDate) < 0 && goal.currentAmount < goal.targetAmount,
    );
    const urgentPayments = upcoming.filter((item) => item.days <= 3);
    const urgentIncome = upcomingIncomes.filter((item) => item.days <= 3);
    const urgentDebts = debts.filter(
      (debt) => debt.nextPaymentDate && daysUntil(debt.nextPaymentDate) <= 3,
    );
    if (overdueGoals.length)
      items.push(
        `${overdueGoals.length} ${overdueGoals.length === 1 ? "meta está" : "metas estão"} fora do prazo.`,
      );
    if (urgentPayments.length)
      items.push(
        `${urgentPayments.length} ${urgentPayments.length === 1 ? "pagamento vence" : "pagamentos vencem"} nos próximos 3 dias.`,
      );
    if (monthlyIncome > 0 && monthlyAvailable < 0)
      items.push("As despesas deste mês já superam os rendimentos registados.");
    if (urgentIncome.length)
      items.push(
        `${urgentIncome.length} rendimento${urgentIncome.length === 1 ? "" : "s"} previsto${urgentIncome.length === 1 ? "" : "s"} para os próximos 3 dias.`,
      );
    if (urgentDebts.length)
      items.push(
        `${urgentDebts.length} ${urgentDebts.length === 1 ? "prestação de dívida vence" : "prestações de dívidas vencem"} nos próximos 3 dias.`,
      );
    return items;
  }, [debts, goals, monthlyAvailable, monthlyIncome, upcoming, upcomingIncomes]);

  useEffect(() => {
    if (notificationPermission !== "granted" || !alerts.length) return;
    const key = `expensesnap-planning-alert-${todayInputValue()}-${alerts[0]}`;
    try {
      if (sessionStorage.getItem(key)) return;
      new Notification("ExpenseSnap", { body: alerts[0] });
      sessionStorage.setItem(key, "sent");
    } catch {
      // Browser notifications are optional; the visible alert remains available.
    }
  }, [alerts, notificationPermission]);

  async function createIncome(event: FormEvent) {
    event.preventDefault();
    const amount = numberFromInput(incomeForm.amount);
    if (
      !incomeForm.description.trim() ||
      !incomeForm.date ||
      !Number.isFinite(amount) ||
      amount <= 0
    )
      return;
    setIsSaving(true);
    try {
      const created = await incomeApi.create({
        description: incomeForm.description,
        source: incomeForm.source || undefined,
        amount,
        date: incomeForm.date,
        accountId: incomeForm.accountId || null,
      });
      setIncomes((items) => [created, ...items]);
      setIncomeForm(initialIncome);
      setNotice("Rendimento registado.");
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setIsSaving(false);
    }
  }

  async function createGoal(event: FormEvent) {
    event.preventDefault();
    const targetAmount = numberFromInput(goalForm.targetAmount);
    const currentAmount = goalForm.currentAmount ? numberFromInput(goalForm.currentAmount) : 0;
    if (
      !goalForm.name.trim() ||
      !Number.isFinite(targetAmount) ||
      targetAmount <= 0 ||
      !Number.isFinite(currentAmount) ||
      currentAmount < 0
    )
      return;
    setIsSaving(true);
    try {
      const created = await savingsGoalApi.create({
        name: goalForm.name,
        targetAmount,
        currentAmount,
        targetDate: goalForm.targetDate || undefined,
      });
      setGoals((items) =>
        [...items, created].sort((a, b) =>
          (a.targetDate || "9999").localeCompare(b.targetDate || "9999"),
        ),
      );
      setGoalProgress((items) => ({ ...items, [created.id]: String(created.currentAmount) }));
      setGoalForm(initialGoal);
      setNotice("Meta criada.");
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setIsSaving(false);
    }
  }

  async function createRecurring(event: FormEvent) {
    event.preventDefault();
    const amount = numberFromInput(recurringForm.amount);
    const dayOfMonth = Number(recurringForm.dayOfMonth);
    if (
      !recurringForm.description.trim() ||
      !recurringForm.location.trim() ||
      !recurringForm.categoryId ||
      !Number.isFinite(amount) ||
      amount <= 0 ||
      !Number.isInteger(dayOfMonth) ||
      dayOfMonth < 1 ||
      dayOfMonth > 31
    )
      return;
    setIsSaving(true);
    try {
      const created = await recurringExpenseApi.create({
        ...recurringForm,
        amount,
        dayOfMonth,
        accountId: recurringForm.accountId || null,
      });
      setRecurring((items) =>
        [...items, created].sort((a, b) => a.nextDueDate.localeCompare(b.nextDueDate)),
      );
      setRecurringForm(initialRecurring);
      setNotice("Despesa recorrente agendada.");
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setIsSaving(false);
    }
  }

  async function createRecurringIncome(event: FormEvent) {
    event.preventDefault();
    const amount = numberFromInput(recurringIncomeForm.amount);
    const dayOfMonth = Number(recurringIncomeForm.dayOfMonth);
    if (
      !recurringIncomeForm.description.trim() ||
      !Number.isFinite(amount) ||
      amount <= 0 ||
      !Number.isInteger(dayOfMonth) ||
      dayOfMonth < 1 ||
      dayOfMonth > 31
    )
      return;
    setIsSaving(true);
    try {
      const created = await recurringIncomeApi.create({
        description: recurringIncomeForm.description,
        source: recurringIncomeForm.source || undefined,
        amount,
        dayOfMonth,
        accountId: recurringIncomeForm.accountId || null,
      });
      setRecurringIncomes((items) =>
        [...items, created].sort((a, b) => a.nextDueDate.localeCompare(b.nextDueDate)),
      );
      setRecurringIncomeForm(initialRecurringIncome);
      setNotice("Rendimento recorrente agendado.");
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setIsSaving(false);
    }
  }

  async function recordRecurringIncome(item: RecurringIncome) {
    setIsSaving(true);
    try {
      const updated = await recurringIncomeApi.record(item.id);
      setRecurringIncomes((items) =>
        items.map((current) => (current.id === updated.id ? updated : current)),
      );
      setNotice(`Recebimento de ${item.description} registado.`);
      void load();
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setIsSaving(false);
    }
  }

  async function toggleRecurringIncome(item: RecurringIncome) {
    setIsSaving(true);
    try {
      const updated = await recurringIncomeApi.update(item.id, { isActive: !item.isActive });
      setRecurringIncomes((items) =>
        items.map((current) => (current.id === updated.id ? updated : current)),
      );
      setNotice(
        item.isActive
          ? "Rendimento recorrente colocado em pausa."
          : "Rendimento recorrente reativado.",
      );
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setIsSaving(false);
    }
  }

  async function createDebt(event: FormEvent) {
    event.preventDefault();
    const currentBalance = numberFromInput(debtForm.currentBalance);
    const annualInterestRate = numberFromInput(debtForm.annualInterestRate);
    const monthlyPayment = numberFromInput(debtForm.monthlyPayment);
    if (
      !debtForm.name.trim() ||
      !debtForm.lender.trim() ||
      !Number.isFinite(currentBalance) ||
      currentBalance < 0 ||
      !Number.isFinite(annualInterestRate) ||
      annualInterestRate < 0 ||
      !Number.isFinite(monthlyPayment) ||
      monthlyPayment <= 0
    ) {
      if (Number.isFinite(monthlyPayment) && monthlyPayment <= 0)
        setError("A prestação mensal deve ser superior a zero.");
      return;
    }
    setIsSaving(true);
    try {
      const created = await debtApi.create({
        name: debtForm.name,
        lender: debtForm.lender,
        currentBalance,
        annualInterestRate,
        monthlyPayment,
        nextPaymentDate: debtForm.nextPaymentDate || null,
      });
      setDebts((items) => [...items, created]);
      setDebtBalances((items) => ({ ...items, [created.id]: String(created.currentBalance) }));
      setDebtForm(initialDebt);
      setNotice("Dívida adicionada ao plano.");
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setIsSaving(false);
    }
  }

  async function saveDebtBalance(debt: Debt) {
    const currentBalance = numberFromInput(debtBalances[debt.id] || "");
    if (!Number.isFinite(currentBalance) || currentBalance < 0) return;
    setIsSaving(true);
    try {
      const updated = await debtApi.update(debt.id, { currentBalance });
      setDebts((items) => items.map((item) => (item.id === updated.id ? updated : item)));
      setDebtBalances((items) => ({ ...items, [updated.id]: String(updated.currentBalance) }));
      setNotice("Saldo da dívida atualizado.");
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setIsSaving(false);
    }
  }

  async function enableNotifications() {
    if (typeof Notification === "undefined") {
      setNotice("Este navegador não suporta notificações.");
      return;
    }
    const permission = await Notification.requestPermission();
    setNotificationPermission(permission);
    setNotice(
      permission === "granted"
        ? "Alertas do navegador ativados."
        : "Pode continuar a ver todos os alertas nesta página.",
    );
  }

  async function saveGoalProgress(goal: SavingsGoal) {
    const currentAmount = numberFromInput(goalProgress[goal.id] || "");
    if (!Number.isFinite(currentAmount) || currentAmount < 0) return;
    setIsSaving(true);
    try {
      const updated = await savingsGoalApi.update(goal.id, { currentAmount });
      setGoals((items) => items.map((item) => (item.id === updated.id ? updated : item)));
      setGoalProgress((items) => ({ ...items, [updated.id]: String(updated.currentAmount) }));
      setNotice("Progresso da meta atualizado.");
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setIsSaving(false);
    }
  }

  async function recordRecurring(item: RecurringExpense) {
    setIsSaving(true);
    try {
      const updated = await recurringExpenseApi.record(item.id);
      setRecurring((items) =>
        items.map((current) => (current.id === updated.id ? updated : current)),
      );
      setNotice(`“${item.description}” foi registada como paga.`);
      void load();
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setIsSaving(false);
    }
  }

  async function toggleRecurring(item: RecurringExpense) {
    setIsSaving(true);
    try {
      const updated = await recurringExpenseApi.update(item.id, { isActive: !item.isActive });
      setRecurring((items) =>
        items.map((current) => (current.id === updated.id ? updated : current)),
      );
      setNotice(item.isActive ? "Recorrência colocada em pausa." : "Recorrência reativada.");
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setIsSaving(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setIsSaving(true);
    try {
      if (deleteTarget.type === "income") {
        await incomeApi.remove(deleteTarget.id);
        setIncomes((items) => items.filter((item) => item.id !== deleteTarget.id));
      }
      if (deleteTarget.type === "goal") {
        await savingsGoalApi.remove(deleteTarget.id);
        setGoals((items) => items.filter((item) => item.id !== deleteTarget.id));
      }
      if (deleteTarget.type === "recurring") {
        await recurringExpenseApi.remove(deleteTarget.id);
        setRecurring((items) => items.filter((item) => item.id !== deleteTarget.id));
      }
      if (deleteTarget.type === "recurringIncome") {
        await recurringIncomeApi.remove(deleteTarget.id);
        setRecurringIncomes((items) => items.filter((item) => item.id !== deleteTarget.id));
      }
      if (deleteTarget.type === "debt") {
        await debtApi.remove(deleteTarget.id);
        setDebts((items) => items.filter((item) => item.id !== deleteTarget.id));
      }
      setNotice("Registo removido.");
      setDeleteTarget(null);
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading)
    return (
      <div className="page">
        <LoadingState label="A preparar o seu plano financeiro" />
      </div>
    );
  if (error && !summary)
    return (
      <div className="page">
        <ErrorState message={error} onRetry={() => void load()} />
      </div>
    );

  return (
    <div className="page page--planning">
      <NoticeToast message={notice} onClose={() => setNotice("")} />
      <PageHeader
        eyebrow="Plano financeiro"
        title="Planeie antes de gastar"
        description="Ligue rendimentos, metas e compromissos mensais para saber o que está realmente disponível."
      />
      <div className="planning-header-actions">
        <Link className="button button--secondary" to="/accounts">
          <Landmark aria-hidden="true" /> Contas e cartoes
        </Link>
        {notificationPermission !== "unsupported" && notificationPermission !== "granted" && (
          <button
            className="button button--secondary"
            type="button"
            onClick={() => void enableNotifications()}
          >
            <Bell aria-hidden="true" /> Ativar alertas
          </button>
        )}
      </div>
      {error && (
        <div className="form-alert form-alert--page" role="alert">
          {error}
        </div>
      )}

      <section className="planning-overview" aria-label="Resumo financeiro do mês">
        <article>
          <span>
            <CircleDollarSign aria-hidden="true" /> Rendimentos
          </span>
          <strong>{formatCurrency(monthlyIncome, currency)}</strong>
          <small>Registados este mês</small>
        </article>
        <article>
          <span>
            <Landmark aria-hidden="true" /> Despesas
          </span>
          <strong>{formatCurrency(monthlyExpenses, currency)}</strong>
          <small>Registadas este mês</small>
        </article>
        <article
          className={
            monthlyAvailable < 0
              ? "planning-overview__available planning-overview__available--negative"
              : "planning-overview__available"
          }
        >
          <span>
            <CheckCircle2 aria-hidden="true" /> Disponível
          </span>
          <strong>{formatCurrency(monthlyAvailable, currency)}</strong>
          <small>Rendimentos menos despesas</small>
        </article>
        <article>
          <span>
            <CreditCard aria-hidden="true" /> Saldo nas contas
          </span>
          <strong>{formatCurrency(totalAccountBalance, currency)}</strong>
          <small>
            {accounts.length
              ? `${accounts.length} conta${accounts.length === 1 ? "" : "s"} ligada${accounts.length === 1 ? "" : "s"}`
              : "Adicione uma conta para acompanhar"}
          </small>
        </article>
      </section>

      {alerts.length > 0 && (
        <section className="planning-alerts" aria-label="Alertas do plano">
          <AlertTriangle aria-hidden="true" />
          <div>
            <strong>Vale a pena olhar para isto</strong>
            {alerts.map((alert) => (
              <p key={alert}>{alert}</p>
            ))}
          </div>
        </section>
      )}

      <section className="planning-calendar" aria-labelledby="calendar-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Próximos 45 dias</p>
            <h2 id="calendar-title">Calendário financeiro</h2>
          </div>
          <CalendarDays aria-hidden="true" />
        </div>
        {calendarItems.length ? (
          <ol className="planning-calendar__list">
            {calendarItems.slice(0, 10).map((item) => (
              <li
                className={`planning-calendar__item planning-calendar__item--${item.kind}`}
                key={item.id}
              >
                <time dateTime={dateOnly(item.date)}>
                  <b>{dateOnly(item.date).slice(8)}</b>
                  <span>
                    {new Intl.DateTimeFormat("pt-PT", { month: "short" })
                      .format(new Date(item.date))
                      .replace(".", "")}
                  </span>
                </time>
                <div>
                  <strong>{item.title}</strong>
                  <small>{item.detail}</small>
                </div>
                {item.amount !== undefined && (
                  <b
                    className={
                      item.kind === "income"
                        ? "calendar-amount calendar-amount--income"
                        : "calendar-amount"
                    }
                  >
                    {item.kind === "income" ? "+" : "-"}
                    {formatCurrency(item.amount, currency)}
                  </b>
                )}
              </li>
            ))}
          </ol>
        ) : (
          <p className="planning-calendar__empty">
            Adicione recorrências, dívidas ou metas com prazo para ver o seu calendário financeiro.
          </p>
        )}
      </section>

      <div className="planning-grid">
        <section className="planning-panel planning-panel--goals" aria-labelledby="goals-title">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Poupança</p>
              <h2 id="goals-title">Metas</h2>
            </div>
            <Target aria-hidden="true" />
          </div>
          <details className="planning-disclosure" open={goals.length === 0}>
            <summary>
              <span>Adicionar meta</span>
              <small>Definir um valor e, se quiser, uma data.</small>
            </summary>
            <form className="planning-form" onSubmit={createGoal}>
              <label className="field">
                <span>Nome da meta</span>
                <input
                  value={goalForm.name}
                  onChange={(event) =>
                    setGoalForm((form) => ({ ...form, name: event.target.value }))
                  }
                  placeholder="Ex.: Fundo de emergência"
                  maxLength={100}
                />
              </label>
              <div className="planning-form__split">
                <label className="field">
                  <span>Objetivo</span>
                  <input
                    inputMode="decimal"
                    value={goalForm.targetAmount}
                    onChange={(event) =>
                      setGoalForm((form) => ({ ...form, targetAmount: event.target.value }))
                    }
                    placeholder="3 000"
                  />
                </label>
                <label className="field">
                  <span>Já poupado</span>
                  <input
                    inputMode="decimal"
                    value={goalForm.currentAmount}
                    onChange={(event) =>
                      setGoalForm((form) => ({ ...form, currentAmount: event.target.value }))
                    }
                    placeholder="0"
                  />
                </label>
              </div>
              <label className="field">
                <span>
                  Data-alvo <em>opcional</em>
                </span>
                <input
                  type="date"
                  value={goalForm.targetDate}
                  onChange={(event) =>
                    setGoalForm((form) => ({ ...form, targetDate: event.target.value }))
                  }
                />
              </label>
              <button className="button button--accent" type="submit" disabled={isSaving}>
                {isSaving ? (
                  <Spinner label="A guardar" />
                ) : (
                  <>
                    <Plus aria-hidden="true" /> Criar meta
                  </>
                )}
              </button>
            </form>
          </details>
          <div className="planning-list">
            {goals.length ? (
              goals.map((goal) => {
                const ratio = Math.min(100, (goal.currentAmount / goal.targetAmount) * 100);
                const overdue = Boolean(
                  goal.targetDate &&
                  daysUntil(goal.targetDate) < 0 &&
                  goal.currentAmount < goal.targetAmount,
                );
                return (
                  <article className="goal-card" key={goal.id}>
                    <div className="goal-card__header">
                      <span className="goal-card__icon">
                        <Target aria-hidden="true" />
                      </span>
                      <div>
                        <h3>{goal.name}</h3>
                        <p>
                          {goal.targetDate
                            ? `${overdue ? "Prazo ultrapassado" : `Até ${formatDate(goal.targetDate)}`}`
                            : "Sem data-alvo"}
                        </p>
                      </div>
                      <button
                        className="icon-button icon-button--danger"
                        type="button"
                        aria-label={`Remover meta ${goal.name}`}
                        onClick={() =>
                          setDeleteTarget({ type: "goal", id: goal.id, label: goal.name })
                        }
                      >
                        <Trash2 aria-hidden="true" />
                      </button>
                    </div>
                    <div className="goal-card__amount">
                      <strong>{formatCurrency(goal.currentAmount, currency)}</strong>
                      <span>de {formatCurrency(goal.targetAmount, currency)}</span>
                    </div>
                    <div
                      className="goal-card__progress"
                      role="progressbar"
                      aria-label={`Progresso da meta ${goal.name}`}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={Math.round(ratio)}
                    >
                      <span style={{ width: `${ratio}%` }} />
                    </div>
                    <div className="goal-card__update">
                      <label>
                        <span className="sr-only">Valor poupado em {goal.name}</span>
                        <input
                          inputMode="decimal"
                          value={goalProgress[goal.id] || ""}
                          onChange={(event) =>
                            setGoalProgress((items) => ({
                              ...items,
                              [goal.id]: event.target.value,
                            }))
                          }
                        />
                      </label>
                      <button
                        className="button button--secondary button--small"
                        type="button"
                        disabled={isSaving}
                        onClick={() => void saveGoalProgress(goal)}
                      >
                        Atualizar
                      </button>
                    </div>
                  </article>
                );
              })
            ) : (
              <EmptyState
                title="Ainda sem metas"
                description="Crie uma meta com valor e prazo para acompanhar a sua poupança."
              />
            )}
          </div>
        </section>

        <section className="planning-panel" aria-labelledby="income-title">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Entradas</p>
              <h2 id="income-title">Rendimentos</h2>
            </div>
            <CircleDollarSign aria-hidden="true" />
          </div>
          <details className="planning-disclosure" open={incomes.length === 0}>
            <summary>
              <span>Registar rendimento</span>
              <small>Adicionar uma entrada recebida.</small>
            </summary>
            <form className="planning-form" onSubmit={createIncome}>
              <label className="field">
                <span>
                  Conta <em>opcional</em>
                </span>
                <select
                  value={incomeForm.accountId}
                  onChange={(event) =>
                    setIncomeForm((form) => ({ ...form, accountId: event.target.value }))
                  }
                >
                  <option value="">Sem conta associada</option>
                  {accounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Descrição</span>
                <input
                  value={incomeForm.description}
                  onChange={(event) =>
                    setIncomeForm((form) => ({ ...form, description: event.target.value }))
                  }
                  placeholder="Ex.: Salário"
                  maxLength={160}
                />
              </label>
              <div className="planning-form__split">
                <label className="field">
                  <span>Valor</span>
                  <input
                    inputMode="decimal"
                    value={incomeForm.amount}
                    onChange={(event) =>
                      setIncomeForm((form) => ({ ...form, amount: event.target.value }))
                    }
                    placeholder="1 500"
                  />
                </label>
                <label className="field">
                  <span>Data</span>
                  <input
                    type="date"
                    value={incomeForm.date}
                    onChange={(event) =>
                      setIncomeForm((form) => ({ ...form, date: event.target.value }))
                    }
                  />
                </label>
              </div>
              <label className="field">
                <span>
                  Origem <em>opcional</em>
                </span>
                <input
                  value={incomeForm.source}
                  onChange={(event) =>
                    setIncomeForm((form) => ({ ...form, source: event.target.value }))
                  }
                  placeholder="Ex.: Empresa"
                  maxLength={120}
                />
              </label>
              <button className="button button--primary" type="submit" disabled={isSaving}>
                {isSaving ? (
                  <Spinner label="A guardar" />
                ) : (
                  <>
                    <Plus aria-hidden="true" /> Registar rendimento
                  </>
                )}
              </button>
            </form>
          </details>
          <div className="planning-list planning-list--compact">
            {incomes.length ? (
              incomes.slice(0, 6).map((income) => (
                <article className="planning-row" key={income.id}>
                  <span className="planning-row__icon">
                    <CircleDollarSign aria-hidden="true" />
                  </span>
                  <div>
                    <h3>{income.description}</h3>
                    <p>
                      {income.source || formatDate(income.date)}
                      {income.source ? ` · ${formatDate(income.date)}` : ""}
                    </p>
                  </div>
                  <strong>{formatCurrency(income.amount, currency)}</strong>
                  <button
                    className="icon-button icon-button--danger"
                    type="button"
                    aria-label={`Remover rendimento ${income.description}`}
                    onClick={() =>
                      setDeleteTarget({ type: "income", id: income.id, label: income.description })
                    }
                  >
                    <Trash2 aria-hidden="true" />
                  </button>
                </article>
              ))
            ) : (
              <EmptyState
                title="Sem rendimentos registados"
                description="Registe entradas para calcular o valor disponível deste mês."
              />
            )}
          </div>
          <div className="planning-subsection">
            <div className="section-heading section-heading--compact">
              <div>
                <p className="eyebrow">Previsível</p>
                <h3>Rendimentos recorrentes</h3>
              </div>
              <Repeat2 aria-hidden="true" />
            </div>
            <details
              className="planning-disclosure planning-disclosure--subtle"
              open={recurringIncomes.length === 0}
            >
              <summary>
                <span>Agendar rendimento recorrente</span>
                <small>Salário, bolsa ou rendimento mensal.</small>
              </summary>
              <form
                className="planning-form planning-form--recurring-income"
                onSubmit={createRecurringIncome}
              >
                <label className="field">
                  <span>Descrição</span>
                  <input
                    value={recurringIncomeForm.description}
                    onChange={(event) =>
                      setRecurringIncomeForm((form) => ({
                        ...form,
                        description: event.target.value,
                      }))
                    }
                    placeholder="Ex.: Salário"
                    maxLength={160}
                  />
                </label>
                <label className="field">
                  <span>
                    Origem <em>opcional</em>
                  </span>
                  <input
                    value={recurringIncomeForm.source}
                    onChange={(event) =>
                      setRecurringIncomeForm((form) => ({ ...form, source: event.target.value }))
                    }
                    placeholder="Ex.: Empresa"
                    maxLength={120}
                  />
                </label>
                <label className="field">
                  <span>Valor</span>
                  <input
                    inputMode="decimal"
                    value={recurringIncomeForm.amount}
                    onChange={(event) =>
                      setRecurringIncomeForm((form) => ({ ...form, amount: event.target.value }))
                    }
                    placeholder="0,00"
                  />
                </label>
                <label className="field">
                  <span>Dia</span>
                  <input
                    inputMode="numeric"
                    min="1"
                    max="31"
                    value={recurringIncomeForm.dayOfMonth}
                    onChange={(event) =>
                      setRecurringIncomeForm((form) => ({
                        ...form,
                        dayOfMonth: event.target.value,
                      }))
                    }
                    placeholder="Ex.: 25"
                  />
                </label>
                <label className="field">
                  <span>
                    Conta <em>opcional</em>
                  </span>
                  <select
                    value={recurringIncomeForm.accountId}
                    onChange={(event) =>
                      setRecurringIncomeForm((form) => ({ ...form, accountId: event.target.value }))
                    }
                  >
                    <option value="">Sem conta associada</option>
                    {accounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.name}
                      </option>
                    ))}
                  </select>
                </label>
                <button className="button button--secondary" type="submit" disabled={isSaving}>
                  {isSaving ? (
                    <Spinner label="A guardar" />
                  ) : (
                    <>
                      <Plus aria-hidden="true" /> Agendar
                    </>
                  )}
                </button>
              </form>
            </details>
            <div className="planning-list planning-list--compact">
              {recurringIncomes.length ? (
                recurringIncomes.map((item) => (
                  <article
                    className={`planning-row planning-row--income ${item.isActive ? "" : "planning-row--paused"}`}
                    key={item.id}
                  >
                    <span className="planning-row__icon">
                      <CircleDollarSign aria-hidden="true" />
                    </span>
                    <div>
                      <h3>{item.description}</h3>
                      <p>
                        {item.source || "Rendimento mensal"} · {item.account?.name || "Sem conta"}
                      </p>
                      <small>
                        {item.isActive
                          ? `${dueCopy(daysUntil(item.nextDueDate))} · ${formatDate(item.nextDueDate)}`
                          : "Em pausa"}
                      </small>
                    </div>
                    <strong>{formatCurrency(item.amount, currency)}</strong>
                    <div className="recurring-card__actions">
                      {item.isActive && (
                        <button
                          className="button button--primary button--small"
                          type="button"
                          disabled={isSaving}
                          onClick={() => void recordRecurringIncome(item)}
                        >
                          Recebido
                        </button>
                      )}
                      <button
                        className="icon-button"
                        type="button"
                        disabled={isSaving}
                        aria-label={
                          item.isActive
                            ? `Pausar ${item.description}`
                            : `Reativar ${item.description}`
                        }
                        onClick={() => void toggleRecurringIncome(item)}
                      >
                        {item.isActive ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
                      </button>
                      <button
                        className="icon-button icon-button--danger"
                        type="button"
                        disabled={isSaving}
                        aria-label={`Remover ${item.description}`}
                        onClick={() =>
                          setDeleteTarget({
                            type: "recurringIncome",
                            id: item.id,
                            label: item.description,
                          })
                        }
                      >
                        <Trash2 aria-hidden="true" />
                      </button>
                    </div>
                  </article>
                ))
              ) : (
                <p className="planning-subsection__empty">
                  Agende salário, bolsa ou rendas recebidas e confirme cada entrada quando a
                  receber.
                </p>
              )}
            </div>
          </div>
        </section>
      </div>

      <section
        className="planning-panel planning-panel--recurring"
        aria-labelledby="recurring-title"
      >
        <div className="section-heading">
          <div>
            <p className="eyebrow">Compromissos</p>
            <h2 id="recurring-title">Despesas recorrentes</h2>
          </div>
          <Repeat2 aria-hidden="true" />
        </div>
        <details className="planning-disclosure" open={recurring.length === 0}>
          <summary>
            <span>Agendar despesa recorrente</span>
            <small>Renda, seguro, subscrição ou outro pagamento mensal.</small>
          </summary>
          <form className="planning-form planning-form--recurring" onSubmit={createRecurring}>
            <label className="field">
              <span>
                Conta <em>opcional</em>
              </span>
              <select
                value={recurringForm.accountId}
                onChange={(event) =>
                  setRecurringForm((form) => ({ ...form, accountId: event.target.value }))
                }
              >
                <option value="">Sem conta associada</option>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Descrição</span>
              <input
                value={recurringForm.description}
                onChange={(event) =>
                  setRecurringForm((form) => ({ ...form, description: event.target.value }))
                }
                placeholder="Ex.: Renda"
                maxLength={160}
              />
            </label>
            <label className="field">
              <span>Local</span>
              <input
                value={recurringForm.location}
                onChange={(event) =>
                  setRecurringForm((form) => ({ ...form, location: event.target.value }))
                }
                placeholder="Ex.: Senhorio"
                maxLength={160}
              />
            </label>
            <label className="field">
              <span>Categoria</span>
              <select
                value={recurringForm.categoryId}
                onChange={(event) =>
                  setRecurringForm((form) => ({ ...form, categoryId: event.target.value }))
                }
              >
                <option value="">Escolher categoria</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Valor</span>
              <input
                inputMode="decimal"
                value={recurringForm.amount}
                onChange={(event) =>
                  setRecurringForm((form) => ({ ...form, amount: event.target.value }))
                }
                placeholder="0,00"
              />
            </label>
            <label className="field">
              <span>Dia do mês</span>
              <input
                inputMode="numeric"
                value={recurringForm.dayOfMonth}
                onChange={(event) =>
                  setRecurringForm((form) => ({ ...form, dayOfMonth: event.target.value }))
                }
                placeholder="Ex.: 1"
                min="1"
                max="31"
              />
            </label>
            <button
              className="button button--accent"
              type="submit"
              disabled={isSaving || !categories.length}
            >
              {isSaving ? (
                <Spinner label="A guardar" />
              ) : (
                <>
                  <Plus aria-hidden="true" /> Agendar
                </>
              )}
            </button>
          </form>
        </details>
        <div className="recurring-layout">
          <div className="planning-list">
            {recurring.length ? (
              recurring.map((item) => (
                <article
                  className={`recurring-card ${item.isActive ? "" : "recurring-card--paused"}`}
                  key={item.id}
                >
                  <span className="recurring-card__icon">
                    <CategoryIcon icon={item.category.icon} categoryName={item.category.name} />
                  </span>
                  <div>
                    <h3>{item.description}</h3>
                    <p>
                      {item.category.name} · {item.location}
                    </p>
                    <small>
                      <CalendarClock aria-hidden="true" />{" "}
                      {item.isActive
                        ? `${dueCopy(daysUntil(item.nextDueDate))} · ${formatDate(item.nextDueDate)}`
                        : "Em pausa"}
                    </small>
                  </div>
                  <strong>{formatCurrency(item.amount, currency)}</strong>
                  <div className="recurring-card__actions">
                    {item.isActive && (
                      <button
                        className="button button--primary button--small"
                        type="button"
                        disabled={isSaving}
                        onClick={() => void recordRecurring(item)}
                      >
                        Marcar paga
                      </button>
                    )}
                    <button
                      className="icon-button"
                      type="button"
                      disabled={isSaving}
                      aria-label={
                        item.isActive
                          ? `Pausar ${item.description}`
                          : `Reativar ${item.description}`
                      }
                      onClick={() => void toggleRecurring(item)}
                    >
                      {item.isActive ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
                    </button>
                    <button
                      className="icon-button icon-button--danger"
                      type="button"
                      disabled={isSaving}
                      aria-label={`Remover ${item.description}`}
                      onClick={() =>
                        setDeleteTarget({ type: "recurring", id: item.id, label: item.description })
                      }
                    >
                      <Trash2 aria-hidden="true" />
                    </button>
                  </div>
                </article>
              ))
            ) : (
              <EmptyState
                title="Sem despesas recorrentes"
                description="Agende renda, seguros ou subscrições para antecipar os próximos vencimentos."
              />
            )}
          </div>
          <aside className="upcoming-card">
            <p className="eyebrow">Próximos vencimentos</p>
            <h3>O que se aproxima</h3>
            {upcoming.length ? (
              <ol>
                {upcoming.slice(0, 5).map((item) => (
                  <li key={item.id}>
                    <span>{dateOnly(item.nextDueDate).slice(8)}</span>
                    <div>
                      <strong>{item.description}</strong>
                      <small>{dueCopy(item.days)}</small>
                    </div>
                    <b>{formatCurrency(item.amount, currency)}</b>
                  </li>
                ))}
              </ol>
            ) : (
              <p>Quando criar recorrências ativas, os vencimentos aparecem aqui.</p>
            )}
          </aside>
        </div>
      </section>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Remover este registo?"
        description={deleteTarget ? `“${deleteTarget.label}” será removido permanentemente.` : ""}
        confirmLabel="Remover"
        busy={isSaving}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => void confirmDelete()}
      />
      <section className="planning-panel planning-debts" aria-labelledby="debts-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Compromissos de longo prazo</p>
            <h2 id="debts-title">Dívidas</h2>
          </div>
          <CreditCard aria-hidden="true" />
        </div>
        <details className="planning-disclosure" open={debts.length === 0}>
          <summary>
            <span>Adicionar dívida</span>
            <small>Registe o saldo, a prestação e o próximo vencimento.</small>
          </summary>
          <form className="planning-form planning-form--debt" onSubmit={createDebt}>
            <label className="field">
              <span>Nome</span>
              <input
                value={debtForm.name}
                onChange={(event) => setDebtForm((form) => ({ ...form, name: event.target.value }))}
                placeholder="Ex.: Cartão de crédito"
                maxLength={100}
              />
            </label>
            <label className="field">
              <span>Credor</span>
              <input
                value={debtForm.lender}
                onChange={(event) =>
                  setDebtForm((form) => ({ ...form, lender: event.target.value }))
                }
                placeholder="Ex.: Banco"
                maxLength={100}
              />
            </label>
            <label className="field">
              <span>Saldo atual</span>
              <input
                inputMode="decimal"
                value={debtForm.currentBalance}
                onChange={(event) =>
                  setDebtForm((form) => ({ ...form, currentBalance: event.target.value }))
                }
                placeholder="0,00"
              />
            </label>
            <label className="field">
              <span>Juro anual (%)</span>
              <input
                inputMode="decimal"
                value={debtForm.annualInterestRate}
                onChange={(event) =>
                  setDebtForm((form) => ({ ...form, annualInterestRate: event.target.value }))
                }
                placeholder="0"
              />
            </label>
            <label className="field">
              <span>Prestação mensal</span>
              <input
                inputMode="decimal"
                value={debtForm.monthlyPayment}
                onChange={(event) =>
                  setDebtForm((form) => ({ ...form, monthlyPayment: event.target.value }))
                }
                placeholder="0,00"
              />
            </label>
            <label className="field">
              <span>
                Próximo vencimento <em>opcional</em>
              </span>
              <input
                type="date"
                value={debtForm.nextPaymentDate}
                onChange={(event) =>
                  setDebtForm((form) => ({ ...form, nextPaymentDate: event.target.value }))
                }
              />
            </label>
            <button className="button button--accent" type="submit" disabled={isSaving}>
              {isSaving ? (
                <Spinner label="A guardar" />
              ) : (
                <>
                  <Plus aria-hidden="true" /> Adicionar dívida
                </>
              )}
            </button>
          </form>
        </details>
        <div className="debt-grid">
          {debts.length ? (
            debts.map((debt) => (
              <article className="debt-card" key={debt.id}>
                <div className="debt-card__header">
                  <div>
                    <h3>{debt.name}</h3>
                    <p>{debt.lender}</p>
                  </div>
                  <button
                    className="icon-button icon-button--danger"
                    type="button"
                    aria-label={`Remover ${debt.name}`}
                    disabled={isSaving}
                    onClick={() => setDeleteTarget({ type: "debt", id: debt.id, label: debt.name })}
                  >
                    <Trash2 aria-hidden="true" />
                  </button>
                </div>
                <div className="debt-card__metrics">
                  <span>
                    <small>Saldo</small>
                    <strong>{formatCurrency(debt.currentBalance, currency)}</strong>
                  </span>
                  <span>
                    <small>Juro anual</small>
                    <strong>{debt.annualInterestRate}%</strong>
                  </span>
                  <span>
                    <small>Prestação</small>
                    <strong>{formatCurrency(debt.monthlyPayment, currency)}</strong>
                  </span>
                </div>
                <p className="debt-card__due">
                  {debt.nextPaymentDate
                    ? `${dueCopy(daysUntil(debt.nextPaymentDate))} · ${formatDate(debt.nextPaymentDate)}`
                    : "Sem data de vencimento"}
                </p>
                <div className="goal-card__update">
                  <label>
                    <span className="sr-only">Novo saldo de {debt.name}</span>
                    <input
                      inputMode="decimal"
                      value={debtBalances[debt.id] || ""}
                      onChange={(event) =>
                        setDebtBalances((items) => ({ ...items, [debt.id]: event.target.value }))
                      }
                    />
                  </label>
                  <button
                    className="button button--secondary button--small"
                    type="button"
                    disabled={isSaving}
                    onClick={() => void saveDebtBalance(debt)}
                  >
                    Atualizar saldo
                  </button>
                </div>
              </article>
            ))
          ) : (
            <EmptyState
              title="Sem dívidas registadas"
              description="Adicione empréstimos, cartões ou financiamentos para antecipar as prestações."
            />
          )}
        </div>
      </section>
    </div>
  );
}
