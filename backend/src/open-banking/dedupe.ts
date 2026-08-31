import { hmacHex } from "./crypto.js";
import type { ProviderTransaction } from "./contracts.js";

/**
 * Chave de deduplicação. Nunca se usa apenas data + descrição + valor como
 * chave global: o identificador do provedor entra sempre na composição.
 *
 * Prioridade:
 * 1. `entry_reference` (identificador estável e imutável do provedor);
 * 2. identificador estável documentado pelo provedor (`stableId`);
 * 3. fallback com conta, sentido, valor, moeda, data e descrição normalizada.
 */
export interface DedupeInput {
  provider: string;
  providerAccountHash: string;
  entryReference: string | null;
  /** Só quando o provedor documenta estabilidade; `transaction_id` não serve. */
  stableId?: string | null;
  direction: ProviderTransaction["direction"];
  amount: string;
  currency: string;
  bookingDate: string | null;
  valueDate: string | null;
  transactionDate: string | null;
  description: string;
  counterpartyAccountHash: string | null;
}

export function normalizeDescriptionKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\p{Diacritic}]/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function buildDedupeKey(input: DedupeInput): string {
  const scope = `${input.provider}:${input.providerAccountHash}`;

  if (input.entryReference) {
    return hmacHex(`entry:${scope}:${input.entryReference}`);
  }
  if (input.stableId) {
    return hmacHex(`stable:${scope}:${input.stableId}`);
  }

  const date = input.bookingDate ?? input.valueDate ?? input.transactionDate ?? "";
  return hmacHex(
    [
      "fallback",
      scope,
      input.direction,
      input.amount,
      input.currency,
      date,
      normalizeDescriptionKey(input.description),
      input.counterpartyAccountHash ?? "",
    ].join("|"),
  );
}

export function dedupeKeyFromTransaction(
  transaction: ProviderTransaction,
  context: { provider: string; providerAccountHash: string },
): string {
  return buildDedupeKey({
    provider: context.provider,
    providerAccountHash: context.providerAccountHash,
    entryReference: transaction.entryReference,
    // O Enable Banking documenta `transaction_id` como não estável.
    stableId: null,
    direction: transaction.direction,
    amount: transaction.amount,
    currency: transaction.currency,
    bookingDate: transaction.bookingDate,
    valueDate: transaction.valueDate,
    transactionDate: transaction.transactionDate,
    description: transaction.description,
    counterpartyAccountHash: transaction.counterpartyAccountHash,
  });
}

export interface PendingCandidate {
  id: string;
  dedupeKey: string;
  providerEntryReference: string | null;
  bookingDate: Date | null;
  valueDate: Date | null;
  transactionDate: Date | null;
  description: string;
  counterpartyAccountHash: string | null;
}

const MATCH_WINDOW_DAYS = 5;

function dayDifference(left: Date | null, right: Date | null) {
  if (!left || !right) return null;
  return Math.abs(left.getTime() - right.getTime()) / 86_400_000;
}

function datesWithinWindow(transaction: ProviderTransaction, candidate: PendingCandidate) {
  const candidateDates = [candidate.bookingDate, candidate.valueDate, candidate.transactionDate];
  const transactionDates = [
    transaction.bookingDate,
    transaction.valueDate,
    transaction.transactionDate,
  ].filter((value): value is string => typeof value === "string");

  if (!transactionDates.length) return false;
  return transactionDates.some((date) =>
    candidateDates.some((candidateDate) => {
      const difference = dayDifference(new Date(date), candidateDate);
      return difference !== null && difference <= MATCH_WINDOW_DAYS;
    }),
  );
}

function descriptionsMatch(transaction: ProviderTransaction, candidate: PendingCandidate) {
  const left = normalizeDescriptionKey(transaction.description);
  const right = normalizeDescriptionKey(candidate.description);
  if (!left || !right) return false;
  return left === right || left.includes(right) || right.includes(left);
}

/**
 * Procura o movimento pendente que corresponde a uma transação agora
 * contabilizada, quando não há referência estável para casar.
 * Devolve `null` quando a correspondência é ambígua: nesse caso nada é apagado
 * e o movimento fica para revisão.
 */
export function findPendingCandidate(
  transaction: ProviderTransaction,
  candidates: PendingCandidate[],
): { match: PendingCandidate } | { ambiguous: true } | null {
  // Só se procura correspondência entre registos sem referência estável.
  const matches = candidates.filter((candidate) => {
    if (candidate.providerEntryReference) return false;
    return datesWithinWindow(transaction, candidate) && descriptionsMatch(transaction, candidate);
  });

  if (matches.length === 1) return { match: matches[0]! };
  if (matches.length > 1) return { ambiguous: true };
  return null;
}
