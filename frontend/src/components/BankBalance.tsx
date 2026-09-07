import { formatCurrency } from "../utils/format";
import { useI18n } from "../i18n/I18nContext";

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
  const { t, locale, formatDate } = useI18n();
  const formattedDelta =
    typeof derivedBalance === "number" &&
    typeof balanceDelta === "number" &&
    Number.isFinite(balanceDelta) &&
    Math.abs(balanceDelta) >= 0.01
      ? { derivedBalance, balanceDelta }
      : null;

  return (
    <div className="bank-balance">
      <p className="bank-balance__label">{t(label)}</p>
      <strong className="bank-balance__value">
        {formatCurrency(currentBalance, currency, locale)}
      </strong>
      {availableBalance !== null && availableBalance !== undefined && (
        <p className="bank-balance__available">
          {t("Saldo disponível: {amount}", {
            amount: formatCurrency(availableBalance, currency, locale),
          })}
        </p>
      )}
      {formattedDelta && (
        <p className="bank-balance__delta">
          {t("Na app: {appAmount} · diferença {difference}", {
            appAmount: formatCurrency(formattedDelta.derivedBalance, currency, locale),
            difference: formatCurrency(formattedDelta.balanceDelta, currency, locale),
          })}
        </p>
      )}
      <p className="bank-balance__source">
        {balanceSource === "provider"
          ? t("Valor fornecido pelo banco")
          : t("Valor calculado na aplicação")}
        {balanceAsOf
          ? ` · ${formatDate(balanceAsOf, { dateStyle: "short", timeStyle: "short" })}`
          : ""}
      </p>
    </div>
  );
}
