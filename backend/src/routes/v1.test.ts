import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { Prisma } from "@prisma/client";
import express from "express";
import jwt from "jsonwebtoken";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { errorHandler } from "../middleware.js";
import v1Routes from "./v1.js";

const repositories = vi.hoisted(() => ({
  userFindUnique: vi.fn(),
  categoryFindFirst: vi.fn(),
  accountFindFirst: vi.fn(),
  expenseFindMany: vi.fn(),
  expenseCreate: vi.fn(),
  incomeCreate: vi.fn(),
  idempotencyFindUnique: vi.fn(),
  idempotencyCreate: vi.fn(),
}));

vi.mock("../prisma.js", () => ({
  prisma: {
    user: { findUnique: repositories.userFindUnique },
    category: { findFirst: repositories.categoryFindFirst },
    account: { findFirst: repositories.accountFindFirst },
    expense: { findMany: repositories.expenseFindMany, create: repositories.expenseCreate },
    income: { create: repositories.incomeCreate },
    apiIdempotencyKey: {
      findUnique: repositories.idempotencyFindUnique,
      create: repositories.idempotencyCreate,
    },
  },
}));

const userId = "7c8f0f14-1f87-4dfb-a2bf-85bf170a79c8";
const categoryId = "dfc493e7-f9dc-48c5-9341-f659b5c5f288";
const expenseId = "7b5f1793-45d7-485f-ab68-e32d1a57ed0d";

function authorization(subject = userId) {
  const token = jwt.sign(
    { type: "access", email: "owner@example.com" },
    process.env.JWT_ACCESS_SECRET!,
    { subject, expiresIn: "5m" },
  );
  return `Bearer ${token}`;
}

function createdExpense() {
  return {
    id: expenseId,
    description: "Supermercado",
    amount: new Prisma.Decimal("24.90"),
    currency: "EUR",
    date: new Date("2026-09-16T00:00:00.000Z"),
    createdAt: new Date("2026-09-16T12:00:00.000Z"),
  };
}

describe("v1 API", () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use("/v1", v1Routes);
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
    repositories.userFindUnique.mockReset().mockResolvedValue({
      id: userId,
      name: "Owner",
      email: "owner@example.com",
      currency: "EUR",
      timeZone: "Europe/Lisbon",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
    });
    repositories.categoryFindFirst.mockReset().mockResolvedValue({ id: categoryId });
    repositories.accountFindFirst.mockReset();
    repositories.expenseFindMany.mockReset().mockResolvedValue([]);
    repositories.expenseCreate.mockReset().mockResolvedValue(createdExpense());
    repositories.incomeCreate.mockReset();
    repositories.idempotencyFindUnique.mockReset().mockResolvedValue(null);
    repositories.idempotencyCreate.mockReset().mockResolvedValue({ id: "key-1" });
  });

  it("requires an existing access token", async () => {
    const response = await fetch(`${baseUrl}/v1/me`);

    expect(response.status).toBe(401);
    expect((await response.json()).error.code).toBe("UNAUTHORIZED");
  });

  it("returns the authenticated profile in the versioned envelope", async () => {
    const response = await fetch(`${baseUrl}/v1/me`, {
      headers: { Authorization: authorization() },
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toMatchObject({ id: userId, currency: "EUR", timeZone: "Europe/Lisbon" });
    expect(body.meta).toEqual({});
    expect(repositories.userFindUnique).toHaveBeenCalledWith({
      where: { id: userId },
      select: expect.any(Object),
    });
  });

  it("uses cursor pagination and never returns another user's expenses", async () => {
    repositories.expenseFindMany.mockResolvedValue([
      {
        ...createdExpense(),
        category: { id: categoryId, name: "Alimentação", icon: "utensils" },
        bankTransaction: null,
      },
      {
        ...createdExpense(),
        id: "9d1a3c55-6f42-4a17-8e0b-2f5c7d90ab13",
        category: { id: categoryId, name: "Alimentação", icon: "utensils" },
        bankTransaction: null,
      },
    ]);

    const response = await fetch(`${baseUrl}/v1/expenses?limit=1&cursor=${expenseId}`, {
      headers: { Authorization: authorization() },
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toHaveLength(1);
    expect(body.data[0]).toMatchObject({ id: expenseId, amount: "24.90", source: "manual" });
    expect(body.meta).toMatchObject({ hasMore: true, nextCursor: expenseId });
    expect(repositories.expenseFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId }, cursor: { id: expenseId }, skip: 1, take: 2 }),
    );
  });

  it("requires and replays an idempotency key when creating a manual expense", async () => {
    const input = {
      description: "Supermercado",
      location: "Lisboa",
      amount: "24.90",
      date: "2026-09-16",
      categoryId,
    };
    const missingKey = await fetch(`${baseUrl}/v1/expenses`, {
      method: "POST",
      headers: { Authorization: authorization(), "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    expect(missingKey.status).toBe(400);
    expect((await missingKey.json()).error.code).toBe("IDEMPOTENCY_KEY_REQUIRED");

    const first = await fetch(`${baseUrl}/v1/expenses`, {
      method: "POST",
      headers: {
        Authorization: authorization(),
        "Content-Type": "application/json",
        "Idempotency-Key": "partner-request-1",
      },
      body: JSON.stringify(input),
    });
    const firstBody = await first.json();

    expect(first.status).toBe(201);
    expect(firstBody.data).toMatchObject({ id: expenseId, amount: "24.90", source: "manual" });
    expect(repositories.expenseCreate).toHaveBeenCalledOnce();
    expect(repositories.idempotencyCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId,
          scope: "expenses:create",
          key: "partner-request-1",
          statusCode: 201,
        }),
      }),
    );

    repositories.idempotencyFindUnique.mockResolvedValueOnce({
      statusCode: 201,
      response: firstBody,
    });
    const retry = await fetch(`${baseUrl}/v1/expenses`, {
      method: "POST",
      headers: {
        Authorization: authorization(),
        "Content-Type": "application/json",
        "Idempotency-Key": "partner-request-1",
      },
      body: JSON.stringify(input),
    });

    expect(retry.status).toBe(201);
    expect(await retry.json()).toEqual(firstBody);
    expect(repositories.expenseCreate).toHaveBeenCalledOnce();
  });

  it("does not create an expense if the category does not belong to the caller", async () => {
    repositories.categoryFindFirst.mockResolvedValue(null);

    const response = await fetch(`${baseUrl}/v1/expenses`, {
      method: "POST",
      headers: {
        Authorization: authorization(),
        "Content-Type": "application/json",
        "Idempotency-Key": "partner-request-2",
      },
      body: JSON.stringify({
        description: "Supermercado",
        location: "Lisboa",
        amount: "24.90",
        date: "2026-09-16",
        categoryId,
      }),
    });

    expect(response.status).toBe(404);
    expect((await response.json()).error.code).toBe("CATEGORY_NOT_FOUND");
    expect(repositories.expenseCreate).not.toHaveBeenCalled();
  });
});
