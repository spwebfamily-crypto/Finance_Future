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
  accountUpdate: vi.fn(),
  accountDelete: vi.fn(),
  transferFindMany: vi.fn(),
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
        update: repositories.accountUpdate,
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
