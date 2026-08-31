import type { AddressInfo } from "node:http";
import type { Server } from "node:http";
import express from "express";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { errorHandler } from "../middleware.js";
import internalRoutes from "./internalOpenBanking.js";
import { resetTestPrisma, testPrisma } from "../open-banking/testPrisma.js";
import {
  installTestOpenBankingConfig,
  useTestOpenBankingConfig,
} from "../open-banking/testSupport.js";
import { encryptString } from "../open-banking/crypto.js";
import {
  fakeOpenBankingStore,
  FakeOpenBankingProvider,
} from "../open-banking/fakeOpenBankingProvider.js";

installTestOpenBankingConfig();

vi.mock("../prisma.js", async () => {
  const { testPrisma: shared } = await import("../open-banking/testPrisma.js");
  return { prisma: shared };
});

const prisma = testPrisma;
const userId = "7c8f0f14-1f87-4dfb-a2bf-85bf170a79c8";
const cronSecret = "test-cron-secret-with-at-least-32-characters";
const provider = new FakeOpenBankingProvider();

describe("internal open banking scheduling routes", () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use("/api/internal", internalRoutes);
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
    resetTestPrisma();
    fakeOpenBankingStore.reset();
    useTestOpenBankingConfig({ OPEN_BANKING_CRON_SECRET: cronSecret });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("rejects a wrong or missing cron secret", async () => {
    const missing = await fetch(`${baseUrl}/api/internal/open-banking/sync-due`, {
      method: "POST",
    });
    expect(missing.status).toBe(401);

    const wrong = await fetch(`${baseUrl}/api/internal/open-banking/sync-due`, {
      method: "POST",
      headers: { Authorization: `Bearer ${"x".repeat(40)}` },
    });
    expect(wrong.status).toBe(401);
    expect((await wrong.json()).error.code).toBe("UNAUTHORIZED");
  });

  it("processes a batch and answers only with counts", async () => {
    const connection = await prisma.bankConnection.create({
      data: {
        userId,
        provider: "fake",
        providerSessionCiphertext: encryptString("sess-1"),
        institutionId: "PT|Banco Demonstração",
        institutionName: "Banco Demonstração",
        institutionCountry: "PT",
        status: "active",
        nextSyncAt: new Date(Date.now() - 60_000),
      },
    });

    const response = await fetch(`${baseUrl}/api/internal/open-banking/sync-due?limit=5`, {
      method: "POST",
      headers: { Authorization: `Bearer ${cronSecret}` },
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(Object.keys(body.data).sort()).toEqual([
      "accountsProcessed",
      "claimed",
      "completed",
      "failed",
      "transactionsCreated",
      "transactionsUpdated",
    ]);
    expect(body.data.claimed).toBe(1);
    expect(JSON.stringify(body)).not.toContain("sess-1");
    expect(JSON.stringify(body)).not.toContain(connection.id);
  });

  it("honours the maximum batch size", async () => {
    const response = await fetch(`${baseUrl}/api/internal/open-banking/sync-due?limit=1000`, {
      method: "POST",
      headers: { Authorization: `Bearer ${cronSecret}` },
    });
    expect(response.status).toBe(200);
  });

  it("cleans up expired attempts", async () => {
    await prisma.bankAuthorizationAttempt.create({
      data: {
        userId,
        provider: "fake",
        institutionId: "PT|Banco Demonstração",
        institutionName: "Banco Demonstração",
        country: "PT",
        psuType: "personal",
        stateHash: "hash-antigo",
        returnPath: "/accounts",
        expiresAt: new Date(Date.now() - 40 * 86_400_000),
      },
    });

    const response = await fetch(`${baseUrl}/api/internal/open-banking/cleanup?retentionDays=30`, {
      method: "POST",
      headers: { Authorization: `Bearer ${cronSecret}` },
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.attemptsDeleted).toBe(1);
    expect(await prisma.bankAuthorizationAttempt.count()).toBe(0);
  });

  it("exposes aggregate stats without bank data", async () => {
    await prisma.bankConnection.create({
      data: {
        userId,
        provider: "fake",
        providerSessionCiphertext: encryptString("sess-2"),
        institutionId: "PT|Banco Demonstração",
        institutionName: "Banco Demonstração",
        institutionCountry: "PT",
        status: "active",
        nextSyncAt: new Date(Date.now() - 60_000),
      },
    });

    const response = await fetch(`${baseUrl}/api/internal/open-banking/stats`, {
      headers: { Authorization: `Bearer ${cronSecret}` },
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toMatchObject({ connections: 1, due: 1 });
    expect(JSON.stringify(body)).not.toContain("sess-2");
    expect(provider).toBeInstanceOf(FakeOpenBankingProvider);
  });

  it("answers OPEN_BANKING_DISABLED when the feature flag is off", async () => {
    useTestOpenBankingConfig({
      OPEN_BANKING_ENABLED: "false",
      OPEN_BANKING_CRON_SECRET: cronSecret,
    });

    const response = await fetch(`${baseUrl}/api/internal/open-banking/sync-due`, {
      method: "POST",
      headers: { Authorization: `Bearer ${cronSecret}` },
    });

    expect(response.status).toBe(403);
    expect((await response.json()).error.code).toBe("OPEN_BANKING_DISABLED");
  });
});
