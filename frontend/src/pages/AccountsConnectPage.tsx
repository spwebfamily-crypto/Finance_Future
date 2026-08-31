import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Landmark, WifiOff } from "lucide-react";
import { BankConsentNotice } from "../components/BankConsentNotice";
import { InstitutionPicker } from "../components/InstitutionPicker";
import { LoadingState } from "../components/States";
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
      // O utilizador é encaminhado para o ambiente do próprio banco.
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
        eyebrow="Open Banking"
        title="Ligar um banco"
        description="Escolha o banco, confirme o consentimento no ambiente do próprio banco e as contas passam a atualizar-se sozinhas."
      />

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

      <div className="connect-grid">
        <section className="accounts-panel" aria-labelledby="psu-title">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Tipo de conta</p>
              <h2 id="psu-title">Conta pessoal ou empresarial</h2>
            </div>
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

        <section className="accounts-panel" aria-labelledby="consent-title">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Consentimento</p>
              <h2 id="consent-title">O que vai autorizar</h2>
            </div>
          </div>
          <BankConsentNotice institutionName={selected?.name} />
          <button
            type="button"
            className="button button--accent"
            disabled={!selected || isSubmitting || !isOnline}
            onClick={() => void continueInBank()}
          >
            Continuar no banco
          </button>
          {!selected && <p className="planning-disclosure__hint">Escolha primeiro o banco.</p>}
          <button
            type="button"
            className="button button--secondary"
            onClick={() => navigate("/accounts")}
          >
            Voltar às contas
          </button>
        </section>
      </div>
    </div>
  );
}
