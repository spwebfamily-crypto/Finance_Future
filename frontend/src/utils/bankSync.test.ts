import { describe, expect, it } from "vitest";
import type { BankSyncJob } from "../types";
import { bankSyncResultMessage, isBankSyncPending, isBankSyncSuccessful } from "./bankSync";

const t = (source: string) => source;

function job(status: BankSyncJob["status"], errorCode: string | null = null): BankSyncJob {
  return {
    id: "job-1",
    connectionId: "connection-1",
    status,
    trigger: "manual",
    attemptCount: 1,
    startedAt: null,
    finishedAt: null,
    accountsProcessed: 0,
    transactionsCreated: 0,
    transactionsUpdated: 0,
    transactionsSkipped: 0,
    errorCode,
    createdAt: "2026-09-15T10:00:00.000Z",
  };
}

describe("bank sync status", () => {
  it("does not report a failed terminal job as successful", () => {
    const failed = job("failed", "SYNC_JOB_STALE");

    expect(isBankSyncPending(failed)).toBe(false);
    expect(isBankSyncSuccessful(failed)).toBe(false);
    expect(bankSyncResultMessage(failed, t)).toContain("interrompida");
  });

  it("keeps partial jobs explicit and actionable", () => {
    const partial = job("partial", "PROVIDER_PROVIDER_TIMEOUT");

    expect(isBankSyncSuccessful(partial)).toBe(true);
    expect(bankSyncResultMessage(partial, t)).toContain("Sincronização parcial");
  });

  it("explains when the bank rate limit stopped a partial sync", () => {
    const partial = job("partial", "PROVIDER_PROVIDER_RATE_LIMITED");

    expect(bankSyncResultMessage(partial, t)).toContain("tente após a espera indicada");
  });
});
