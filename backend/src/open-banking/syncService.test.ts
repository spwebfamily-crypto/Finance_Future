import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
import { decryptString } from "./crypto.js";
import { resetTestPrisma, testPrisma } from "./testPrisma.js";
import { installTestOpenBankingConfig } from "./testSupport.js";
import { fakeOpenBankingStore, FakeOpenBankingProvider } from "./fakeOpenBankingProvider.js";
import { claimSyncJob, processSyncJob, runSyncJob, selectBalances } from "./syncService.js";
import { buildDedupeKey, findPendingCandidate, normalizeDescriptionKey } from "./dedupe.js";
import type { ProviderTransaction } from "./contracts.js";
import { prisma } from "../prisma.js";

installTestOpenBankingConfig();

vi.mock("../prisma.js", async () => {
  const { testPrisma: shared } = await import("./testPrisma.js");
  return { prisma: shared };
});

// A instância partilhada é a mesma que o serviço usa através do mock.
const memory = testPrisma;

function dbCounts() {
  return Object.fromEntries(
    Object.entries(memory.data).map(([model, rows]) => [model, rows.length]),
  );
}

const userId = "7c8f0f14-1f87-4dfb-a2bf-85bf170a79c8";
const provider = new FakeOpenBankingProvider();

function transaction(overrides: Partial<ProviderTransaction> = {}): ProviderTransaction {
  return {
    entryReference: null,
    providerTransactionId: null,
    status: "booked",
    direction: "debit",
    amount: "10.00",
    currency: "EUR",
    bookingDate: "2026-08-01",
    valueDate: null,
    transactionDate: null,
    description: "Movimento",
    counterpartyName: null,
    counterpartyAccountHash: null,
    merchantCategoryCode: null,
    bankTransactionCode: null,
    ...overrides,
  };
}

async function seedCategory(name = "Outros") {
  return prisma.category.create({ data: { userId, name, isDefault: true } });
}

async function seedConnection(options: { accounts?: unknown[]; status?: string } = {}) {
  const connection = await prisma.bankConnection.create({
    data: {
      userId,
      provider: "fake",
      providerSessionCiphertext: "v1.iv.tag.session",
      institutionId: "PT|Banco Demonstração",
      institutionName: "Banco Demonstração",
      institutionCountry: "PT",
      status: (options.status as never) ?? "active",
    },
  });
  return connection as unknown as { id: string };
}

async function seedSessionWithAccounts(
  accounts: Array<{
    providerAccountId: string;
    providerAccountHash: string;
    displayName: string;
    currency?: string;
    iban?: string | null;
    balances?: Array<{
      kind: "closing_booked" | "closing_available" | "interim_booked";
      amount: string;
      currency: string;
      referenceDate: string | null;
    }>;
    pages?: ProviderTransaction[][];
  }>,
  options: { status?: never } = {},
) {
  const sessionId = provider.seedSession({
    institutionId: "PT|Banco Demonstração",
    ...(options.status ? { status: options.status } : {}),
    accounts: accounts.map((account) => ({
      providerAccountId: account.providerAccountId,
      providerAccountHash: account.providerAccountHash,
      displayName: account.displayName,
      iban: account.iban ?? null,
      currency: account.currency ?? "EUR",
      balances: account.balances ?? [
        {
          kind: "closing_booked",
          amount: "100.00",
          currency: account.currency ?? "EUR",
          referenceDate: null,
        },
      ],
      pages: account.pages ?? [[transaction({ description: "Primeiro movimento" })]],
    })),
  });
  return sessionId;
}

async function createJob(connectionId: string) {
  const job = await prisma.bankSyncJob.create({
    data: { userId, connectionId, trigger: "initial" },
  });
  return job as unknown as { id: string };
}

/** Liga a sessão do provedor ao cipher usado pela ligação. */
async function linkSession(connectionId: string, sessionId: string) {
  const { encryptString } = await import("./crypto.js");
  await prisma.bankConnection.update({
    where: { id: connectionId },
    data: { providerSessionCiphertext: encryptString(sessionId) },
  });
}

