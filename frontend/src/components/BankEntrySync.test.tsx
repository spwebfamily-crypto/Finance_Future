import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BANK_SYNC_COMPLETED_EVENT } from "../api/bank-sync-events";
import type { BankConnectionSummary, BankSyncJob } from "../types";
import { BankEntrySync } from "./BankEntrySync";

const api = vi.hoisted(() => ({ connections: vi.fn(), sync: vi.fn(), syncJobs: vi.fn() }));
vi.mock("../api/resources", () => ({ openBankingApi: api }));
vi.mock("../auth/AuthContext", () => ({ useAuth: () => ({ user: { id: "user-1" } }) }));

const connection: BankConnectionSummary = {
  id: "connection-1",
  institutionId: "PT|Banco Demo",
  institutionName: "Banco Demo",
  institutionCountry: "PT",
  status: "active",
  consentExpiresAt: new Date(Date.now() + 86_400_000).toISOString(),
  lastSyncedAt: null,
  nextSyncAt: null,
  error: null,
  accountCount: 1,
  accounts: [],
  createdAt: new Date().toISOString(),
};

function completedJob(): BankSyncJob {
  return {
    id: "job-1",
    connectionId: connection.id,
    status: "completed",
    trigger: "manual",
    attemptCount: 1,
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    accountsProcessed: 1,
    transactionsCreated: 1,
    transactionsUpdated: 0,
    transactionsSkipped: 0,
    errorCode: null,
    createdAt: new Date().toISOString(),
  };
}

describe("BankEntrySync", () => {
  beforeEach(() => {
    api.connections.mockReset().mockResolvedValue([]);
    api.sync.mockReset().mockResolvedValue({ jobId: "job-1", status: "queued" });
    api.syncJobs.mockReset().mockResolvedValue([completedJob()]);
  });

  it("does not start jobs for a user without linked banks", async () => {
    render(<MemoryRouter><BankEntrySync offline={false} /></MemoryRouter>);
    await waitFor(() => expect(api.connections).toHaveBeenCalledTimes(1));
    expect(api.sync).not.toHaveBeenCalled();
  });

  it("starts and tracks sync for a linked bank on entry", async () => {
    api.connections.mockResolvedValue([connection]);
    const completed = vi.fn();
    window.addEventListener(BANK_SYNC_COMPLETED_EVENT, completed);
    render(<MemoryRouter><BankEntrySync offline={false} /></MemoryRouter>);
    expect(await screen.findByText(/Bancos atualizados/)).toBeInTheDocument();
    expect(api.sync).toHaveBeenCalledWith(connection.id);
    expect(api.syncJobs).toHaveBeenCalledWith(["job-1"]);
    expect(completed).toHaveBeenCalledTimes(1);
    window.removeEventListener(BANK_SYNC_COMPLETED_EVENT, completed);
  });

  it("respects a recent sync and the provider's rate-limit window", async () => {
    api.connections.mockResolvedValue([
      { ...connection, lastSyncedAt: new Date().toISOString() },
      {
        ...connection,
        id: "connection-2",
        error: { code: "PROVIDER_PROVIDER_RATE_LIMITED", at: new Date().toISOString() },
        nextSyncAt: new Date(Date.now() + 3_600_000).toISOString(),
      },
    ]);
    render(<MemoryRouter><BankEntrySync offline={false} /></MemoryRouter>);
    await waitFor(() => expect(api.connections).toHaveBeenCalledTimes(1));
    expect(api.sync).not.toHaveBeenCalled();
  });
});
