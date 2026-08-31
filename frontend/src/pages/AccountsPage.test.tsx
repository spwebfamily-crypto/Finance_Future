import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FinancialAccount } from "../types";
import { AccountsPage } from "./AccountsPage";

const api = vi.hoisted(() => ({
  list: vi.fn(),
  transfers: vi.fn(),
  correctBalance: vi.fn(),
  remove: vi.fn(),
  create: vi.fn(),
  transfer: vi.fn(),
  connections: vi.fn(),
}));

vi.mock("../api/resources", () => ({
  accountApi: api,
  openBankingApi: { connections: api.connections },
}));
vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({
    user: { id: "user-1", name: "Rita", email: "rita@example.com", currency: "EUR" },
  }),
}));

const account: FinancialAccount = {
  id: "account-1",
  name: "Conta principal",
  type: "current",
  openingBalance: 100,
  currentBalance: 125,
  creditLimit: null,
  createdAt: "2026-08-01T10:00:00.000Z",
  updatedAt: "2026-08-01T10:00:00.000Z",
};

describe("AccountsPage account actions", () => {
  beforeEach(() => {
    api.list.mockReset().mockResolvedValue([account]);
    api.transfers.mockReset().mockResolvedValue([]);
    api.connections.mockReset().mockResolvedValue([]);
    api.correctBalance.mockReset();
    api.remove.mockReset().mockResolvedValue(undefined);
  });

  it("lets the user correct the displayed account balance", async () => {
    const corrected = { ...account, openingBalance: 225.5, currentBalance: 250.5 };
    api.correctBalance.mockResolvedValue(corrected);
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <AccountsPage />
      </MemoryRouter>,
    );

    await user.click(
      await screen.findByRole("button", { name: "Corrigir saldo da conta Conta principal" }),
    );
    const input = screen.getByRole("textbox", { name: "Novo saldo" });
    await user.clear(input);
    await user.type(input, "250,50");
    await user.click(screen.getByRole("button", { name: "Guardar correção" }));

    await waitFor(() =>
      expect(api.correctBalance).toHaveBeenCalledWith("account-1", { currentBalance: 250.5 }),
    );
    expect(await screen.findByText("Saldo corrigido.")).toBeInTheDocument();
    expect(screen.getAllByText(/250,50/)).toHaveLength(2);
  });

  it("deletes an account even when the server refreshes related transfer data", async () => {
    api.list.mockResolvedValueOnce([account]).mockResolvedValueOnce([]);
    api.transfers.mockResolvedValue([]);
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <AccountsPage />
      </MemoryRouter>,
    );

    await user.click(await screen.findByRole("button", { name: "Remover conta Conta principal" }));
    expect(
      screen.getByText(/As transferências desta conta também serão removidas/),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Remover conta" }));

    await waitFor(() => expect(api.remove).toHaveBeenCalledWith("account-1"));
    expect(await screen.findByText("Conta removida.")).toBeInTheDocument();
    expect(screen.getByText(/Crie a primeira conta acima/)).toBeInTheDocument();
  });
});
