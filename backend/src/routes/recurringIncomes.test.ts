import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { Prisma } from "@prisma/client";
import express from "express";
import jwt from "jsonwebtoken";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { errorHandler } from "../middleware.js";
import recurringIncomeRoutes from "./recurringIncomes.js";

const repositories = vi.hoisted(() => ({
  accountFindFirst: vi.fn(),
  recurringIncomeFindFirst: vi.fn(),
  recurringIncomeFindMany: vi.fn(),
  recurringIncomeCreate: vi.fn(),
  recurringIncomeUpdate: vi.fn(),
  incomeCreate: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("../prisma.js", () => {
  const transactionClient = {
    recurringIncome: {
      findFirst: repositories.recurringIncomeFindFirst,
      update: repositories.recurringIncomeUpdate,
    },
    income: { create: repositories.incomeCreate },
  };
  return {
    prisma: {
      account: { findFirst: repositories.accountFindFirst },
      recurringIncome: {
        findFirst: repositories.recurringIncomeFindFirst,
        findMany: repositories.recurringIncomeFindMany,
        create: repositories.recurringIncomeCreate,
        update: repositories.recurringIncomeUpdate,
      },
      $transaction: repositories.transaction.mockImplementation((input) =>
        Array.isArray(input) ? Promise.all(input) : input(transactionClient),
      ),
    },
  };
});

const userId = "7c8f0f14-1f87-4dfb-a2bf-85bf170a79c8";
const accountId = "7b5f1793-45d7-485f-ab68-e32d1a57ed0d";
const recurringIncomeId = "de847505-8cd7-4c4a-ac31-c4707853f121";
const secondRecurringIncomeId = "25eb48fc-9e64-48fd-865c-a32e3a23a18a";

function presentedRecurringIncome(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: recurringIncomeId,
    accountId,
    description: "Salário",
    source: "Empresa",
    amount: new Prisma.Decimal("2100"),
    dayOfMonth: 25,
    nextDueDate: new Date("2026-09-25T00:00:00.000Z"),
    isActive: true,
    lastReceivedAt: null,
    createdAt: new Date("2026-08-01T10:00:00.000Z"),
    updatedAt: new Date("2026-08-01T10:00:00.000Z"),
    account: { id: accountId, name: "Conta principal", type: "current" },
    ...overrides,
  };
}

function authorization() {
  const token = jwt.sign(
    { type: "access", email: "owner@example.com" },
    process.env.JWT_ACCESS_SECRET!,
    { subject: userId, expiresIn: "5m" },
  );
  return `Bearer ${token}`;
}

describe("recurring incomes routes", () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use("/api/recurring-incomes", recurringIncomeRoutes);
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
    repositories.accountFindFirst.mockReset().mockResolvedValue({ id: accountId });
    repositories.recurringIncomeFindFirst.mockReset();
    repositories.recurringIncomeFindMany.mockReset();
    repositories.recurringIncomeCreate.mockReset();
    repositories.recurringIncomeUpdate.mockReset();
    repositories.incomeCreate.mockReset();
  });

  it("lists recurring incomes of the authenticated user ordered by state and due date", async () => {
    repositories.recurringIncomeFindMany.mockResolvedValue([
      presentedRecurringIncome(),
      presentedRecurringIncome({
        id: secondRecurringIncomeId,
        description: "Renda de quarto",
        source: null,
        amount: new Prisma.Decimal("350.10"),
        isActive: false,
      }),
    ]);

    const response = await fetch(`${baseUrl}/api/recurring-incomes`, {
      headers: { Authorization: authorization() },
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toHaveLength(2);
    expect(body.data[0].amount).toBe(2100);
    expect(body.data[1].amount).toBe(350.1);
    expect(body.data[1].source).toBeNull();
    expect(repositories.recurringIncomeFindMany.mock.calls[0][0]).toMatchObject({
      where: { userId },
      orderBy: [{ isActive: "desc" }, { nextDueDate: "asc" }],
    });
  });

  it("creates a recurring income after confirming the account belongs to the user", async () => {
    repositories.recurringIncomeCreate.mockResolvedValue(presentedRecurringIncome());

    const response = await fetch(`${baseUrl}/api/recurring-incomes`, {
      method: "POST",
      headers: { Authorization: authorization(), "Content-Type": "application/json" },
      body: JSON.stringify({
        description: "Salário",
        source: "Empresa",
        amount: "2100",
        accountId,
        dayOfMonth: 25,
      }),
    });
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.data.amount).toBe(2100);
    expect(repositories.accountFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: accountId, userId } }),
    );
    expect(repositories.recurringIncomeCreate).toHaveBeenCalledOnce();
    const createCall = repositories.recurringIncomeCreate.mock.calls[0][0];
    expect(createCall.data).toMatchObject({
      description: "Salário",
      source: "Empresa",
      amount: "2100",
      accountId,
      dayOfMonth: 25,
      userId,
    });
    expect(createCall.data.nextDueDate).toBeInstanceOf(Date);
  });

  it("rejects an invalid payload with 400 without creating anything", async () => {
    const response = await fetch(`${baseUrl}/api/recurring-incomes`, {
      method: "POST",
      headers: { Authorization: authorization(), "Content-Type": "application/json" },
      body: JSON.stringify({
        description: "",
        source: "",
        amount: 0,
        accountId,
        dayOfMonth: 33,
      }),
    });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(repositories.accountFindFirst).not.toHaveBeenCalled();
    expect(repositories.recurringIncomeCreate).not.toHaveBeenCalled();
  });

  it("pauses a recurring income without touching the next due date", async () => {
    repositories.recurringIncomeFindFirst.mockResolvedValue({ id: recurringIncomeId });
    repositories.recurringIncomeUpdate.mockResolvedValue(
      presentedRecurringIncome({ isActive: false }),
    );

    const response = await fetch(`${baseUrl}/api/recurring-incomes/${recurringIncomeId}`, {
      method: "PATCH",
      headers: { Authorization: authorization(), "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: false }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.isActive).toBe(false);
    expect(repositories.recurringIncomeUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: recurringIncomeId },
        data: { isActive: false },
      }),
    );
  });

  it("reactivates a paused recurring income", async () => {
    repositories.recurringIncomeFindFirst.mockResolvedValue({ id: recurringIncomeId });
    repositories.recurringIncomeUpdate.mockResolvedValue(presentedRecurringIncome());

    const response = await fetch(`${baseUrl}/api/recurring-incomes/${recurringIncomeId}`, {
      method: "PATCH",
      headers: { Authorization: authorization(), "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: true }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.isActive).toBe(true);
    expect(repositories.recurringIncomeUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: recurringIncomeId },
        data: { isActive: true },
      }),
    );
  });

  it("records an income from the recurring template inside one transaction", async () => {
    const currentNextDueDate = new Date("2026-08-25T00:00:00.000Z");
    repositories.recurringIncomeFindFirst.mockResolvedValue({
      id: recurringIncomeId,
      userId,
      accountId,
      description: "Salário",
      source: "Empresa",
      amount: new Prisma.Decimal("2100"),
      dayOfMonth: 25,
      nextDueDate: currentNextDueDate,
    });
    repositories.recurringIncomeUpdate.mockResolvedValue(
      presentedRecurringIncome({
        nextDueDate: new Date("2026-09-25T00:00:00.000Z"),
        lastReceivedAt: new Date("2026-08-26T12:00:00.000Z"),
      }),
    );

    const response = await fetch(`${baseUrl}/api/recurring-incomes/${recurringIncomeId}/record`, {
      method: "POST",
      headers: { Authorization: authorization() },
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.amount).toBe(2100);
    expect(repositories.transaction).toHaveBeenCalledOnce();
    expect(repositories.incomeCreate).toHaveBeenCalledOnce();
    const createCall = repositories.incomeCreate.mock.calls[0][0];
    expect(createCall.data).toMatchObject({
      userId,
      accountId,
      description: "Salário",
      source: "Empresa",
    });
    expect(createCall.data.amount.toString()).toBe("2100");
    expect(createCall.data.date).toEqual(currentNextDueDate);
    expect(repositories.recurringIncomeUpdate).toHaveBeenCalledOnce();
    const updateCall = repositories.recurringIncomeUpdate.mock.calls[0][0];
    expect(updateCall.where).toEqual({ id: recurringIncomeId });
    expect(updateCall.data.nextDueDate).toEqual(new Date("2026-09-25T00:00:00.000Z"));
    expect(updateCall.data.lastReceivedAt).toBeInstanceOf(Date);
  });

  it("returns 404 when recording an inactive or unknown recurring income", async () => {
    repositories.recurringIncomeFindFirst.mockResolvedValue(null);

    const response = await fetch(`${baseUrl}/api/recurring-incomes/${recurringIncomeId}/record`, {
      method: "POST",
      headers: { Authorization: authorization() },
    });
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error.code).toBe("RECURRING_INCOME_NOT_FOUND");
    expect(repositories.incomeCreate).not.toHaveBeenCalled();
    expect(repositories.recurringIncomeUpdate).not.toHaveBeenCalled();
  });
});
