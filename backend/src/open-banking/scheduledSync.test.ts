import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetTestPrisma, testPrisma } from "./testPrisma.js";
import { installTestOpenBankingConfig } from "./testSupport.js";
import {
  cleanupOpenBankingData,
  claimConnection,
  findDueConnectionIds,
  hasActiveJob,
  processDueConnections,
  processSyncJob,
  reclaimStaleRunningJobs,
} from "./syncService.js";
import { encryptString } from "./crypto.js";
import { fakeOpenBankingStore, FakeOpenBankingProvider } from "./fakeOpenBankingProvider.js";

installTestOpenBankingConfig();

vi.mock("../prisma.js", async () => {
  const { testPrisma: shared } = await import("./testPrisma.js");
  return { prisma: shared };
});

const prisma = testPrisma;
const userId = "7c8f0f14-1f87-4dfb-a2bf-85bf170a79c8";
const provider = new FakeOpenBankingProvider();

beforeEach(() => {
  resetTestPrisma();
  fakeOpenBankingStore.reset();
});

async function seedConnection(options: {
  status?: string;
  nextSyncAt: Date | null;
  sessionId?: string;
}) {
  return prisma.bankConnection.create({
    data: {
      userId,
      provider: "fake",
      providerSessionCiphertext: encryptString(options.sessionId ?? "sess-1"),
      institutionId: "PT|Banco Demonstração",
      institutionName: "Banco Demonstração",
      institutionCountry: "PT",
      status: (options.status ?? "active") as never,
      nextSyncAt: options.nextSyncAt,
    },
  });
}

describe("scheduled synchronisation", () => {
  it("only picks connections that are due", async () => {
    const due = await seedConnection({ nextSyncAt: new Date(Date.now() - 60_000) });
    await seedConnection({ nextSyncAt: new Date(Date.now() + 3_600_000) });
    await seedConnection({ status: "disconnected", nextSyncAt: new Date(Date.now() - 60_000) });

    expect(await findDueConnectionIds(10)).toEqual([due.id]);
  });

  it("lets only one worker claim a connection", async () => {
    const connection = await seedConnection({ nextSyncAt: new Date(Date.now() - 60_000) });

    const [first, second] = await Promise.all([
      claimConnection(connection.id as string),
      claimConnection(connection.id as string),
    ]);

    expect([first, second].filter(Boolean)).toHaveLength(1);
  });

  it("processes a batch and reports only counts", async () => {
    const connection = await seedConnection({ nextSyncAt: new Date(Date.now() - 60_000) });
    const sessionId = provider.seedSession({
      institutionId: "PT|Banco Demonstração",
      accounts: [
        {
          providerAccountId: "acc-1",
          providerAccountHash: "hash-1",
          displayName: "Conta",
          currency: "EUR",
          balances: [],
          pages: [
            [
              {
                entryReference: "r1",
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
                providerTransactionId: null,
              },
            ],
          ],
        },
      ],
    });
    // A ligação passa a apontar para a sessão criada acima.
    await prisma.bankConnection.update({
      where: { id: connection.id as string },
      data: { providerSessionCiphertext: encryptString(sessionId) },
    });

    const result = await processDueConnections(10);

    expect(result.claimed).toBe(1);
    expect(result.completed).toBe(1);
    expect(result.transactionsCreated).toBe(1);
    expect(Object.keys(result).sort()).toEqual([
      "accountsProcessed",
      "claimed",
      "completed",
      "failed",
      "transactionsCreated",
      "transactionsUpdated",
    ]);
    const connectionAfter = await prisma.bankConnection.findUnique({
      where: { id: connection.id as string },
    });
    expect(connectionAfter!.nextSyncAt!.getTime()).toBeGreaterThan(Date.now());
  });

  it("resumes a failed job without duplicating data", async () => {
    const connection = await seedConnection({ nextSyncAt: new Date(Date.now() - 60_000) });
    const sessionId = provider.seedSession({
      institutionId: "PT|Banco Demonstração",
      accounts: [
        {
          providerAccountId: "acc-1",
          providerAccountHash: "hash-1",
          displayName: "Conta",
          currency: "EUR",
          balances: [],
          pages: [
            [
              {
                entryReference: "r1",
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
                providerTransactionId: null,
              },
            ],
          ],
        },
      ],
    });
    await prisma.bankConnection.update({
      where: { id: connection.id as string },
      data: { providerSessionCiphertext: encryptString(sessionId) },
    });

    fakeOpenBankingStore.failNext(1, "provider_unavailable");
    const firstJob = await prisma.bankSyncJob.create({
      data: { userId, connectionId: connection.id as string, trigger: "scheduled" },
    });
    const first = await processSyncJob(firstJob.id as string);
    expect(first?.status).toBe("failed");

    const secondJob = await prisma.bankSyncJob.create({
      data: { userId, connectionId: connection.id as string, trigger: "scheduled" },
    });
    const second = await processSyncJob(secondJob.id as string);

    expect(second?.status).toBe("completed");
    expect(second?.transactionsCreated).toBe(1);
    expect(await prisma.bankTransaction.count({ where: { userId } })).toBe(1);
  });
});

