import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowRightLeft,
  Banknote,
  CreditCard,
  Landmark,
  PencilLine,
  Plus,
  RefreshCw,
  Trash2,
  WalletCards,
} from "lucide-react";
import { accountApi, openBankingApi } from "../api/resources";
import { errorMessage } from "../api/client";
import { BalanceCorrectionDialog } from "../components/BalanceCorrectionDialog";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { ErrorState, LoadingState, Spinner } from "../components/States";
import { NoticeToast } from "../components/NoticeToast";
import { PageHeader } from "../components/PageHeader";
import { useAuth } from "../auth/AuthContext";
import type {
  AccountTransfer,
  AccountType,
  BankConnectionSummary,
  FinancialAccount,
} from "../types";
import { formatCurrency, formatDate, parseSignedMoney, todayInputValue } from "../utils/format";

const initialAccount = {
  name: "",
  type: "current" as AccountType,
  openingBalance: "",
  creditLimit: "",
};
const initialTransfer = {
  fromAccountId: "",
  toAccountId: "",
  amount: "",
  description: "",
  date: todayInputValue(),
};
const SYNC_POLL_INTERVAL_MS = 1_500;

const accountLabels: Record<AccountType, string> = {
  current: "À ordem",
  savings: "Poupança",
  cash: "Dinheiro",
  credit_card: "Cartão de crédito",
  other: "Outra",
};

function amount(value: string) {
  return parseSignedMoney(value);
}

function isValidAccountBalance(value: string) {
  const parsed = parseSignedMoney(value);
  return Number.isFinite(parsed) && Math.abs(parsed) <= 9_999_999_999.99;
}

function isVisibleAccount(account: FinancialAccount) {
  if (account.source !== "bank") return true;
  return Boolean(account.connectionStatus) && account.connectionStatus !== "disconnected";
}

function AccountIcon({ type }: { type: AccountType }) {
  if (type === "credit_card") return <CreditCard aria-hidden="true" />;
  if (type === "cash") return <Banknote aria-hidden="true" />;
  if (type === "savings") return <WalletCards aria-hidden="true" />;
  return <Landmark aria-hidden="true" />;
}

