import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { Prisma } from "@prisma/client";
import express from "express";
import jwt from "jsonwebtoken";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { errorHandler } from "../middleware.js";
import accountRoutes from "./accounts.js";

const repositories = vi.hoisted(() => ({
  accountFindFirst: vi.fn(),
  accountFindMany: vi.fn(),
  accountUpdate: vi.fn(),
  accountDelete: vi.fn(),
  transferFindMany: vi.fn(),
  transferCreate: vi.fn(),
  transferDeleteMany: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("../prisma.js", () => {
  const transactionClient = {
    account: {
      update: repositories.accountUpdate,
      delete: repositories.accountDelete,
    },
    transfer: {
      findMany: repositories.transferFindMany,
      deleteMany: repositories.transferDeleteMany,
    },
  };
  return {
    prisma: {
      account: {
        findFirst: repositories.accountFindFirst,
        findMany: repositories.accountFindMany,
        update: repositories.accountUpdate,
      },
      transfer: {
        findMany: repositories.transferFindMany,
        create: repositories.transferCreate,
      },
      $transaction: repositories.transaction.mockImplementation((callback) =>
        callback(transactionClient),
      ),
    },
  };
});

const userId = "7c8f0f14-1f87-4dfb-a2bf-85bf170a79c8";
const accountId = "7b5f1793-45d7-485f-ab68-e32d1a57ed0d";
const secondAccountId = "de847505-8cd7-4c4a-ac31-c4707853f121";
const thirdAccountId = "25eb48fc-9e64-48fd-865c-a32e3a23a18a";

function authorization() {
  const token = jwt.sign(
    { type: "access", email: "owner@example.com" },
    process.env.JWT_ACCESS_SECRET!,
    { subject: userId, expiresIn: "5m" },
  );
  return `Bearer ${token}`;
}

describe("account balance corrections and deletion", () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use("/api/accounts", accountRoutes);
    app.use(errorHandler);
    await new Promise<void>((resolve) => {
      server = app.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  });

  beforeEach(() => {
    repositories.accountFindFirst.mockReset();
    repositories.accountUpdate.mockReset();
    repositories.accountDelete.mockReset().mockResolvedValue({ id: accountId });
    repositories.transferFindMany.mockReset().mockResolvedValue([]);
    repositories.transferDeleteMany.mockReset().mockResolvedValue({ count: 0 });
  });

  it("sets the current balance by adjusting only the opening balance", async () => {
    repositories.accountFindFirst.mockResolvedValue({
      id: accountId,
      name: "Conta principal",
      type: "current",
      openingBalance: new Prisma.Decimal("100"),
      creditLimit: null,
      createdAt: new Date("2026-08-01T10:00:00.000Z"),
      updatedAt: new Date("2026-08-01T10:00:00.000Z"),
      incomes: [{ amount: new Prisma.Decimal("100") }],
      expenses: [{ amount: new Prisma.Decimal("20") }],
      outgoingTransfers: [{ amount: new Prisma.Decimal("40") }],
      incomingTransfers: [{ amount: new Prisma.Decimal("10") }],
    });
    repositories.accountUpdate.mockResolvedValue({
      id: accountId,
      name: "Conta principal",
      type: "current",
      openingBalance: new Prisma.Decimal("200"),
      creditLimit: null,
      createdAt: new Date("2026-08-01T10:00:00.000Z"),
      updatedAt: new Date("2026-08-18T10:00:00.000Z"),
    });

    const response = await fetch(`${baseUrl}/api/accounts/${accountId}/balance`, {
      method: "PATCH",
      headers: { Authorization: authorization(), "Content-Type": "application/json" },
      body: JSON.stringify({ currentBalance: 250 }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.currentBalance).toBe(250);
    expect(body.data.openingBalance).toBe(200);
    expect(repositories.accountUpdate).toHaveBeenCalledOnce();
    expect(repositories.accountUpdate.mock.calls[0][0].data.openingBalance.toString()).toBe("200");
  });

  it("removes transfer history while preserving balances of the remaining accounts", async () => {
    repositories.accountFindFirst.mockResolvedValue({ id: accountId });
    repositories.transferFindMany.mockResolvedValue([
      { fromAccountId: accountId, toAccountId: secondAccountId, amount: new Prisma.Decimal("100") },
      { fromAccountId: thirdAccountId, toAccountId: accountId, amount: new Prisma.Decimal("40") },
      { fromAccountId: accountId, toAccountId: secondAccountId, amount: new Prisma.Decimal("15") },
    ]);

    const response = await fetch(`${baseUrl}/api/accounts/${accountId}`, {
      method: "DELETE",
      headers: { Authorization: authorization() },
    });

    expect(response.status).toBe(204);
    expect(repositories.accountUpdate).toHaveBeenCalledTimes(2);
    const adjustments = new Map(
      repositories.accountUpdate.mock.calls.map(([call]) => [
        call.where.id,
        call.data.openingBalance.increment.toString(),
      ]),
    );
    expect(adjustments.get(secondAccountId)).toBe("115");
    expect(adjustments.get(thirdAccountId)).toBe("-40");
    expect(repositories.transferDeleteMany).toHaveBeenCalledOnce();
    expect(repositories.accountDelete).toHaveBeenCalledWith({ where: { id: accountId } });
  });
});

describe("account transfers", () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use("/api/accounts", accountRoutes);
    app.use(errorHandler);
    await new Promise<void>((resolve) => {
      server = app.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  });

  beforeEach(() => {
    repositories.accountFindMany.mockReset();
    repositories.transferFindMany.mockReset();
    repositories.transferCreate.mockReset();
  });

  it("creates a transfer between two accounts owned by the user", async () => {
    repositories.accountFindMany.mockResolvedValue([{ id: accountId }, { id: secondAccountId }]);
    repositories.transferCreate.mockResolvedValue({
      id: "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
      fromAccountId: accountId,
      toAccountId: secondAccountId,
      amount: new Prisma.Decimal("250"),
      description: "Renda partilhada",
      date: new Date("2026-08-05T00:00:00.000Z"),
      createdAt: new Date("2026-08-05T12:00:00.000Z"),
      fromAccount: { id: accountId, name: "Conta principal" },
      toAccount: { id: secondAccountId, name: "Poupança" },
    });

    const response = await fetch(`${baseUrl}/api/accounts/transfers`, {
      method: "POST",
      headers: { Authorization: authorization(), "Content-Type": "application/json" },
      body: JSON.stringify({
        fromAccountId: accountId,
        toAccountId: secondAccountId,
        amount: "250",
        description: "Renda partilhada",
        date: "2026-08-05",
      }),
    });
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.data.amount).toBe(250);
    expect(body.data.fromAccount.name).toBe("Conta principal");
    expect(body.data.toAccount.name).toBe("Poupança");
    expect(repositories.accountFindMany).toHaveBeenCalledOnce();
    expect(repositories.accountFindMany.mock.calls[0][0]).toMatchObject({
      where: { userId, id: { in: [accountId, secondAccountId] } },
    });
    expect(repositories.transferCreate).toHaveBeenCalledOnce();
    const createCall = repositories.transferCreate.mock.calls[0][0];
    expect(createCall.data).toMatchObject({
      fromAccountId: accountId,
      toAccountId: secondAccountId,
      amount: "250",
      description: "Renda partilhada",
      date: new Date("2026-08-05T00:00:00.000Z"),
      userId,
    });
  });

  it("rejects a transfer involving an account of another user with 404", async () => {
    repositories.accountFindMany.mockResolvedValue([{ id: accountId }]);

    const response = await fetch(`${baseUrl}/api/accounts/transfers`, {
      method: "POST",
      headers: { Authorization: authorization(), "Content-Type": "application/json" },
      body: JSON.stringify({
        fromAccountId: accountId,
        toAccountId: thirdAccountId,
        amount: "80",
        date: "2026-08-05",
      }),
    });
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error.code).toBe("ACCOUNT_NOT_FOUND");
    expect(body.error.message).toBe("Uma das contas não foi encontrada.");
    expect(repositories.transferCreate).not.toHaveBeenCalled();
  });

  it("lists the latest transfers of the authenticated user with presented amounts", async () => {
    repositories.transferFindMany.mockResolvedValue([
      {
        id: "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
        amount: new Prisma.Decimal("120.5"),
        description: null,
        date: new Date("2026-08-05T00:00:00.000Z"),
        createdAt: new Date("2026-08-05T12:00:00.000Z"),
        fromAccount: { id: accountId, name: "Conta principal" },
        toAccount: { id: secondAccountId, name: "Poupança" },
      },
    ]);

    const response = await fetch(`${baseUrl}/api/accounts/transfers`, {
      headers: { Authorization: authorization() },
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].amount).toBe(120.5);
    expect(body.data[0].description).toBeNull();
    expect(repositories.transferFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId },
        orderBy: [{ date: "desc" }, { createdAt: "desc" }],
        take: 50,
      }),
    );
  });
});

