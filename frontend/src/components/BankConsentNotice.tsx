import { ShieldCheck } from "lucide-react";
import { useI18n } from "../i18n/I18nContext";

/**
 * Explicação do consentimento. Deixa claro que a palavra-passe do banco nunca
 * passa pela aplicação.
 */
export function BankConsentNotice({ institutionName }: { institutionName?: string }) {
  const { t } = useI18n();
  return (
    <aside className="consent-notice" aria-label={t("O que vai autorizar")}>
      <p className="consent-notice__title">
        <ShieldCheck aria-hidden="true" /> {t("O que vai autorizar")}
      </p>
      <ul>
        <li>
          {t(institutionName ? "Ler saldo e movimentos de {bank}." : "Ler saldo e movimentos.", {
            bank: institutionName ?? "",
          })}
        </li>
        <li>{t("Transformar cada gasto contabilizado numa despesa da aplicação.")}</li>
        <li>{t("Renovar o consentimento quando o banco o pedir (em regra a cada 90 dias).")}</li>
      </ul>
      <p className="consent-notice__security">
        {t(
          "O ExpenseSnap nunca recebe nem guarda a sua palavra-passe do banco: a autorização é feita no ambiente seguro do próprio banco. Pode desligar o banco e apagar os dados importados quando quiser.",
        )}
      </p>
    </aside>
  );
}
