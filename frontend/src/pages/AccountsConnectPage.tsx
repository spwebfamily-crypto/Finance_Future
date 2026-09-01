import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Landmark, ShieldCheck, WifiOff } from "lucide-react";
import { BankConsentNotice } from "../components/BankConsentNotice";
import { InstitutionPicker } from "../components/InstitutionPicker";
import { LoadingState, Spinner } from "../components/States";
import { PageHeader } from "../components/PageHeader";
import { openBankingApi } from "../api/resources";
import { errorMessage } from "../api/client";
import type { BankInstitution, PsuType } from "../types";

function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(
    () => typeof navigator === "undefined" || navigator.onLine,
  );
  useEffect(() => {
    const online = () => setIsOnline(true);
    const offline = () => setIsOnline(false);
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    return () => {
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
    };
  }, []);
  return isOnline;
}

export function AccountsConnectPage() {
  const navigate = useNavigate();
  const isOnline = useOnlineStatus();
  const [institutions, setInstitutions] = useState<BankInstitution[]>([]);
  const [query, setQuery] = useState("");
  const [psuType, setPsuType] = useState<PsuType>("personal");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setIsLoading(true);
    setError("");
    try {
      const items = await openBankingApi.institutions("PT", psuType);
      setInstitutions(items);
      setSelectedId((current) =>
        current && items.some((item) => item.id === current) ? current : null,
      );
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setIsLoading(false);
    }
  }, [psuType]);

  useEffect(() => {
    void load();
  }, [load]);

  const selected = useMemo(
    () => institutions.find((institution) => institution.id === selectedId) ?? null,
    [institutions, selectedId],
  );

  async function continueInBank() {
    if (!selected) return;
    setIsSubmitting(true);
    setError("");
    try {
      const authorization = await openBankingApi.authorize({
        institutionId: selected.id,
        country: selected.country,
        psuType,
        returnPath: "/accounts",
      });
      window.location.assign(authorization.authorizationUrl);
    } catch (requestError) {
      setError(errorMessage(requestError));
      setIsSubmitting(false);
    }
  }

  if (isLoading) {
    return (
      <div className="page">
        <LoadingState label="A carregar os bancos disponíveis" />
      </div>
    );
  }

  return (
    <div className="page page--connect">
      <PageHeader
        eyebrow="Ligar banco"
        title="Ligar um banco"
        description="Autorize a leitura no próprio banco. Cada gasto contabilizado passa a despesa — no arquivo, no painel e nos limites."
      />

      <ol className="connect-steps" aria-label="Como funciona">
        <li className={selected ? "is-done" : "is-current"}>
          <span>1</span>
          <div>
            <strong>Escolha o banco</strong>
            <small>Só leitura de saldos e movimentos.</small>
          </div>
        </li>
        <li className={selected ? "is-current" : ""}>
          <span>2</span>
          <div>
            <strong>Confirme no banco</strong>
            <small>A palavra-passe nunca passa por aqui.</small>
          </div>
        </li>
        <li>
          <span>3</span>
          <div>
            <strong>Gastos viram despesas</strong>
            <small>Ficam no arquivo no instante da sincronização.</small>
          </div>
        </li>
      </ol>

      {error && (
        <div className="form-alert form-alert--page" role="alert">
          {error}
          <button type="button" className="button button--secondary" onClick={() => void load()}>
            Tentar novamente
          </button>
        </div>
      )}

      {!isOnline && (
        <p className="offline-note" role="status">
          <WifiOff aria-hidden="true" /> Sem ligação. Para ligar um banco precisa de estar online.
        </p>
      )}

      <div className="connect-layout">
        <section className="accounts-panel accounts-panel--quiet" aria-labelledby="psu-title">
          <div className="connect-toolbar">
            <div>
              <p className="eyebrow">Banco</p>
              <h2 id="psu-title">Onde está o dinheiro</h2>
            </div>
            <div className="segmented-control" role="group" aria-label="Tipo de conta">
              <button
                type="button"
                className={psuType === "personal" ? "is-active" : ""}
                aria-pressed={psuType === "personal"}
                onClick={() => setPsuType("personal")}
              >
                Pessoal
              </button>
              <button
                type="button"
                className={psuType === "business" ? "is-active" : ""}
                aria-pressed={psuType === "business"}
                onClick={() => setPsuType("business")}
              >
                Empresarial
              </button>
            </div>
          </div>

          {institutions.length ? (
            <InstitutionPicker
              institutions={institutions}
              query={query}
              onQueryChange={setQuery}
              selectedId={selectedId}
              onSelect={(institution) => setSelectedId(institution.id)}
              disabled={!isOnline}
            />
          ) : (
            <p className="accounts-empty">
              <Landmark aria-hidden="true" /> Não há bancos disponíveis para este tipo de conta.
            </p>
          )}
        </section>

        <aside className="connect-aside">
          <BankConsentNotice institutionName={selected?.name} />
          <div className="connect-cta">
            <button
              type="button"
              className="button button--accent button--wide"
              disabled={!selected || isSubmitting || !isOnline}
              onClick={() => void continueInBank()}
            >
              {isSubmitting ? (
                <Spinner label="A abrir o banco" />
              ) : (
                <>
                  Continuar no banco <ArrowRight aria-hidden="true" />
                </>
              )}
            </button>
            {!selected && <p className="planning-disclosure__hint">Escolha primeiro o banco.</p>}
            <p className="connect-cta__trust">
              <ShieldCheck aria-hidden="true" /> Só leitura. Pode desligar quando quiser.
            </p>
            <button
              type="button"
              className="button button--ghost button--wide"
              onClick={() => navigate("/accounts")}
            >
              Voltar às contas
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}
