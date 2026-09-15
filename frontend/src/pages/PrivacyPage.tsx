import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ShieldCheck } from "lucide-react";
import { ErrorState, LoadingState } from "../components/States";
import { PageHeader } from "../components/PageHeader";
import { openBankingApi } from "../api/resources";
import { errorMessage } from "../api/client";
import type { BankConnectionStatus, BankConnectionSummary } from "../types";
import { useI18n } from "../i18n/I18nContext";

const connectionStatusLabels: Record<BankConnectionStatus, string> = {
  pending: "status.connection.pending",
  active: "status.connection.active",
  reauth_required: "status.connection.reauth_required",
  expired: "status.connection.expired",
  revoked: "status.connection.revoked",
  disconnected: "status.connection.disconnected",
  error: "status.connection.error",
};

/** Centro de privacidade: bancos ligados, dados guardados e como os apagar. */
export function PrivacyPage() {
  const { t, formatDate } = useI18n();
  const [connections, setConnections] = useState<BankConnectionSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setIsLoading(true);
    setError("");
    try {
      setConnections(await openBankingApi.connections());
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (active) void load();
    });
    return () => {
      active = false;
    };
  }, [load]);

  const liveConnections = connections.filter((connection) => connection.status !== "disconnected");

  return (
    <div className="page page--privacy">
      <PageHeader
        eyebrow={t("privacy.eyebrow")}
        title={t("privacy.title")}
        description={t("privacy.description")}
      />

      {error && !connections.length ? (
        <ErrorState message={error} onRetry={() => void load()} />
      ) : (
        error && (
          <div className="form-alert form-alert--page" role="alert">
            {error}
            <button
              className="button button--secondary button--small"
              type="button"
              onClick={() => void load()}
            >
              {t("Tentar novamente")}
            </button>
          </div>
        )
      )}

      <section className="accounts-panel" aria-labelledby="privacy-data">
        <div className="section-heading">
          <div>
            <p className="eyebrow">{t("privacy.dataEyebrow")}</p>
            <h2 id="privacy-data">{t("privacy.dataTitle")}</h2>
          </div>
          <ShieldCheck aria-hidden="true" />
        </div>
        <ul className="privacy-list">
          <li>
            <strong>{t("privacy.storedInstitution")}</strong> —{" "}
            {t("privacy.storedInstitutionDescription")}
          </li>
          <li>
            <strong>{t("privacy.storedSession")}</strong> — {t("privacy.storedSessionDescription")}
          </li>
          <li>
            <strong>{t("privacy.storedIban")}</strong> — {t("privacy.storedIbanDescription")}
          </li>
          <li>
            <strong>{t("privacy.storedTransactions")}</strong> —{" "}
            {t("privacy.storedTransactionsDescription")}
          </li>
          <li>
            <strong>{t("privacy.storedRecords")}</strong> — {t("privacy.storedRecordsDescription")}
          </li>
        </ul>
        <p className="planning-disclosure__hint">{t("privacy.noPassword")}</p>
      </section>

      <section className="accounts-panel" aria-labelledby="privacy-connections">
        <div className="section-heading">
          <div>
            <p className="eyebrow">{t("privacy.connectionsEyebrow")}</p>
            <h2 id="privacy-connections">{t("privacy.connectionsTitle")}</h2>
          </div>
        </div>
        {isLoading ? (
          <LoadingState label={t("privacy.loading")} />
        ) : error && !connections.length ? null : liveConnections.length ? (
          <ul className="privacy-connections">
            {liveConnections.map((connection) => (
              <li key={connection.id}>
                <div>
                  <strong>{connection.institutionName}</strong>
                  <p>
                    {t("privacy.status", { status: t(connectionStatusLabels[connection.status]) })}
                    {connection.lastSyncedAt
                      ? ` · ${t("privacy.lastSync", { date: formatDate(connection.lastSyncedAt, { dateStyle: "medium", timeStyle: "short" }) })}`
                      : ` · ${t("privacy.notSynced")}`}
                    {connection.consentExpiresAt
                      ? ` · ${t("privacy.consentUntil", { date: formatDate(connection.consentExpiresAt, { dateStyle: "medium" }) })}`
                      : ""}
                  </p>
                </div>
                <Link className="button button--secondary" to="/accounts/connections">
                  {t("privacy.manage")}
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="accounts-empty">{t("privacy.empty")}</p>
        )}
      </section>

      <section className="accounts-panel" aria-labelledby="privacy-rights">
        <div className="section-heading">
          <div>
            <p className="eyebrow">{t("privacy.controlEyebrow")}</p>
            <h2 id="privacy-rights">{t("privacy.controlTitle")}</h2>
          </div>
        </div>
        <p>{t("privacy.rightsDescription")}</p>
        <Link className="button button--primary" to="/accounts/connections">
          {t("privacy.manageConnections")}
        </Link>
      </section>
    </div>
  );
}
