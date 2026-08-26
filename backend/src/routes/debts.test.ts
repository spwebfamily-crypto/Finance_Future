import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { Prisma } from "@prisma/client";
import express from "express";
import jwt from "jsonwebtoken";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { errorHandler } from "../middleware.js";
import debtRoutes from "./debts.js";

const repositories = vi.hoisted(() => ({
  debtFindFirst: vi.fn(),
  debtFindMany: vi.fn(),
  debtCreate: vi.fn(),
  debtUpdate: vi.fn(),
  debtDelete: vi.fn(),
}));

vi.mock("../prisma.js", () => ({
  prisma: {
    debt: {
      findFirst: repositories.debtFindFirst,
      findMany: repositories.debtFindMany,
      create: repositories.debtCreate,
      update: repositories.debtUpdate,
      delete: repositories.debtDelete,
    },
  },
}));

const userId = "7c8f0f14-1f87-4dfb-a2bf-85bf170a79c8";
const otherUserId = "9d1a3c55-6f42-4a17-8e0b-2f5c7d90ab13";
const debtId = "5a8e2f74-b1c9-4d36-a0f5-73cb8e21d940";

function storedDebt(overrides: Record<string, unknown> = {}) {
  return {
    id: debtId,
    name: "Crédito habitação",
    lender: "Banco Central",
    currentBalance: new Prisma.Decimal("120000.00"),
    annualInterestRate: new Prisma.Decimal("3.50"),
    monthlyPayment: new Prisma.Decimal("650.00"),
    nextPaymentDate: new Date("2026-09-08T00:00:00.000Z"),
    createdAt: new Date("2026-08-10T12:00:00.000Z"),
    updatedAt: new Date("2026-08-10T12:00:00.000Z"),
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

describe("debt routes", () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use("/api/debts", debtRoutes);
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
    repositories.debtFindFirst.mockReset();
    repositories.debtFindMany.mockReset();
    repositories.debtCreate.mockReset().mockResolvedValue(storedDebt());
    repositories.debtUpdate.mockReset();
    repositories.debtDelete.mockReset();
  });

  it("lista apenas as dívidas do utilizador autenticado", async () => {
    repositories.debtFindMany.mockResolvedValue([storedDebt()]);

    const response = await fetch(`${baseUrl}/api/debts`, {
      headers: { Authorization: authorization() },
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toHaveLength(1);
    expect(body.data[0]).toMatchObject({
      id: debtId,
      name: "Crédito habitação",
      currentBalance: 120000,
      annualInterestRate: 3.5,
      monthlyPayment: 650,
    });
    expect(repositories.debtFindMany).toHaveBeenCalledOnce();
    expect(repositories.debtFindMany.mock.calls[0][0]).toMatchObject({
      where: { userId },
    });
  });

  it("cria uma dívida válida", async () => {
    const response = await fetch(`${baseUrl}/api/debts`, {
      method: "POST",
      headers: { Authorization: authorization(), "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Crédito habitação",
        lender: "Banco Central",
        currentBalance: "120000.00",
        annualInterestRate: "3.50",
        monthlyPayment: "650.00",
        nextPaymentDate: "2026-09-08",
      }),
    });
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.data).toMatchObject({ id: debtId, name: "Crédito habitação" });
    expect(repositories.debtCreate).toHaveBeenCalledOnce();
    expect(repositories.debtCreate.mock.calls[0][0].data).toMatchObject({
      name: "Crédito habitação",
      lender: "Banco Central",
      currentBalance: "120000.00",
      annualInterestRate: "3.50",
      monthlyPayment: "650.00",
      userId,
    });
  });

  it("rejeita uma taxa de juro inválida com 400 VALIDATION_ERROR", async () => {
    const response = await fetch(`${baseUrl}/api/debts`, {
      method: "POST",
      headers: { Authorization: authorization(), "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Crédito pessoal",
        lender: "Banco do Sul",
        currentBalance: "5000.00",
        annualInterestRate: "150",
        monthlyPayment: "200.00",
      }),
    });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(repositories.debtCreate).not.toHaveBeenCalled();
  });

  it("atualiza o saldo de uma dívida existente", async () => {
    repositories.debtFindFirst.mockResolvedValue({ id: debtId });
    repositories.debtUpdate.mockResolvedValue(
      storedDebt({ currentBalance: new Prisma.Decimal("118500.75") }),
    );

    const response = await fetch(`${baseUrl}/api/debts/${debtId}`, {
      method: "PATCH",
      headers: { Authorization: authorization(), "Content-Type": "application/json" },
      body: JSON.stringify({ currentBalance: "118500.75" }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.currentBalance).toBe(118500.75);
    expect(repositories.debtFindFirst).toHaveBeenCalledOnce();
    expect(repositories.debtFindFirst.mock.calls[0][0]).toMatchObject({
      where: { id: debtId, userId },
    });
    expect(repositories.debtUpdate).toHaveBeenCalledOnce();
    expect(repositories.debtUpdate.mock.calls[0][0]).toMatchObject({
      where: { id: debtId },
      data: { currentBalance: "118500.75" },
    });
  });

  it("devolve 404 ao atualizar uma dívida de outro utilizador", async () => {
    repositories.debtFindFirst.mockResolvedValue(null);

    const response = await fetch(`${baseUrl}/api/debts/${debtId}`, {
      method: "PATCH",
      headers: { Authorization: authorization(otherUserId), "Content-Type": "application/json" },
      body: JSON.stringify({ currentBalance: "100.00" }),
    });
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error.code).toBe("DEBT_NOT_FOUND");
    expect(repositories.debtUpdate).not.toHaveBeenCalled();
  });

  it("remove uma dívida existente do utilizador", async () => {
    repositories.debtFindFirst.mockResolvedValue({ id: debtId });

    const response = await fetch(`${baseUrl}/api/debts/${debtId}`, {
      method: "DELETE",
      headers: { Authorization: authorization() },
    });

    expect(response.status).toBe(204);
    expect(repositories.debtDelete).toHaveBeenCalledOnce();
    expect(repositories.debtDelete.mock.calls[0][0]).toEqual({
      where: { id: debtId },
    });
  });

  it("devolve 404 ao remover uma dívida de outro utilizador", async () => {
    repositories.debtFindFirst.mockResolvedValue(null);

    const response = await fetch(`${baseUrl}/api/debts/${debtId}`, {
      method: "DELETE",
      headers: { Authorization: authorization(otherUserId) },
    });
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error.code).toBe("DEBT_NOT_FOUND");
    expect(repositories.debtDelete).not.toHaveBeenCalled();
  });
});
