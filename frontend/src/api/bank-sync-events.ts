export const BANK_SYNC_COMPLETED_EVENT = "expensesnap:bank-sync-completed";

export function notifyBankSyncCompleted(connectionId?: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(BANK_SYNC_COMPLETED_EVENT, {
      detail: connectionId ? { connectionId } : undefined,
    }),
  );
}
