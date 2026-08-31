import { generateKeyPairSync } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EnableBankingProvider, type EnableBankingRequestFn } from "./enableBankingProvider.js";
import type { EnableBankingRequestOptions } from "./providerAuth.js";
import { installTestOpenBankingConfig } from "./testSupport.js";

installTestOpenBankingConfig();

const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const credentials = {
  appId: "00000000-1111-4222-8333-444444444444",
  privateKey: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
};

interface RecordedCall {
  path: string;
  options: EnableBankingRequestOptions;
}

function stubRequest(handler: (call: RecordedCall) => unknown) {
  const calls: RecordedCall[] = [];
  const request = (async (path: string, options: EnableBankingRequestOptions) => {
    calls.push({ path, options });
    return handler({ path, options });
  }) as unknown as EnableBankingRequestFn;
  return { provider: new EnableBankingProvider(credentials, request), calls };
}

const aspspResponse = {
  aspsps: [
    {
      name: "Banco Demo",
      country: "PT",
      logo: "https://enablebanking.com/brands/PT/BancoDemo/",
      psu_types: ["personal"],
      maximum_consent_validity: 15552000,
    },
    {
      name: "Banco Inseguro",
      country: "PT",
      logo: "http://exemplo.com/logo.png",
      psu_types: ["business"],
    },
  ],
};

const account = {
  uid: "07cc67f4-45d6-494b-adac-09b5cbc7e2b5",
  identification_hash: "WwpbCiJhY2NvdW50IiwKImFjY291bnRfaWQiLAoiaWJhbiIKXQpd.E8Gz",
  name: "Conta à ordem",
  details: "Conta de depósitos à ordem",
  currency: "EUR",
  cash_account_type: "CACC",
  account_id: { iban: "PT50000201231234567890154" },
};

describe("enable banking institutions", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it("normalizes the ASPSP list and discards untrusted logos", async () => {
    const { provider, calls } = stubRequest(() => aspspResponse);
    const institutions = await provider.listInstitutions({ country: "PT", psuType: "personal" });

    expect(calls[0]?.path).toBe("/aspsps");
    expect(calls[0]?.options.query).toEqual({
      country: "PT",
      psu_type: "personal",
      service: "AIS",
    });
    expect(institutions).toEqual([
      {
        id: "PT|Banco Demo",
        name: "Banco Demo",
        country: "PT",
        logoUrl: "https://enablebanking.com/brands/PT/BancoDemo/",
        supportsPersonal: true,
        supportsBusiness: false,
      },
      {
        id: "PT|Banco Inseguro",
        name: "Banco Inseguro",
        country: "PT",
        logoUrl: null,
        supportsPersonal: false,
        supportsBusiness: true,
      },
    ]);
  });
});

describe("enable banking authorization", () => {
  it("requests only account information and forwards the state", async () => {
    const { provider, calls } = stubRequest(() => ({
      url: "https://auth.enablebanking.com/ais/start?sessionid=abc",
      authorization_id: "73100c65-c54d-46a1-87d1-aa3effde435a",
    }));

    const result = await provider.startAuthorization({
      institutionId: "PT|Banco Demo",
      country: "PT",
      psuType: "personal",
      state: "state-aleatorio",
      redirectUrl: "http://localhost:3000/api/open-banking/callback",
    });

    const body = calls[0]?.options.body as Record<string, unknown>;
    expect(calls[0]?.path).toBe("/auth");
    expect(body.state).toBe("state-aleatorio");
    expect(body.redirect_url).toBe("http://localhost:3000/api/open-banking/callback");
    expect(body.psu_type).toBe("personal");
    expect(body.aspsp).toEqual({ name: "Banco Demo", country: "PT" });
    expect((body.access as Record<string, unknown>).balances).toBe(true);
    expect((body.access as Record<string, unknown>).transactions).toBe(true);
    expect(result.providerAuthorizationId).toBe("73100c65-c54d-46a1-87d1-aa3effde435a");
    expect(result.authorizationUrl).toContain("auth.enablebanking.com");
  });

  it("rejects an authorization URL outside the provider domain", async () => {
    const { provider } = stubRequest(() => ({ url: "https://phishing.example.com/ais/start" }));
    await expect(
      provider.startAuthorization({
        institutionId: "PT|Banco Demo",
        country: "PT",
        psuType: "personal",
        state: "s",
        redirectUrl: "http://localhost:3000/api/open-banking/callback",
      }),
    ).rejects.toMatchObject({ code: "provider_invalid_response" });
  });

  it("exchanges the authorization code for a session and masks the IBAN", async () => {
    const { provider, calls } = stubRequest(() => ({
      session_id: "sess-1",
      status: "AUTHORIZED",
      aspsp: { name: "Banco Demo", country: "PT" },
      psu_type: "personal",
      access: { valid_until: "2026-11-29T12:00:00Z" },
      accounts: [account],
    }));

    const session = await provider.exchangeAuthorizationCode("codigo-banco");

    expect(calls[0]?.path).toBe("/sessions");
    expect(calls[0]?.options.body).toEqual({ code: "codigo-banco" });
    expect(session.providerSessionId).toBe("sess-1");
    expect(session.status).toBe("authorized");
    expect(session.institutionId).toBe("PT|Banco Demo");
    expect(session.consentExpiresAt).toBe("2026-11-29T12:00:00Z");
    expect(session.accounts).toHaveLength(1);
    expect(session.accounts[0]?.providerAccountId).toBe(account.uid);
    expect(session.accounts[0]?.providerAccountHash).toBe(account.identification_hash);
    expect(session.accounts[0]?.currency).toBe("EUR");
    expect(session.accounts[0]?.accountType).toBe("current");
    expect(session.accounts[0]?.maskedIban).toContain("PT50");
    expect(session.accounts[0]?.maskedIban).not.toContain("00020123");
  });

  it("maps session statuses that require reauthorization", async () => {
    const statuses: Array<[string, string]> = [
      ["EXPIRED", "expired"],
      ["REVOKED", "revoked"],
      ["CLOSED", "closed"],
      ["PENDING_AUTHORIZATION", "pending"],
      ["QUALQUER_OUTRO", "invalid"],
    ];
    for (const [providerStatus, expected] of statuses) {
      const { provider } = stubRequest(() => ({
        session_id: "sess-1",
        status: providerStatus,
        aspsp: { name: "Banco Demo", country: "PT" },
        accounts_data: [],
      }));
      const session = await provider.getSession("sess-1");
      expect(session.status).toBe(expected);
    }
  });
});

