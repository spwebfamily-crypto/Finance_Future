import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
import { resetTestPrisma, testPrisma } from "./testPrisma.js";
import { installTestOpenBankingConfig } from "./testSupport.js";
import { disconnectConnection, replaceSession } from "./disconnectService.js";
import { decryptString, encryptString } from "./crypto.js";
import { fakeOpenBankingStore } from "./fakeOpenBankingProvider.js";

installTestOpenBankingConfig();

vi.mock("../prisma.js", async () => {
  const { testPrisma: shared } = await import("./testPrisma.js");
  return { prisma: shared };
});

const prisma = testPrisma;
const userId = "7c8f0f14-1f87-4dfb-a2bf-85bf170a79c8";
const otherUserId = "1f0e2d3c-4b5a-4968-8779-9a0b1c2d3e4f";

beforeEach(() => {
  resetTestPrisma();
  fakeOpenBankingStore.reset();
});

async function seedConnection(options: { userId?: string; sessionId?: string } = {}) {
  const connection = await prisma.bankConnection.create({
    data: {
      userId: options.userId ?? userId,
      provider: "fake",
      providerSessionCiphertext: encryptString(options.sessionId ?? "sess-1"),
      institutionId: "PT|Banco Demonstração",
      institutionName: "Banco Demonstração",
      institutionCountry: "PT",
      status: "active",
    },
  });
  const account = await prisma.account.create({
    data: {
      userId: options.userId ?? userId,
      name: "Conta ligada",
      type: "current",
      source: "bank",
      currency: "EUR",
      openingBalance: new Prisma.Decimal("0"),
      providerCurrentBalance: new Prisma.Decimal("1000.00"),
      providerAvailableBalance: new Prisma.Decimal("950.00"),
    },
  });
  const link = await prisma.bankAccountLink.create({
    data: {
      connectionId: connection.id as string,
      accountId: account.id as string,
      providerAccountIdCiphertext: encryptString("acc-1"),
      providerAccountHash: "hash-1",
      displayName: "Conta ligada",
      currency: "EUR",
      accountType: "current",
    },
  });
  return { connection, account, link };
}

async function seedTransaction(
  linkId: string,
  options: { expenseId?: string | null; incomeId?: string | null; amount?: string } = {},
) {
  return prisma.bankTransaction.create({
    data: {
      userId,
      bankAccountLinkId: linkId,
      dedupeKey: `key-${Math.random().toString(36).slice(2)}`,
      status: "booked",
      direction: "debit",
      amount: new Prisma.Decimal(options.amount ?? "25.00"),
      currency: "EUR",
      bookingDate: new Date("2026-08-01T00:00:00.000Z"),
      description: "Movimento",
      classification: "expense",
      expenseId: options.expenseId ?? null,
      incomeId: options.incomeId ?? null,
    },
  });
}

