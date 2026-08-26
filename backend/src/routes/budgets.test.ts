import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { Prisma } from "@prisma/client";
import express from "express";
import jwt from "jsonwebtoken";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { errorHandler } from "../middleware.js";
import budgetRoutes from "./budgets.js";

const repositories = vi.hoisted(() => ({
  budgetFindFirst: vi.fn(),
  budgetFindMany: vi.fn(),
  budgetCreate: vi.fn(),
  budgetUpdate: vi.fn(),
  budgetDelete: vi.fn(),
  categoryFindFirst: vi.fn(),
}));

vi.mock("../prisma.js", () => {
  return {
    prisma: {
      budget: {
        findFirst: repositories.budgetFindFirst,
        findMany: repositories.budgetFindMany,
        create: repositories.budgetCreate,
        update: repositories.budgetUpdate,
        delete: repositories.budgetDelete,
      },
      category: {
        findFirst: repositories.categoryFindFirst,
      },
    },
  };
});

const userId = "7c8f0f14-1f87-4dfb-a2bf-85bf170a79c8";
const otherUserId = "de847505-8cd7-4c4a-ac31-c4707853f121";
const categoryId = "dfc493e7-f9dc-48c5-9341-f659b5c5f288";
const budgetId = "7b5f1793-45d7-485f-ab68-e32d1a57ed0d";

