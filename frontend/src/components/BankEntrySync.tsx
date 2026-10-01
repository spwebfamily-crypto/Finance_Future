import { useEffect, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, RefreshCw, X } from "lucide-react";
import { Link } from "react-router-dom";
import { openBankingApi } from "../api/resources";
import { notifyBankSyncCompleted } from "../api/bank-sync-events";
import { useAuth } from "../auth/AuthContext";
import { useI18n } from "../i18n/I18nContext";
import type { BankSyncJob } from "../types";
import { isBankSyncPending, isBankSyncSuccessful } from "../utils/bankSync";

const RECENT_SYNC_MS = 5 * 60_000;
const POLL_INTERVAL_MS = 10_000;
const MAX_POLLS = 30;

type EntrySyncState = "idle" | "syncing" | "success" | "error";
type PendingJob = { connectionId: string; jobId: string };

/** Atualiza as ligações autorizadas ao abrir a app, sem pedir nada a quem não tem bancos. */
export function BankEntrySync({ offline }: { offline: boolean }) {
  const { user } = useAuth();
  const { t } = useI18n();
  const [state, setState] = useState<EntrySyncState>("idle");
  const initialCallback = useRef(
    typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).get("bankConnection") === "success",
  );
  const userId = user?.id;

  useEffect(() => {
    if (!userId || offline || initialCallback.current) return;
    let cancelled = false;
    let timer: number | undefined;

    async function poll(jobs: PendingJob[], attempt: number, hadError: boolean) {
      try {
        const batches: BankSyncJob[][] = [];
        for (let index = 0; index < jobs.length; index += 25) {
          batches.push(await openBankingApi.syncJobs(jobs.slice(index, index + 25).map((job) => job.jobId)));
        }
        if (cancelled) return;
        const byId = new Map(batches.flat().map((job) => [job.id, job]));
        const remaining: PendingJob[] = [];
        let failed = hadError;
        for (const job of jobs) {
          const result = byId.get(job.jobId);
          if (!result || isBankSyncPending(result)) {
            remaining.push(job);
          } else if (isBankSyncSuccessful(result)) {
            notifyBankSyncCompleted(job.connectionId);
            if (result.status === "partial") failed = true;
          } else {
            failed = true;
          }
        }
        if (remaining.length && attempt < MAX_POLLS) {
          timer = window.setTimeout(() => void poll(remaining, attempt + 1, failed), POLL_INTERVAL_MS);
        } else {
          setState(failed || remaining.length ? "error" : "success");
        }
      } catch {
        if (cancelled) return;
        if (attempt < 3) {
          timer = window.setTimeout(() => void poll(jobs, attempt + 1, hadError), POLL_INTERVAL_MS);
        } else {
          setState("error");
        }
      }
    }

    async function start() {
      try {
        const connections = await openBankingApi.connections();
        if (cancelled) return;
        const now = Date.now();
        const eligible = connections.filter((connection) => {
          if (connection.status !== "active" && connection.status !== "error") return false;
          if (connection.consentExpiresAt && Date.parse(connection.consentExpiresAt) <= now) return false;
          if (connection.lastSyncedAt && now - Date.parse(connection.lastSyncedAt) < RECENT_SYNC_MS) return false;
          if (
            connection.error?.code === "PROVIDER_PROVIDER_RATE_LIMITED" &&
            connection.nextSyncAt && Date.parse(connection.nextSyncAt) > now
          ) return false;
          return true;
        });
        if (!eligible.length) return;
        setState("syncing");
        const requests = await Promise.allSettled(eligible.map((connection) => openBankingApi.sync(connection.id)));
        if (cancelled) return;
        const jobs: PendingJob[] = [];
        let failed = false;
        requests.forEach((result, index) => {
          if (result.status === "fulfilled") {
            jobs.push({ connectionId: eligible[index].id, jobId: result.value.jobId });
          } else {
            failed = true;
          }
        });
        if (jobs.length) void poll(jobs, 0, failed);
        else setState("error");
      } catch {
        // A leitura de ligações pode estar desativada; só mostramos erro após
        // saber que existe uma ligação cuja sincronização foi tentada.
      }
    }

    void start();
    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [userId, offline]);

  if (state === "idle") return null;
  const message =
    state === "syncing"
      ? "A sincronizar os bancos ligados…"
      : state === "success"
        ? "Bancos atualizados. Saldos e movimentos disponíveis."
        : "Uma ligação bancária não foi atualizada. Consulte o estado e tente novamente.";
  const Icon = state === "syncing" ? RefreshCw : state === "success" ? CheckCircle2 : AlertCircle;

  return (
    <div className={`bank-sync-banner bank-sync-banner--${state}`} role="status">
      <Icon aria-hidden="true" />
      <span>{t(message)}</span>
      {state === "error" && <Link to="/accounts/connections">{t("Ver bancos")}</Link>}
      {state !== "syncing" && (
        <button className="icon-button" type="button" onClick={() => setState("idle")} aria-label={t("Fechar aviso")}>
          <X aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
