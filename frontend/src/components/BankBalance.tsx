import { formatCurrency } from "../utils/format";
import { useI18n } from "../i18n/I18nContext";

/**
 * Saldo de uma conta. Mostra a origem do valor (derivado ou fornecido pelo
 * banco) e nunca sugere atualização em tempo real.
 */
export function BankBalance({
  currentBalance,
  balanceSource,
  balanceAsOf,
  currency,
  label = "Saldo contabilístico",
}: {
  currentBalance: number | null;
  balanceSource?: "derived" | "provider" | "unavailable";
  balanceAsOf?: string | null;
  currency: string;
  label?: string;
}) {
  const { t, locale, formatDate } = useI18n();
  return (
    <div className="bank-balance">
      <p className="bank-balance__label">{t(label)}</p>
      <strong className="bank-balance__value">
        {currentBalance === null
          ? t("Ainda sem sincronização")
          : formatCurrency(currentBalance, currency, locale)}
      </strong>
      <p className="bank-balance__source">
        {balanceSource === "provider"
          ? t("Valor fornecido pelo banco")
          : balanceSource === "unavailable"
            ? t("Ainda sem sincronização")
            : t("Valor calculado na aplicação")}
        {balanceAsOf
          ? ` · ${formatDate(balanceAsOf, { dateStyle: "short", timeStyle: "short" })}`
          : ""}
      </p>
    </div>
  );
}