export function AccountsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [accounts, setAccounts] = useState<FinancialAccount[]>([]);
  const [transfers, setTransfers] = useState<AccountTransfer[]>([]);
  const [connections, setConnections] = useState<BankConnectionSummary[]>([]);
  const [syncingConnectionId, setSyncingConnectionId] = useState<string | null>(null);
  const [pendingSyncJobs, setPendingSyncJobs] = useState<
    Array<{ connectionId: string; jobId: string }>
  >([]);
  const [accountForm, setAccountForm] = useState(initialAccount);
  const [transferForm, setTransferForm] = useState(initialTransfer);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<FinancialAccount | null>(null);
  const [balanceTarget, setBalanceTarget] = useState<FinancialAccount | null>(null);
  const [correctedBalance, setCorrectedBalance] = useState("");
  const [balanceError, setBalanceError] = useState("");
  const [accountErrors, setAccountErrors] = useState<{ name?: string; openingBalance?: string; creditLimit?: string }>(
    {},
  );
  const [transferErrors, setTransferErrors] = useState<{
    fromAccountId?: string;
    toAccountId?: string;
    amount?: string;
    date?: string;
  }>({});
  const accountNameRef = useRef<HTMLInputElement>(null);
  const accountBalanceRef = useRef<HTMLInputElement>(null);
  const accountLimitRef = useRef<HTMLInputElement>(null);
  const transferFromRef = useRef<HTMLSelectElement>(null);
  const transferToRef = useRef<HTMLSelectElement>(null);
  const transferAmountRef = useRef<HTMLInputElement>(null);
  const transferDateRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError("");
    try {
      const [nextAccounts, nextTransfers] = await Promise.all([
        accountApi.list(),
        accountApi.transfers(),
      ]);
      setAccounts(nextAccounts);
      setTransfers(nextTransfers);
      // As ligações só são necessárias para as contas ligadas; uma falha não
      // impede a utilização das contas manuais.
      try {
        setConnections(await openBankingApi.connections());
      } catch {
        setConnections([]);
      }
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!pendingSyncJobs.length) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      const remaining: typeof pendingSyncJobs = [];
      let completed = false;
      for (const pending of pendingSyncJobs) {
        try {
          const job = await openBankingApi.syncJob(pending.jobId);
          if (job.status === "queued" || job.status === "running") remaining.push(pending);
          else if (job.status === "completed") completed = true;
          else if (!cancelled)
            setError("A sincronização bancária não foi concluída. Tente novamente.");
        } catch {
          if (!cancelled) setError("Não foi possível confirmar a sincronização bancária.");
        }
      }
      if (cancelled) return;
      setPendingSyncJobs(remaining);
      if (!remaining.length) setSyncingConnectionId(null);
      if (completed) {
        setNotice("Sincronização concluída. Saldos e movimentos foram atualizados.");
        void load();
      }
    }, SYNC_POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [pendingSyncJobs, load]);

  // Resultado do callback do banco: `?bankConnection=success|error&reason=...`.
  const bankConnectionOutcome = searchParams.get("bankConnection");
  useEffect(() => {
    if (!bankConnectionOutcome) return;
    setNotice(
      bankConnectionOutcome === "success"
        ? "Banco ligado. A primeira sincronização começou — os gastos contabilizados passam a despesas."
        : "Não foi possível concluir a ligação ao banco. Tente novamente.",
    );
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete("bankConnection");
    nextParams.delete("reason");
    setSearchParams(nextParams, { replace: true });
  }, [bankConnectionOutcome, searchParams, setSearchParams]);

  async function syncConnection(connectionId: string) {
    setSyncingConnectionId(connectionId);
    setError("");
    try {
      const job = await openBankingApi.sync(connectionId);
      setPendingSyncJobs((jobs) => [...jobs, { connectionId, jobId: job.jobId }]);
      setNotice("A sincronizar saldos e movimentos…");
    } catch (requestError) {
      setError(errorMessage(requestError));
      setSyncingConnectionId(null);
    }
  }

  const currency = user?.currency || "EUR";
  const visibleAccounts = useMemo(() => accounts.filter(isVisibleAccount), [accounts]);
  const hasLinkedBank = visibleAccounts.some((account) => account.source === "bank");
  const balancesByCurrency = useMemo(() => {
    const totals = new Map<string, number>();
    for (const account of visibleAccounts) {
      const accountCurrency = account.currency || currency;
      totals.set(
        accountCurrency,
        (totals.get(accountCurrency) ?? 0) + (account.currentBalance ?? account.openingBalance),
      );
    }
    return [...totals.entries()];
  }, [currency, visibleAccounts]);

  async function createAccount(event: FormEvent) {
    event.preventDefault();
    const openingBalance = accountForm.openingBalance ? amount(accountForm.openingBalance) : 0;
    const creditLimit = accountForm.creditLimit ? amount(accountForm.creditLimit) : undefined;
    const nextErrors: { name?: string; openingBalance?: string; creditLimit?: string } = {};
    if (!accountForm.name.trim()) nextErrors.name = "Introduza o nome da conta.";
    if (accountForm.openingBalance && !Number.isFinite(openingBalance))
      nextErrors.openingBalance = "Indique um saldo inicial válido.";
    if (creditLimit !== undefined && (!Number.isFinite(creditLimit) || creditLimit < 0))
      nextErrors.creditLimit = "Indique um limite válido.";
    setAccountErrors(nextErrors);
    if (nextErrors.name || nextErrors.openingBalance || nextErrors.creditLimit) {
      (nextErrors.name
        ? accountNameRef
        : nextErrors.openingBalance
          ? accountBalanceRef
          : accountLimitRef
      ).current?.focus();
      return;
    }
    setIsSaving(true);
    try {
      const created = await accountApi.create({
        name: accountForm.name,
        type: accountForm.type,
        openingBalance,
        creditLimit,
      });
      setAccounts((items) => [...items, created]);
      setAccountForm(initialAccount);
      setNotice("Conta criada.");
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setIsSaving(false);
    }
  }

  async function createTransfer(event: FormEvent) {
    event.preventDefault();
    const transferAmount = amount(transferForm.amount);
    const nextErrors: {
      fromAccountId?: string;
      toAccountId?: string;
      amount?: string;
      date?: string;
    } = {};
    if (!transferForm.fromAccountId) nextErrors.fromAccountId = "Escolha a conta de origem.";
    if (!transferForm.toAccountId) nextErrors.toAccountId = "Escolha a conta de destino.";
    if (
      transferForm.fromAccountId &&
      transferForm.toAccountId &&
      transferForm.fromAccountId === transferForm.toAccountId
    )
      nextErrors.toAccountId = "Escolha duas contas diferentes.";
    if (!transferForm.date) nextErrors.date = "Indique a data.";
    if (!Number.isFinite(transferAmount) || transferAmount <= 0)
      nextErrors.amount = "Indique um valor maior do que zero.";
    setTransferErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      (nextErrors.fromAccountId
        ? transferFromRef
        : nextErrors.toAccountId
          ? transferToRef
          : nextErrors.amount
            ? transferAmountRef
            : transferDateRef
      ).current?.focus();
      return;
    }
    setIsSaving(true);
    try {
      const created = await accountApi.transfer({ ...transferForm, amount: transferAmount });
      setTransfers((items) => [created, ...items]);
      setTransferForm(initialTransfer);
      setNotice("Transferência registada.");
      void load();
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setIsSaving(false);
    }
  }

  async function removeAccount() {
    if (!deleteTarget) return;
    setIsSaving(true);
    try {
      await accountApi.remove(deleteTarget.id);
      const [nextAccounts, nextTransfers] = await Promise.all([
        accountApi.list(),
        accountApi.transfers(),
      ]);
      setAccounts(nextAccounts);
      setTransfers(nextTransfers);
      setDeleteTarget(null);
      setNotice("Conta removida.");
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setIsSaving(false);
    }
  }

  function openBalanceCorrection(account: FinancialAccount) {
    const balance = account.currentBalance ?? account.openingBalance;
    setError("");
    setBalanceError("");
    setBalanceTarget(account);
    setCorrectedBalance(String(balance).replace(".", ","));
  }

  async function correctBalance() {
    if (!balanceTarget) return;
    const nextBalance = amount(correctedBalance);
    if (
      !isValidAccountBalance(correctedBalance) ||
      !Number.isFinite(nextBalance) ||
      Math.abs(nextBalance) > 9_999_999_999.99
    ) {
      setBalanceError("Indique um saldo válido, com no máximo duas casas decimais.");
      return;
    }
    setIsSaving(true);
    setError("");
    try {
      const updated = await accountApi.correctBalance(balanceTarget.id, {
        currentBalance: nextBalance,
      });
      setAccounts((items) => items.map((item) => (item.id === updated.id ? updated : item)));
      setBalanceTarget(null);
      setCorrectedBalance("");
      setBalanceError("");
      setNotice("Saldo corrigido.");
    } catch (requestError) {
      setBalanceError(errorMessage(requestError));
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading)
    return (
      <div className="page">
        <LoadingState label="A preparar as suas contas" />
      </div>
    );
  if (error && !accounts.length)
    return (
      <div className="page">
        <ErrorState message={error} onRetry={() => void load()} />
      </div>
    );

  return (
    <div className="page page--accounts">
      <NoticeToast message={notice} onClose={() => setNotice("")} />
      <PageHeader
        eyebrow="Dinheiro disponível"
        title="Contas e cartões"
        description="Saldos, cartões e transferências. Os gastos das contas ligadas ao banco entram automaticamente nas despesas."
        action={
          <>
            <button
              type="button"
              className="button button--accent"
              onClick={() => navigate("/accounts/connect")}
            >
              <Plus aria-hidden="true" /> Ligar banco
            </button>
            <Link className="button button--secondary" to="/accounts/connections">
              Bancos ligados
            </Link>
          </>
        }
      />
      {error && (
        <div className="form-alert form-alert--page" role="alert">
          {error}
        </div>
      )}
      <p className={`accounts-insight${hasLinkedBank ? "" : " accounts-insight--invite"}`}>
        {hasLinkedBank ? (
          <>
            Os gastos contabilizados das contas ligadas já estão em{" "}
            <Link to="/expenses">Despesas</Link>.
          </>
        ) : (
          "Ligue o banco uma vez: os gastos passam a despesas sem as escrever à mão."
        )}
      </p>
      <section className="accounts-total">
        <span>Saldo combinado</span>
        <div className="accounts-total__values">
          {balancesByCurrency.length ? (
            balancesByCurrency.map(([accountCurrency, total]) => (
              <strong key={accountCurrency}>{formatCurrency(total, accountCurrency)}</strong>
            ))
          ) : (
            <strong>{formatCurrency(0, currency)}</strong>
          )}
        </div>
        <small>
          {visibleAccounts.length} {visibleAccounts.length === 1 ? "conta" : "contas"} registadas
        </small>
      </section>

      <div className="accounts-grid">
        <section className="accounts-panel" aria-labelledby="account-create-title">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Adicionar</p>
              <h2 id="account-create-title">Nova conta</h2>
            </div>
          </div>
          <details className="planning-disclosure" open={visibleAccounts.length === 0}>
            <summary>
              <span>Adicionar conta</span>
              <small>Conta bancária, dinheiro ou cartão.</small>
            </summary>
            <form className="planning-form" onSubmit={createAccount} noValidate>
              <label className="field">
                <span>Nome</span>
                <input
                  ref={accountNameRef}
                  value={accountForm.name}
                  onChange={(event) => {
                    setAccountForm((form) => ({ ...form, name: event.target.value }));
                    setAccountErrors((current) => ({ ...current, name: undefined }));
                  }}
                  placeholder="Ex.: Conta principal"
                  aria-invalid={Boolean(accountErrors.name)}
                  aria-describedby={accountErrors.name ? "account-name-error" : undefined}
                />
                {accountErrors.name && (
                  <small className="field__error" id="account-name-error">
                    {accountErrors.name}
                  </small>
                )}
              </label>
              <label className="field">
                <span>Tipo</span>
                <select
                  value={accountForm.type}
                  onChange={(event) =>
                    setAccountForm((form) => ({
                      ...form,
                      type: event.target.value as AccountType,
                      creditLimit: event.target.value === "credit_card" ? form.creditLimit : "",
                    }))
                  }
                >
                  {Object.entries(accountLabels).map(([type, label]) => (
                    <option key={type} value={type}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Saldo inicial</span>
                <input
                  ref={accountBalanceRef}
                  inputMode="decimal"
                  value={accountForm.openingBalance}
                  onChange={(event) => {
                    setAccountForm((form) => ({ ...form, openingBalance: event.target.value }));
                    setAccountErrors((current) => ({ ...current, openingBalance: undefined }));
                  }}
                  placeholder="0,00"
                  aria-invalid={Boolean(accountErrors.openingBalance)}
                  aria-describedby={accountErrors.openingBalance ? "account-balance-error" : undefined}
                />
                {accountErrors.openingBalance && (
                  <small className="field__error" id="account-balance-error">
                    {accountErrors.openingBalance}
                  </small>
                )}
              </label>
              {accountForm.type === "credit_card" && (
                <label className="field">
                  <span>Limite do cartão</span>
                  <input
                    ref={accountLimitRef}
                    inputMode="decimal"
                    value={accountForm.creditLimit}
                    onChange={(event) => {
                      setAccountForm((form) => ({ ...form, creditLimit: event.target.value }));
                      setAccountErrors((current) => ({ ...current, creditLimit: undefined }));
                    }}
                    placeholder="1 500"
                    aria-invalid={Boolean(accountErrors.creditLimit)}
                    aria-describedby={accountErrors.creditLimit ? "account-limit-error" : undefined}
                  />
                  {accountErrors.creditLimit && (
                    <small className="field__error" id="account-limit-error">
                      {accountErrors.creditLimit}
                    </small>
                  )}
                </label>
              )}
              <button className="button button--accent" type="submit" disabled={isSaving}>
                {isSaving ? (
                  <Spinner label="A guardar" />
                ) : (
                  <>
                    <Plus aria-hidden="true" /> Criar conta
                  </>
                )}
              </button>
            </form>
          </details>
        </section>
        <section className="accounts-panel" aria-labelledby="transfer-title">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Mover dinheiro</p>
              <h2 id="transfer-title">Transferência</h2>
            </div>
            <ArrowRightLeft aria-hidden="true" />
          </div>
          <details className="planning-disclosure" open={visibleAccounts.length < 2}>
            <summary>
              <span>Fazer transferência</span>
              <small>Mover dinheiro entre duas contas.</small>
            </summary>
            {visibleAccounts.length < 2 && (
              <p className="planning-disclosure__hint">
                Crie pelo menos duas contas antes de fazer uma transferência.
              </p>
            )}
            <form className="planning-form" onSubmit={createTransfer} noValidate>
              <div className="planning-form__split">
                <label className="field">
                  <span>De</span>
                  <select
                    ref={transferFromRef}
                    value={transferForm.fromAccountId}
                    onChange={(event) => {
                      setTransferForm((form) => ({ ...form, fromAccountId: event.target.value }));
                      setTransferErrors((current) => ({ ...current, fromAccountId: undefined }));
                    }}
                    aria-invalid={Boolean(transferErrors.fromAccountId)}
                    aria-describedby={
                      transferErrors.fromAccountId ? "transfer-from-error" : undefined
                    }
                  >
                    <option value="">Escolher</option>
                    {visibleAccounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.name}
                      </option>
                    ))}
                  </select>
                  {transferErrors.fromAccountId && (
                    <small className="field__error" id="transfer-from-error">
                      {transferErrors.fromAccountId}
                    </small>
                  )}
                </label>
                <label className="field">
                  <span>Para</span>
                  <select
                    ref={transferToRef}
                    value={transferForm.toAccountId}
                    onChange={(event) => {
                      setTransferForm((form) => ({ ...form, toAccountId: event.target.value }));
                      setTransferErrors((current) => ({ ...current, toAccountId: undefined }));
                    }}
                    aria-invalid={Boolean(transferErrors.toAccountId)}
                    aria-describedby={transferErrors.toAccountId ? "transfer-to-error" : undefined}
                  >
                    <option value="">Escolher</option>
                    {visibleAccounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.name}
                      </option>
                    ))}
                  </select>
                  {transferErrors.toAccountId && (
                    <small className="field__error" id="transfer-to-error">
                      {transferErrors.toAccountId}
                    </small>
                  )}
                </label>
              </div>
              <div className="planning-form__split">
                <label className="field">
                  <span>Valor</span>
                  <input
                    ref={transferAmountRef}
                    inputMode="decimal"
                    value={transferForm.amount}
                    onChange={(event) => {
                      setTransferForm((form) => ({ ...form, amount: event.target.value }));
                      setTransferErrors((current) => ({ ...current, amount: undefined }));
                    }}
                    placeholder="0,00"
                    aria-invalid={Boolean(transferErrors.amount)}
                    aria-describedby={transferErrors.amount ? "transfer-amount-error" : undefined}
                  />
                  {transferErrors.amount && (
                    <small className="field__error" id="transfer-amount-error">
                      {transferErrors.amount}
                    </small>
                  )}
                </label>
                <label className="field">
                  <span>Data</span>
                  <input
                    ref={transferDateRef}
                    type="date"
                    value={transferForm.date}
                    onChange={(event) => {
                      setTransferForm((form) => ({ ...form, date: event.target.value }));
                      setTransferErrors((current) => ({ ...current, date: undefined }));
                    }}
                    aria-invalid={Boolean(transferErrors.date)}
                    aria-describedby={transferErrors.date ? "transfer-date-error" : undefined}
                  />
                  {transferErrors.date && (
                    <small className="field__error" id="transfer-date-error">
                      {transferErrors.date}
                    </small>
                  )}
                </label>
              </div>
              <label className="field">
                <span>
                  Nota <em>opcional</em>
                </span>
                <input
                  value={transferForm.description}
                  onChange={(event) =>
                    setTransferForm((form) => ({ ...form, description: event.target.value }))
                  }
                  placeholder="Ex.: reforço da poupança"
                />
              </label>
              <button
                className="button button--primary"
                disabled={isSaving || visibleAccounts.length < 2}
                type="submit"
              >
                Transferir
              </button>
            </form>
          </details>
        </section>
      </div>

      <section className="accounts-panel accounts-panel--list" aria-labelledby="accounts-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Saldos</p>
            <h2 id="accounts-title">As suas contas</h2>
          </div>
        </div>
        <div className="account-cards">
          {visibleAccounts.length ? (
            visibleAccounts.map((account) => {
              const balance = account.currentBalance ?? account.openingBalance;
              const cardUse =
                account.type === "credit_card" && account.creditLimit
                  ? Math.max(0, -balance) / account.creditLimit
                  : null;
              const isLinked = account.source === "bank";
              const connection = connections.find(
                (item) =>
                  item.status !== "disconnected" &&
                  item.accounts.some((link) => link.accountId === account.id),
              );
              const canSync = connection?.status === "active" || connection?.status === "error";
              return (
                <article
                  className={`account-card-large account-card-large--${account.type}${isLinked ? " account-card-large--linked" : ""}`}
                  key={account.id}
                >
                  <span className="account-card-large__icon">
                    <AccountIcon type={account.type} />
                  </span>
                  <div className="account-card-large__identity">
                    <p>{accountLabels[account.type]}</p>
                    <h3>
                      <Link to={`/accounts/${account.id}`}>{account.name}</Link>
                    </h3>
                    <span
                      className={`account-badge account-badge--${isLinked ? "bank" : "manual"}`}
                    >
                      {isLinked ? "Ligada ao banco" : "Manual"}
                    </span>
                    {(isLinked || cardUse !== null) && (
                      <div className="account-card-large__meta">
                        {isLinked &&
                          account.availableBalance !== null &&
                          account.availableBalance !== undefined && (
                            <span>
                              Disponível{" "}
                              {formatCurrency(
                                account.availableBalance,
                                account.currency ?? currency,
                              )}
                            </span>
                          )}
                        {isLinked &&
                          typeof account.derivedBalance === "number" &&
                          typeof account.balanceDelta === "number" &&
                          Math.abs(account.balanceDelta) >= 0.01 && (
                            <span className="account-card-large__delta">
                              Na app{" "}
                              {formatCurrency(account.derivedBalance, account.currency ?? currency)}{" "}
                              · diferença{" "}
                              {formatCurrency(account.balanceDelta, account.currency ?? currency)}
                            </span>
                          )}
                        {isLinked && (
                          <span>
                            {account.lastSyncedAt
                              ? `Atualizado ${new Date(account.lastSyncedAt).toLocaleString("pt-PT")}`
                              : "Ainda sem sincronização"}
                          </span>
                        )}
                        {cardUse !== null && (
                          <span>{Math.min(100, cardUse * 100).toFixed(0)}% do limite</span>
                        )}
                      </div>
                    )}
                  </div>
                  <strong>{formatCurrency(balance, account.currency ?? currency)}</strong>
                  <div className="account-card-large__actions">
                    {isLinked && connection && canSync && (
                      <button
                        type="button"
                        className="icon-button"
                        aria-label={`Sincronizar ${connection.institutionName}`}
                        disabled={syncingConnectionId === connection.id}
                        onClick={() => void syncConnection(connection.id)}
                      >
                        <RefreshCw aria-hidden="true" />
                        <span>Sincronizar</span>
                      </button>
                    )}
                    {isLinked && connection && !canSync && connection.status !== "pending" && (
                      <Link className="text-button" to="/accounts/connections">
                        Gerir ligação
                      </Link>
                    )}
                    {!isLinked && (
                      <button
                        type="button"
                        className="icon-button account-card-large__correct"
                        aria-label={`Corrigir saldo da conta ${account.name}`}
                        onClick={() => openBalanceCorrection(account)}
                      >
                        <PencilLine aria-hidden="true" />
                        <span>Corrigir valor</span>
                      </button>
                    )}
                    {!isLinked && (
                      <button
                        type="button"
                        className="icon-button icon-button--danger"
                        aria-label={`Remover conta ${account.name}`}
                        title="Remover conta"
                        onClick={() => setDeleteTarget(account)}
                      >
                        <Trash2 aria-hidden="true" />
                      </button>
                    )}
                  </div>
                </article>
              );
            })
          ) : (
            <p className="accounts-empty">
              Crie uma conta ou ligue o banco para começar a acompanhar o saldo. Os gastos ligados
              passam a despesas.
            </p>
          )}
        </div>
      </section>

      <section className="accounts-panel accounts-panel--list" aria-labelledby="transfers-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Histórico</p>
            <h2 id="transfers-title">Últimas transferências</h2>
          </div>
        </div>
        {transfers.length ? (
          <div className="transfer-list">
            {transfers.map((transfer) => (
              <article key={transfer.id}>
                <span>
                  <ArrowRightLeft aria-hidden="true" />
                </span>
                <div>
                  <h3>
                    {transfer.fromAccount.name} <ArrowRightLeft aria-hidden="true" />{" "}
                    {transfer.toAccount.name}
                  </h3>
                  <p>
                    {transfer.description || formatDate(transfer.date)}
                    {transfer.description ? ` · ${formatDate(transfer.date)}` : ""}
                  </p>
                </div>
                <strong>{formatCurrency(transfer.amount, currency)}</strong>
              </article>
            ))}
          </div>
        ) : (
          <p className="accounts-empty">As transferências entre contas aparecem aqui.</p>
        )}
      </section>
      <BalanceCorrectionDialog
        open={Boolean(balanceTarget)}
        accountName={balanceTarget?.name ?? ""}
        currentBalance={balanceTarget?.currentBalance ?? balanceTarget?.openingBalance ?? 0}
        currency={currency}
        value={correctedBalance}
        errorMessage={balanceError}
        busy={isSaving}
        onValueChange={(value) => {
          setCorrectedBalance(value);
          setBalanceError("");
        }}
        onCancel={() => {
          setBalanceTarget(null);
          setBalanceError("");
        }}
        onConfirm={() => void correctBalance()}
      />
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Remover esta conta?"
        description={
          deleteTarget
            ? `“${deleteTarget.name}” será removida. As despesas e rendimentos existentes deixam de estar associados a esta conta. As transferências desta conta também serão removidas, sem alterar o saldo das restantes contas.`
            : ""
        }
        confirmLabel="Remover conta"
        busy={isSaving}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => void removeAccount()}
      />
    </div>
  );
}
