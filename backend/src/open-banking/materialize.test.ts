import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
import { resetTestPrisma, testPrisma } from "./testPrisma.js";
import { installTestOpenBankingConfig } from "./testSupport.js";
import { findTransferPairs, matchInternalTransfers } from "./transferMatcher.js";
import { materializeBookedTransactions } from "./materialize.js";
import { hmacHex, normalizeIban } from "./crypto.js";

installTestOpenBankingConfig();

vi.mock("../prisma.js", async () => {
  const { testPrisma: shared } = await import("./testPrisma.js");
  return { prisma: shared };
});

const prisma = testPrisma;
const userId = "7c8f0f14-1f87-4dfb-a2bf-85bf170a79c8";
const otherUserId = "1f0e2d3c-4b5a-4968-8779-9a0b1c2d3e4f";

const ibanA = "PT50000201231234567890154";
const ibanB = "PT51000201231234567890155";

beforeEach(() => {
  resetTestPrisma();
});

async function seedCategory(name = "Outros") {
  await prisma.category.create({ data: { userId, name, isDefault: true } });
}

async function seedBankAccount(options: {
  userId?: string;
  displayName: string;
  iban?: string | null;
  hash: string;
}) {
  const connection = await prisma.bankConnection.create({
    data: {
      userId: options.userId ?? userId,
      provider: "fake",
      providerSessionCiphertext: "v1.iv.tag.session",
      institutionId: "PT|Banco Demonstração",
      institutionName: "Banco Demonstração",
      institutionCountry: "PT",
      status: "active",
    },
  });
  const account = await prisma.account.create({
    data: {
      userId: options.userId ?? userId,
      name: options.displayName,
      type: "current",
      source: "bank",
      currency: "EUR",
    },
  });
  const link = await prisma.bankAccountLink.create({
    data: {
      connectionId: connection.id as string,
      accountId: account.id as string,
      providerAccountIdCiphertext: "v1.iv.tag.account",
      providerAccountHash: options.hash,
      providerIbanHash: options.iban ? hmacHex(`iban:${normalizeIban(options.iban)}`) : null,
      displayName: options.displayName,
      currency: "EUR",
      accountType: "current",
    },
  });
  return { connection, account, link };
}

async function seedTransaction(
  linkId: string,
  overrides: Partial<{
    userId: string;
    direction: "debit" | "credit";
    amount: string;
    currency: string;
    status: string;
    description: string;
    bookingDate: string | Date;
    counterpartyName: string | null;
    counterpartyAccountHash: string | null;
    classification: string;
    excludedFromAnalytics: boolean;
  }> = {},
) {
  const { bookingDate, ...rest } = overrides;
  return prisma.bankTransaction.create({
    data: {
      userId,
      bankAccountLinkId: linkId,
      dedupeKey: `key-${linkId}-${Math.random().toString(36).slice(2)}`,
      status: "booked",
      direction: "debit",
      amount: new Prisma.Decimal("10.00"),
      currency: "EUR",
      bookingDate: new Date("2026-08-01T00:00:00.000Z"),
      description: "Movimento",
      classification: "unreviewed",
      ...rest,
      ...(bookingDate
        ? { bookingDate: bookingDate instanceof Date ? bookingDate : new Date(bookingDate) }
        : {}),
    } as never,
  });
}

