import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BANK_SYNC_COMPLETED_EVENT } from "../api/bank-sync-events";
import type { BankConnectionSummary, BankSyncJob } from "../types";
import { BankConnectionsPage } from "./BankConnectionsPage";

const api = vi.hoisted(() => ({
  connections: vi.fn(),
  institutions: vi.fn(),
  sync: vi.fn(),
  syncJob: vi.fn(),
  reauthorize: vi.fn(),
  disconnect: vi.fn(),
}));

vi.mock("../api/resources", () => ({ openBankingApi: api }));

const connection: BankConnectionSummary = {
  id: "connection-1",
  institutionId: "PT|Banco Demonstração",
  institutionName: "Banco Demonstração",
  institutionCountry: "PT",
  status: "active",
  consentExpiresAt: "2026-11-30T00:00:00.000Z",
  lastSyncedAt: "2026-09-14T10:00:00.000Z",
  nextSyncAt: null,
  error: null,
  accountCount: 1,
  accounts: [],
  createdAt: "2026-09-01T09:00:00.000Z",
};

function failedJob(): BankSyncJob {
  return {
    id: "job-1",
    connectionId: connection.id,
    status: "failed",
    trigger: "manual",
    attemptCount: 1,
    startedAt: "2026-09-15T10:00:00.000Z",
    finishedAt: "2026-09-15T10:00:02.000Z",
    accountsProcessed: 0,
    transactionsCreated: 0,
    transactionsUpdated: 0,
    transactionsSkipped: 0,
    errorCode: "BANK_PROVIDER_UNAVAILABLE",
    createdAt: "2026-09-15T10:00:00.000Z",
  };
}

describe("BankConnectionsPage sync feedback", () => {
  beforeEach(() => {
    api.connections.mockReset().mockResolvedValue([connection]);
    api.institutions.mockReset().mockResolvedValue([]);
    api.sync.mockReset().mockResolvedValue({ jobId: "job-1", status: "queued" });
    api.syncJob.mockReset().mockResolvedValue(failedJob());
  });

  it("shows an actionable error and never emits success for a failed job", async () => {
    const completed = vi.fn();
    window.addEventListener(BANK_SYNC_COMPLETED_EVENT, completed);
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <BankConnectionsPage />
      </MemoryRouter>,
    );

    await user.click(await screen.findByRole("button", { name: "Sincronizar" }));

    expect(await screen.findByRole("alert", {}, { timeout: 5_000 })).toHaveTextContent(
      "temporariamente indisponível",
    );
    expect(completed).not.toHaveBeenCalled();
    window.removeEventListener(BANK_SYNC_COMPLETED_EVENT, completed);
  });
});
