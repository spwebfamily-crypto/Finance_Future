import { useEffect, useState } from "react";
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
  const retryAt =
    connection.error?.code === "PROVIDER_PROVIDER_RATE_LIMITED" ? connection.nextSyncAt : null;
  const [expiredRetryAt, setExpiredRetryAt] = useState<string | null>(null);
  const cooldownActive = Boolean(retryAt && expiredRetryAt !== retryAt);

  useEffect(() => {
    if (!retryAt) return;
    const remaining = new Date(retryAt).getTime() - Date.now();
    const timer = window.setTimeout(() => setExpiredRetryAt(retryAt), Math.max(0, remaining));
    return () => window.clearTimeout(timer);
  }, [retryAt]);

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
        nextSyncAt={connection.nextSyncAt}
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
            disabled={busy || cooldownActive}
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
            {busy || cooldownActive ? (
              <Spinner label={t(busy ? "A sincronizar" : "Aguardar limite do banco")} />
            ) : (
              <RefreshCw aria-hidden="true" />
            )}
            <span>
              {t(
                cooldownActive
                  ? "Disponível após {date}"
                  : connection.status === "error"
                    ? "Tentar novamente"
                    : "Sincronizar",
                cooldownActive && retryAt
                  ? { date: formatDate(retryAt, { dateStyle: "short", timeStyle: "short" }) }
                  : undefined,
              )}
            </span>
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
