import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { Prisma } from "@prisma/client";
import express from "express";
import jwt from "jsonwebtoken";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { errorHandler } from "../middleware.js";
import analyticsRoutes from "./analytics.js";

const repositories = vi.hoisted(() => ({
  userFindUnique: vi.fn(),
  categoryFindMany: vi.fn(),
  budgetFindMany: vi.fn(),
  expenseFindMany: vi.fn(),
}));

vi.mock("../prisma.js", () => ({
  prisma: {
    user: { findUnique: repositories.userFindUnique },
    category: { findMany: repositories.categoryFindMany },
    budget: { findMany: repositories.budgetFindMany },
    expense: { findMany: repositories.expenseFindMany },
  },
}));

const userId = "7c8f0f14-1f87-4dfb-a2bf-85bf170a79c8";
const categoryId = "dfc493e7-f9dc-48c5-9341-f659b5c5f288";

function authorization() {
  const token = jwt.sign(
    { type: "access", email: "owner@example.com" },
    process.env.JWT_ACCESS_SECRET!,
    { subject: userId, expiresIn: "5m" },
  );
  return `Bearer ${token}`;
}

describe("analytics daily summary", () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use("/api/analytics", analyticsRoutes);
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
    repositories.userFindUnique.mockReset().mockResolvedValue({
      timeZone: "Europe/Lisbon",
      currency: "EUR",
    });
    repositories.categoryFindMany
      .mockReset()
      .mockResolvedValue([
        { id: categoryId, name: "Alimentação", icon: "utensils", isDefault: true },
      ]);
    repositories.budgetFindMany.mockReset().mockResolvedValue([]);
    repositories.expenseFindMany.mockReset();
  });

  it("groups current-month expenses by UTC calendar day", async () => {
    repositories.expenseFindMany
      .mockResolvedValueOnce([
        {
          categoryId,
          amount: new Prisma.Decimal("10.50"),
          date: new Date("2026-07-03T08:00:00.000Z"),
        },
        {
          categoryId,
          amount: new Prisma.Decimal("4.25"),
          date: new Date("2026-07-03T18:00:00.000Z"),
        },
        {
          categoryId,
          amount: new Prisma.Decimal("20"),
          date: new Date("2026-07-10T12:00:00.000Z"),
        },
      ])
      .mockResolvedValueOnce([]);

    const response = await fetch(`${baseUrl}/api/analytics/summary?month=2026-07`, {
      headers: { Authorization: authorization() },
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.total).toBe(34.75);
    expect(body.data.byDay).toEqual([
      { day: "2026-07-03", total: 14.75 },
      { day: "2026-07-10", total: 20 },
    ]);
    expect(repositories.expenseFindMany.mock.calls[0][0].select).toEqual({
      categoryId: true,
      amount: true,
      date: true,
    });
  });
});
