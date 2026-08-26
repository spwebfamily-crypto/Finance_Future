import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { Prisma } from "@prisma/client";
import express from "express";
import jwt from "jsonwebtoken";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { errorHandler } from "../middleware.js";
import savingsGoalRoutes from "./savingsGoals.js";

const repositories = vi.hoisted(() => ({
  goalFindFirst: vi.fn(),
  goalFindMany: vi.fn(),
  goalCreate: vi.fn(),
  goalUpdate: vi.fn(),
  goalDelete: vi.fn(),
}));

vi.mock("../prisma.js", () => ({
  prisma: {
    savingsGoal: {
      findFirst: repositories.goalFindFirst,
      findMany: repositories.goalFindMany,
      create: repositories.goalCreate,
      update: repositories.goalUpdate,
      delete: repositories.goalDelete,
    },
  },
}));

const userId = "7c8f0f14-1f87-4dfb-a2bf-85bf170a79c8";
const otherUserId = "9d1a3c55-6f42-4a17-8e0b-2f5c7d90ab13";
const goalId = "3f6b9a21-c4d8-4e50-b7a2-91de0c48f6a5";

function storedGoal(overrides: Record<string, unknown> = {}) {
  return {
    id: goalId,
    name: "Fundo de emergência",
    icon: "piggy-bank",
    targetAmount: new Prisma.Decimal("5000.00"),
    currentAmount: new Prisma.Decimal("1250.00"),
    targetDate: new Date("2026-12-31T00:00:00.000Z"),
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

describe("savings goal routes", () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use("/api/savings-goals", savingsGoalRoutes);
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
    repositories.goalFindFirst.mockReset();
    repositories.goalFindMany.mockReset();
    repositories.goalCreate.mockReset().mockResolvedValue(storedGoal());
    repositories.goalUpdate.mockReset();
    repositories.goalDelete.mockReset();
  });

  it("lista apenas as metas do utilizador autenticado", async () => {
    repositories.goalFindMany.mockResolvedValue([storedGoal()]);

    const response = await fetch(`${baseUrl}/api/savings-goals`, {
      headers: { Authorization: authorization() },
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toHaveLength(1);
    expect(body.data[0]).toMatchObject({
      id: goalId,
      name: "Fundo de emergência",
      targetAmount: 5000,
      currentAmount: 1250,
    });
    expect(repositories.goalFindMany).toHaveBeenCalledOnce();
    expect(repositories.goalFindMany.mock.calls[0][0]).toMatchObject({
      where: { userId },
    });
  });

  it("cria uma meta válida com valores por omissão", async () => {
    const response = await fetch(`${baseUrl}/api/savings-goals`, {
      method: "POST",
      headers: { Authorization: authorization(), "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Fundo de emergência",
        icon: "piggy-bank",
        targetAmount: "5000.00",
        targetDate: "2026-12-31",
      }),
    });
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.data).toMatchObject({ id: goalId, name: "Fundo de emergência" });
    expect(repositories.goalCreate).toHaveBeenCalledOnce();
    expect(repositories.goalCreate.mock.calls[0][0].data).toMatchObject({
      name: "Fundo de emergência",
      targetAmount: "5000.00",
      currentAmount: "0",
      icon: "piggy-bank",
      userId,
    });
  });

  it("rejeita um prazo inválido com 400 VALIDATION_ERROR", async () => {
    const response = await fetch(`${baseUrl}/api/savings-goals`, {
      method: "POST",
      headers: { Authorization: authorization(), "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Fundo de emergência",
        targetAmount: "5000.00",
        targetDate: "31/12/2026",
      }),
    });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(repositories.goalCreate).not.toHaveBeenCalled();
  });

  it("atualiza o valor poupado de uma meta existente", async () => {
    repositories.goalFindFirst.mockResolvedValue({ id: goalId });
    repositories.goalUpdate.mockResolvedValue(
      storedGoal({ currentAmount: new Prisma.Decimal("2500.00") }),
    );

    const response = await fetch(`${baseUrl}/api/savings-goals/${goalId}`, {
      method: "PATCH",
      headers: { Authorization: authorization(), "Content-Type": "application/json" },
      body: JSON.stringify({ currentAmount: "2500.00" }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.currentAmount).toBe(2500);
    expect(repositories.goalFindFirst).toHaveBeenCalledOnce();
    expect(repositories.goalFindFirst.mock.calls[0][0]).toMatchObject({
      where: { id: goalId, userId },
    });
    expect(repositories.goalUpdate).toHaveBeenCalledOnce();
    expect(repositories.goalUpdate.mock.calls[0][0]).toMatchObject({
      where: { id: goalId },
      data: { currentAmount: "2500.00" },
    });
  });

  it("devolve 404 ao atualizar uma meta de outro utilizador", async () => {
    repositories.goalFindFirst.mockResolvedValue(null);

    const response = await fetch(`${baseUrl}/api/savings-goals/${goalId}`, {
      method: "PATCH",
      headers: { Authorization: authorization(otherUserId), "Content-Type": "application/json" },
      body: JSON.stringify({ currentAmount: "100.00" }),
    });
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error.code).toBe("SAVINGS_GOAL_NOT_FOUND");
    expect(repositories.goalUpdate).not.toHaveBeenCalled();
  });

  it("remove uma meta existente do utilizador", async () => {
    repositories.goalFindFirst.mockResolvedValue({ id: goalId });

    const response = await fetch(`${baseUrl}/api/savings-goals/${goalId}`, {
      method: "DELETE",
      headers: { Authorization: authorization() },
    });

    expect(response.status).toBe(204);
    expect(repositories.goalDelete).toHaveBeenCalledOnce();
    expect(repositories.goalDelete.mock.calls[0][0]).toEqual({
      where: { id: goalId },
    });
  });

  it("devolve 404 ao remover uma meta de outro utilizador", async () => {
    repositories.goalFindFirst.mockResolvedValue(null);

    const response = await fetch(`${baseUrl}/api/savings-goals/${goalId}`, {
      method: "DELETE",
      headers: { Authorization: authorization(otherUserId) },
    });
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error.code).toBe("SAVINGS_GOAL_NOT_FOUND");
    expect(repositories.goalDelete).not.toHaveBeenCalled();
  });
});
