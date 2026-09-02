import { Prisma } from "@prisma/client";
import type {
  ProviderAccountType,
  ProviderBalanceKind,
  ProviderSessionStatus,
  ProviderTransaction,
  ProviderTransactionStatus,
} from "./contracts.js";

// Normalização das respostas do provedor. Todas as funções são puras e
// defensivas: um campo inesperado nunca propaga um valor não normalizado.

const amountPattern = /^-?\d{1,12}(?:\.\d{1,4})?$/;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const currencyPattern = /^[A-Z]{3}$/;
const MAX_TEXT = 200;
// Caracteres de controlo e de formatação: nunca chegam à base de dados.
const CONTROL_CHARACTERS = /[\p{Cc}\p{Cf}]/gu;

/** Remove caracteres de controlo e normaliza espaços; nunca lança. */
export function sanitizeText(value: unknown, maxLength = MAX_TEXT): string {
  if (typeof value !== "string") return "";
  return value.replace(CONTROL_CHARACTERS, " ").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

export function normalizeDate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const date = value.trim();
  if (!datePattern.test(date)) return null;
  const timestamp = Date.parse(`${date}T00:00:00.000Z`);
  return Number.isNaN(timestamp) ? null : new Date(timestamp).toISOString();
}

/** Montante sempre positivo, com duas casas decimais. */
export function normalizeAmount(value: unknown): string | null {
  const raw =
    typeof value === "number" ? value.toString() : typeof value === "string" ? value : null;
  if (raw === null || !amountPattern.test(raw)) return null;
  return new Prisma.Decimal(raw).abs().toDecimalPlaces(2).toFixed(2);
}

export function normalizeCurrency(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const currency = value.trim().toUpperCase();
  return currencyPattern.test(currency) ? currency : null;
}

export function mapBalanceType(value: unknown): ProviderBalanceKind {
  switch (value) {
    case "CLBD":
      return "closing_booked";
    case "PRCD":
      return "previously_closed_booked";
    case "CLAV":
      return "closing_available";
    case "ITBD":
      return "interim_booked";
    case "ITAV":
      return "interim_available";
    case "XPCD":
      return "expected";
    case "OPBD":
      return "opening_booked";
    default:
      return "other";
  }
}

export function mapSessionStatus(value: unknown): ProviderSessionStatus {
  switch (value) {
    case "AUTHORIZED":
      return "authorized";
    case "PENDING_AUTHORIZATION":
    case "RETURNED_FROM_BANK":
      return "pending";
    case "EXPIRED":
      return "expired";
    case "REVOKED":
      return "revoked";
    case "CLOSED":
    case "CANCELLED":
      return "closed";
    default:
      return "invalid";
  }
}

export function mapTransactionStatus(value: unknown): ProviderTransactionStatus {
  switch (value) {
    case "BOOK":
      return "booked";
    case "RJCT":
      return "rejected";
    case "CNCL":
      return "removed";
    default:
      // PDNG, HOLD, SCHD e desconhecidos ficam pendentes: nunca materializam.
      return "pending";
  }
}

const cashAccountTypes: Record<string, ProviderAccountType> = {
  CACC: "current",
  SVGS: "savings",
  CARD: "card",
  LOAN: "loan",
};

export function mapAccountType(value: unknown): ProviderAccountType {
  if (typeof value === "string" && cashAccountTypes[value]) return cashAccountTypes[value]!;
  return "other";
}

/** Mantém apenas a primeira data válida no formato YYYY-MM-DD. */
export function firstDefinedDate(...values: unknown[]): string | null {
  for (const value of values) {
    const date = normalizeDate(value);
    if (date) return date;
  }
  return null;
}

interface RawParty {
  name?: unknown;
}

interface RawAccountIdentification {
  iban?: unknown;
  identification?: unknown;
}

interface RawTransaction {
  entry_reference?: unknown;
  transaction_id?: unknown;
  status?: unknown;
  credit_debit_indicator?: unknown;
  transaction_amount?: { amount?: unknown; currency?: unknown };
  booking_date?: unknown;
  value_date?: unknown;
  transaction_date?: unknown;
  remittance_information?: unknown;
  reference_number?: unknown;
  merchant_category_code?: unknown;
  bank_transaction_code?: { code?: unknown; sub_code?: unknown; description?: unknown };
  creditor?: RawParty;
  creditor_account?: RawAccountIdentification;
  debtor?: RawParty;
  debtor_account?: RawAccountIdentification;
  note?: unknown;
}

function counterpartyOf(transaction: RawTransaction, direction: "debit" | "credit") {
  const party = direction === "debit" ? transaction.creditor : transaction.debtor;
  const account = direction === "debit" ? transaction.creditor_account : transaction.debtor_account;
  const name = sanitizeText(party?.name, 120) || null;
  const iban =
    typeof account?.iban === "string"
      ? account.iban
      : typeof account?.identification === "string"
        ? account.identification
        : null;
  return { name, iban };
}

export function buildTransactionDescription(transaction: RawTransaction): string {
  const remittance = Array.isArray(transaction.remittance_information)
    ? transaction.remittance_information
        .map((line) => sanitizeText(line, 140))
        .filter(Boolean)
        .join(" · ")
    : "";
  const candidates = [
    remittance,
    sanitizeText(transaction.reference_number, 140),
    sanitizeText(transaction.bank_transaction_code?.description, 140),
    sanitizeText(transaction.creditor?.name, 120),
    sanitizeText(transaction.debtor?.name, 120),
    sanitizeText(transaction.note, 140),
  ];
  return candidates.find(Boolean) || "Movimento bancário";
}

/**
 * Converte uma transação do provedor no tipo normalizado.
 * `hashCounterparty` aplica HMAC ao identificador da contraparte (nunca guarda IBAN).
 */
export function mapTransaction(
  raw: RawTransaction,
  hashCounterparty: (value: string) => string,
): ProviderTransaction {
  const direction = raw.credit_debit_indicator === "CRDT" ? "credit" : "debit";
  const amount = normalizeAmount(raw.transaction_amount?.amount);
  const currency = normalizeCurrency(raw.transaction_amount?.currency);
  if (!amount || !currency) {
    throw new Error("Transação sem montante ou moeda válidos.");
  }
  const counterparty = counterpartyOf(raw, direction);

  return {
    entryReference: sanitizeText(raw.entry_reference, 120) || null,
    providerTransactionId: sanitizeText(raw.transaction_id, 120) || null,
    status: mapTransactionStatus(raw.status),
    direction,
    amount,
    currency,
    bookingDate: firstDefinedDate(raw.booking_date),
    valueDate: firstDefinedDate(raw.value_date),
    transactionDate: firstDefinedDate(raw.transaction_date),
    description: buildTransactionDescription(raw),
    counterpartyName: counterparty.name,
    counterpartyAccountHash: counterparty.iban ? hashCounterparty(counterparty.iban) : null,
    merchantCategoryCode: sanitizeText(raw.merchant_category_code, 16) || null,
    bankTransactionCode: sanitizeText(raw.bank_transaction_code?.code, 32) || null,
  };
}

const ALLOWED_LOGO_HOSTS = ["enablebanking.com"];

/** Só aceita logos HTTPS do domínio do provedor; tudo o resto é descartado. */
export function safeLogoUrl(value: unknown): string | null {
  if (typeof value !== "string" || !value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return null;
    const host = url.hostname.toLowerCase();
    const isAllowed = ALLOWED_LOGO_HOSTS.some(
      (allowed) => host === allowed || host.endsWith(`.${allowed}`),
    );
    return isAllowed ? url.toString() : null;
  } catch {
    return null;
  }
}