describe("account contract with linked bank accounts", () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use("/api/accounts", accountRoutes);
    app.use(errorHandler);
    await new Promise<void>((resolve) => {
      server = app.listen(0, "127.0.0.1", resolve);
    });
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  });

  beforeEach(() => {
    repositories.accountFindFirst.mockReset();
    repositories.accountFindMany.mockReset();
    repositories.accountUpdate.mockReset();
    repositories.accountDelete.mockReset().mockResolvedValue({ id: accountId });
    repositories.transferFindMany.mockReset().mockResolvedValue([]);
    repositories.transferDeleteMany.mockReset().mockResolvedValue({ count: 0 });
  });

  const manualAccount = {
    id: accountId,
    name: "Conta principal",
    type: "current",
    source: "manual",
    currency: "EUR",
    openingBalance: new Prisma.Decimal("100"),
    creditLimit: null,
    providerCurrentBalance: null,
    providerAvailableBalance: null,
    providerBalanceUpdatedAt: null,
    bankAccountLink: null,
    createdAt: new Date("2026-08-01T10:00:00.000Z"),
    updatedAt: new Date("2026-08-01T10:00:00.000Z"),
    expenses: [{ amount: new Prisma.Decimal("20") }],
    incomes: [{ amount: new Prisma.Decimal("100") }],
    outgoingTransfers: [],
    incomingTransfers: [],
  };

  const linkedAccount = {
    ...manualAccount,
    id: secondAccountId,
    name: "Conta do banco",
    source: "bank",
    providerCurrentBalance: new Prisma.Decimal("1250.30"),
    providerAvailableBalance: new Prisma.Decimal("1180.30"),
    providerBalanceUpdatedAt: new Date("2026-08-30T08:00:00.000Z"),
    bankAccountLink: {
      connection: { status: "active", lastSyncedAt: new Date("2026-08-30T08:00:00.000Z") },
    },
  };

  it("keeps manual accounts derived and exposes the provider snapshot for linked accounts", async () => {
    repositories.accountFindMany.mockResolvedValue([manualAccount, linkedAccount]);

    const response = await fetch(`${baseUrl}/api/accounts`, {
      headers: { Authorization: authorization() },
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    const [manual, linked] = body.data;
    expect(manual).toMatchObject({
      source: "manual",
      currentBalance: 180,
      balanceSource: "derived",
      availableBalance: null,
      connectionStatus: null,
    });
    // O saldo do banco não soma os movimentos: 1250,30 e não 1330,30.
    expect(linked).toMatchObject({
      source: "bank",
      currentBalance: 1250.3,
      availableBalance: 1180.3,
      balanceSource: "provider",
      balanceAsOf: "2026-08-30T08:00:00.000Z",
      connectionStatus: "active",
    });
    expect(linked.bankAccountLink).toBeUndefined();
    expect(JSON.stringify(body)).not.toContain("providerSessionCiphertext");
  });

  it("falls back to the derived balance when the provider has no snapshot yet", async () => {
    repositories.accountFindMany.mockResolvedValue([
      { ...linkedAccount, providerCurrentBalance: null, providerAvailableBalance: null },
    ]);

    const response = await fetch(`${baseUrl}/api/accounts`, {
      headers: { Authorization: authorization() },
    });
    const body = await response.json();

    expect(body.data[0]).toMatchObject({ balanceSource: "derived", currentBalance: 180 });
  });

  it("blocks manual balance correction on a linked account", async () => {
    repositories.accountFindFirst.mockResolvedValue({
      ...linkedAccount,
      expenses: [],
      incomes: [],
    });

    const response = await fetch(`${baseUrl}/api/accounts/${secondAccountId}/balance`, {
      method: "PATCH",
      headers: { Authorization: authorization(), "Content-Type": "application/json" },
      body: JSON.stringify({ currentBalance: 999 }),
    });
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error.code).toBe("BANK_LINKED_BALANCE_READ_ONLY");
    expect(repositories.accountUpdate).not.toHaveBeenCalled();
  });

  it("still allows balance correction on manual accounts", async () => {
    repositories.accountFindFirst.mockResolvedValue(manualAccount);
    repositories.accountUpdate.mockResolvedValue({
      ...manualAccount,
      openingBalance: new Prisma.Decimal("150"),
    });

    const response = await fetch(`${baseUrl}/api/accounts/${accountId}/balance`, {
      method: "PATCH",
      headers: { Authorization: authorization(), "Content-Type": "application/json" },
      body: JSON.stringify({ currentBalance: 230 }),
    });

    expect(response.status).toBe(200);
    expect(repositories.accountUpdate).toHaveBeenCalledOnce();
  });

  it("requires a controlled disconnect before removing a linked account", async () => {
    repositories.accountFindFirst.mockResolvedValue({ id: secondAccountId, source: "bank" });

    const response = await fetch(`${baseUrl}/api/accounts/${secondAccountId}`, {
      method: "DELETE",
      headers: { Authorization: authorization() },
    });
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error.code).toBe("BANK_LINKED_ACCOUNT_REQUIRES_DISCONNECT");
    expect(repositories.accountDelete).not.toHaveBeenCalled();
  });
});