describe("disconnecting a bank connection", () => {
  it("keeps imported data and converts accounts into manual ones", async () => {
    const { connection, account, link } = await seedConnection();
    const expense = await prisma.expense.create({
      data: {
        userId,
        categoryId: "11111111-1111-4111-8111-111111111111",
        accountId: account.id as string,
        description: "Compra",
        location: "Loja",
        amount: new Prisma.Decimal("25.00"),
        date: new Date("2026-08-01T00:00:00.000Z"),
      },
    });
    const transaction = await seedTransaction(link.id as string, {
      expenseId: expense.id as string,
    });

    const result = await disconnectConnection(connection.id as string, userId, "keep_imported");

    expect(result).toMatchObject({ retention: "keep_imported", accountsKept: 1 });

    const updatedAccount = await prisma.account.findUnique({ where: { id: account.id as string } });
    expect(updatedAccount!.source).toBe("manual");
    // O saldo derivado passa a reproduzir os 1000,00 do banco (1000 + 25 de despesa).
    expect(new Prisma.Decimal(updatedAccount!.openingBalance as Prisma.Decimal).toFixed(2)).toBe(
      "1025.00",
    );
    expect(updatedAccount!.providerCurrentBalance).toBeNull();
    expect(updatedAccount!.providerAvailableBalance).toBeNull();

    const updatedLink = await prisma.bankAccountLink.findUnique({
      where: { id: link.id as string },
    });
    expect(updatedLink!.providerAccountIdCiphertext).toBe("");

    // Nada do histórico importado é apagado.
    expect(await prisma.expense.count({ where: { userId } })).toBe(1);
    expect(await prisma.bankTransaction.count({ where: { userId } })).toBe(1);
    const keptTransaction = await prisma.bankTransaction.findUnique({
      where: { id: transaction.id as string },
    });
    expect(keptTransaction!.expenseId).toBe(expense.id);

    const updatedConnection = await prisma.bankConnection.findUnique({
      where: { id: connection.id as string },
    });
    expect(updatedConnection!.status).toBe("disconnected");
    expect(updatedConnection!.disconnectedAt).not.toBeNull();
    expect(updatedConnection!.providerSessionCiphertext).toBe("");
  });

  it("deletes only what came from the connection", async () => {
    const { connection, account, link } = await seedConnection();
    const manualAccount = await prisma.account.create({
      data: { userId, name: "Manual", type: "current", source: "manual" },
    });
    const bankExpense = await prisma.expense.create({
      data: {
        userId,
        categoryId: "11111111-1111-4111-8111-111111111111",
        accountId: account.id as string,
        description: "Do banco",
        location: "Loja",
        amount: new Prisma.Decimal("25.00"),
        date: new Date("2026-08-01T00:00:00.000Z"),
      },
    });
    const manualExpense = await prisma.expense.create({
      data: {
        userId,
        categoryId: "11111111-1111-4111-8111-111111111111",
        accountId: manualAccount.id as string,
        description: "Manual",
        location: "Casa",
        amount: new Prisma.Decimal("10.00"),
        date: new Date("2026-08-02T00:00:00.000Z"),
      },
    });
    await seedTransaction(link.id as string, { expenseId: bankExpense.id as string });

    const result = await disconnectConnection(connection.id as string, userId, "delete_imported");

    expect(result).toMatchObject({
      retention: "delete_imported",
      expensesDeleted: 1,
      transactionsDeleted: 1,
      accountsDeleted: 1,
    });
    expect(await prisma.expense.count({ where: { userId } })).toBe(1);
    expect((await prisma.expense.findMany({ where: { userId } }))[0]!.id).toBe(manualExpense.id);
    expect(await prisma.bankTransaction.count({ where: { userId } })).toBe(0);
    expect(
      await prisma.bankAccountLink.count({ where: { connectionId: connection.id as string } }),
    ).toBe(0);
    expect(await prisma.account.count({ where: { userId } })).toBe(1);
    expect(await prisma.bankConnection.count({ where: { id: connection.id as string } })).toBe(1);
  });

  it("keeps a bank account that still has manual movements", async () => {
    const { connection, account, link } = await seedConnection();
    await prisma.expense.create({
      data: {
        userId,
        categoryId: "11111111-1111-4111-8111-111111111111",
        accountId: account.id as string,
        description: "Manual na conta ligada",
        location: "Casa",
        amount: new Prisma.Decimal("5.00"),
        date: new Date("2026-08-03T00:00:00.000Z"),
      },
    });
    await seedTransaction(link.id as string);

    const result = await disconnectConnection(connection.id as string, userId, "delete_imported");

    expect(result.accountsDeleted).toBe(0);
    expect(result.accountsKept).toBe(1);
    const updatedAccount = await prisma.account.findUnique({ where: { id: account.id as string } });
    expect(updatedAccount!.source).toBe("manual");
    expect(await prisma.expense.count({ where: { userId } })).toBe(1);
  });

  it("is idempotent and refuses connections of another user", async () => {
    const { connection } = await seedConnection();

    await disconnectConnection(connection.id as string, userId, "keep_imported");
    const second = await disconnectConnection(connection.id as string, userId, "keep_imported");
    expect(second.accountsKept).toBe(1);

    await expect(
      disconnectConnection(connection.id as string, otherUserId, "keep_imported"),
    ).rejects.toMatchObject({ code: "BANK_CONNECTION_NOT_FOUND" });
  });

  it("revokes the session at the provider when possible", async () => {
    const { connection, account } = await seedConnection();
    await prisma.account.update({
      where: { id: account.id as string },
      data: { providerCurrentBalance: new Prisma.Decimal("500.00") },
    });

    const result = await disconnectConnection(connection.id as string, userId, "keep_imported");
    expect(result.sessionRevoked).toBe(true);
  });
});

describe("reauthorization", () => {
  it("replaces the encrypted session and reactivates the connection", async () => {
    const { connection } = await seedConnection();
    await prisma.bankConnection.update({
      where: { id: connection.id as string },
      data: { status: "reauth_required", lastErrorCode: "PROVIDER_SESSION_EXPIRED" },
    });

    await replaceSession(connection.id as string, "sess-2");

    const updated = await prisma.bankConnection.findUnique({
      where: { id: connection.id as string },
    });
    expect(updated!.status).toBe("active");
    expect(updated!.lastErrorCode).toBeNull();
    expect(decryptString(updated!.providerSessionCiphertext)).toBe("sess-2");
  });
});