describe("materialization", () => {
  it("creates an expense for a booked debit and an income for a booked credit", async () => {
    await seedCategory();
    const { link, account } = await seedBankAccount({ displayName: "Conta", hash: "hash-1" });
    const debit = await seedTransaction(link.id as string, {
      direction: "debit",
      amount: "42.50",
      description: "Compra Continente",
      counterpartyName: "Continente",
    });
    const credit = await seedTransaction(link.id as string, {
      direction: "credit",
      amount: "1250.00",
      description: "Salário",
      counterpartyName: "Empregador",
    });

    const counters = await materializeBookedTransactions(userId);

    expect(counters).toMatchObject({ expensesCreated: 1, incomesCreated: 1, skipped: 0 });

    const expenses = await prisma.expense.findMany({ where: { userId } });
    const incomes = await prisma.income.findMany({ where: { userId } });
    expect(expenses).toHaveLength(1);
    expect(incomes).toHaveLength(1);
    expect(expenses[0]).toMatchObject({
      description: "Compra Continente",
      location: "Continente",
      accountId: account.id,
    });
    expect(String(expenses[0]!.amount)).toBe("42.50");
    expect(incomes[0]).toMatchObject({ description: "Salário", source: "Empregador" });
    expect(String(incomes[0]!.amount)).toBe("1250.00");

    const updatedDebit = await prisma.bankTransaction.findUnique({
      where: { id: debit.id as string },
    });
    const updatedCredit = await prisma.bankTransaction.findUnique({
      where: { id: credit.id as string },
    });
    expect(updatedDebit!.classification).toBe("expense");
    expect(updatedCredit!.classification).toBe("income");
  });

  it("does not duplicate materialization on a second run and keeps the chosen category", async () => {
    await seedCategory("Outros");
    await prisma.category.create({ data: { userId, name: "Transportes", isDefault: true } });
    const transportes = await prisma.category.findFirst({ where: { userId, name: "Transportes" } });
    const { link } = await seedBankAccount({ displayName: "Conta", hash: "hash-1" });
    const debit = await seedTransaction(link.id as string, {
      direction: "debit",
      amount: "30.00",
      description: "Comboio",
    });

    await materializeBookedTransactions(userId);
    const expense = (await prisma.expense.findMany({ where: { userId } }))[0]!;
    await prisma.expense.update({
      where: { id: expense.id as string },
      data: { categoryId: transportes!.id as string },
    });

    const counters = await materializeBookedTransactions(userId);

    expect(counters.expensesCreated).toBe(0);
    const expenses = await prisma.expense.findMany({ where: { userId } });
    expect(expenses).toHaveLength(1);
    expect(expenses[0]!.categoryId).toBe(transportes!.id);
    const stored = await prisma.bankTransaction.findUnique({ where: { id: debit.id as string } });
    expect(stored!.classification).toBe("expense");
  });

  it("never materializes pending transactions", async () => {
    await seedCategory();
    const { link } = await seedBankAccount({ displayName: "Conta", hash: "hash-1" });
    await seedTransaction(link.id as string, {
      status: "pending",
      direction: "debit",
      amount: "15.00",
      description: "Pendente",
    });

    const counters = await materializeBookedTransactions(userId);

    expect(counters).toMatchObject({ expensesCreated: 0, skipped: 0 });
    expect(await prisma.expense.count({ where: { userId } })).toBe(0);
  });

  it("treats a matching credit as a refund instead of income", async () => {
    await seedCategory();
    const { link } = await seedBankAccount({ displayName: "Conta", hash: "hash-1" });
    await seedTransaction(link.id as string, {
      direction: "debit",
      amount: "80.00",
      description: "Compra devolvida",
      counterpartyName: "Loja",
      bookingDate: "2026-08-01T00:00:00.000Z",
    });
    const credit = await seedTransaction(link.id as string, {
      direction: "credit",
      amount: "80.00",
      description: "Compra devolvida",
      counterpartyName: "Loja",
      bookingDate: "2026-08-05T00:00:00.000Z",
    });

    const counters = await materializeBookedTransactions(userId);

    expect(counters.refundsDetected).toBe(1);
    expect(await prisma.income.count({ where: { userId } })).toBe(0);
    const stored = await prisma.bankTransaction.findUnique({ where: { id: credit.id as string } });
    expect(stored!.classification).toBe("refund");
  });

  it("ignores excluded and ignored movements", async () => {
    await seedCategory();
    const { link } = await seedBankAccount({ displayName: "Conta", hash: "hash-1" });
    await seedTransaction(link.id as string, {
      direction: "debit",
      amount: "5.00",
      excludedFromAnalytics: true,
    });
    await seedTransaction(link.id as string, {
      direction: "debit",
      amount: "6.00",
      classification: "ignored",
    });

    const counters = await materializeBookedTransactions(userId);

    expect(counters.skipped).toBe(2);
    expect(await prisma.expense.count({ where: { userId } })).toBe(0);
  });
});

