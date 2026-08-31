import { AlertTriangle } from "lucide-react";

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
  const message =
    status === "expired"
      ? `O consentimento do ${institutionName} expirou.`
      : status === "revoked"
        ? `O consentimento do ${institutionName} foi revogado no banco.`
        : `O ${institutionName} pede uma renovação do consentimento.`;

  return (
    <div className="reauthorize-banner" role="status">
      <AlertTriangle aria-hidden="true" />
      <p>
        {message} Os movimentos deixam de ser atualizados até renovar o acesso. Os dados já
        importados continuam disponíveis.
      </p>
      <button type="button" className="button button--accent" onClick={onRenew} disabled={busy}>
        Renovar acesso
      </button>
    </div>
  );
}
