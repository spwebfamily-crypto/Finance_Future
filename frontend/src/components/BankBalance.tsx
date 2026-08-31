/**
 * Saldo de uma conta. Mostra a origem do valor (derivado ou fornecido pelo
 * banco) e nunca sugere atualização em tempo real.
 */
export function BankBalance({
  currentBalance,
  availableBalance,
  balanceSource,
  balanceAsOf,
  currency,
  label = "Saldo contabilístico",
}: {
  currentBalance: number;
  availableBalance?: number | null;
  balanceSource?: "derived" | "provider";
  balanceAsOf?: string | null;
  currency: string;
  label?: string;
}) {
  const formatted = new Intl.NumberFormat("pt-PT", { style: "currency", currency }).format(
    currentBalance,
  );

  return (
    <div className="bank-balance">
      <p className="bank-balance__label">{label}</p>
      <strong className="bank-balance__value">{formatted}</strong>
      {availableBalance !== null && availableBalance !== undefined && (
        <p className="bank-balance__available">
          Saldo disponível:{" "}
          {new Intl.NumberFormat("pt-PT", { style: "currency", currency }).format(availableBalance)}
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