function buildBudget(monthlyLimit: string) {
  return {
    id: budgetId,
    userId,
    categoryId,
    monthlyLimit: new Prisma.Decimal(monthlyLimit),
    createdAt: new Date("2026-08-01T10:00:00.000Z"),
    updatedAt: new Date("2026-08-01T10:00:00.000Z"),
    category: {
      id: categoryId,
      name: "Alimentação",
      icon: "shopping-basket",
      isDefault: true,
      userId,
    },
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

describe("budget routes", () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use("/api/budgets", budgetRoutes);
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
    repositories.budgetFindFirst.mockReset();
    repositories.budgetFindMany.mockReset().mockResolvedValue([]);
    repositories.budgetCreate.mockReset();
    repositories.budgetUpdate.mockReset();
    repositories.budgetDelete.mockReset().mockResolvedValue({ id: budgetId });
    repositories.categoryFindFirst.mockReset();
  });

  it("lista os orçamentos do utilizador autenticado ordenados pelo nome da categoria", async () => {
    repositories.budgetFindMany.mockResolvedValue([buildBudget("120.50")]);

    const response = await fetch(`${baseUrl}/api/budgets`, {
      headers: { Authorization: authorization() },
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toHaveLength(1);
    expect(body.data[0]).toMatchObject({ id: budgetId, monthlyLimit: 120.5 });
    expect(typeof body.data[0].monthlyLimit).toBe("number");
    const listCall = repositories.budgetFindMany.mock.calls[0][0];
    expect(listCall.where).toEqual({ userId });
    expect(listCall.orderBy).toEqual({ category: { name: "asc" } });
    expect(listCall.include).toHaveProperty("category");
  });

  it("cria um orçamento para uma categoria pertencente ao utilizador", async () => {
    repositories.categoryFindFirst.mockResolvedValue({ id: categoryId, name: "Alimentação" });
    repositories.budgetCreate.mockResolvedValue(buildBudget("150"));

    const response = await fetch(`${baseUrl}/api/budgets`, {
      method: "POST",
      headers: { Authorization: authorization(), "Content-Type": "application/json" },
      body: JSON.stringify({ categoryId, monthlyLimit: "150,00" }),
    });
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.data.monthlyLimit).toBe(150);
    expect(repositories.categoryFindFirst.mock.calls[0][0].where).toEqual({
      id: categoryId,
      userId,
    });
    expect(repositories.budgetCreate).toHaveBeenCalledOnce();
    expect(repositories.budgetCreate.mock.calls[0][0].data).toEqual({
      userId,
      categoryId,
      monthlyLimit: "150.00",
    });
  });

  it("rejeita um limite mensal inválido com VALIDATION_ERROR", async () => {
    const response = await fetch(`${baseUrl}/api/budgets`, {
      method: "POST",
      headers: { Authorization: authorization(), "Content-Type": "application/json" },
      body: JSON.stringify({ categoryId, monthlyLimit: "-10" }),
    });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(repositories.categoryFindFirst).not.toHaveBeenCalled();
    expect(repositories.budgetCreate).not.toHaveBeenCalled();
  });

  it("não cria um orçamento para uma categoria de outro utilizador", async () => {
    repositories.categoryFindFirst.mockResolvedValue(null);

    const response = await fetch(`${baseUrl}/api/budgets`, {
      method: "POST",
      headers: { Authorization: authorization(), "Content-Type": "application/json" },
      body: JSON.stringify({ categoryId, monthlyLimit: "150" }),
    });
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error.code).toBe("CATEGORY_NOT_FOUND");
    expect(repositories.budgetCreate).not.toHaveBeenCalled();
  });

  it("atualiza o limite mensal de um orçamento do utilizador", async () => {
    repositories.budgetFindFirst.mockResolvedValue({ id: budgetId, userId });
    repositories.budgetUpdate.mockResolvedValue(buildBudget("300"));

    const response = await fetch(`${baseUrl}/api/budgets/${budgetId}`, {
      method: "PATCH",
      headers: { Authorization: authorization(), "Content-Type": "application/json" },
      body: JSON.stringify({ monthlyLimit: "300" }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.monthlyLimit).toBe(300);
    expect(repositories.budgetFindFirst.mock.calls[0][0].where).toEqual({
      id: budgetId,
      userId,
    });
    expect(repositories.budgetUpdate).toHaveBeenCalledOnce();
    expect(repositories.budgetUpdate.mock.calls[0][0]).toMatchObject({
      where: { id: budgetId },
      data: { monthlyLimit: "300" },
    });
  });

  it("devolve 404 ao atualizar um orçamento de outro utilizador", async () => {
    repositories.budgetFindFirst.mockResolvedValue(null);

    const response = await fetch(`${baseUrl}/api/budgets/${budgetId}`, {
      method: "PATCH",
      headers: { Authorization: authorization(), "Content-Type": "application/json" },
      body: JSON.stringify({ monthlyLimit: "300" }),
    });
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error.code).toBe("BUDGET_NOT_FOUND");
    expect(body.error.message).toBe("Orçamento não encontrado.");
    expect(repositories.budgetUpdate).not.toHaveBeenCalled();
  });

  it("remove um orçamento do utilizador autenticado", async () => {
    repositories.budgetFindFirst.mockResolvedValue({ id: budgetId });

    const response = await fetch(`${baseUrl}/api/budgets/${budgetId}`, {
      method: "DELETE",
      headers: { Authorization: authorization() },
    });

    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");
    expect(repositories.budgetFindFirst.mock.calls[0][0].where).toEqual({
      id: budgetId,
      userId,
    });
    expect(repositories.budgetDelete).toHaveBeenCalledWith({ where: { id: budgetId } });
  });

  it("devolve 404 ao remover um orçamento inexistente ou de outro utilizador", async () => {
    repositories.budgetFindFirst.mockResolvedValue(null);

    const response = await fetch(`${baseUrl}/api/budgets/${budgetId}`, {
      method: "DELETE",
      headers: { Authorization: authorization() },
    });
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error.code).toBe("BUDGET_NOT_FOUND");
    expect(repositories.budgetDelete).not.toHaveBeenCalled();
  });

  it("filtra sempre por utilizador, nunca expondo orçamentos alheios", async () => {
    repositories.budgetFindFirst.mockImplementation(({ where }) =>
      where.userId === userId ? Promise.resolve({ id: budgetId }) : Promise.resolve(null),
    );

    const ownResponse = await fetch(`${baseUrl}/api/budgets/${budgetId}`, {
      method: "DELETE",
      headers: { Authorization: authorization() },
    });

    expect(ownResponse.status).toBe(204);

    const foreignToken = jwt.sign(
      { type: "access", email: "intruso@example.com" },
      process.env.JWT_ACCESS_SECRET!,
      { subject: otherUserId, expiresIn: "5m" },
    );
    const foreignResponse = await fetch(`${baseUrl}/api/budgets/${budgetId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${foreignToken}` },
    });
    const foreignBody = await foreignResponse.json();

    expect(foreignResponse.status).toBe(404);
    expect(foreignBody.error.code).toBe("BUDGET_NOT_FOUND");
    expect(repositories.budgetDelete).toHaveBeenCalledTimes(1);
    expect(repositories.budgetDelete).toHaveBeenCalledWith({ where: { id: budgetId } });
  });
});
