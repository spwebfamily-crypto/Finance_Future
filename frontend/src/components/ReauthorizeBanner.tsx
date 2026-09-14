import { AlertTriangle } from "lucide-react";
import { useI18n } from "../i18n/I18nContext";

/** Aviso de renovação de consentimento, mostrado quando o banco exige reautorização. */
export function ReauthorizeBanner({
  status,
  institutionName,
  onRenew,
  busy = false,
}: {
  status: "reauth_required" | "expired" | "revoked";
  institutionName: string;
  onRenew: () => void;
  busy?: boolean;
}) {
  const { t } = useI18n();
  const message =
    status === "expired"
      ? t("O consentimento do {bank} expirou.", { bank: institutionName })
      : status === "revoked"
        ? t("O consentimento do {bank} foi revogado no banco.", { bank: institutionName })
        : t("O {bank} pede uma renovação do consentimento.", { bank: institutionName });

  return (
    <div className="reauthorize-banner" role="status">
      <AlertTriangle aria-hidden="true" />
      <p>
        {message} {t("Os movimentos deixam de ser atualizados até renovar o acesso. Os dados já importados continuam disponíveis.")}
      </p>
      <button type="button" className="button button--accent" onClick={onRenew} disabled={busy}>
        {t("Renovar acesso")}
      </button>
    </div>
  );
}