beforeEach(() => {
  resetTestPrisma();
  fakeOpenBankingStore.reset();
});

describe("dedupe keys", () => {
  it("prefers the provider entry reference", () => {
    const withReference = buildDedupeKey({
      provider: "fake",
      providerAccountHash: "hash-1",
      entryReference: "ref-1",
      direction: "debit",
      amount: "10.00",
      currency: "EUR",
      bookingDate: "2026-08-01",
      valueDate: null,
      transactionDate: null,
      description: "Movimento",
      counterpartyAccountHash: null,
    });
    const fallback = buildDedupeKey({
      provider: "fake",
      providerAccountHash: "hash-1",
      entryReference: null,
      direction: "debit",
      amount: "10.00",
      currency: "EUR",
      bookingDate: "2026-08-01",
      valueDate: null,
      transactionDate: null,
      description: "Movimento",
      counterpartyAccountHash: null,
    });

    expect(withReference).not.toBe(fallback);
  });

  it("scopes the fallback key to the account and never to date/description/amount alone", () => {
    const base = {
      provider: "fake",
      entryReference: null,
      direction: "debit" as const,
      amount: "10.00",
      currency: "EUR",
      bookingDate: "2026-08-01",
      valueDate: null,
      transactionDate: null,
      description: "Movimento",
      counterpartyAccountHash: null,
    };

    expect(buildDedupeKey({ ...base, providerAccountHash: "hash-1" })).not.toBe(
      buildDedupeKey({ ...base, providerAccountHash: "hash-2" }),
    );
    expect(
      buildDedupeKey({ ...base, providerAccountHash: "hash-1", direction: "credit" }),
    ).not.toBe(buildDedupeKey({ ...base, providerAccountHash: "hash-1" }));
    expect(normalizeDescriptionKey("Café Central")).toBe(normalizeDescriptionKey("cafe  central"));
  });

  it("does not match a pending transaction when the data is ambiguous", () => {
    const candidates = [
      {
        id: "a",
        dedupeKey: "k1",
        providerEntryReference: null,
        bookingDate: new Date("2026-08-01T00:00:00.000Z"),
        valueDate: null,
        transactionDate: null,
        description: "Compra",
        counterpartyAccountHash: null,
      },
      {
        id: "b",
        dedupeKey: "k2",
        providerEntryReference: null,
        bookingDate: new Date("2026-08-02T00:00:00.000Z"),
        valueDate: null,
        transactionDate: null,
        description: "Compra",
        counterpartyAccountHash: null,
      },
    ];

    expect(findPendingCandidate(transaction({ description: "Compra" }), candidates)).toEqual({
      ambiguous: true,
    });
    expect(
      findPendingCandidate(transaction({ description: "Compra" }), candidates.slice(0, 1)),
    ).toEqual({ match: candidates[0] });
    expect(
      findPendingCandidate(transaction({ description: "Outra" }), candidates.slice(0, 1)),
    ).toBeNull();
    expect(
      findPendingCandidate(transaction({ description: "Compra" }), [
        { ...candidates[0]!, bookingDate: new Date("2026-01-01T00:00:00.000Z") },
      ]),
    ).toBeNull();
  });
});

describe("balance selection", () => {
  it("prefers closing booked for the current balance and closing available for the available one", () => {
    const selected = selectBalances([
      { kind: "interim_available", amount: "90.00", currency: "EUR", referenceDate: null },
      { kind: "closing_available", amount: "95.00", currency: "EUR", referenceDate: null },
      { kind: "interim_booked", amount: "99.00", currency: "EUR", referenceDate: null },
      { kind: "closing_booked", amount: "100.00", currency: "EUR", referenceDate: "2026-08-30" },
    ]);

    expect(selected.current?.toFixed(2)).toBe("100.00");
    expect(selected.available?.toFixed(2)).toBe("95.00");
  });

  it("falls back to interim booked when there is no closing balance", () => {
    const selected = selectBalances([
      { kind: "interim_booked", amount: "12.34", currency: "EUR", referenceDate: null },
    ]);
    expect(selected.current?.toFixed(2)).toBe("12.34");
    expect(selected.available).toBeNull();
  });
});

