import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  ArrowRightLeft,
  Banknote,
  CreditCard,
  Landmark,
  PencilLine,
  Plus,
  Trash2,
  WalletCards,
} from "lucide-react";
import { accountApi } from "../api/resources";
import { errorMessage } from "../api/client";
import { BalanceCorrectionDialog } from "../components/BalanceCorrectionDialog";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { ErrorState, LoadingState, Spinner } from "../components/States";
import { NoticeToast } from "../components/NoticeToast";
import { PageHeader } from "../components/PageHeader";
import { useAuth } from "../auth/AuthContext";
import type { AccountTransfer, AccountType, FinancialAccount } from "../types";
import { formatCurrency, formatDate, todayInputValue } from "../utils/format";

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

const accountLabels: Record<AccountType, string> = {
  current: "À ordem",
  savings: "Poupança",
  cash: "Dinheiro",
  credit_card: "Cartão de crédito",
  other: "Outra",
};

function amount(value: string) {
  return Number(value.replace(",", "."));
}

function isValidAccountBalance(value: string) {
  return /^-?\d{1,10}(?:[.,]\d{1,2})?$/.test(value.trim());
}

function AccountIcon({ type }: { type: AccountType }) {
  if (type === "credit_card") return <CreditCard aria-hidden="true" />;
  if (type === "cash") return <Banknote aria-hidden="true" />;
  if (type === "savings") return <WalletCards aria-hidden="true" />;
  return <Landmark aria-hidden="true" />;
}

export function AccountsPage() {
  const { user } = useAuth();
  const [accounts, setAccounts] = useState<FinancialAccount[]>([]);
  const [transfers, setTransfers] = useState<AccountTransfer[]>([]);
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
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const currency = user?.currency || "EUR";
  const totalBalance = useMemo(
    () =>
      accounts.reduce(
        (total, account) => total + (account.currentBalance ?? account.openingBalance),
        0,
      ),
    [accounts],
  );

  async function createAccount(event: FormEvent) {
    event.preventDefault();
    const openingBalance = accountForm.openingBalance ? amount(accountForm.openingBalance) : 0;
    const creditLimit = accountForm.creditLimit ? amount(accountForm.creditLimit) : undefined;
    if (
      !accountForm.name.trim() ||
      !Number.isFinite(openingBalance) ||
      (creditLimit !== undefined && (!Number.isFinite(creditLimit) || creditLimit < 0))
    )
      return;
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
    if (
      !transferForm.fromAccountId ||
      !transferForm.toAccountId ||
      transferForm.fromAccountId === transferForm.toAccountId ||
      !transferForm.date ||
      !Number.isFinite(transferAmount) ||
      transferAmount <= 0
    )
      return;
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
        description="Acompanhe saldos reais, cartões e transferências sem transformar uma transferência numa despesa."
      />
      {error && (
        <div className="form-alert form-alert--page" role="alert">
          {error}
        </div>
      )}
      <section className="accounts-total">
        <span>Saldo combinado</span>
        <strong>{formatCurrency(totalBalance, currency)}</strong>
        <small>
          {accounts.length} {accounts.length === 1 ? "conta" : "contas"} registadas
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
          <details className="planning-disclosure" open={accounts.length === 0}>
            <summary>
              <span>Adicionar conta</span>
              <small>Conta bancária, dinheiro ou cartão.</small>
            </summary>
            <form className="planning-form" onSubmit={createAccount}>
              <label className="field">
                <span>Nome</span>
                <input
                  value={accountForm.name}
                  onChange={(event) =>
                    setAccountForm((form) => ({ ...form, name: event.target.value }))
                  }
                  placeholder="Ex.: Conta principal"
                />
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
                  inputMode="decimal"
                  value={accountForm.openingBalance}
                  onChange={(event) =>
                    setAccountForm((form) => ({ ...form, openingBalance: event.target.value }))
                  }
                  placeholder="0,00"
                />
              </label>
              {accountForm.type === "credit_card" && (
                <label className="field">
                  <span>Limite do cartão</span>
                  <input
                    inputMode="decimal"
                    value={accountForm.creditLimit}
                    onChange={(event) =>
                      setAccountForm((form) => ({ ...form, creditLimit: event.target.value }))
                    }
                    placeholder="1 500"
                  />
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
          <details className="planning-disclosure" open={accounts.length < 2}>
            <summary>
              <span>Fazer transferência</span>
              <small>Mover dinheiro entre duas contas.</small>
            </summary>
            {accounts.length < 2 && (
              <p className="planning-disclosure__hint">
                Crie pelo menos duas contas antes de fazer uma transferência.
              </p>
            )}
            <form className="planning-form" onSubmit={createTransfer}>
              <div className="planning-form__split">
                <label className="field">
                  <span>De</span>
                  <select
                    value={transferForm.fromAccountId}
                    onChange={(event) =>
                      setTransferForm((form) => ({ ...form, fromAccountId: event.target.value }))
                    }
                  >
                    <option value="">Escolher</option>
                    {accounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>Para</span>
                  <select
                    value={transferForm.toAccountId}
                    onChange={(event) =>
                      setTransferForm((form) => ({ ...form, toAccountId: event.target.value }))
                    }
                  >
                    <option value="">Escolher</option>
                    {accounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="planning-form__split">
                <label className="field">
                  <span>Valor</span>
                  <input
                    inputMode="decimal"
                    value={transferForm.amount}
                    onChange={(event) =>
                      setTransferForm((form) => ({ ...form, amount: event.target.value }))
                    }
                    placeholder="0,00"
                  />
                </label>
                <label className="field">
                  <span>Data</span>
                  <input
                    type="date"
                    value={transferForm.date}
                    onChange={(event) =>
                      setTransferForm((form) => ({ ...form, date: event.target.value }))
                    }
                  />
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
                disabled={isSaving || accounts.length < 2}
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
          {accounts.length ? (
            accounts.map((account) => {
              const balance = account.currentBalance ?? account.openingBalance;
              const cardUse =
                account.type === "credit_card" && account.creditLimit
                  ? Math.max(0, -balance) / account.creditLimit
                  : null;
              return (
                <article
                  className={`account-card-large account-card-large--${account.type}`}
                  key={account.id}
                >
                  <span className="account-card-large__icon">
                    <AccountIcon type={account.type} />
                  </span>
                  <div>
                    <p>{accountLabels[account.type]}</p>
                    <h3>{account.name}</h3>
                  </div>
                  <strong>{formatCurrency(balance, currency)}</strong>
                  {cardUse !== null && (
                    <small>{Math.min(100, cardUse * 100).toFixed(0)}% do limite utilizado</small>
                  )}
                  <div className="account-card-large__actions">
                    <button
                      type="button"
                      className="icon-button account-card-large__correct"
                      aria-label={`Corrigir saldo da conta ${account.name}`}
                      onClick={() => openBalanceCorrection(account)}
                    >
                      <PencilLine aria-hidden="true" />
                      <span>Corrigir valor</span>
                    </button>
                    <button
                      type="button"
                      className="icon-button icon-button--danger"
                      aria-label={`Remover conta ${account.name}`}
                      title="Remover conta"
                      onClick={() => setDeleteTarget(account)}
                    >
                      <Trash2 aria-hidden="true" />
                    </button>
                  </div>
                </article>
              );
            })
          ) : (
            <p className="accounts-empty">
              Crie a primeira conta acima para começar a acompanhar o seu saldo.
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
