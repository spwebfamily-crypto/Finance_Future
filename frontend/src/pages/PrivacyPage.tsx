import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ShieldCheck } from "lucide-react";
import { ErrorState, LoadingState } from "../components/States";
import { PageHeader } from "../components/PageHeader";
import { openBankingApi } from "../api/resources";
import { errorMessage } from "../api/client";
import type { BankConnectionStatus, BankConnectionSummary } from "../types";

const connectionStatusLabels: Record<BankConnectionStatus, string> = {
  pending: "Aguarda confirmação no banco",
  active: "Ligação ativa",
  reauth_required: "É preciso voltar a autorizar",
  expired: "Consentimento expirado",
  revoked: "Consentimento revogado",
  disconnected: "Banco desligado",
  error: "Erro na última sincronização",
};

/** Centro de privacidade: bancos ligados, dados guardados e como os apagar. */
export function PrivacyPage() {
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
    void load();
  }, [load]);

  const liveConnections = connections.filter((connection) => connection.status !== "disconnected");

  return (
    <div className="page page--privacy">
      <PageHeader
        eyebrow="Privacidade"
        title="Os seus dados bancários"
        description="O que é guardado, para que serve e como revogar ou eliminar o acesso."
      />

      {error && !connections.length ? (
        <ErrorState message={error} onRetry={() => void load()} />
      ) : (
        error && (
          <div className="form-alert form-alert--page" role="alert">
            {error}
            <button className="button button--secondary button--small" type="button" onClick={() => void load()}>
              Tentar novamente
            </button>
          </div>
        )
      )}

      <section className="accounts-panel" aria-labelledby="privacy-data">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Dados</p>
            <h2 id="privacy-data">O que guardamos</h2>
          </div>
          <ShieldCheck aria-hidden="true" />
        </div>
        <ul className="privacy-list">
          <li>
            <strong>Nome da instituição e identificador da ligação</strong> — para mostrar que banco
            está ligado.
          </li>
          <li>
            <strong>Identificador da sessão, cifrado</strong> — necessário para ler saldos e
            movimentos enquanto o consentimento existir.
          </li>
          <li>
            <strong>IBAN mascarado e um hash da conta</strong> — apenas para apresentação e para
            casar transferências entre as suas contas. O IBAN completo nunca é guardado.
          </li>
          <li>
            <strong>Saldos e movimentos</strong> — descrição, valor, data, estado (pendente ou
            contabilizado) e, quando existir, o nome da contraparte.
          </li>
          <li>
            <strong>Despesas, rendimentos e transferências criadas</strong> — a partir de movimentos
            contabilizados, para entrarem nas análises que já usa.
          </li>
        </ul>
        <p className="planning-disclosure__hint">
          Nunca guardamos a palavra-passe do banco nem credenciais bancárias. Não há iniciação de
          pagamentos.
        </p>
      </section>

      <section className="accounts-panel" aria-labelledby="privacy-connections">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Ligações</p>
            <h2 id="privacy-connections">Bancos ligados</h2>
          </div>
        </div>
        {isLoading ? (
          <LoadingState label="A carregar as ligações" />
        ) : error && !connections.length ? null : liveConnections.length ? (
          <ul className="privacy-connections">
            {liveConnections.map((connection) => (
              <li key={connection.id}>
                <div>
                  <strong>{connection.institutionName}</strong>
                  <p>
                    Estado: {connectionStatusLabels[connection.status]}
                    {connection.lastSyncedAt
                      ? ` · Última sincronização: ${new Date(connection.lastSyncedAt).toLocaleString("pt-PT")}`
                      : " · Ainda sem sincronização"}
                    {connection.consentExpiresAt
                      ? ` · Consentimento até ${new Date(connection.consentExpiresAt).toLocaleDateString("pt-PT")}`
                      : ""}
                  </p>
                </div>
                <Link className="button button--secondary" to="/accounts/connections">
                  Gerir
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="accounts-empty">Não tem bancos ligados.</p>
        )}
      </section>

      <section className="accounts-panel" aria-labelledby="privacy-rights">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Controlo</p>
            <h2 id="privacy-rights">Renovar, revogar e eliminar</h2>
          </div>
        </div>
        <p>
          Pode renovar o consentimento quando o banco o exigir, desligar um banco conservando os
          dados já importados ou apagar esses dados. A eliminação remove apenas o que veio do banco:
          os registos manuais não são apagados.
        </p>
        <Link className="button button--primary" to="/accounts/connections">
          Gerir ligações bancárias
        </Link>
      </section>
    </div>
  );
}
