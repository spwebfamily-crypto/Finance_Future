import { ProviderError, type Institution, type ListInstitutionsInput } from "./contracts.js";
import { hmacHex, maskIban, normalizeIban } from "./crypto.js";
import {
  mapAccountType,
  mapBalanceType,
  mapSessionStatus,
  mapTransaction,
  normalizeCurrency,
  safeLogoUrl,
  sanitizeText,
} from "./normalize.js";
import { enableBankingRequest, type EnableBankingCredentials } from "./providerAuth.js";
import type {
  OpenBankingProvider,
  ProviderAccount,
  ProviderAccountContext,
  ProviderBalance,
  ProviderSession,
  ProviderTransaction,
  ProviderTransactionPage,
  GetTransactionsInput,
  StartAuthorizationInput,
  AuthorizationResult,
} from "./contracts.js";

/** Consentimento pedido ao banco: 90 dias, abaixo do máximo anunciado de 180. */
const CONSENT_VALIDITY_DAYS = 90;
const MAX_ACCOUNTS_PER_SESSION = 25;
const INSTITUTIONS_CACHE_MS = 60 * 60 * 1000;
const ALLOWED_AUTH_HOSTS = ["auth.enablebanking.com", "tilisy.enablebanking.com"];

interface RawAspsp {
  name?: unknown;
  country?: unknown;
  logo?: unknown;
  psu_types?: unknown;
  maximum_consent_validity?: unknown;
}

interface RawAccount {
  uid?: unknown;
  identification_hash?: unknown;
  name?: unknown;
  details?: unknown;
  product?: unknown;
  currency?: unknown;
  cash_account_type?: unknown;
  account_id?: { iban?: unknown };
}

interface RawSessionAccount {
  uid?: unknown;
  identification_hash?: unknown;
}

interface RawSession {
  session_id?: unknown;
  status?: unknown;
  aspsp?: { name?: unknown; country?: unknown };
  psu_type?: unknown;
  access?: { valid_until?: unknown };
  accounts_data?: RawSessionAccount[];
}

interface RawBalances {
  balances?: Array<{
    balance_type?: unknown;
    balance_amount?: { amount?: unknown; currency?: unknown };
    reference_date?: unknown;
  }>;
}

interface RawTransactions {
  transactions?: unknown[];
  continuation_key?: unknown;
}

type RawTransaction = Parameters<typeof mapTransaction>[0];

function consentExpiry(now: Date, days = CONSENT_VALIDITY_DAYS) {
  return new Date(now.getTime() + days * 24 * 60 * 60 * 1000).toISOString();
}

function requireHttps(value: unknown, allowedHosts: string[]): string {
  if (typeof value !== "string" || !value) throw new ProviderError("provider_invalid_response");
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ProviderError("provider_invalid_response");
  }
  if (url.protocol !== "https:" || !allowedHosts.includes(url.hostname.toLowerCase())) {
    throw new ProviderError("provider_invalid_response");
  }
  return url.toString();
}

export type EnableBankingRequestFn = typeof enableBankingRequest;

export class EnableBankingProvider implements OpenBankingProvider {
  readonly name = "enable_banking" as const;

  private institutionsCache: { expiresAt: number; items: Institution[] } | null = null;

  constructor(
    private readonly credentials: EnableBankingCredentials,
    /** Injetável para testes: evita qualquer rede nos testes unitários. */
    private readonly request: EnableBankingRequestFn = enableBankingRequest,
  ) {}

  async listInstitutions(input: ListInstitutionsInput): Promise<Institution[]> {
    const cached = this.institutionsCache;
    if (cached && cached.expiresAt > Date.now()) {
      return cached.items.filter((item) => item.country === input.country);
    }

    const response = await this.request<{ aspsps?: RawAspsp[] }>("/aspsps", {
      credentials: this.credentials,
      query: { country: input.country, psu_type: input.psuType, service: "AIS" },
    });
    const items = (response.aspsps ?? []).map((aspsp) => this.toInstitution(aspsp));
    this.institutionsCache = { expiresAt: Date.now() + INSTITUTIONS_CACHE_MS, items };
    return items;
  }

  private toInstitution(aspsp: RawAspsp): Institution {
    const country = sanitizeText(aspsp.country, 8).toUpperCase();
    const name = sanitizeText(aspsp.name, 120);
    const psuTypes = Array.isArray(aspsp.psu_types) ? aspsp.psu_types.map(String) : [];
    return {
      id: `${country}|${name}`,
      name,
      country,
      logoUrl: safeLogoUrl(aspsp.logo),
      supportsPersonal: psuTypes.includes("personal") || psuTypes.length === 0,
      supportsBusiness: psuTypes.includes("business") || psuTypes.length === 0,
    };
  }

  async startAuthorization(input: StartAuthorizationInput): Promise<AuthorizationResult> {
    const [country, ...nameParts] = input.institutionId.split("|");
    const name = nameParts.join("|");
    if (!country || !name) throw new ProviderError("invalid_request");

    const response = await this.request<{ url?: unknown; authorization_id?: unknown }>("/auth", {
      credentials: this.credentials,
      method: "POST",
      body: {
        access: {
          balances: true,
          transactions: true,
          valid_until: consentExpiry(new Date()),
        },
        aspsp: { name, country },
        state: input.state,
        redirect_url: input.redirectUrl,
        psu_type: input.psuType,
      },
    });

    return {
      authorizationUrl: requireHttps(response.url, ALLOWED_AUTH_HOSTS),
      providerAuthorizationId:
        typeof response.authorization_id === "string" ? response.authorization_id : null,
    };
  }

