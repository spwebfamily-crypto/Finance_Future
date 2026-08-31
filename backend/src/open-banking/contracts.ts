// Tipos normalizados de Open Banking (apenas leitura / AIS).
// Nenhum contrato específico de um provedor (Enable Banking, Salt Edge, ...)
// pode atravessar esta fronteira: rotas, Prisma e frontend só conhecem estes tipos.

export const OPEN_BANKING_PROVIDERS = ["enable_banking", "fake"] as const;
export type ProviderName = (typeof OPEN_BANKING_PROVIDERS)[number];

export type PsuType = "personal" | "business";

export type ProviderSessionStatus =
  "authorized" | "pending" | "expired" | "revoked" | "closed" | "invalid";

export type ProviderTransactionStatus = "pending" | "booked" | "rejected" | "removed";

export type ProviderTransactionDirection = "debit" | "credit";

export type ProviderBalanceKind =
  | "closing_booked"
  | "closing_available"
  | "interim_booked"
  | "interim_available"
  | "expected"
  | "opening_booked"
  | "other";

/** Tipos de conta normalizados a partir de `cash_account_type` (ISO 20022). */
export type ProviderAccountType = "current" | "savings" | "card" | "loan" | "other";

export interface Institution {
  /** Identificador normalizado (opaco para o frontend). */
  id: string;
  name: string;
  country: string;
  logoUrl: string | null;
  supportsPersonal: boolean;
  supportsBusiness: boolean;
}

export interface ListInstitutionsInput {
  country: string;
  psuType: PsuType;
}

export interface StartAuthorizationInput {
  institutionId: string;
  country: string;
  psuType: PsuType;
  /** Aleatório, de uso único; o provedor devolve-o no callback. */
  state: string;
  redirectUrl: string;
}

export interface AuthorizationResult {
  authorizationUrl: string;
  providerAuthorizationId: string | null;
}

export interface ProviderAccount {
  /** Identificador sensível do provedor: cifrar em repouso, nunca devolver ao frontend. */
  providerAccountId: string;
  /** Hash estável da conta (HMAC), usado para casar a mesma conta entre sessões. */
  providerAccountHash: string;
  displayName: string;
  maskedIban: string | null;
  /** HMAC do IBAN, quando o provedor o devolve; permite casar transferências próprias. */
  ibanHash: string | null;
  currency: string;
  accountType: ProviderAccountType;
}

export interface ProviderSession {
  providerSessionId: string;
  institutionId: string;
  institutionName: string;
  institutionCountry: string;
  psuType: PsuType;
  status: ProviderSessionStatus;
  consentExpiresAt: string | null;
  accounts: ProviderAccount[];
}

export interface ProviderBalance {
  kind: ProviderBalanceKind;
  /** Montante como string decimal (o sinal é preservado; ex.: "-12.34"). */
  amount: string;
  currency: string;
  referenceDate: string | null;
}

export interface ProviderTransaction {
  /** Referência estável do provedor (entry_reference), quando existir. */
  entryReference: string | null;
  /** Identificador não estável; nunca usar como chave primária lógica. */
  providerTransactionId: string | null;
  status: ProviderTransactionStatus;
  direction: ProviderTransactionDirection;
  /** Montante sempre positivo; o sentido vem em `direction`. */
  amount: string;
  currency: string;
  bookingDate: string | null;
  valueDate: string | null;
  transactionDate: string | null;
  description: string;
  counterpartyName: string | null;
  counterpartyAccountHash: string | null;
  merchantCategoryCode: string | null;
  bankTransactionCode: string | null;
}

export interface ProviderTransactionPage {
  transactions: ProviderTransaction[];
  /** Chave de paginação do provedor; `null` significa "última página". */
  continuationKey: string | null;
}

/**
 * O Enable Banking identifica as contas por um `uid` válido apenas enquanto a
 * sessão está AUTHORIZED, e exige cabeçalhos do PSU nos pedidos de dados. Por
 * isso os métodos de conta recebem sempre o contexto da sessão, em vez de um
 * `accountId` isolado como na interface genérica.
 */
export interface ProviderAccountContext {
  sessionId: string;
  providerAccountId: string;
}

export interface GetTransactionsInput extends ProviderAccountContext {
  dateFrom?: string | null;
  dateTo?: string | null;
  continuationKey?: string | null;
}

export type ProviderErrorCode =
  | "provider_unavailable"
  | "provider_rate_limited"
  | "provider_invalid_response"
  | "provider_timeout"
  | "authorization_failed"
  | "consent_expired"
  | "consent_revoked"
  | "invalid_request"
  | "unauthorized";

const providerErrorMessages: Record<ProviderErrorCode, string> = {
  provider_unavailable: "O serviço do banco não está disponível de momento.",
  provider_rate_limited: "Foram feitos demasiados pedidos ao banco. Tente novamente mais tarde.",
  provider_invalid_response: "O banco devolveu uma resposta inesperada.",
  provider_timeout: "O banco demorou demasiado tempo a responder.",
  authorization_failed: "Não foi possível concluir a autorização no banco.",
  consent_expired: "O consentimento do banco expirou e tem de ser renovado.",
  consent_revoked: "O consentimento do banco foi revogado.",
  invalid_request: "O pedido enviado ao banco foi rejeitado.",
  unauthorized: "O acesso ao banco não foi autorizado.",
};

export class ProviderError extends Error {
  constructor(
    public readonly code: ProviderErrorCode,
    public readonly status: number | null = null,
    /** Código sanitizado do provedor; nunca incluir payload bancário. */
    public readonly providerCode: string | null = null,
  ) {
    super(providerErrorMessages[code]);
    this.name = "ProviderError";
  }
}

export interface OpenBankingProvider {
  readonly name: ProviderName;
  listInstitutions(input: ListInstitutionsInput): Promise<Institution[]>;
  startAuthorization(input: StartAuthorizationInput): Promise<AuthorizationResult>;
  exchangeAuthorizationCode(code: string): Promise<ProviderSession>;
  getSession(sessionId: string): Promise<ProviderSession>;
  getAccount(input: ProviderAccountContext): Promise<ProviderAccount>;
  getBalances(input: ProviderAccountContext): Promise<ProviderBalance[]>;
  getTransactions(input: GetTransactionsInput): Promise<ProviderTransactionPage>;
  revokeSession(sessionId: string): Promise<void>;
}
