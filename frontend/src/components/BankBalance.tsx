import { formatCurrency } from "../utils/format";

/**
 * Saldo de uma conta. Mostra a origem do valor (derivado ou fornecido pelo
 * banco) e nunca sugere atualização em tempo real.
 */
export function BankBalance({
  currentBalance,
  availableBalance,
  derivedBalance,
  balanceDelta,
  balanceSource,
  balanceAsOf,
  currency,
  label = "Saldo contabilístico",
}: {
  currentBalance: number;
  availableBalance?: number | null;
  derivedBalance?: number;
  balanceDelta?: number | null;
  balanceSource?: "derived" | "provider";
  balanceAsOf?: string | null;
  currency: string;
  label?: string;
}) {
  const formattedDelta =
    typeof derivedBalance === "number" &&
    typeof balanceDelta === "number" &&
    Number.isFinite(balanceDelta) &&
    Math.abs(balanceDelta) >= 0.01
      ? { derivedBalance, balanceDelta }
      : null;

  return (
    <div className="bank-balance">
      <p className="bank-balance__label">{label}</p>
      <strong className="bank-balance__value">{formatCurrency(currentBalance, currency)}</strong>
      {availableBalance !== null && availableBalance !== undefined && (
        <p className="bank-balance__available">
          Saldo disponível: {formatCurrency(availableBalance, currency)}
        </p>
      )}
      {formattedDelta && (
        <p className="bank-balance__delta">
          Na app: {formatCurrency(formattedDelta.derivedBalance, currency)} · diferença{" "}
          {formatCurrency(formattedDelta.balanceDelta, currency)}
        </p>
      )}
      <p className="bank-balance__source">
        {balanceSource === "provider"
          ? "Valor fornecido pelo banco"
          : "Valor calculado na aplicação"}
        {balanceAsOf ? ` · ${new Date(balanceAsOf).toLocaleString("pt-PT")}` : ""}
      </p>
    </div>
  );
}