  async exchangeAuthorizationCode(code: string): Promise<ProviderSession> {
    const response = await this.request<RawSession & { accounts?: RawAccount[] }>("/sessions", {
      credentials: this.credentials,
      method: "POST",
      body: { code },
    });
    return this.toSession(response, response.accounts ?? []);
  }

  async getSession(sessionId: string): Promise<ProviderSession> {
    const response = await this.request<RawSession>(`/sessions/${sessionId}`, {
      credentials: this.credentials,
    });
    const accountsData = (response.accounts_data ?? []).slice(0, MAX_ACCOUNTS_PER_SESSION);
    const accounts: RawAccount[] = [];
    for (const entry of accountsData) {
      if (typeof entry?.uid !== "string") continue;
      try {
        accounts.push(await this.getRawAccount(entry.uid));
      } catch {
        // Uma conta inacessível não impede a sincronização das restantes.
      }
    }
    // `GET /sessions/{session_id}` não devolve o próprio `session_id`; ele já
    // está no caminho do pedido. Mantê-lo como fallback evita rejeitar uma
    // sessão autorizada cuja resposta segue o formato oficial do provedor.
    return this.toSession(response, accounts, sessionId);
  }

  async getAccount(input: ProviderAccountContext): Promise<ProviderAccount> {
    return toAccount(await this.getRawAccount(input.providerAccountId));
  }

  async getBalances(input: ProviderAccountContext): Promise<ProviderBalance[]> {
    const response = await this.request<RawBalances>(
      `/accounts/${input.providerAccountId}/balances`,
      { credentials: this.credentials },
    );
    return (response.balances ?? []).map((balance) => {
      const currency = normalizeCurrency(balance.balance_amount?.currency) ?? "EUR";
      return {
        kind: mapBalanceType(balance.balance_type),
        amount: String(balance.balance_amount?.amount ?? "0"),
        currency,
        referenceDate: typeof balance.reference_date === "string" ? balance.reference_date : null,
      };
    });
  }

  async getTransactions(input: GetTransactionsInput): Promise<ProviderTransactionPage> {
    const response = await this.request<RawTransactions>(
      `/accounts/${input.providerAccountId}/transactions`,
      {
        credentials: this.credentials,
        query: {
          date_from: input.dateFrom ?? null,
          date_to: input.dateTo ?? null,
          continuation_key: input.continuationKey ?? null,
        },
      },
    );

    const transactions: ProviderTransaction[] = (response.transactions ?? []).map((raw) =>
      mapTransaction(raw as RawTransaction, (value) => hmacHex(`iban:${normalizeIban(value)}`)),
    );
    const continuationKey =
      typeof response.continuation_key === "string" && response.continuation_key
        ? response.continuation_key
        : null;

    return { transactions, continuationKey };
  }

  async revokeSession(sessionId: string): Promise<void> {
    await this.request(`/sessions/${sessionId}`, {
      credentials: this.credentials,
      method: "DELETE",
    });
  }

  private async getRawAccount(uid: string): Promise<RawAccount> {
    return this.request<RawAccount>(`/accounts/${uid}/details`, {
      credentials: this.credentials,
    });
  }

  private toSession(
    raw: RawSession,
    accounts: RawAccount[],
    fallbackSessionId: string | null = null,
  ): ProviderSession {
    const sessionId = typeof raw.session_id === "string" ? raw.session_id : fallbackSessionId;
    if (!sessionId) throw new ProviderError("provider_invalid_response");
    const validUntil = raw.access?.valid_until;
    return {
      providerSessionId: sessionId,
      institutionId: `${sanitizeText(raw.aspsp?.country, 8).toUpperCase()}|${sanitizeText(
        raw.aspsp?.name,
        120,
      )}`,
      institutionName: sanitizeText(raw.aspsp?.name, 120),
      institutionCountry: sanitizeText(raw.aspsp?.country, 8).toUpperCase(),
      psuType: raw.psu_type === "business" ? "business" : "personal",
      status: mapSessionStatus(raw.status),
      consentExpiresAt: typeof validUntil === "string" ? validUntil : null,
      accounts: accounts.map(toAccount),
    };
  }
}

function toAccount(raw: RawAccount): ProviderAccount {
  const uid = typeof raw.uid === "string" ? raw.uid : null;
  const hash = typeof raw.identification_hash === "string" ? raw.identification_hash : null;
  if (!uid || !hash) throw new ProviderError("provider_invalid_response");
  const displayName =
    sanitizeText(raw.name, 80) ||
    sanitizeText(raw.details, 80) ||
    sanitizeText(raw.product, 80) ||
    "Conta bancária";
  const iban = typeof raw.account_id?.iban === "string" ? raw.account_id.iban : null;
  return {
    providerAccountId: uid,
    providerAccountHash: hash,
    displayName,
    maskedIban: maskIban(iban),
    ibanHash: iban ? hmacHex(`iban:${normalizeIban(iban)}`) : null,
    currency: normalizeCurrency(raw.currency) ?? "EUR",
    accountType: mapAccountType(raw.cash_account_type),
  };
}
