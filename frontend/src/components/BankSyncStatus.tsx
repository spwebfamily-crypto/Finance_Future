import { AlertTriangle, CheckCircle2, Clock, RefreshCw, WifiOff } from "lucide-react";
import type { BankConnectionStatus } from "../types";

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
  "Não foi possível concluir a leitura do banco. Renove o acesso para criar uma nova sessão segura.";

/**
 * Estado da ligação. Nunca se escreve "tempo real": o texto é sempre sobre a
 * última atualização conhecida.
 */
export function BankSyncStatus({
  status,
  lastSyncedAt,
  compact = false,
}: {
  status: BankConnectionStatus;
  lastSyncedAt?: string | null;
  compact?: boolean;
}) {
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
      <span>{labels[status]}</span>
      {status === "error" && !compact && <small>{errorRecoveryHint}</small>}
      {!compact && lastSyncedAt && (
        <small>Última atualização: {new Date(lastSyncedAt).toLocaleString("pt-PT")}</small>
      )}
      {!compact && !lastSyncedAt && status === "active" && <small>Ainda sem sincronização.</small>}
    </p>
  );
}

export function SyncingIndicator({ label = "A sincronizar" }: { label?: string }) {
  return (
    <p className="bank-status bank-status--syncing" role="status">
      <RefreshCw aria-hidden="true" />
      <span>{label}</span>
    </p>
  );
}
