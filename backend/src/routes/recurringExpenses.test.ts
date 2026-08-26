import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { Prisma } from "@prisma/client";
import express from "express";
import jwt from "jsonwebtoken";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { errorHandler } from "../middleware.js";
import recurringExpenseRoutes from "./recurringExpenses.js";

const repositories = vi.hoisted(() => ({
  categoryFindFirst: vi.fn(),
  accountFindFirst: vi.fn(),
  recurringExpenseFindFirst: vi.fn(),
  recurringExpenseFindMany: vi.fn(),
  recurringExpenseCreate: vi.fn(),
  recurringExpenseUpdate: vi.fn(),
  expenseCreate: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("../prisma.js", () => {
  const transactionClient = {
    recurringExpense: {
      findFirst: repositories.recurringExpenseFindFirst,
      update: repositories.recurringExpenseUpdate,
    },
    expense: { create: repositories.expenseCreate },
  };
  return {
    prisma: {
      category: { findFirst: repositories.categoryFindFirst },
      account: { findFirst: repositories.accountFindFirst },
      recurringExpense: {
        findFirst: repositories.recurringExpenseFindFirst,
        findMany: repositories.recurringExpenseFindMany,
        create: repositories.recurringExpenseCreate,
        update: repositories.recurringExpenseUpdate,
      },
      $transaction: repositories.transaction.mockImplementation((input) =>
        Array.isArray(input) ? Promise.all(input) : input(transactionClient),
      ),
    },
  };
});

const userId = "7c8f0f14-1f87-4dfb-a2bf-85bf170a79c8";
const categoryId = "dfc493e7-f9dc-48c5-9341-f659b5c5f288";
const accountId = "7b5f1793-45d7-485f-ab68-e32d1a57ed0d";
const recurringExpenseId = "de847505-8cd7-4c4a-ac31-c4707853f121";
const secondRecurringExpenseId = "25eb48fc-9e64-48fd-865c-a32e3a23a18a";

function presentedRecurringExpense(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: recurringExpenseId,
    categoryId,
    accountId,
    description: "Renda",
    location: "Lisboa",
    amount: new Prisma.Decimal("650"),
    dayOfMonth: 8,
    nextDueDate: new Date("2026-09-08T00:00:00.000Z"),
    isActive: true,
    lastPaidAt: null,
    createdAt: new Date("2026-08-01T10:00:00.000Z"),
    updatedAt: new Date("2026-08-01T10:00:00.000Z"),
    category: { id: categoryId, name: "Habitação", icon: "home" },
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

describe("recurring expenses routes", () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use("/api/recurring-expenses", recurringExpenseRoutes);
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
    repositories.categoryFindFirst.mockReset().mockResolvedValue({ id: categoryId });
    repositories.accountFindFirst.mockReset().mockResolvedValue({ id: accountId });
    repositories.recurringExpenseFindFirst.mockReset();
    repositories.recurringExpenseFindMany.mockReset();
    repositories.recurringExpenseCreate.mockReset();
    repositories.recurringExpenseUpdate.mockReset();
    repositories.expenseCreate.mockReset();
  });

  it("lists recurring expenses of the authenticated user ordered by state and due date", async () => {
    repositories.recurringExpenseFindMany.mockResolvedValue([
      presentedRecurringExpense(),
      presentedRecurringExpense({
        id: secondRecurringExpenseId,
        description: "Internet",
        amount: new Prisma.Decimal("32.45"),
        isActive: false,
      }),
    ]);

    const response = await fetch(`${baseUrl}/api/recurring-expenses`, {
      headers: { Authorization: authorization() },
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toHaveLength(2);
    expect(body.data[0].amount).toBe(650);
    expect(body.data[0].category.name).toBe("Habitação");
    expect(body.data[1].amount).toBe(32.45);
    expect(repositories.recurringExpenseFindMany.mock.calls[0][0]).toMatchObject({
      where: { userId },
      orderBy: [{ isActive: "desc" }, { nextDueDate: "asc" }],
    });
  });

  it("creates a recurring expense after confirming the category and account belong to the user", async () => {
    repositories.recurringExpenseCreate.mockResolvedValue(presentedRecurringExpense());

    const response = await fetch(`${baseUrl}/api/recurring-expenses`, {
      method: "POST",
      headers: { Authorization: authorization(), "Content-Type": "application/json" },
      body: JSON.stringify({
        description: "Renda",
        location: "Lisboa",
        amount: "650",
        categoryId,
        accountId,
        dayOfMonth: 8,
      }),
    });
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.data.amount).toBe(650);
    expect(repositories.categoryFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: categoryId, userId } }),
    );
    expect(repositories.accountFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: accountId, userId } }),
    );
    expect(repositories.recurringExpenseCreate).toHaveBeenCalledOnce();
    const createCall = repositories.recurringExpenseCreate.mock.calls[0][0];
    expect(createCall.data).toMatchObject({
      description: "Renda",
      location: "Lisboa",
      amount: "650",
      dayOfMonth: 8,
      userId,
    });
    expect(createCall.data.nextDueDate).toBeInstanceOf(Date);
  });

  it("rejects an invalid payload with 400 without creating anything", async () => {
    const response = await fetch(`${baseUrl}/api/recurring-expenses`, {
      method: "POST",
      headers: { Authorization: authorization(), "Content-Type": "application/json" },
      body: JSON.stringify({
        description: "",
        location: "",
        amount: -1,
        categoryId: "sem-uuid",
        dayOfMonth: 32,
      }),
    });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(repositories.recurringExpenseCreate).not.toHaveBeenCalled();
  });

  it("pauses a recurring expense without touching the next due date", async () => {
    repositories.recurringExpenseFindFirst.mockResolvedValue({ id: recurringExpenseId });
    repositories.recurringExpenseUpdate.mockResolvedValue(
      presentedRecurringExpense({ isActive: false }),
    );

    const response = await fetch(`${baseUrl}/api/recurring-expenses/${recurringExpenseId}`, {
      method: "PATCH",
      headers: { Authorization: authorization(), "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: false }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.isActive).toBe(false);
    expect(repositories.recurringExpenseUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: recurringExpenseId },
        data: { isActive: false },
      }),
    );
  });

  it("reactivates a paused recurring expense", async () => {
    repositories.recurringExpenseFindFirst.mockResolvedValue({ id: recurringExpenseId });
    repositories.recurringExpenseUpdate.mockResolvedValue(presentedRecurringExpense());

    const response = await fetch(`${baseUrl}/api/recurring-expenses/${recurringExpenseId}`, {
      method: "PATCH",
      headers: { Authorization: authorization(), "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: true }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.isActive).toBe(true);
    expect(repositories.recurringExpenseUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: recurringExpenseId },
        data: { isActive: true },
      }),
    );
  });

  it("records an expense from the recurring template inside one transaction", async () => {
    const currentNextDueDate = new Date("2026-08-10T00:00:00.000Z");
    repositories.recurringExpenseFindFirst.mockResolvedValue({
      id: recurringExpenseId,
      userId,
      categoryId,
      accountId,
      description: "Renda",
      location: "Lisboa",
      amount: new Prisma.Decimal("650"),
      dayOfMonth: 10,
      nextDueDate: currentNextDueDate,
    });
    repositories.recurringExpenseUpdate.mockResolvedValue(
      presentedRecurringExpense({
        dayOfMonth: 10,
        nextDueDate: new Date("2026-09-10T00:00:00.000Z"),
        lastPaidAt: new Date("2026-08-26T12:00:00.000Z"),
      }),
    );

    const response = await fetch(`${baseUrl}/api/recurring-expenses/${recurringExpenseId}/record`, {
      method: "POST",
      headers: { Authorization: authorization() },
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.amount).toBe(650);
    expect(repositories.transaction).toHaveBeenCalledOnce();
    expect(repositories.expenseCreate).toHaveBeenCalledOnce();
    const createCall = repositories.expenseCreate.mock.calls[0][0];
    expect(createCall.data).toMatchObject({
      userId,
      categoryId,
      accountId,
      description: "Renda",
      location: "Lisboa",
    });
    expect(createCall.data.amount.toString()).toBe("650");
    expect(createCall.data.date).toEqual(currentNextDueDate);
    expect(repositories.recurringExpenseUpdate).toHaveBeenCalledOnce();
    const updateCall = repositories.recurringExpenseUpdate.mock.calls[0][0];
    expect(updateCall.where).toEqual({ id: recurringExpenseId });
    expect(updateCall.data.nextDueDate).toEqual(new Date("2026-09-10T00:00:00.000Z"));
    expect(updateCall.data.lastPaidAt).toBeInstanceOf(Date);
  });

  it("returns 404 when recording an inactive or unknown recurring expense", async () => {
    repositories.recurringExpenseFindFirst.mockResolvedValue(null);

    const response = await fetch(`${baseUrl}/api/recurring-expenses/${recurringExpenseId}/record`, {
      method: "POST",
      headers: { Authorization: authorization() },
    });
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error.code).toBe("RECURRING_EXPENSE_NOT_FOUND");
    expect(repositories.expenseCreate).not.toHaveBeenCalled();
    expect(repositories.recurringExpenseUpdate).not.toHaveBeenCalled();
  });
});
