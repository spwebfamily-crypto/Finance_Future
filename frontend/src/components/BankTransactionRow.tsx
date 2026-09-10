import type { BankTransaction } from "../types";
import { useI18n } from "../i18n/I18nContext";

const classificationLabels: Record<BankTransaction["classification"], string> = {
  unreviewed: "Por rever",
  expense: "Despesa",
  income: "Rendimento",
  internal_transfer: "Transferência própria",
  ignored: "Ignorado",
  refund: "Reembolso",
};

function formatAmount(value: number, currency: string, locale: string) {
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(value);
}

function formatDay(value: string | null, locale: string, noDate: string) {
  if (!value) return noDate;
  return new Intl.DateTimeFormat(locale, { day: "2-digit", month: "short" }).format(
    new Date(value),
  );
}

export function BankTransactionRow({
  transaction,
  categories,
  busy = false,
  onCategoryChange,
  onConfirmExpense,
  onToggleAnalytics,
}: {
  transaction: BankTransaction;
  categories: Array<{ id: string; name: string }>;
  busy?: boolean;
  onCategoryChange: (transaction: BankTransaction, categoryId: string) => void;
  onConfirmExpense: (transaction: BankTransaction, categoryId: string) => void;
  onToggleAnalytics: (transaction: BankTransaction, excluded: boolean) => void;
}) {
  const { t, locale } = useI18n();
  const isPending = transaction.status === "pending";
  const isCredit = transaction.direction === "credit";
  const needsReview = transaction.direction === "debit" && transaction.classification === "unreviewed";
  const selectedCategoryId = transaction.expense?.categoryId ?? categories[0]?.id ?? "";

  return (
    <article className={`bank-transaction-row${isPending ? " bank-transaction-row--pending" : ""}`}>
      <div className="bank-transaction-row__main">
        <p className="bank-transaction-row__description">{transaction.description}</p>
        <p className="bank-transaction-row__meta">
          {formatDay(transaction.bookingDate, locale, t("Sem data"))}
          {transaction.counterpartyName ? ` · ${transaction.counterpartyName}` : ""}
          {isPending && <span className="bank-transaction-row__badge">{t("Pendente")}</span>}
          <span className="bank-transaction-row__badge bank-transaction-row__badge--muted">
            {t(classificationLabels[transaction.classification])}
          </span>
        </p>
      </div>

      <strong className={`bank-transaction-row__amount${isCredit ? " is-credit" : ""}`}>
        {isCredit ? "+" : "−"}
        {formatAmount(transaction.amount, transaction.currency, locale)}
      </strong>

      <div className="bank-transaction-row__actions">
        {(transaction.expense || needsReview) && (
          <label className="field field--inline">
            <span>{t("Categoria")}</span>
            <select
              value={selectedCategoryId}
              disabled={busy}
              onChange={(event) => {
                if (needsReview) onConfirmExpense(transaction, event.target.value);
                else onCategoryChange(transaction, event.target.value);
              }}
            >
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {needsReview && (
          <button
            className="button button--primary button--small"
            type="button"
            disabled={busy || !selectedCategoryId}
            onClick={() => onConfirmExpense(transaction, selectedCategoryId)}
          >
            {t("Confirmar gasto")}
          </button>
        )}
        <label className="switch">
          <input
            type="checkbox"
            checked={transaction.excludedFromAnalytics}
            disabled={busy}
            onChange={(event) => onToggleAnalytics(transaction, event.target.checked)}
          />
          <span>{t("Não contar como despesa")}</span>
        </label>
      </div>
    </article>
  );
}
