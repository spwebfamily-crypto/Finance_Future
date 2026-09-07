import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetTestPrisma, testPrisma } from "./testPrisma.js";
import { cleanupStableBankTransactionDuplicates } from "./duplicateCleanup.js";

vi.mock("../prisma.js", async () => {
  const { testPrisma: shared } = await import("./testPrisma.js");
  return { prisma: shared };
});

const userId = "user-duplicate-cleanup";

beforeEach(() => resetTestPrisma());

async function seedDuplicateMovement() {
  const firstConnection = await testPrisma.bankConnection.create({
    data: {
      userId,
      provider: "fake",
      providerSessionCiphertext: "cipher-1",
      institutionId: "bank-1",
      institutionName: "Banco",
      institutionCountry: "PT",
      status: "active",
      nextSyncAt: null,
    },
  });
  const secondConnection = await testPrisma.bankConnection.create({
    data: {
      userId,
      provider: "fake",
      providerSessionCiphertext: "cipher-2",
      institutionId: "bank-1",
      institutionName: "Banco",
      institutionCountry: "PT",
      status: "active",
      nextSyncAt: null,
    },
  });
  const firstAccount = await testPrisma.account.create({
    data: { userId, name: "Conta 1", type: "current" },
  });
  const secondAccount = await testPrisma.account.create({
    data: { userId, name: "Conta 2", type: "current" },
  });
  const firstLink = await testPrisma.bankAccountLink.create({
    data: {
      connectionId: firstConnection.id,
      accountId: firstAccount.id,
      providerAccountIdCiphertext: "account-1",
      providerAccountHash: "same-logical-account",
      displayName: "Conta",
      currency: "EUR",
      accountType: "current",
    },
  });
  const secondLink = await testPrisma.bankAccountLink.create({
    data: {
      connectionId: secondConnection.id,
      accountId: secondAccount.id,
      providerAccountIdCiphertext: "account-2",
      providerAccountHash: "same-logical-account",
      displayName: "Conta",
      currency: "EUR",
      accountType: "current",
    },
  });
  const category = await testPrisma.category.create({
    data: { userId, name: "Outros", isDefault: true },
  });
  const firstExpense = await testPrisma.expense.create({
    data: {
      userId,
      categoryId: category.id,
      accountId: firstAccount.id,
      description: "Compra",
      location: "Loja",
      amount: 10,
      date: new Date("2026-09-01T10:00:00Z"),
    },
  });
  const secondExpense = await testPrisma.expense.create({
    data: {
      userId,
      categoryId: category.id,
      accountId: secondAccount.id,
      description: "Compra",
      location: "Loja",
      amount: 10,
      date: new Date("2026-09-01T10:00:00Z"),
    },
  });
  const base = {
    userId,
    providerEntryReference: "stable-reference-1",
    status: "booked",
    direction: "debit",
    amount: 10,
    currency: "EUR",
    bookingDate: new Date("2026-09-01T10:00:00Z"),
    description: "Compra",
    classification: "expense",
  };
  await testPrisma.bankTransaction.create({
    data: {
      ...base,
      bankAccountLinkId: firstLink.id,
      dedupeKey: "dedupe-1",
      expenseId: firstExpense.id,
      firstSeenAt: new Date("2026-09-01T10:01:00Z"),
    },
  });
  await testPrisma.bankTransaction.create({
    data: {
      ...base,
      bankAccountLinkId: secondLink.id,
      dedupeKey: "dedupe-2",
      expenseId: secondExpense.id,
      firstSeenAt: new Date("2026-09-01T10:02:00Z"),
    },
  });
}

describe("stable bank transaction duplicate cleanup", () => {
  it("audits without changing data", async () => {
    await seedDuplicateMovement();

    const result = await cleanupStableBankTransactionDuplicates({ userId });

    expect(result.groupsFound).toBe(1);
    expect(result.transactionsRemoved).toBe(1);
    expect(await testPrisma.bankTransaction.count({ where: { userId } })).toBe(2);
    expect(await testPrisma.expense.count({ where: { userId } })).toBe(2);
  });

  it("keeps one canonical movement and removes its repeated expense", async () => {
    await seedDuplicateMovement();

    const result = await cleanupStableBankTransactionDuplicates({ userId, apply: true });

    expect(result).toMatchObject({
      groupsFound: 1,
      transactionsRemoved: 1,
      expensesRemoved: 1,
      conflictsSkipped: 0,
    });
    expect(await testPrisma.bankTransaction.count({ where: { userId } })).toBe(1);
    expect(await testPrisma.expense.count({ where: { userId } })).toBe(1);
  });

  it("does not treat matching fallback data without a stable reference as safe to delete", async () => {
    await seedDuplicateMovement();
    await testPrisma.bankTransaction.updateMany({
      where: { userId },
      data: { providerEntryReference: null },
    });

    const result = await cleanupStableBankTransactionDuplicates({ userId, apply: true });

    expect(result.groupsFound).toBe(0);
    expect(await testPrisma.bankTransaction.count({ where: { userId } })).toBe(2);
  });
});
