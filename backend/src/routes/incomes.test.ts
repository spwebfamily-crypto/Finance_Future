import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { Prisma } from "@prisma/client";
import express from "express";
import jwt from "jsonwebtoken";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { errorHandler } from "../middleware.js";
import incomeRoutes from "./incomes.js";

const repositories = vi.hoisted(() => ({
  accountFindFirst: vi.fn(),
  incomeFindFirst: vi.fn(),
  incomeFindMany: vi.fn(),
  incomeCreate: vi.fn(),
  incomeUpdate: vi.fn(),
  incomeDelete: vi.fn(),
}));

vi.mock("../prisma.js", () => ({
  prisma: {
    account: { findFirst: repositories.accountFindFirst },
    income: {
      findFirst: repositories.incomeFindFirst,
      findMany: repositories.incomeFindMany,
      create: repositories.incomeCreate,
      update: repositories.incomeUpdate,
      delete: repositories.incomeDelete,
    },
  },
}));

const userId = "7c8f0f14-1f87-4dfb-a2bf-85bf170a79c8";
const otherUserId = "9d1a3c55-6f42-4a17-8e0b-2f5c7d90ab13";
const accountId = "dfc493e7-f9dc-48c5-9341-f659b5c5f288";
const incomeId = "7b5f1793-45d7-485f-ab68-e32d1a57ed0d";

function storedIncome(overrides: Record<string, unknown> = {}) {
  return {
    id: incomeId,
    description: "Salário",
    source: "Empresa",
    amount: new Prisma.Decimal("3200.50"),
    date: new Date("2026-08-10T00:00:00.000Z"),
    createdAt: new Date("2026-08-10T12:00:00.000Z"),
    updatedAt: new Date("2026-08-10T12:00:00.000Z"),
    account: { id: accountId, name: "Conta à ordem", type: "CHECKING" },
    ...overrides,
  };
}

function authorization(subject = userId) {
  const token = jwt.sign(
    { type: "access", email: "owner@example.com" },
    process.env.JWT_ACCESS_SECRET!,
    { subject, expiresIn: "5m" },
  );
  return `Bearer ${token}`;
}

describe("income routes", () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use("/api/incomes", incomeRoutes);
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
    repositories.incomeFindFirst.mockReset();
    repositories.incomeFindMany.mockReset();
    repositories.incomeCreate.mockReset().mockResolvedValue(storedIncome());
    repositories.incomeUpdate.mockReset();
    repositories.incomeDelete.mockReset();
  });

  it("lista apenas os rendimentos do utilizador autenticado", async () => {
    repositories.incomeFindMany.mockResolvedValue([storedIncome()]);

    const response = await fetch(`${baseUrl}/api/incomes`, {
      headers: { Authorization: authorization() },
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toHaveLength(1);
    expect(body.data[0]).toMatchObject({
      id: incomeId,
      description: "Salário",
      amount: 3200.5,
    });
    expect(repositories.incomeFindMany).toHaveBeenCalledOnce();
    expect(repositories.incomeFindMany.mock.calls[0][0]).toMatchObject({
      where: { userId },
    });
  });

  it("cria um rendimento válido sem conta associada", async () => {
    const response = await fetch(`${baseUrl}/api/incomes`, {
      method: "POST",
      headers: { Authorization: authorization(), "Content-Type": "application/json" },
      body: JSON.stringify({
        description: "Freelance",
        amount: "450.20",
        date: "2026-08-12",
      }),
    });
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.data.amount).toBe(3200.5);
    expect(repositories.incomeCreate).toHaveBeenCalledOnce();
    expect(repositories.incomeCreate.mock.calls[0][0].data).toMatchObject({
      description: "Freelance",
      amount: "450.20",
      source: null,
      accountId: null,
      userId,
    });
    expect(repositories.accountFindFirst).not.toHaveBeenCalled();
  });

  it("cria um rendimento associado a uma conta do utilizador", async () => {
    const response = await fetch(`${baseUrl}/api/incomes`, {
      method: "POST",
      headers: { Authorization: authorization(), "Content-Type": "application/json" },
      body: JSON.stringify({
        description: "Salário",
        source: "Empresa",
        amount: "3200.50",
        date: "2026-08-10",
        accountId,
      }),
    });

    expect(response.status).toBe(201);
    expect(repositories.accountFindFirst).toHaveBeenCalledOnce();
    expect(repositories.accountFindFirst.mock.calls[0][0]).toMatchObject({
      where: { id: accountId, userId },
    });
    expect(repositories.incomeCreate.mock.calls[0][0].data).toMatchObject({
      accountId,
      userId,
    });
  });

  it("rejeita um valor inválido com 400 VALIDATION_ERROR", async () => {
    const response = await fetch(`${baseUrl}/api/incomes`, {
      method: "POST",
      headers: { Authorization: authorization(), "Content-Type": "application/json" },
      body: JSON.stringify({
        description: "Freelance",
        amount: "-10",
        date: "2026-08-12",
      }),
    });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(repositories.incomeCreate).not.toHaveBeenCalled();
  });

  it("atualiza um rendimento existente do utilizador", async () => {
    repositories.incomeFindFirst.mockResolvedValue({ id: incomeId });
    repositories.incomeUpdate.mockResolvedValue(
      storedIncome({ amount: new Prisma.Decimal("3400.00"), source: null }),
    );

    const response = await fetch(`${baseUrl}/api/incomes/${incomeId}`, {
      method: "PATCH",
      headers: { Authorization: authorization(), "Content-Type": "application/json" },
      body: JSON.stringify({ amount: "3400.00" }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.amount).toBe(3400);
    expect(repositories.incomeFindFirst).toHaveBeenCalledOnce();
    expect(repositories.incomeFindFirst.mock.calls[0][0]).toMatchObject({
      where: { id: incomeId, userId },
    });
    expect(repositories.incomeUpdate).toHaveBeenCalledOnce();
    expect(repositories.incomeUpdate.mock.calls[0][0]).toMatchObject({
      where: { id: incomeId },
      data: { amount: "3400.00" },
    });
  });

  it("devolve 404 ao atualizar um rendimento de outro utilizador", async () => {
    repositories.incomeFindFirst.mockResolvedValue(null);

    const response = await fetch(`${baseUrl}/api/incomes/${incomeId}`, {
      method: "PATCH",
      headers: { Authorization: authorization(otherUserId), "Content-Type": "application/json" },
      body: JSON.stringify({ amount: "100.00" }),
    });
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error.code).toBe("INCOME_NOT_FOUND");
    expect(repositories.incomeUpdate).not.toHaveBeenCalled();
  });

  it("remove um rendimento existente do utilizador", async () => {
    repositories.incomeFindFirst.mockResolvedValue({ id: incomeId });

    const response = await fetch(`${baseUrl}/api/incomes/${incomeId}`, {
      method: "DELETE",
      headers: { Authorization: authorization() },
    });

    expect(response.status).toBe(204);
    expect(repositories.incomeDelete).toHaveBeenCalledOnce();
    expect(repositories.incomeDelete.mock.calls[0][0]).toEqual({
      where: { id: incomeId },
    });
  });

  it("devolve 404 ao remover um rendimento de outro utilizador", async () => {
    repositories.incomeFindFirst.mockResolvedValue(null);

    const response = await fetch(`${baseUrl}/api/incomes/${incomeId}`, {
      method: "DELETE",
      headers: { Authorization: authorization(otherUserId) },
    });
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error.code).toBe("INCOME_NOT_FOUND");
    expect(repositories.incomeDelete).not.toHaveBeenCalled();
  });
});
