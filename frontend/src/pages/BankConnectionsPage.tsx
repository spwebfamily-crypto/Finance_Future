import { useCallback, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Plus } from "lucide-react";
import { BankConnectionCard } from "../components/BankConnectionCard";
import { DisconnectBankDialog } from "../components/DisconnectBankDialog";
import { ErrorState, LoadingState } from "../components/States";
import { NoticeToast } from "../components/NoticeToast";
import { PageHeader } from "../components/PageHeader";
import { openBankingApi } from "../api/resources";
import { errorMessage } from "../api/client";
import type { BankConnectionSummary, BankInstitution, BankRetention, BankSyncJob } from "../types";

const POLL_INTERVAL_MS = 3_000;

export function BankConnectionsPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [connections, setConnections] = useState<BankConnectionSummary[]>([]);
  const [institutionLogos, setInstitutionLogos] = useState<Map<string, string>>(new Map());
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState(
    searchParams.get("bankConnection") === "success"
      ? "Banco ligado. A primeira sincronização começou — os gastos contabilizados passam a despesas."
      : "",
  );
  const [busyId, setBusyId] = useState<string | null>(null);
  const [disconnectTarget, setDisconnectTarget] = useState<BankConnectionSummary | null>(null);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [pendingJobs, setPendingJobs] = useState<Array<{ connectionId: string; jobId: string }>>(
    [],
  );

  // As ligações persistem apenas o identificador e o nome do banco. As marcas
  // continuam a vir do catálogo oficial e seguro devolvido pelo provedor.
  const loadInstitutionLogos = useCallback(async () => {
    const results = await Promise.allSettled([
      openBankingApi.institutions("PT", "personal"),
      openBankingApi.institutions("PT", "business"),
    ]);
    const logos = new Map<string, string>();
    for (const result of results) {
      if (result.status !== "fulfilled") continue;
      for (const institution of result.value as BankInstitution[]) {
        if (institution.logoUrl) logos.set(institution.id, institution.logoUrl);
      }
    }
    setInstitutionLogos(logos);
  }, []);

  const load = useCallback(
    async (showLoading = true) => {
      if (showLoading) setIsLoading(true);
      setError("");
      try {
        setConnections(await openBankingApi.connections());
        // A indisponibilidade momentânea do catálogo não impede a visualização
        // das ligações já existentes; nesse caso é mostrado o fallback neutro.
        void loadInstitutionLogos();
      } catch (requestError) {
        setError(errorMessage(requestError));
      } finally {
        if (showLoading) setIsLoading(false);
      }
    },
    [loadInstitutionLogos],
  );

  useEffect(() => {
    void load();
  }, [load]);

  // Acompanha os jobs em curso sem bloquear a interface.
  useEffect(() => {
    if (!pendingJobs.length) return;
    let cancelled = false;
    const poll = async () => {
      const remaining: Array<{ connectionId: string; jobId: string }> = [];
      let hasFinishedJob = false;
      for (const job of pendingJobs) {
        try {
          const status: BankSyncJob = await openBankingApi.syncJob(job.jobId);
          if (status.status === "queued" || status.status === "running") {
            remaining.push(job);
          } else if (!cancelled) {
            hasFinishedJob = true;
            setNotice(
              status.status === "completed"
                ? "Sincronização concluída. Os gastos contabilizados já estão em Despesas."
                : `Sincronização terminada com o estado ${status.status}.`,
            );
          }
        } catch {
          // Um job já eliminado deixa de ser seguido.
        }
      }
      if (cancelled) return;
      setPendingJobs(remaining);
      if (remaining.length || hasFinishedJob) {
        // Atualiza os saldos e o estado da ligação sem substituir a página por
        // um skeleton a cada ciclo de polling.
        void load(false);
      }
    };
    const timer = window.setTimeout(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [pendingJobs, load]);

  async function sync(connection: BankConnectionSummary) {
    setBusyId(connection.id);
    setError("");
    try {
      const job = await openBankingApi.sync(connection.id);
      setPendingJobs((jobs) => [...jobs, { connectionId: connection.id, jobId: job.jobId }]);
      setNotice("Sincronização pedida. Os gastos entram em Despesas quando terminar.");
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setBusyId(null);
    }
  }

  async function reauthorize(connection: BankConnectionSummary) {
    setBusyId(connection.id);
    setError("");
    try {
      const authorization = await openBankingApi.reauthorize(
        connection.id,
        "personal",
        connection.institutionCountry,
      );
      window.location.assign(authorization.authorizationUrl);
    } catch (requestError) {
      setError(errorMessage(requestError));
      setBusyId(null);
    }
  }

  async function confirmDisconnect(retention: BankRetention) {
    if (!disconnectTarget) return;
    setIsDisconnecting(true);
    try {
      const result = await openBankingApi.disconnect(disconnectTarget.id, retention);
      setNotice(
        retention === "delete_imported"
          ? `Banco desligado. ${result.transactionsDeleted} movimentos eliminados.`
          : "Banco desligado. Os dados importados foram conservados.",
      );
      setDisconnectTarget(null);
      await load();
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setIsDisconnecting(false);
    }
  }

  if (isLoading) {
    return (
      <div className="page">
        <LoadingState label="A carregar as ligações bancárias" />
      </div>
    );
  }

  if (error && !connections.length) {
    return (
      <div className="page">
        <ErrorState message={error} onRetry={() => void load()} />
      </div>
    );
  }

  const live = connections.filter((connection) => connection.status !== "disconnected");

  return (
    <div className="page page--connections">
      <NoticeToast message={notice} onClose={() => setNotice("")} />
      <PageHeader
        eyebrow="Bancos"
        title="Bancos ligados"
        description="Sincronize para trazer gastos como despesas. Renove o acesso ou desligue quando quiser."
        action={
          <button
            type="button"
            className="button button--accent"
            onClick={() => navigate("/accounts/connect")}
          >
            <Plus aria-hidden="true" /> Ligar banco
          </button>
        }
      />

      {error && (
        <div className="form-alert form-alert--page" role="alert">
          {error}
        </div>
      )}

      <section aria-labelledby="active-connections">
        <h2 id="active-connections" className="section-title">
          Ligações ativas
        </h2>
        {live.length ? (
          <div className="bank-connection-grid">
            {live.map((connection) => (
              <BankConnectionCard
                key={connection.id}
                connection={connection}
                logoUrl={institutionLogos.get(connection.institutionId)}
                busy={
                  busyId === connection.id ||
                  pendingJobs.some((job) => job.connectionId === connection.id)
                }
                onSync={(target) => void sync(target)}
                onReauthorize={(target) => void reauthorize(target)}
                onDisconnect={(target) => setDisconnectTarget(target)}
              />
            ))}
          </div>
        ) : (
          <p className="accounts-empty">
            Ainda não tem bancos ligados. Ligue um banco para importar saldos — cada gasto
            contabilizado passa a despesa.
          </p>
        )}
      </section>

      <DisconnectBankDialog
        open={Boolean(disconnectTarget)}
        institutionName={disconnectTarget?.institutionName ?? ""}
        busy={isDisconnecting}
        onCancel={() => setDisconnectTarget(null)}
        onConfirm={(retention) => void confirmDisconnect(retention)}
      />
    </div>
  );
}
