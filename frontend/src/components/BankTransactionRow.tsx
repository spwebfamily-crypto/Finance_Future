import type { BankTransaction } from "../types";

const classificationLabels: Record<BankTransaction["classification"], string> = {
  unreviewed: "Por rever",
  expense: "Despesa",
  income: "Rendimento",
  internal_transfer: "Transferência própria",
  ignored: "Ignorado",
  refund: "Reembolso",
};

function formatAmount(value: number, currency: string) {
  return new Intl.NumberFormat("pt-PT", { style: "currency", currency }).format(value);
}

function formatDay(value: string | null) {
  if (!value) return "Sem data";
  return new Intl.DateTimeFormat("pt-PT", { day: "2-digit", month: "short" }).format(
    new Date(value),
  );
}

export function BankTransactionRow({
  transaction,
  categories,
  busy = false,
  onCategoryChange,
  onToggleAnalytics,
}: {
  transaction: BankTransaction;
  categories: Array<{ id: string; name: string }>;
  busy?: boolean;
  onCategoryChange: (transaction: BankTransaction, categoryId: string) => void;
  onToggleAnalytics: (transaction: BankTransaction, excluded: boolean) => void;
}) {
  const isPending = transaction.status === "pending";
  const isCredit = transaction.direction === "credit";

  return (
    <article className={`bank-transaction-row${isPending ? " bank-transaction-row--pending" : ""}`}>
      <div className="bank-transaction-row__main">
        <p className="bank-transaction-row__description">{transaction.description}</p>
        <p className="bank-transaction-row__meta">
          {formatDay(transaction.bookingDate)}
          {transaction.counterpartyName ? ` · ${transaction.counterpartyName}` : ""}
          {isPending && <span className="bank-transaction-row__badge">Pendente</span>}
          <span className="bank-transaction-row__badge bank-transaction-row__badge--muted">
            {classificationLabels[transaction.classification]}
          </span>
        </p>
      </div>

      <strong className={`bank-transaction-row__amount${isCredit ? " is-credit" : ""}`}>
        {isCredit ? "+" : "−"}
        {formatAmount(transaction.amount, transaction.currency)}
      </strong>

      <div className="bank-transaction-row__actions">
        {transaction.expense && (
          <label className="field field--inline">
            <span>Categoria</span>
            <select
              value={transaction.expense.categoryId}
              disabled={busy}
              onChange={(event) => onCategoryChange(transaction, event.target.value)}
            >
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="switch">
          <input
            type="checkbox"
            checked={transaction.excludedFromAnalytics}
            disabled={busy}
            onChange={(event) => onToggleAnalytics(transaction, event.target.checked)}
          />
          <span>Excluir das análises</span>
        </label>
      </div>
    </article>
  );
}
