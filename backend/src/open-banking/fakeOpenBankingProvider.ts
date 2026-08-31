import { randomUUID } from "node:crypto";
import {
  ProviderError,
  type AuthorizationResult,
  type GetTransactionsInput,
  type Institution,
  type ListInstitutionsInput,
  type OpenBankingProvider,
  type ProviderAccount,
  type ProviderAccountContext,
  type ProviderBalance,
  type ProviderErrorCode,
  type ProviderName,
  type ProviderSession,
  type ProviderSessionStatus,
  type ProviderTransaction,
  type ProviderTransactionPage,
  type PsuType,
  type StartAuthorizationInput,
} from "./contracts.js";
import { getOpenBankingConfig } from "./config.js";
import { hmacHex, maskIban, normalizeIban } from "./crypto.js";

export const FAKE_AUTHORIZE_PATH = "/api/open-banking/fake-authorize";

const institutions: Institution[] = [
  {
    id: "PT|Banco Demonstração",
    name: "Banco Demonstração",
    country: "PT",
    logoUrl: null,
    supportsPersonal: true,
    supportsBusiness: false,
  },
  {
    id: "PT|Banco Empresas Demo",
    name: "Banco Empresas Demo",
    country: "PT",
    logoUrl: null,
    supportsPersonal: false,
    supportsBusiness: true,
  },
  {
    id: "PT|Banco Sem Transações",
    name: "Banco Sem Transações",
    country: "PT",
    logoUrl: null,
    supportsPersonal: true,
    supportsBusiness: true,
  },
];

export interface FakeAccountSeed {
  providerAccountId: string;
  providerAccountHash: string;
  displayName: string;
  iban?: string | null;
  currency: string;
  balances: ProviderBalance[];
  /** Cada entrada é uma página devolvida por `getTransactions`. */
  pages: ProviderTransaction[][];
}

export interface FakeSessionSeed {
  sessionId?: string;
  institutionId: string;
  institutionName?: string;
  country?: string;
  psuType?: PsuType;
  status?: ProviderSessionStatus;
  consentExpiresAt?: string | null;
  accounts: FakeAccountSeed[];
}

interface FakeAuthorization {
  authorizationId: string;
  code: string;
  institutionId: string;
  psuType: PsuType;
  state: string;
  seed: FakeSessionSeed;
  usedAt: Date | null;
}

interface FakeSession {
  sessionId: string;
  institutionId: string;
  institutionName: string;
  country: string;
  psuType: PsuType;
  status: ProviderSessionStatus;
  consentExpiresAt: string | null;
  accounts: FakeAccountSeed[];
}

export class FakeOpenBankingStore {
  readonly authorizations = new Map<string, FakeAuthorization>();
  readonly sessions = new Map<string, FakeSession>();
  /** Permite simular falhas do provedor nos testes. */
  failNextRequests = 0;
  failWithCode: ProviderErrorCode = "provider_unavailable";
  /** Conta que deve falhar no próximo pedido (usada para simular falhas a meio). */
  readonly failAccounts = new Map<string, ProviderErrorCode>();

  reset() {
    this.authorizations.clear();
    this.sessions.clear();
    this.failNextRequests = 0;
    this.failWithCode = "provider_unavailable";
    this.failAccounts.clear();
  }

  failNext(count: number, code: ProviderErrorCode = "provider_unavailable") {
    this.failNextRequests = count;
    this.failWithCode = code;
  }
}

const sharedStore = new FakeOpenBankingStore();

export const fakeOpenBankingStore = sharedStore;