describe("stale running jobs", () => {
  it("treats running jobs older than 20 minutes as inactive", async () => {
    const connection = await seedConnection({ nextSyncAt: new Date(Date.now() - 60_000) });
    await prisma.bankSyncJob.create({
      data: {
        userId,
        connectionId: connection.id,
        trigger: "scheduled",
        status: "running",
        startedAt: new Date(Date.now() - 21 * 60_000),
      },
    });

    expect(await hasActiveJob(connection.id as string)).toBe(false);
  });

  it("still treats a recently started running job as active", async () => {
    const connection = await seedConnection({ nextSyncAt: new Date(Date.now() - 60_000) });
    await prisma.bankSyncJob.create({
      data: {
        userId,
        connectionId: connection.id,
        trigger: "manual",
        status: "running",
        startedAt: new Date(Date.now() - 60_000),
      },
    });

    expect(await hasActiveJob(connection.id as string)).toBe(true);
  });

  it("reclaims stale running jobs as failed", async () => {
    const connection = await seedConnection({ nextSyncAt: new Date(Date.now() - 60_000) });
    const stale = await prisma.bankSyncJob.create({
      data: {
        userId,
        connectionId: connection.id,
        trigger: "scheduled",
        status: "running",
        startedAt: new Date(Date.now() - 21 * 60_000),
      },
    });
    const fresh = await prisma.bankSyncJob.create({
      data: {
        userId,
        connectionId: connection.id,
        trigger: "manual",
        status: "running",
        startedAt: new Date(Date.now() - 60_000),
      },
    });

    expect(await reclaimStaleRunningJobs()).toBe(1);
    expect((await prisma.bankSyncJob.findUnique({ where: { id: stale.id } }))!.status).toBe(
      "failed",
    );
    expect((await prisma.bankSyncJob.findUnique({ where: { id: fresh.id } }))!.status).toBe(
      "running",
    );
  });

  it("lets processDueConnections reclaim a stuck job and enqueue a new sync", async () => {
    const connection = await seedConnection({ nextSyncAt: new Date(Date.now() - 60_000) });
    const sessionId = provider.seedSession({
      institutionId: "PT|Banco Demonstração",
      accounts: [
        {
          providerAccountId: "acc-1",
          providerAccountHash: "hash-1",
          displayName: "Conta",
          currency: "EUR",
          balances: [],
          pages: [
            [
              {
                entryReference: "r1",
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
                providerTransactionId: null,
              },
            ],
          ],
        },
      ],
    });
    await prisma.bankConnection.update({
      where: { id: connection.id as string },
      data: { providerSessionCiphertext: encryptString(sessionId) },
    });
    const stale = await prisma.bankSyncJob.create({
      data: {
        userId,
        connectionId: connection.id as string,
        trigger: "scheduled",
        status: "running",
        startedAt: new Date(Date.now() - 21 * 60_000),
      },
    });

    const result = await processDueConnections(10);

    expect(result.claimed).toBe(1);
    expect(result.completed).toBe(1);
    expect((await prisma.bankSyncJob.findUnique({ where: { id: stale.id } }))!.status).toBe(
      "failed",
    );
    expect(
      await prisma.bankSyncJob.count({
        where: { connectionId: connection.id as string, status: "completed" },
      }),
    ).toBe(1);
  });
});

describe("retention cleanup", () => {
  it("removes expired authorization attempts and old diagnostic payloads", async () => {
    const old = new Date(Date.now() - 40 * 86_400_000);
    await prisma.bankAuthorizationAttempt.create({
      data: {
        userId,
        provider: "fake",
        institutionId: "PT|Banco Demonstração",
        institutionName: "Banco Demonstração",
        country: "PT",
        psuType: "personal",
        stateHash: "hash-antigo",
        returnPath: "/accounts",
        expiresAt: old,
      },
    });
    await prisma.bankAuthorizationAttempt.create({
      data: {
        userId,
        provider: "fake",
        institutionId: "PT|Banco Demonstração",
        institutionName: "Banco Demonstração",
        country: "PT",
        psuType: "personal",
        stateHash: "hash-recente",
        returnPath: "/accounts",
        expiresAt: new Date(Date.now() + 600_000),
      },
    });

    const result = await cleanupOpenBankingData(30);

    expect(result.attemptsDeleted).toBe(1);
    expect(await prisma.bankAuthorizationAttempt.count()).toBe(1);
  });
});
