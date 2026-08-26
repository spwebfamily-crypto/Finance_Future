import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { Prisma } from "@prisma/client";
import express from "express";
import jwt from "jsonwebtoken";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { errorHandler } from "../middleware.js";
import financialProfileRoutes from "./financialProfile.js";

const financialProfileRepository = vi.hoisted(() => ({
  findUnique: vi.fn(),
  upsert: vi.fn(),
  deleteMany: vi.fn(),
}));

vi.mock("../prisma.js", () => ({
  prisma: {
    financialProfile: financialProfileRepository,
  },
}));

const userId = "7c8f0f14-1f87-4dfb-a2bf-85bf170a79c8";
const profile = {
  id: "e3ff3b2a-d720-441d-b5cf-33bd8c5bf0ef",
  userId,
  monthlyNetIncome: new Prisma.Decimal("2450.75"),
  monthlyEssentialCosts: new Prisma.Decimal("520.40"),
  monthlyHousingCosts: new Prisma.Decimal("850.00"),
  monthlyDebtPayments: new Prisma.Decimal("0.00"),
  currentSavings: new Prisma.Decimal("4200.00"),
  goal: "emergency_fund" as const,
  horizon: "medium_term" as const,
  experience: "beginner" as const,
  riskTolerance: "moderate" as const,
  createdAt: new Date("2026-08-10T12:00:00.000Z"),
  updatedAt: new Date("2026-08-10T12:00:00.000Z"),
};

const validInput = {
  monthlyNetIncome: "2450,75",
  monthlyEssentialCosts: "520,40",
  monthlyHousingCosts: 850,
  monthlyDebtPayments: 0,
  currentSavings: "4200.00",
  goal: "emergency_fund",
  horizon: "medium_term",
  experience: "beginner",
  riskTolerance: "moderate",
};

function expectPrivateHeaders(response: Response) {
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(response.headers.get("pragma")).toBe("no-cache");
  expect(response.headers.get("expires")).toBe("0");
}

describe("financial profile routes", () => {
  let server: Server;
  let baseUrl: string;
  let authorization: string;

  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use("/api/financial-profile", financialProfileRoutes);
    app.use(errorHandler);

    await new Promise<void>((resolve) => {
      server = app.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
    const token = jwt.sign(
      { type: "access", email: "owner@example.com" },
      process.env.JWT_ACCESS_SECRET!,
      { subject: userId, expiresIn: "5m" },
    );
    authorization = `Bearer ${token}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  });

  beforeEach(() => {
    financialProfileRepository.findUnique.mockReset();
    financialProfileRepository.upsert.mockReset();
    financialProfileRepository.deleteMany.mockReset();
  });

  it("requires authentication", async () => {
    const response = await fetch(`${baseUrl}/api/financial-profile`);
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error.code).toBe("UNAUTHORIZED");
    expect(financialProfileRepository.findUnique).not.toHaveBeenCalled();
  });

  it("returns null when the authenticated user has not completed onboarding", async () => {
    financialProfileRepository.findUnique.mockResolvedValue(null);

    const response = await fetch(`${baseUrl}/api/financial-profile`, {
      headers: { Authorization: authorization },
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expectPrivateHeaders(response);
    expect(body).toEqual({ data: null });
    expect(financialProfileRepository.findUnique).toHaveBeenCalledWith({
      where: { userId },
    });
  });

  it("returns only the authenticated user profile with decimal values serialized as numbers", async () => {
    financialProfileRepository.findUnique.mockResolvedValue(profile);

    const response = await fetch(`${baseUrl}/api/financial-profile`, {
      headers: { Authorization: authorization },
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toMatchObject({
      id: profile.id,
      monthlyNetIncome: 2450.75,
      monthlyEssentialCosts: 520.4,
      monthlyHousingCosts: 850,
      monthlyDebtPayments: 0,
      currentSavings: 4200,
      goal: "emergency_fund",
      horizon: "medium_term",
      experience: "beginner",
      riskTolerance: "moderate",
      createdAt: "2026-08-10T12:00:00.000Z",
      updatedAt: "2026-08-10T12:00:00.000Z",
    });
  });

  it("atomically creates or replaces the authenticated user profile", async () => {
    financialProfileRepository.upsert.mockResolvedValue(profile);

    const response = await fetch(`${baseUrl}/api/financial-profile`, {
      method: "PUT",
      headers: {
        Authorization: authorization,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(validInput),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expectPrivateHeaders(response);
    expect(body.data.monthlyNetIncome).toBe(2450.75);
    const normalizedInput = {
      monthlyNetIncome: "2450.75",
      monthlyEssentialCosts: "520.40",
      monthlyHousingCosts: "850",
      monthlyDebtPayments: "0",
      currentSavings: "4200.00",
      goal: "emergency_fund",
      horizon: "medium_term",
      experience: "beginner",
      riskTolerance: "moderate",
    };
    expect(financialProfileRepository.upsert).toHaveBeenCalledWith({
      where: { userId },
      create: { userId, ...normalizedInput },
      update: normalizedInput,
    });
  });

  it("rejects invalid profile data before writing to the database", async () => {
    const response = await fetch(`${baseUrl}/api/financial-profile`, {
      method: "PUT",
      headers: {
        Authorization: authorization,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ...validInput, monthlyNetIncome: 0 }),
    });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(financialProfileRepository.upsert).not.toHaveBeenCalled();
  });

  it("lets the authenticated user erase the financial profile", async () => {
    financialProfileRepository.deleteMany.mockResolvedValue({ count: 1 });

    const response = await fetch(`${baseUrl}/api/financial-profile`, {
      method: "DELETE",
      headers: { Authorization: authorization },
    });

    expect(response.status).toBe(204);
    expectPrivateHeaders(response);
    expect(financialProfileRepository.deleteMany).toHaveBeenCalledWith({ where: { userId } });
  });
});
