import type { FinancialAccount } from "../types";

/**
 * Conta bancária só contribui para totais quando existe um snapshot do banco.
 * O saldo inicial e os movimentos nunca servem de fallback para uma conta ligada.
 */
export function accountBalanceValue(account: FinancialAccount): number | null {
  if (account.source === "bank") {
    return account.balanceSource === "provider" && typeof account.currentBalance === "number"
      ? account.currentBalance
      : null;
  }
  return typeof account.currentBalance === "number"
    ? account.currentBalance
    : account.openingBalance;
}
