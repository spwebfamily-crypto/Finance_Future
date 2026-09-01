import { Landmark, RefreshCw } from "lucide-react";
import { BankBalance } from "./BankBalance";
import { BankSyncStatus } from "./BankSyncStatus";
import { Spinner } from "./States";
import type { AccountType, FinancialAccount } from "../types";

const typeLabels: Record<AccountType, string> = {
  current: "À ordem",
  savings: "Poupança",
  cash: "Dinheiro",
  credit_card: "Cartão de crédito",
  other: "Outra",
};

/** Cartão de conta, com distinção clara entre conta ligada ao banco e manual. */
export function BankAccountCard({
  account,
  currency,
  busy = false,
  onSync,
}: {
  account: FinancialAccount;
  currency: string;
  busy?: boolean;
  onSync?: () => void;
}) {
  const isLinked = account.source === "bank";

  return (
    <article className={`bank-account-card${isLinked ? " bank-account-card--linked" : ""}`}>
      <header>
        <span className="bank-account-card__icon" aria-hidden="true">
          <Landmark />
        </span>
        <div>
          <p className="bank-account-card__type">{typeLabels[account.type]}</p>
          <h3>{account.name}</h3>
        </div>
        <span className={`account-badge account-badge--${isLinked ? "bank" : "manual"}`}>
          {isLinked ? "Ligada ao banco" : "Manual"}
        </span>
      </header>

      <BankBalance
        currentBalance={account.currentBalance ?? account.openingBalance}
        availableBalance={isLinked ? account.availableBalance : null}
        derivedBalance={account.derivedBalance}
        balanceDelta={account.balanceDelta}
        balanceSource={account.balanceSource ?? "derived"}
        balanceAsOf={account.balanceAsOf ?? null}
        currency={account.currency ?? currency}
      />

      {isLinked && account.connectionStatus && (
        <BankSyncStatus
          status={account.connectionStatus}
          lastSyncedAt={account.lastSyncedAt}
          compact
        />
      )}

      {isLinked && onSync && (
        <button type="button" className="button button--primary" onClick={onSync} disabled={busy}>
          {busy ? <Spinner label="A sincronizar" /> : <RefreshCw aria-hidden="true" />}
          <span>Sincronizar</span>
        </button>
      )}
    </article>
  );
}
