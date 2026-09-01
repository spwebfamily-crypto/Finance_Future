import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { BankConnectionCard } from "./BankConnectionCard";
import type { BankConnectionSummary } from "../types";

const failedConnection: BankConnectionSummary = {
  id: "connection-1",
  institutionId: "PT|Revolut",
  institutionName: "Revolut",
  institutionCountry: "PT",
  status: "error",
  consentExpiresAt: "2026-11-30T00:00:00.000Z",
  lastSyncedAt: null,
  nextSyncAt: null,
  error: { code: "SYNC_FAILED", at: "2026-09-01T10:00:00.000Z" },
  accountCount: 0,
  accounts: [],
  createdAt: "2026-09-01T09:00:00.000Z",
};

describe("BankConnectionCard", () => {
  it("offers safe recovery for a failed synchronization without disconnecting", async () => {
    const onReauthorize = vi.fn();
    const user = userEvent.setup();

    render(
      <BankConnectionCard
        connection={failedConnection}
        onSync={() => undefined}
        onReauthorize={onReauthorize}
        onDisconnect={() => undefined}
      />,
    );

    expect(screen.getByText(/Não foi possível concluir a leitura do banco/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Renovar acesso" }));
    expect(onReauthorize).toHaveBeenCalledWith(failedConnection);
  });
});