describe("enable banking balances and transactions", () => {
  it("maps balance types to normalized kinds", async () => {
    const { provider } = stubRequest(() => ({
      balances: [
        {
          balance_type: "CLBD",
          balance_amount: { currency: "EUR", amount: "1250.30" },
          reference_date: "2026-08-30",
        },
        {
          balance_type: "CLAV",
          balance_amount: { currency: "EUR", amount: "1180.30" },
        },
        {
          balance_type: "XPCD",
          balance_amount: { currency: "EUR", amount: "1170.00" },
        },
      ],
    }));

    const balances = await provider.getBalances({
      sessionId: "sess-1",
      providerAccountId: account.uid,
    });
    expect(balances).toEqual([
      { kind: "closing_booked", amount: "1250.30", currency: "EUR", referenceDate: "2026-08-30" },
      { kind: "closing_available", amount: "1180.30", currency: "EUR", referenceDate: null },
      { kind: "expected", amount: "1170.00", currency: "EUR", referenceDate: null },
    ]);
  });

  it("normalizes transactions, keeps positive amounts and returns the continuation key", async () => {
    const { provider, calls } = stubRequest(() => ({
      transactions: [
        {
          entry_reference: "5561990681",
          transaction_id: "tx-1",
          status: "BOOK",
          credit_debit_indicator: "DBIT",
          transaction_amount: { currency: "EUR", amount: "-42.50" },
          booking_date: "2026-08-03",
          value_date: "2026-08-02",
          remittance_information: ["Compra Continente"],
          creditor: { name: "Continente" },
          creditor_account: { iban: "PT51000201231234567890155" },
          merchant_category_code: "5411",
          bank_transaction_code: { code: "PMNT" },
        },
        {
          status: "PDNG",
          credit_debit_indicator: "CRDT",
          transaction_amount: { currency: "USD", amount: "10" },
          booking_date: "2026-08-04",
        },
        {
          status: "RJCT",
          credit_debit_indicator: "DBIT",
          transaction_amount: { currency: "EUR", amount: "1.00" },
        },
      ],
      continuation_key: "pagina-2",
    }));

    const page = await provider.getTransactions({
      sessionId: "sess-1",
      providerAccountId: account.uid,
      dateFrom: "2026-08-01",
      continuationKey: "pagina-1",
    });

    expect(calls[0]?.options.query).toEqual({
      date_from: "2026-08-01",
      date_to: null,
      continuation_key: "pagina-1",
    });
    expect(page.continuationKey).toBe("pagina-2");
    expect(page.transactions).toHaveLength(3);

    const [booked, pending, rejected] = page.transactions;
    expect(booked).toMatchObject({
      entryReference: "5561990681",
      status: "booked",
      direction: "debit",
      amount: "42.50",
      currency: "EUR",
      description: "Compra Continente",
      counterpartyName: "Continente",
      merchantCategoryCode: "5411",
      bankTransactionCode: "PMNT",
    });
    expect(booked?.counterpartyAccountHash).toMatch(/^[a-f0-9]{64}$/);
    expect(booked?.bookingDate).toBe("2026-08-03T00:00:00.000Z");
    expect(pending).toMatchObject({ status: "pending", direction: "credit", amount: "10.00" });
    expect(rejected).toMatchObject({ status: "rejected", amount: "1.00" });
  });

  it("rejects a transaction without a valid amount", async () => {
    const { provider } = stubRequest(() => ({
      transactions: [
        {
          status: "BOOK",
          credit_debit_indicator: "DBIT",
          transaction_amount: { currency: "EUR", amount: "nao-e-numero" },
        },
      ],
    }));

    await expect(
      provider.getTransactions({ sessionId: "sess-1", providerAccountId: account.uid }),
    ).rejects.toThrow();
  });

  it("closes the session at the provider", async () => {
    const { provider, calls } = stubRequest(() => ({ message: "OK" }));
    await provider.revokeSession("sess-1");
    expect(calls[0]?.path).toBe("/sessions/sess-1");
    expect(calls[0]?.options.method).toBe("DELETE");
  });
});