describe("internal transfer matching", () => {
  it("creates a single transfer for an unambiguous debit/credit pair", async () => {
    const origin = await seedBankAccount({ displayName: "Origem", hash: "hash-a", iban: ibanA });
    const destination = await seedBankAccount({
      displayName: "Destino",
      hash: "hash-b",
      iban: ibanB,
    });
    const debit = await seedTransaction(origin.link.id as string, {
      direction: "debit",
      amount: "250.00",
      description: "Transferência para poupança",
      counterpartyAccountHash: hmacHex(`iban:${normalizeIban(ibanB)}`),
      bookingDate: "2026-08-10T00:00:00.000Z",
    });
    const credit = await seedTransaction(destination.link.id as string, {
      direction: "credit",
      amount: "250.00",
      description: "Transferência recebida",
      counterpartyAccountHash: hmacHex(`iban:${normalizeIban(ibanA)}`),
      bookingDate: "2026-08-10T00:00:00.000Z",
    });

    const result = await matchInternalTransfers(userId);

    expect(result).toMatchObject({ transfersCreated: 1, pairsLinked: 2, ambiguous: 0 });

    const transfers = await prisma.transfer.findMany({ where: { userId } });
    expect(transfers).toHaveLength(1);
    expect(transfers[0]).toMatchObject({
      fromAccountId: origin.account.id,
      toAccountId: destination.account.id,
    });
    expect(String(transfers[0]!.amount)).toBe("250.00");

    const storedDebit = await prisma.bankTransaction.findUnique({
      where: { id: debit.id as string },
    });
    const storedCredit = await prisma.bankTransaction.findUnique({
      where: { id: credit.id as string },
    });
    expect(storedDebit!.classification).toBe("internal_transfer");
    expect(storedCredit!.classification).toBe("internal_transfer");
    expect(storedDebit!.transferId).toBe(storedCredit!.transferId);
  });

  it("does not match automatically when there is more than one candidate", async () => {
    const origin = await seedBankAccount({ displayName: "Origem", hash: "hash-a", iban: ibanA });
    const first = await seedBankAccount({ displayName: "Destino 1", hash: "hash-b", iban: ibanB });
    const second = await seedBankAccount({ displayName: "Destino 2", hash: "hash-c", iban: null });
    await seedTransaction(origin.link.id as string, {
      direction: "debit",
      amount: "100.00",
      bookingDate: "2026-08-10T00:00:00.000Z",
    });
    await seedTransaction(first.link.id as string, {
      direction: "credit",
      amount: "100.00",
      bookingDate: "2026-08-10T00:00:00.000Z",
    });
    await seedTransaction(second.link.id as string, {
      direction: "credit",
      amount: "100.00",
      bookingDate: "2026-08-11T00:00:00.000Z",
    });

    const result = await matchInternalTransfers(userId);

    expect(result.transfersCreated).toBe(0);
    expect(result.ambiguous).toBeGreaterThan(0);
    expect(await prisma.transfer.count({ where: { userId } })).toBe(0);
  });

  it("removes the expense and income created before the pair was detected", async () => {
    await seedCategory();
    const origin = await seedBankAccount({ displayName: "Origem", hash: "hash-a", iban: ibanA });
    const destination = await seedBankAccount({
      displayName: "Destino",
      hash: "hash-b",
      iban: ibanB,
    });
    const debit = await seedTransaction(origin.link.id as string, {
      direction: "debit",
      amount: "60.00",
      description: "Saída para outra conta",
      counterpartyAccountHash: hmacHex(`iban:${normalizeIban(ibanB)}`),
      bookingDate: "2026-08-10T00:00:00.000Z",
    });
    const credit = await seedTransaction(destination.link.id as string, {
      direction: "credit",
      amount: "60.00",
      description: "Entrada de outra conta",
      counterpartyAccountHash: hmacHex(`iban:${normalizeIban(ibanA)}`),
      bookingDate: "2026-08-10T00:00:00.000Z",
    });

    await materializeBookedTransactions(userId);
    expect(await prisma.expense.count({ where: { userId } })).toBe(1);
    expect(await prisma.income.count({ where: { userId } })).toBe(1);

    await matchInternalTransfers(userId);

    expect(await prisma.expense.count({ where: { userId } })).toBe(0);
    expect(await prisma.income.count({ where: { userId } })).toBe(0);
    const storedDebit = await prisma.bankTransaction.findUnique({
      where: { id: debit.id as string },
    });
    const storedCredit = await prisma.bankTransaction.findUnique({
      where: { id: credit.id as string },
    });
    expect(storedDebit!.expenseId).toBeNull();
    expect(storedCredit!.incomeId).toBeNull();
    expect(storedDebit!.classification).toBe("internal_transfer");
  });

  it("does not match transfers of another user", async () => {
    const mine = await seedBankAccount({ displayName: "Minha", hash: "hash-a", iban: ibanA });
    const theirs = await seedBankAccount({
      userId: otherUserId,
      displayName: "Alheia",
      hash: "hash-b",
      iban: ibanB,
    });
    await seedTransaction(mine.link.id as string, {
      direction: "debit",
      amount: "10.00",
      counterpartyAccountHash: hmacHex(`iban:${normalizeIban(ibanB)}`),
    });
    await seedTransaction(theirs.link.id as string, {
      userId: otherUserId,
      direction: "credit",
      amount: "10.00",
      counterpartyAccountHash: hmacHex(`iban:${normalizeIban(ibanA)}`),
    });

    const result = await matchInternalTransfers(userId);

    expect(result.transfersCreated).toBe(0);
    expect(await prisma.transfer.count({ where: { userId } })).toBe(0);
  });

  it("requires the same amount and a close date", () => {
    const base = {
      id: "x",
      userId,
      bankAccountLinkId: "link-1",
      dedupeKey: "k",
      status: "booked",
      amount: new Prisma.Decimal("10.00"),
      currency: "EUR",
      bookingDate: new Date("2026-08-01T00:00:00.000Z"),
      valueDate: null,
      transactionDate: null,
      description: "Movimento",
      counterpartyName: null,
      counterpartyAccountHash: null,
      merchantCategoryCode: null,
      bankTransactionCode: null,
      classification: "unreviewed",
      excludedFromAnalytics: false,
      expenseId: null,
      incomeId: null,
      transferId: null,
      providerEntryReference: null,
      providerTransactionId: null,
      firstSeenAt: new Date("2026-08-01T00:00:00.000Z"),
      lastSeenAt: new Date("2026-08-01T00:00:00.000Z"),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const debit = { ...base, id: "d1", direction: "debit" as const };
    const credit = { ...base, id: "c1", direction: "credit" as const };
    const accounts = new Map([
      ["link-1", { accountId: "acc-1", providerAccountHash: "hash-a", providerIbanHash: "iban-a" }],
      ["link-2", { accountId: "acc-2", providerAccountHash: "hash-b", providerIbanHash: "iban-b" }],
    ]);

    const exact = findTransferPairs(
      [debit],
      [{ ...credit, bankAccountLinkId: "link-2", counterpartyAccountHash: "iban-a" }],
      accounts,
    );
    expect(exact.pairs).toHaveLength(1);

    const differentAmount = findTransferPairs(
      [debit],
      [
        {
          ...credit,
          bankAccountLinkId: "link-2",
          amount: new Prisma.Decimal("11.00"),
          counterpartyAccountHash: "iban-a",
        },
      ],
      accounts,
    );
    expect(differentAmount.pairs).toHaveLength(0);

    const farDate = findTransferPairs(
      [debit],
      [
        {
          ...credit,
          bankAccountLinkId: "link-2",
          bookingDate: new Date("2026-09-01T00:00:00.000Z"),
          counterpartyAccountHash: "iban-a",
        },
      ],
      accounts,
    );
    expect(farDate.pairs).toHaveLength(0);
  });
});
