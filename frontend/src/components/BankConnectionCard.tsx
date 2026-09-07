import { RefreshCw } from "lucide-react";
import { BankLogo } from "./BankLogo";
import { BankSyncStatus } from "./BankSyncStatus";
import { Spinner } from "./States";
import type { BankConnectionSummary } from "../types";
import { useI18n } from "../i18n/I18nContext";

export function BankConnectionCard({
  connection,
  logoUrl,
  busy = false,
  onSync,
  onReauthorize,
  onDisconnect,
}: {
  connection: BankConnectionSummary;
  logoUrl?: string | null;
  busy?: boolean;
  onSync: (connection: BankConnectionSummary) => void;
  onReauthorize: (connection: BankConnectionSummary) => void;
  onDisconnect: (connection: BankConnectionSummary) => void;
}) {
  const { t, formatDate } = useI18n();
  const needsReauth =
    connection.status === "reauth_required" ||
    connection.status === "expired" ||
    connection.status === "revoked";
  // Um erro não significa necessariamente que o consentimento deixou de ser
  // válido. Primeiro permite-se repetir a leitura usando a mesma sessão.
  const canSync = connection.status === "active" || connection.status === "error";

  return (
    <article className="bank-connection-card">
      <header>
        <BankLogo className="bank-connection-card__icon" logoUrl={logoUrl} />
        <div>
          <h3>{connection.institutionName}</h3>
          <p>
            {t(connection.accountCount === 1 ? "{count} conta ligada" : "{count} contas ligadas", {
              count: connection.accountCount,
            })}
          </p>
        </div>
      </header>

      <BankSyncStatus
        status={connection.status}
        lastSyncedAt={connection.lastSyncedAt}
        errorCode={connection.error?.code}
      />

      {connection.consentExpiresAt && (
        <p className="bank-connection-card__consent">
          {t("Consentimento válido até {date}", {
            date: formatDate(connection.consentExpiresAt),
          })}
        </p>
      )}

      <div className="bank-connection-card__actions">
        {needsReauth && (
          <button
            type="button"
            className="button button--accent"
            onClick={() => onReauthorize(connection)}
            disabled={busy}
          >
            {t("Renovar acesso")}
          </button>
        )}
        {canSync && (
          <button
            type="button"
            className="button button--primary"
            onClick={() => onSync(connection)}
            disabled={busy}
          >
            {busy ? <Spinner label={t("A sincronizar")} /> : <RefreshCw aria-hidden="true" />}
            <span>{t(connection.status === "error" ? "Tentar novamente" : "Sincronizar")}</span>
          </button>
        )}
        <button
          type="button"
          className="icon-button icon-button--danger"
          onClick={() => onDisconnect(connection)}
          disabled={busy}
          aria-label={t("Desligar {bank}", { bank: connection.institutionName })}
        >
          {t("Desligar")}
        </button>
      </div>
    </article>
  );
}
