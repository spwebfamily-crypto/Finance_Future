import { beforeEach, describe, expect, it } from "vitest";
import {
  FakeOpenBankingProvider,
  FAKE_AUTHORIZE_PATH,
  fakeOpenBankingStore,
} from "./fakeOpenBankingProvider.js";
import { installTestOpenBankingConfig } from "./testSupport.js";

installTestOpenBankingConfig();

const provider = new FakeOpenBankingProvider();

beforeEach(() => {
  fakeOpenBankingStore.reset();
});

describe("fake open banking provider", () => {
  it("lists only institutions matching the country and PSU type", async () => {
    const personal = await provider.listInstitutions({ country: "PT", psuType: "personal" });
    const business = await provider.listInstitutions({ country: "PT", psuType: "business" });

    expect(personal.map((item) => item.name)).toContain("Banco Demonstração");
    expect(personal.map((item) => item.name)).not.toContain("Banco Empresas Demo");
    expect(business.map((item) => item.name)).toContain("Banco Empresas Demo");
    expect(await provider.listInstitutions({ country: "ES", psuType: "personal" })).toEqual([]);
  });

  it("points the authorization URL at the local bank simulator", async () => {
    const result = await provider.startAuthorization({
      institutionId: "PT|Banco Demonstração",
      country: "PT",
      psuType: "personal",
      state: "state-123",
      redirectUrl: "http://localhost:3000/api/open-banking/callback",
    });

    expect(result.authorizationUrl).toContain(FAKE_AUTHORIZE_PATH);
    expect(result.authorizationUrl.startsWith("http://localhost:3000")).toBe(true);
    expect(result.providerAuthorizationId).toBeTruthy();
  });

  it("rejects an institution that is not in the provider list", async () => {
    await expect(
      provider.startAuthorization({
        institutionId: "PT|Inexistente",
        country: "PT",
        psuType: "personal",
        state: "state-123",
        redirectUrl: "http://localhost:3000/api/open-banking/callback",
      }),
    ).rejects.toMatchObject({ code: "invalid_request" });
  });

  it("exchanges each authorization code only once", async () => {
    const started = await provider.startAuthorization({
      institutionId: "PT|Banco Demonstração",
      country: "PT",
      psuType: "personal",
      state: "state-123",
      redirectUrl: "http://localhost:3000/api/open-banking/callback",
    });
    const authorizationId = started.providerAuthorizationId!;
    const { code, state } = provider.completeAuthorization(authorizationId);

    expect(state).toBe("state-123");

    const session = await provider.exchangeAuthorizationCode(code);
    expect(session.status).toBe("authorized");
    expect(session.institutionName).toBe("Banco Demonstração");
    expect(session.accounts).toHaveLength(1);
    expect(session.accounts[0]?.maskedIban).toContain("PT50");

    await expect(provider.exchangeAuthorizationCode(code)).rejects.toMatchObject({
      code: "authorization_failed",
    });
  });

  it("rejects an unknown authorization", () => {
    expect(() => provider.completeAuthorization("inexistente")).toThrow(/autoriza/i);
  });

  it("returns balances and paginated transactions, including an empty page with a continuation key", async () => {
    const sessionId = provider.seedSession({
      institutionId: "PT|Banco Demonstração",
      accounts: [
        {
          providerAccountId: "acc-1",
          providerAccountHash: "hash-1",
          displayName: "Conta",
          iban: "PT50000201231234567890154",
          currency: "EUR",
          balances: [
            { kind: "closing_booked", amount: "10.00", currency: "EUR", referenceDate: null },
          ],
          pages: [
            [],
            [
              {
                entryReference: "r1",
                status: "booked",
                direction: "debit",
                amount: "5.00",
                currency: "EUR",
                bookingDate: "2026-08-01",
                valueDate: null,
                transactionDate: null,
                description: "Depois de página vazia",
                counterpartyName: null,
                counterpartyAccountHash: null,
                merchantCategoryCode: null,
                bankTransactionCode: null,
                providerTransactionId: null,
              },
            ],
          ],
        },
      ],
    });

    const context = { sessionId, providerAccountId: "acc-1" };
    expect(await provider.getBalances(context)).toHaveLength(1);

    const firstPage = await provider.getTransactions(context);
    expect(firstPage.transactions).toEqual([]);
    expect(firstPage.continuationKey).toBe("1");

    const secondPage = await provider.getTransactions({
      ...context,
      continuationKey: firstPage.continuationKey!,
    });
    expect(secondPage.transactions).toHaveLength(1);
    expect(secondPage.continuationKey).toBeNull();
  });

  it("simulates a pending transaction becoming booked", async () => {
    const started = await provider.startAuthorization({
      institutionId: "PT|Banco Demonstração",
      country: "PT",
      psuType: "personal",
      state: "state-1",
      redirectUrl: "http://localhost:3000/api/open-banking/callback",
    });
    const { code } = provider.completeAuthorization(started.providerAuthorizationId!);
    const session = await provider.exchangeAuthorizationCode(code);
    const context = { sessionId: session.providerSessionId, providerAccountId: "fake-account-1" };

    const before = await provider.getTransactions(context);
    expect(before.transactions.filter((item) => item.status === "pending")).toHaveLength(1);

    const booked = provider.bookPending(
      session.providerSessionId,
      "fake-account-1",
      "Pagamento MB WAY",
      {
        entryReference: "2026-0003",
      },
    );
    expect(booked?.status).toBe("booked");
    expect(booked?.entryReference).toBe("2026-0003");

    const after = await provider.getTransactions(context);
    expect(after.transactions.filter((item) => item.status === "pending")).toHaveLength(0);
  });

  it("reports an expired session and revokes access", async () => {
    await expect(provider.getSession("inexistente")).rejects.toMatchObject({
      code: "consent_expired",
    });

    const sessionId = provider.seedSession({
      institutionId: "PT|Banco Demonstração",
      accounts: [
        {
          providerAccountId: "acc-9",
          providerAccountHash: "hash-9",
          displayName: "Conta",
          currency: "EUR",
          balances: [],
          pages: [[]],
        },
      ],
    });
    provider.setSessionStatus(sessionId, "expired");
    expect((await provider.getSession(sessionId)).status).toBe("expired");

    await provider.revokeSession(sessionId);
    expect((await provider.getSession(sessionId)).status).toBe("revoked");
  });

  it("can simulate a provider failure", async () => {
    const sessionId = provider.seedSession({
      institutionId: "PT|Banco Demonstração",
      accounts: [
        {
          providerAccountId: "acc-2",
          providerAccountHash: "hash-2",
          displayName: "Conta",
          currency: "EUR",
          balances: [],
          pages: [[]],
        },
      ],
    });

    fakeOpenBankingStore.failNext(1, "provider_rate_limited");
    await expect(provider.getSession(sessionId)).rejects.toMatchObject({
      code: "provider_rate_limited",
    });
    expect((await provider.getSession(sessionId)).status).toBe("authorized");
  });
});