describe("sync engine", () => {
  it("creates accounts, links, balances and transactions", async () => {
    await seedCategory();
    const connection = await seedConnection();
    const sessionId = await seedSessionWithAccounts([
      {
        providerAccountId: "acc-1",
        providerAccountHash: "hash-1",
        displayName: "Conta à ordem",
        balances: [
          { kind: "closing_booked", amount: "1250.30", currency: "EUR", referenceDate: null },
          { kind: "closing_available", amount: "1180.30", currency: "EUR", referenceDate: null },
        ],
        pages: [
          [
            transaction({ entryReference: "r1", description: "Compra", amount: "42.50" }),
            transaction({
              entryReference: "r2",
              direction: "credit",
              description: "Salário",
              amount: "1250.00",
            }),
          ],
        ],
      },
    ]);
    await linkSession(connection.id, sessionId);
    const job = await createJob(connection.id);

    const outcome = await processSyncJob(job.id);

    expect(outcome).toMatchObject({
      status: "completed",
      accountsProcessed: 1,
      transactionsCreated: 2,
      transactionsUpdated: 0,
    });

    const links = await prisma.bankAccountLink.findMany({ where: { connectionId: connection.id } });
    expect(links).toHaveLength(1);
    expect(links[0]!.accountType).toBe("current");
    expect(decryptString(links[0]!.providerAccountIdCiphertext as string)).toBe("acc-1");

    const account = await prisma.account.findUnique({
      where: { id: links[0]!.accountId as string },
    });
    expect(account).toMatchObject({ source: "bank", currency: "EUR", name: "Conta à ordem" });
    expect(new Prisma.Decimal(account!.providerCurrentBalance as Prisma.Decimal).toFixed(2)).toBe(
      "1250.30",
    );
    expect(new Prisma.Decimal(account!.providerAvailableBalance as Prisma.Decimal).toFixed(2)).toBe(
      "1180.30",
    );
    expect(account!.providerBalanceUpdatedAt).not.toBeNull();

    const transactions = await prisma.bankTransaction.findMany({ where: { userId } });
    expect(transactions).toHaveLength(2);
    expect(transactions.map((item) => item.classification).sort()).toEqual(["expense", "income"]);

    const expenses = await prisma.expense.findMany({ where: { userId } });
    const incomes = await prisma.income.findMany({ where: { userId } });
    expect(expenses).toHaveLength(1);
    expect(incomes).toHaveLength(1);
    expect(expenses[0]!.description).toBe("Compra");
    expect(expenses[0]!.location).toBe("Movimento bancário");
    expect(String(incomes[0]!.amount)).toMatch(/1250/);
  });

  it("is idempotent: a second identical sync creates nothing", async () => {
    const connection = await seedConnection();
    const sessionId = await seedSessionWithAccounts([
      {
        providerAccountId: "acc-1",
        providerAccountHash: "hash-1",
        displayName: "Conta à ordem",
        pages: [
          [
            transaction({ entryReference: "r1", description: "Compra", amount: "42.50" }),
            transaction({ entryReference: "r2", description: "Jantar", amount: "18.20" }),
          ],
        ],
      },
    ]);
    await linkSession(connection.id, sessionId);

    const firstJob = await createJob(connection.id);
    const first = await processSyncJob(firstJob.id);
    const secondJob = await createJob(connection.id);
    const second = await processSyncJob(secondJob.id);

    expect(first).toMatchObject({ transactionsCreated: 2, transactionsUpdated: 0 });
    expect(second).toMatchObject({ transactionsCreated: 0, transactionsUpdated: 2 });
    expect(await prisma.bankTransaction.count({ where: { userId } })).toBe(2);
    expect(dbCounts().bankAccountLink).toBe(1);
    expect(await prisma.account.count({ where: { userId } })).toBe(1);
    expect(await prisma.bankAccountLink.count({ where: { connectionId: connection.id } })).toBe(1);
  });

  it("keeps paging while a continuation key is returned, even for empty pages", async () => {
    const connection = await seedConnection();
    const sessionId = await seedSessionWithAccounts([
      {
        providerAccountId: "acc-1",
        providerAccountHash: "hash-1",
        displayName: "Conta à ordem",
        pages: [
          [],
          [transaction({ entryReference: "r1", description: "Depois de página vazia" })],
          [],
        ],
      },
    ]);
    await linkSession(connection.id, sessionId);
    const job = await createJob(connection.id);

    const outcome = await processSyncJob(job.id);

    expect(outcome).toMatchObject({ status: "completed", transactionsCreated: 1 });
    expect(await prisma.bankTransaction.count({ where: { userId } })).toBe(1);
  });

  it("updates the same record when a pending transaction becomes booked", async () => {
    const connection = await seedConnection();
    const sessionId = await seedSessionWithAccounts([
      {
        providerAccountId: "acc-1",
        providerAccountHash: "hash-1",
        displayName: "Conta à ordem",
        pages: [
          [
            transaction({
              entryReference: null,
              status: "pending",
              description: "Pagamento MB WAY",
              amount: "15.00",
              bookingDate: "2026-08-10",
            }),
          ],
        ],
      },
    ]);
    await linkSession(connection.id, sessionId);

    const firstJob = await createJob(connection.id);
    await processSyncJob(firstJob.id);
    const before = await prisma.bankTransaction.findMany({ where: { userId } });
    expect(before).toHaveLength(1);
    expect(before[0]!.status).toBe("pending");

    provider.bookPending(sessionId, "acc-1", "Pagamento MB WAY", { entryReference: "2026-0003" });

    const secondJob = await createJob(connection.id);
    const outcome = await processSyncJob(secondJob.id);

    const after = await prisma.bankTransaction.findMany({ where: { userId } });
    expect(after).toHaveLength(1);
    expect(after[0]!.status).toBe("booked");
    expect(after[0]!.providerEntryReference).toBe("2026-0003");
    expect(after[0]!.id).toBe(before[0]!.id);
    expect(outcome).toMatchObject({ transactionsCreated: 0, transactionsUpdated: 1 });
  });

  it("supports two currencies in the same connection", async () => {
    const connection = await seedConnection();
    const sessionId = await seedSessionWithAccounts([
      {
        providerAccountId: "acc-eur",
        providerAccountHash: "hash-eur",
        displayName: "Conta EUR",
        currency: "EUR",
        pages: [[transaction({ entryReference: "e1", currency: "EUR", amount: "10.00" })]],
      },
      {
        providerAccountId: "acc-usd",
        providerAccountHash: "hash-usd",
        displayName: "Conta USD",
        currency: "USD",
        balances: [
          { kind: "closing_booked", amount: "55.00", currency: "USD", referenceDate: null },
        ],
        pages: [[transaction({ entryReference: "u1", currency: "USD", amount: "20.00" })]],
      },
    ]);
    await linkSession(connection.id, sessionId);
    const job = await createJob(connection.id);

    const outcome = await processSyncJob(job.id);

    expect(outcome).toMatchObject({ accountsProcessed: 2, transactionsCreated: 2 });
    const transactions = await prisma.bankTransaction.findMany({ where: { userId } });
    expect(transactions.map((item) => item.currency).sort()).toEqual(["EUR", "USD"]);
    const accounts = await prisma.account.findMany({ where: { userId } });
    expect(accounts.map((item) => item.currency).sort()).toEqual(["EUR", "USD"]);
  });

  it("marks the connection as expired when the provider session expires", async () => {
    const connection = await seedConnection();
    const sessionId = await seedSessionWithAccounts(
      [{ providerAccountId: "acc-1", providerAccountHash: "hash-1", displayName: "Conta" }],
      { status: "expired" },
    );
    await linkSession(connection.id, sessionId);
    const job = await createJob(connection.id);

    const outcome = await processSyncJob(job.id);

    expect(outcome.status).toBe("failed");
    expect(outcome.errorCode).toBe("BANK_CONNECTION_REAUTH_REQUIRED");
    const updated = await prisma.bankConnection.findUnique({ where: { id: connection.id } });
    expect(updated!.status).toBe("expired");
    expect(updated!.lastErrorCode).toContain("PROVIDER_SESSION_EXPIRED");
  });

  it("keeps the connection active and schedules a retry after a transient failure", async () => {
    const connection = await seedConnection();
    const sessionId = await seedSessionWithAccounts([
      { providerAccountId: "acc-1", providerAccountHash: "hash-1", displayName: "Conta" },
    ]);
    await linkSession(connection.id, sessionId);
    const job = await createJob(connection.id);
    fakeOpenBankingStore.failNext(1, "provider_unavailable");

    const outcome = await processSyncJob(job.id);

    expect(outcome.status).toBe("failed");
    expect(outcome.errorCode).toBe("BANK_PROVIDER_UNAVAILABLE");
    const updated = await prisma.bankConnection.findUnique({ where: { id: connection.id } });
    expect(updated!.status).toBe("active");
    expect(updated!.nextSyncAt!.getTime()).toBeGreaterThan(Date.now());
  });

  it("does not let two workers claim the same job", async () => {
    const connection = await seedConnection();
    const job = await createJob(connection.id);

    const [first, second] = await Promise.all([claimSyncJob(job.id), claimSyncJob(job.id)]);

    expect([first, second].filter((value) => value !== null)).toHaveLength(1);
  });

  it("reports a partial result when the provider fails on the second account", async () => {
    const connection = await seedConnection();
    const sessionId = await seedSessionWithAccounts([
      { providerAccountId: "acc-1", providerAccountHash: "hash-1", displayName: "Conta 1" },
      { providerAccountId: "acc-2", providerAccountHash: "hash-2", displayName: "Conta 2" },
    ]);
    await linkSession(connection.id, sessionId);
    const job = await createJob(connection.id);

    provider.failAccountOnce("acc-2", "provider_unavailable");

    const outcome = await processSyncJob(job.id);

    // Com a nova lógica, a sincronização parcial ainda executa materialização
    // para as contas bem-sucedidas, pelo que o status é "partial" (não "failed").
    expect(outcome.status).toBe("partial");
    expect(outcome.accountsProcessed).toBe(1);
    expect(outcome.materialization).toBeDefined();
    const updated = await prisma.bankConnection.findUnique({ where: { id: connection.id } });
    expect(updated!.status).toBe("error"); // status "error" para ligação com erro parcial
    expect(updated!.lastErrorCode).toBe("PROVIDER_PROVIDER_UNAVAILABLE");
  });

  it("fails cleanly when the connection no longer exists", async () => {
    const job = await prisma.bankSyncJob.create({
      data: { userId, connectionId: randomUUID(), trigger: "manual" },
    });
    const outcome = await runSyncJob(job as never);
    expect(outcome).toMatchObject({ status: "failed", errorCode: "BANK_CONNECTION_NOT_FOUND" });
  });

  it("keeps pending transactions out of the materialized set", async () => {
    const connection = await seedConnection();
    const sessionId = await seedSessionWithAccounts([
      {
        providerAccountId: "acc-1",
        providerAccountHash: "hash-1",
        displayName: "Conta",
        pages: [
          [
            transaction({
              entryReference: "p1",
              status: "pending",
              amount: "7.50",
              description: "Pendente",
            }),
          ],
        ],
      },
    ]);
    await linkSession(connection.id, sessionId);
    const job = await createJob(connection.id);
    await processSyncJob(job.id);

    const stored = await prisma.bankTransaction.findMany({ where: { userId } });
    expect(stored).toHaveLength(1);
    expect(new Prisma.Decimal(stored[0]!.amount as Prisma.Decimal).toFixed(2)).toBe("7.50");
    expect(stored[0]!.status).toBe("pending");
  });
});
