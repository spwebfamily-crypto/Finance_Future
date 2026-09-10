import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DailyBankReviewModal } from "./DailyBankReviewModal";

const api = vi.hoisted(() => ({
  connections: vi.fn(),
  transactions: vi.fn(),
  reviewTransaction: vi.fn(),
  deleteTransaction: vi.fn(),
  categories: vi.fn(),
}));

vi.mock("../api/resources", () => ({
  openBankingApi: {
    connections: api.connections,
    transactions: api.transactions,
    reviewTransaction: api.reviewTransaction,
    deleteTransaction: api.deleteTransaction,
  },
  categoryApi: { list: api.categories },
}));

vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({
    user: {
      id: "user-1",
      name: "Rita",
      email: "rita@example.com",
      currency: "EUR",
      timeZone: "UTC",
    },
  }),
}));

vi.mock("../i18n/I18nContext", () => ({
  useI18n: () => ({ t: (value: string) => value, locale: "pt-PT" }),
}));

describe("DailyBankReviewModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const today = new Date().toISOString();
    api.connections.mockResolvedValue([{ id: "connection-1", status: "active", accountCount: 1 }]);
    api.categories.mockResolvedValue([
      { id: "category-other", name: "Outros", icon: null },
      { id: "category-food", name: "Alimentação", icon: "utensils" },
    ]);
    api.transactions.mockResolvedValue({
      data: [
        {
          id: "transaction-1",
          status: "booked",
          direction: "debit",
          amount: 12.5,
          currency: "EUR",
          bookingDate: today,
          valueDate: null,
          transactionDate: null,
          description: "Café Central",
          counterpartyName: "Café Central",
          classification: "unreviewed",
          excludedFromAnalytics: false,
          reviewedAt: null,
          expenseId: null,
          incomeId: null,
          transferId: null,
          bankAccountLinkId: "link-1",
          bankAccountLink: {
            id: "link-1",
            displayName: "Conta à ordem",
            maskedIban: "PT50 •••• 1234",
            accountId: "account-1",
            connectionId: "connection-1",
          },
          expense: null,
        },
      ],
      meta: { page: 1, pageSize: 200, total: 1, pageCount: 1 },
    });
    api.reviewTransaction.mockResolvedValue({ id: "transaction-1", reviewedAt: today });
    api.deleteTransaction.mockResolvedValue({ id: "transaction-1", status: "removed", classification: "ignored", reviewedAt: today });
  });

  it("opens after login for a linked bank and saves the selected category", async () => {
    const user = userEvent.setup();
    render(<DailyBankReviewModal />);

    expect(
      await screen.findByRole("dialog", { name: "Classifique os gastos de hoje" }),
    ).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Categoria"), "category-food");
    await user.click(screen.getByRole("button", { name: /Concluir/i }));

    await waitFor(() =>
      expect(api.reviewTransaction).toHaveBeenCalledWith("transaction-1", {
        categoryId: "category-food",
        classification: "expense",
      }),
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