function defaultSeed(institutionId: string, psuType: PsuType): FakeSessionSeed {
  const isEmpty = institutionId === "PT|Banco Sem Transações";
  return {
    institutionId,
    institutionName: institutionId.split("|")[1] ?? institutionId,
    country: "PT",
    psuType,
    status: "authorized",
    consentExpiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
    accounts: [
      {
        providerAccountId: "fake-account-1",
        providerAccountHash: "fake-account-hash-1",
        displayName: "Conta à ordem",
        iban: "PT50000201231234567890154",
        currency: "EUR",
        balances: [
          { kind: "closing_booked", amount: "1250.30", currency: "EUR", referenceDate: null },
          { kind: "closing_available", amount: "1180.30", currency: "EUR", referenceDate: null },
        ],
        pages: isEmpty
          ? [[]]
          : [
              [
                {
                  entryReference: "2026-0001",
                  providerTransactionId: "tx-1",
                  status: "booked",
                  direction: "debit",
                  amount: "42.50",
                  currency: "EUR",
                  bookingDate: "2026-08-03",
                  valueDate: "2026-08-03",
                  transactionDate: "2026-08-02",
                  description: "Compra Continente",
                  counterpartyName: "Continente",
                  counterpartyAccountHash: null,
                  merchantCategoryCode: "5411",
                  bankTransactionCode: "PMNT",
                },
                {
                  entryReference: "2026-0002",
                  providerTransactionId: "tx-2",
                  status: "booked",
                  direction: "credit",
                  amount: "1250.00",
                  currency: "EUR",
                  bookingDate: "2026-08-01",
                  valueDate: "2026-08-01",
                  transactionDate: "2026-08-01",
                  description: "Salário",
                  counterpartyName: "Empregador Demo",
                  counterpartyAccountHash: null,
                  merchantCategoryCode: null,
                  bankTransactionCode: null,
                },
                {
                  entryReference: null,
                  providerTransactionId: "tx-3",
                  status: "pending",
                  direction: "debit",
                  amount: "15.00",
                  currency: "EUR",
                  bookingDate: "2026-08-10",
                  valueDate: null,
                  transactionDate: "2026-08-10",
                  description: "Pagamento MB WAY",
                  counterpartyName: "MB WAY",
                  counterpartyAccountHash: null,
                  merchantCategoryCode: null,
                  bankTransactionCode: null,
                },
              ],
            ],
      },
    ],
  };
}

/**
 * Provedor em memória para testes unitários e E2E: nunca faz rede e nunca é
 * usado em produção (a configuração só o seleciona por `OPEN_BANKING_PROVIDER=fake`).
 */
export class FakeOpenBankingProvider implements OpenBankingProvider {
  readonly name: ProviderName = "fake";

  constructor(private readonly store: FakeOpenBankingStore = sharedStore) {}

  async listInstitutions(input: ListInstitutionsInput): Promise<Institution[]> {
    return institutions.filter(
      (institution) =>
        institution.country === input.country &&
        (input.psuType === "personal"
          ? institution.supportsPersonal
          : institution.supportsBusiness),
    );
  }

  async startAuthorization(input: StartAuthorizationInput): Promise<AuthorizationResult> {
    const institution = institutions.find((item) => item.id === input.institutionId);
    if (!institution) throw new ProviderError("invalid_request");

    const authorizationId = randomUUID();
    this.store.authorizations.set(authorizationId, {
      authorizationId,
      code: randomUUID(),
      institutionId: input.institutionId,
      psuType: input.psuType,
      state: input.state,
      seed: defaultSeed(input.institutionId, input.psuType),
      usedAt: null,
    });

    const origin = new URL(getOpenBankingConfig().callbackUrl).origin;
    return {
      authorizationUrl: `${origin}${FAKE_AUTHORIZE_PATH}?authorizationId=${authorizationId}`,
      providerAuthorizationId: authorizationId,
    };
  }

  /** Usado pela rota de desenvolvimento que simula o banco. */
  completeAuthorization(authorizationId: string) {
    const authorization = this.store.authorizations.get(authorizationId);
    if (!authorization) throw new ProviderError("authorization_failed");
    return { code: authorization.code, state: authorization.state };
  }

  async exchangeAuthorizationCode(code: string): Promise<ProviderSession> {
    const authorization = [...this.store.authorizations.values()].find(
      (item) => item.code === code && item.usedAt === null,
    );
    if (!authorization) throw new ProviderError("authorization_failed");
    authorization.usedAt = new Date();

    const sessionId = randomUUID();
    const seed = authorization.seed;
    const session: FakeSession = {
      sessionId,
      institutionId: seed.institutionId,
      institutionName:
        seed.institutionName ?? seed.institutionId.split("|")[1] ?? seed.institutionId,
      country: seed.country ?? "PT",
      psuType: seed.psuType ?? authorization.psuType,
      status: seed.status ?? "authorized",
      consentExpiresAt: seed.consentExpiresAt ?? null,
      accounts: seed.accounts,
    };
    this.store.sessions.set(sessionId, session);
    return this.toSession(session);
  }

