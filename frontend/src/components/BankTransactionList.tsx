import { Inbox } from "lucide-react";
import { BankTransactionRow } from "./BankTransactionRow";
import type { BankTransaction } from "../types";
import { useI18n } from "../i18n/I18nContext";

export function BankTransactionList({
  transactions,
  categories,
  busyTransactionId = null,
  onCategoryChange,
  onToggleAnalytics,
}: {
  transactions: BankTransaction[];
  categories: Array<{ id: string; name: string }>;
  busyTransactionId?: string | null;
  onCategoryChange: (transaction: BankTransaction, categoryId: string) => void;
  onToggleAnalytics: (transaction: BankTransaction, excluded: boolean) => void;
}) {
  const { t } = useI18n();
  if (!transactions.length) {
    return (
      <p className="accounts-empty">
        <Inbox aria-hidden="true" /> {t("Ainda não há movimentos para os filtros escolhidos.")}
      </p>
    );
  }

  return (
    <div className="bank-transaction-list">
      {transactions.map((transaction) => (
        <BankTransactionRow
          key={transaction.id}
          transaction={transaction}
          categories={categories}
          busy={busyTransactionId === transaction.id}
          onCategoryChange={onCategoryChange}
          onToggleAnalytics={onToggleAnalytics}
        />
      ))}
    </div>
  );
}
