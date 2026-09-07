import { AlertTriangle, CheckCircle2, Clock, RefreshCw, WifiOff } from "lucide-react";
import type { BankConnectionStatus } from "../types";
import { useI18n } from "../i18n/I18nContext";

const labels: Record<BankConnectionStatus, string> = {
  pending: "Aguarda confirmação no banco",
  active: "Ligação ativa",
  reauth_required: "É necessário renovar o consentimento",
  expired: "Consentimento expirado",
  revoked: "Consentimento revogado",
  disconnected: "Banco desligado",
  error: "Erro na última sincronização",
};

const errorRecoveryHint =
  "Não foi possível concluir a leitura do banco. Tente sincronizar novamente; se persistir, renove o acesso.";

/**
 * Estado da ligação. Nunca se escreve "tempo real": o texto é sempre sobre a
 * última atualização conhecida.
 */
export function BankSyncStatus({
  status,
  lastSyncedAt,
  errorCode,
  compact = false,
}: {
  status: BankConnectionStatus;
  lastSyncedAt?: string | null;
  errorCode?: string | null;
  compact?: boolean;
}) {
  const { t, formatDate } = useI18n();
  const icon =
    status === "active" ? (
      <CheckCircle2 aria-hidden="true" />
    ) : status === "disconnected" ? (
      <WifiOff aria-hidden="true" />
    ) : status === "pending" ? (
      <Clock aria-hidden="true" />
    ) : (
      <AlertTriangle aria-hidden="true" />
    );

  return (
    <p className={`bank-status bank-status--${status}`}>
      {icon}
      <span>{t(labels[status])}</span>
      {status === "error" && !compact && (
        <>
          <small>{t(errorRecoveryHint)}</small>
          {errorCode && <small>{t("Código de diagnóstico: {code}", { code: errorCode })}</small>}
        </>
      )}
      {!compact && lastSyncedAt && (
        <small>
          {t("Última atualização: {date}", {
            date: formatDate(lastSyncedAt, { dateStyle: "short", timeStyle: "short" }),
          })}
        </small>
      )}
      {!compact && !lastSyncedAt && status === "active" && (
        <small>{t("Ainda sem sincronização.")}</small>
      )}
    </p>
  );
}

export function SyncingIndicator({ label = "A sincronizar" }: { label?: string }) {
  const { t } = useI18n();
  return (
    <p className="bank-status bank-status--syncing" role="status">
      <RefreshCw aria-hidden="true" />
      <span>{t(label)}</span>
    </p>
  );
}