  seedSession(seed: FakeSessionSeed): string {
    const sessionId = seed.sessionId ?? randomUUID();
    this.store.sessions.set(sessionId, {
      sessionId,
      institutionId: seed.institutionId,
      institutionName:
        seed.institutionName ?? seed.institutionId.split("|")[1] ?? seed.institutionId,
      country: seed.country ?? "PT",
      psuType: seed.psuType ?? "personal",
      status: seed.status ?? "authorized",
      consentExpiresAt: seed.consentExpiresAt ?? null,
      accounts: seed.accounts,
    });
    return sessionId;
  }

  async getSession(sessionId: string): Promise<ProviderSession> {
    this.guardFailure();
    const session = this.store.sessions.get(sessionId);
    if (!session) throw new ProviderError("consent_expired");
    return this.toSession(session);
  }

  async getAccount(input: ProviderAccountContext): Promise<ProviderAccount> {
    const account = this.findAccount(input);
    return {
      ...describeAccount(account),
    };
  }

  async getBalances(input: ProviderAccountContext): Promise<ProviderBalance[]> {
    return this.findAccount(input).balances;
  }

  async getTransactions(input: GetTransactionsInput): Promise<ProviderTransactionPage> {
    const account = this.findAccount(input);
    const pageIndex = input.continuationKey ? Number.parseInt(input.continuationKey, 10) : 0;
    const page = account.pages[Number.isNaN(pageIndex) ? 0 : pageIndex] ?? [];
    const hasNextPage = pageIndex + 1 < account.pages.length;
    return {
      transactions: page.map((transaction) => ({ ...transaction })),
      continuationKey: hasNextPage ? String(pageIndex + 1) : null,
    };
  }

  async revokeSession(sessionId: string): Promise<void> {
    const session = this.store.sessions.get(sessionId);
    if (session) session.status = "revoked";
  }

  /** Simula a passagem de pendente para contabilizada na conta do provedor. */
  bookPending(
    sessionId: string,
    providerAccountId: string,
    description: string,
    options: { entryReference?: string | null; bookingDate?: string } = {},
  ) {
    const session = this.store.sessions.get(sessionId);
    if (!session) throw new ProviderError("consent_expired");
    for (const account of session.accounts) {
      if (account.providerAccountId !== providerAccountId) continue;
      for (const page of account.pages) {
        const transaction = page.find(
          (item) => item.status === "pending" && item.description === description,
        );
        if (!transaction) continue;
        transaction.status = "booked";
        if (options.bookingDate) transaction.bookingDate = options.bookingDate;
        if (options.entryReference !== undefined)
          transaction.entryReference = options.entryReference;
        return transaction;
      }
    }
    return null;
  }

  setSessionStatus(sessionId: string, status: ProviderSessionStatus) {
    const session = this.store.sessions.get(sessionId);
    if (session) session.status = status;
  }

  private guardFailure() {
    if (this.store.failNextRequests > 0) {
      this.store.failNextRequests -= 1;
      throw new ProviderError(this.store.failWithCode ?? "provider_unavailable");
    }
  }

  /** Falha uma conta específica no próximo pedido. */
  failAccountOnce(providerAccountId: string, code: ProviderErrorCode = "provider_unavailable") {
    this.store.failAccounts.set(providerAccountId, code);
  }

  private findAccount(input: ProviderAccountContext): FakeAccountSeed {
    this.guardFailure();
    const accountFailure = this.store.failAccounts.get(input.providerAccountId);
    if (accountFailure) {
      this.store.failAccounts.delete(input.providerAccountId);
      throw new ProviderError(accountFailure);
    }
    const session = this.store.sessions.get(input.sessionId);
    if (!session) throw new ProviderError("consent_expired");
    const account = session.accounts.find(
      (item) => item.providerAccountId === input.providerAccountId,
    );
    if (!account) throw new ProviderError("invalid_request");
    return account;
  }

  private toSession(session: FakeSession): ProviderSession {
    return {
      providerSessionId: session.sessionId,
      institutionId: session.institutionId,
      institutionName: session.institutionName,
      institutionCountry: session.country,
      psuType: session.psuType,
      status: session.status,
      consentExpiresAt: session.consentExpiresAt,
      accounts: session.accounts.map(describeAccount),
    };
  }
}

function describeAccount(account: FakeAccountSeed): ProviderAccount {
  return {
    providerAccountId: account.providerAccountId,
    providerAccountHash: account.providerAccountHash,
    displayName: account.displayName,
    maskedIban: maskIban(account.iban ?? null),
    ibanHash: account.iban ? hmacHex(`iban:${normalizeIban(account.iban)}`) : null,
    currency: account.currency,
    accountType: "current",
  };
}

export const fakeInstitutions = institutions;
