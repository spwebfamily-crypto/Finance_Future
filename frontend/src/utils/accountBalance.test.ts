import { describe, expect, it } from "vitest";
import type { FinancialAccount } from "../types";
import { accountBalanceValue } from "./accountBalance";

const baseAccount: FinancialAccount = {
  id: "account-1",
  name: "Conta",
  type: "current",
  currency: "EUR",
  openingBalance: 100,
  createdAt: "2026-09-15T09:00:00.000Z",
  updatedAt: "2026-09-15T09:00:00.000Z",
};

describe("accountBalanceValue", () => {
  it("uses movement-derived balances only for manual accounts", () => {
    expect(accountBalanceValue({ ...baseAccount, source: "manual", currentBalance: 125 })).toBe(
      125,
    );
  });

  it("uses only the provider snapshot for linked accounts", () => {
    expect(
      accountBalanceValue({
        ...baseAccount,
        source: "bank",
        currentBalance: 850,
        balanceSource: "provider",
      }),
    ).toBe(850);
  });

  it("returns null instead of falling back to opening balance for linked accounts", () => {
    expect(
      accountBalanceValue({
        ...baseAccount,
        source: "bank",
        currentBalance: null,
        balanceSource: "unavailable",
      }),
    ).toBeNull();
  });
});
