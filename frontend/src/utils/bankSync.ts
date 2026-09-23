import type { BankSyncJob } from "../types";

type Translate = (source: string, variables?: Record<string, string | number>) => string;

export function isBankSyncPending(job: Pick<BankSyncJob, "status">) {
  return job.status === "queued" || job.status === "running";
}

export function isBankSyncSuccessful(job: Pick<BankSyncJob, "status">) {
  return job.status === "completed" || job.status === "partial";
}

export function bankSyncResultMessage(job: BankSyncJob, t: Translate) {
  if (job.status === "completed") {
    return t("Sincronização concluída. Saldos e movimentos foram atualizados.");
  }
  if (job.status === "partial") {
    if (
      job.errorCode === "PROVIDER_PROVIDER_RATE_LIMITED" ||
      job.errorCode === "BANK_PROVIDER_RATE_LIMITED"
    ) {
      return t(
        "O banco limitou os pedidos. As contas já atualizadas foram guardadas; tente após a espera indicada.",
      );
    }
    return t(
      "Sincronização parcial. As contas disponíveis foram atualizadas; tente novamente para concluir.",
    );
  }

  switch (job.errorCode) {
    case "BANK_CONNECTION_EXPIRED":
    case "BANK_CONNECTION_REAUTH_REQUIRED":
      return t("O acesso ao banco expirou. Renove o acesso para voltar a sincronizar.");
    case "BANK_PROVIDER_UNAVAILABLE":
    case "PROVIDER_PROVIDER_UNAVAILABLE":
    case "PROVIDER_PROVIDER_TIMEOUT":
      return t("O banco está temporariamente indisponível. Tente sincronizar novamente.");
    case "PROVIDER_PROVIDER_RATE_LIMITED":
    case "BANK_PROVIDER_RATE_LIMITED":
      return t("O banco limitou os pedidos. Aguarde até à próxima sincronização.");
    case "SYNC_JOB_STALE":
      return t("A sincronização anterior foi interrompida. Pode tentar novamente agora.");
    default:
      return t("A sincronização bancária falhou. Tente novamente ou renove o acesso.");
  }
}
