import { RefreshCw } from "lucide-react";
import { BankLogo } from "./BankLogo";
import { BankSyncStatus } from "./BankSyncStatus";
import { Spinner } from "./States";
import type { BankConnectionSummary } from "../types";

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
  const needsReauth =
    connection.status === "reauth_required" ||
    connection.status === "expired" ||
    connection.status === "revoked" ||
    // Uma ligação em erro não pode ser sincronizada de novo com segurança: a
    // renovação cria uma nova sessão sem apagar os dados já importados.
    connection.status === "error";
  const canSync = connection.status === "active";

  return (
    <article className="bank-connection-card">
      <header>
        <BankLogo
          className="bank-connection-card__icon"
          logoUrl={logoUrl}
        />
        <div>
          <h3>{connection.institutionName}</h3>
          <p>
            {connection.accountCount}{" "}
            {connection.accountCount === 1 ? "conta ligada" : "contas ligadas"}
          </p>
        </div>
      </header>

      <BankSyncStatus status={connection.status} lastSyncedAt={connection.lastSyncedAt} />

      {connection.consentExpiresAt && (
        <p className="bank-connection-card__consent">
          Consentimento válido até{" "}
          {new Date(connection.consentExpiresAt).toLocaleDateString("pt-PT")}
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
            Renovar acesso
          </button>
        )}
        {canSync && (
          <button
            type="button"
            className="button button--primary"
            onClick={() => onSync(connection)}
            disabled={busy}
          >
            {busy ? <Spinner label="A sincronizar" /> : <RefreshCw aria-hidden="true" />}
            <span>Sincronizar</span>
          </button>
        )}
        <button
          type="button"
          className="icon-button icon-button--danger"
          onClick={() => onDisconnect(connection)}
          disabled={busy}
          aria-label={`Desligar ${connection.institutionName}`}
        >
          Desligar
        </button>
      </div>
    </article>
  );
}
