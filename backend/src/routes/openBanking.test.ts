import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:http";
import type { Server } from "node:http";
import express from "express";
import jwt from "jsonwebtoken";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { errorHandler } from "../middleware.js";
import openBankingRoutes from "./openBanking.js";
import {
  FakeOpenBankingProvider,
  fakeOpenBankingStore,
} from "../open-banking/fakeOpenBankingProvider.js";
import { sha256Hex } from "../open-banking/crypto.js";
import { installTestOpenBankingConfig } from "../open-banking/testSupport.js";
import type { BankAuthorizationAttempt } from "@prisma/client";

installTestOpenBankingConfig();

type AttemptRow = BankAuthorizationAttempt & { usedAt: Date | null };

const repositories = vi.hoisted(() => ({
  attempts: [] as AttemptRow[],
  connections: [] as Array<Record<string, unknown>>,
  jobs: [] as Array<Record<string, unknown>>,
  attemptCreate: vi.fn(),
  attemptFindUnique: vi.fn(),
  attemptUpdateMany: vi.fn(),
  connectionCreate: vi.fn(),
  connectionFindMany: vi.fn(),
  connectionFindFirst: vi.fn(),
  jobCreate: vi.fn(),
}));

vi.mock("../prisma.js", () => ({
  prisma: {
    bankAuthorizationAttempt: {
      create: repositories.attemptCreate.mockImplementation(
        async ({ data }: { data: Record<string, unknown> }) => {
          const row = {
            id: randomUUID(),
            usedAt: null,
            providerAuthorizationId: null,
            createdAt: new Date(),
            ...data,
          } as AttemptRow;
          repositories.attempts.push(row);
          return row;
        },
      ),
      findUnique: repositories.attemptFindUnique.mockImplementation(
        async ({ where }: { where: { stateHash: string } }) =>
          repositories.attempts.find((attempt) => attempt.stateHash === where.stateHash) ?? null,
      ),
      updateMany: repositories.attemptUpdateMany.mockImplementation(
        async ({
          where,
          data,
        }: {
          where: Record<string, unknown>;
          data: Record<string, unknown>;
        }) => {
          let count = 0;
          for (const attempt of repositories.attempts) {
            const matchesId = attempt.id === where.id || where.id === undefined;
            const matchesUnused = where.usedAt === undefined || attempt.usedAt === where.usedAt;
            if (matchesId && matchesUnused) {
              Object.assign(attempt, data);
              count += 1;
            }
          }
          return { count };
        },
      ),
    },
    bankConnection: {
      create: repositories.connectionCreate.mockImplementation(
        async ({ data }: { data: Record<string, unknown> }) => {
          const row = { id: randomUUID(), createdAt: new Date(), updatedAt: new Date(), ...data };
          repositories.connections.push(row);
          return row;
        },
      ),
      findMany: repositories.connectionFindMany.mockImplementation(
        async ({ where }: { where: { userId?: string; status?: { not?: string } } }) =>
          repositories.connections.filter((connection) => {
            if (connection.userId !== where.userId) return false;
            if (where.status?.not && connection.status === where.status.not) return false;
            return true;
          }),
      ),
      findFirst: repositories.connectionFindFirst.mockImplementation(
        async ({ where }: { where: { id?: string; userId?: string } }) =>
          repositories.connections.find(
            (connection) => connection.id === where.id && connection.userId === where.userId,
          ) ?? null,
      ),
    },
    bankSyncJob: {
      create: repositories.jobCreate.mockImplementation(
        async ({ data }: { data: Record<string, unknown> }) => {
          const row = { id: randomUUID(), status: "queued", createdAt: new Date(), ...data };
          repositories.jobs.push(row);
          return row;
        },
      ),
    },
  },
}));

const userId = "7c8f0f14-1f87-4dfb-a2bf-85bf170a79c8";
const otherUserId = "1f0e2d3c-4b5a-4968-8779-9a0b1c2d3e4f";

function authorization(userId: string = ownerId()) {
  const token = jwt.sign(
    { type: "access", email: "owner@example.com" },
    process.env.JWT_ACCESS_SECRET!,
    {
      subject: userId,
      expiresIn: "5m",
    },
  );
  return `Bearer ${token}`;
}

function ownerId() {
  return userId;
}

describe("open banking institutions, authorization and callback", () => {
  let server: Server;
  let baseUrl: string;
  const provider = new FakeOpenBankingProvider();

  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use("/api/open-banking", openBankingRoutes);
    app.use(errorHandler);
    await new Promise<void>((resolve) => {
      server = app.listen(0, "127.0.0.1", resolve);
    });
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  beforeEach(() => {
    repositories.attempts.length = 0;
    repositories.connections.length = 0;
    repositories.jobs.length = 0;
    fakeOpenBankingStore.reset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  });

  /** O callback configurado aponta para :3000; nos testes usa-se o servidor real. */
  function localize(url: string) {
    return url.replace("http://localhost:3000", baseUrl);
  }

  async function startAuthorization(returnPath = "/accounts") {
    const response = await fetch(`${baseUrl}/api/open-banking/authorizations`, {
      method: "POST",
      headers: { Authorization: authorization(), "Content-Type": "application/json" },
      body: JSON.stringify({
        institutionId: "PT|Banco Demonstração",
        country: "PT",
        psuType: "personal",
        returnPath,
      }),
    });
    return { response, body: await response.json() };
  }

  it("lists institutions for the authenticated user", async () => {
    const response = await fetch(
      `${baseUrl}/api/open-banking/institutions?country=PT&psuType=personal`,
      {
        headers: { Authorization: authorization() },
      },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.map((item: { name: string }) => item.name)).toContain("Banco Demonstração");
  });

  it("requires authentication on the authenticated routes", async () => {
    const institutions = await fetch(`${baseUrl}/api/open-banking/institutions`);
    expect(institutions.status).toBe(401);

    const authorizations = await fetch(`${baseUrl}/api/open-banking/authorizations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ institutionId: "PT|Banco Demonstração", country: "PT" }),
    });
    expect(authorizations.status).toBe(401);
  });

  it("rejects a country outside the allowlist", async () => {
    const response = await fetch(`${baseUrl}/api/open-banking/institutions?country=ZZ`, {
      headers: { Authorization: authorization() },
    });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects an institution that the provider does not offer", async () => {
    const response = await fetch(`${baseUrl}/api/open-banking/authorizations`, {
      method: "POST",
      headers: { Authorization: authorization(), "Content-Type": "application/json" },
      body: JSON.stringify({ institutionId: "PT|Inexistente", country: "PT", psuType: "personal" }),
    });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("BANK_INSTITUTION_NOT_FOUND");
  });

  it("creates the authorization and stores only the hash of the state", async () => {
    const { response, body } = await startAuthorization();

    expect(response.status).toBe(201);
    expect(body.data.authorizationUrl).toContain("/api/open-banking/fake-authorize");
    expect(body.data.institutionName).toBe("Banco Demonstração");
    expect(new Date(body.data.expiresAt).getTime() - Date.now()).toBeLessThanOrEqual(10 * 60_000);

    expect(repositories.attempts).toHaveLength(1);
    const attempt = repositories.attempts[0]!;
    expect(attempt.userId).toBe(userId);
    expect(attempt.stateHash).toMatch(/^[a-f0-9]{64}$/);
    expect(attempt.usedAt).toBeNull();
    expect(attempt).not.toHaveProperty("state");
    expect(attempt.providerAuthorizationId).toBe(
      new URL(body.data.authorizationUrl).searchParams.get("authorizationId"),
    );
  });

  it("completes the bank redirect, creates the connection and never exposes the code", async () => {
    const { body } = await startAuthorization("/accounts/connections");
    const authorizationUrl = new URL(body.data.authorizationUrl);
    const authorizationId = authorizationUrl.searchParams.get("authorizationId")!;

    const bankRedirect = await fetch(
      `${baseUrl}${authorizationUrl.pathname}?authorizationId=${authorizationId}`,
      {
        redirect: "manual",
      },
    );
    expect(bankRedirect.status).toBe(303);
    const callbackUrl = new URL(bankRedirect.headers.get("location")!);
    expect(callbackUrl.pathname).toBe("/api/open-banking/callback");
    expect(callbackUrl.searchParams.get("code")).toBeTruthy();

    const callback = await fetch(localize(callbackUrl.toString()), { redirect: "manual" });

    expect(callback.status).toBe(303);
    expect(callback.headers.get("cache-control")).toBe("no-store");
    expect(callback.headers.get("referrer-policy")).toBe("no-referrer");

    const target = new URL(callback.headers.get("location")!);
    expect(target.origin).toBe("http://localhost:5173");
    expect(target.pathname).toBe("/accounts/connections");
    expect(target.searchParams.get("bankConnection")).toBe("success");
    expect(target.search).not.toContain("code=");
    expect(target.search).not.toContain("state=");

    expect(repositories.connections).toHaveLength(1);
    const connection = repositories.connections[0]!;
    expect(connection.userId).toBe(userId);
    expect(connection.status).toBe("active");
    expect(connection.providerSessionCiphertext.startsWith("v1.")).toBe(true);
    expect(connection.providerSessionCiphertext).not.toContain(
      fakeOpenBankingStore.sessions.keys().next().value as string,
    );
    expect(repositories.jobs).toHaveLength(1);
    expect(repositories.jobs[0]).toMatchObject({ trigger: "initial", connectionId: connection.id });
  });

  it("follows the whole flow and lands on the frontend with a success flag", async () => {
    const { body } = await startAuthorization();
    const bankRedirect = await fetch(localize(body.data.authorizationUrl), { redirect: "manual" });
    const callback = await fetch(localize(bankRedirect.headers.get("location")!), {
      redirect: "manual",
    });

    expect(callback.status).toBe(303);
    expect(callback.headers.get("location")).toBe(
      "http://localhost:5173/accounts?bankConnection=success",
    );
  });

  it("rejects an unknown, expired or replayed state", async () => {
    const unknown = await fetch(
      `${baseUrl}/api/open-banking/callback?code=abc&state=desconhecido`,
      {
        redirect: "manual",
      },
    );
    expect(new URL(unknown.headers.get("location")!).searchParams.get("reason")).toBe(
      "invalid_state",
    );

    const { body } = await startAuthorization();
    const authorizationId = new URL(body.data.authorizationUrl).searchParams.get(
      "authorizationId",
    )!;
    const { code, state } = provider.completeAuthorization(authorizationId);
    repositories.attempts[0]!.expiresAt = new Date(Date.now() - 1_000);

    const expired = await fetch(
      `${baseUrl}/api/open-banking/callback?code=${code}&state=${state}`,
      { redirect: "manual" },
    );
    expect(new URL(expired.headers.get("location")!).searchParams.get("reason")).toBe("expired");

    repositories.attempts[0]!.expiresAt = new Date(Date.now() + 60_000);
    const first = await fetch(`${baseUrl}/api/open-banking/callback?code=${code}&state=${state}`, {
      redirect: "manual",
    });
    expect(new URL(first.headers.get("location")!).searchParams.get("bankConnection")).toBe(
      "success",
    );

    const replayed = await fetch(
      `${baseUrl}/api/open-banking/callback?code=${code}&state=${state}`,
      {
        redirect: "manual",
      },
    );
    expect(new URL(replayed.headers.get("location")!).searchParams.get("reason")).toBe("replayed");
    expect(repositories.connections).toHaveLength(1);
  });

  it("handles a cancellation at the bank and invalidates the state", async () => {
    const { body } = await startAuthorization();
    const authorizationId = new URL(body.data.authorizationUrl).searchParams.get(
      "authorizationId",
    )!;
    const { state } = provider.completeAuthorization(authorizationId);
    const response = await fetch(
      `${baseUrl}/api/open-banking/callback?error=access_denied&error_description=User+cancelled&state=${state}`,
      { redirect: "manual" },
    );
    const target = new URL(response.headers.get("location")!);

    expect(target.searchParams.get("bankConnection")).toBe("error");
    expect(target.searchParams.get("reason")).toBe("cancelled");
    expect(target.search).not.toContain("error_description");
    expect(repositories.attempts[0]!.usedAt).not.toBeNull();
  });

  it("does not let another user consume a state", async () => {
    const { body } = await startAuthorization();
    const authorizationId = new URL(body.data.authorizationUrl).searchParams.get(
      "authorizationId",
    )!;
    const { code, state } = provider.completeAuthorization(authorizationId);

    // O userId vem da tentativa, nunca do navegador: trocar o token não muda nada.
    repositories.attempts[0]!.userId = otherUserId;
    const response = await fetch(
      `${baseUrl}/api/open-banking/callback?code=${code}&state=${state}`,
      {
        redirect: "manual",
        headers: { Authorization: authorization() },
      },
    );

    expect(new URL(response.headers.get("location")!).searchParams.get("bankConnection")).toBe(
      "success",
    );
    expect(repositories.connections[0]!.userId).toBe(otherUserId);
  });

  it("lists connections without provider secrets", async () => {
    repositories.connections.push({
      id: "conn-1",
      userId,
      provider: "fake",
      providerSessionCiphertext: "v1.iv.tag.data",
      institutionId: "PT|Banco Demonstração",
      institutionName: "Banco Demonstração",
      institutionCountry: "PT",
      status: "active",
      lastErrorCode: "BANK_PROVIDER_UNAVAILABLE",
      lastErrorAt: new Date("2026-08-30T10:00:00.000Z"),
      accounts: [
        {
          id: "link-1",
          accountId: "acc-1",
          displayName: "Conta",
          maskedIban: "PT50 **** 0154",
          currency: "EUR",
        },
      ],
    });
    repositories.connections.push({
      id: "conn-2",
      userId: otherUserId,
      provider: "fake",
      providerSessionCiphertext: "v1.iv.tag.other",
      institutionName: "Outra pessoa",
      accounts: [],
    });
    repositories.connections.push({
      id: "conn-disconnected",
      userId,
      provider: "fake",
      institutionName: "Banco antigo",
      status: "disconnected",
      accounts: [],
    });

    const response = await fetch(`${baseUrl}/api/open-banking/connections`, {
      headers: { Authorization: authorization() },
    });
    const body = await response.json();

    expect(repositories.connectionFindMany.mock.calls[0]![0].where).toEqual({
      userId,
      status: { not: "disconnected" },
    });
    expect(body.data).toHaveLength(1);
    expect(body.data[0]).toMatchObject({
      id: "conn-1",
      status: "active",
      accountCount: 1,
      error: { code: "BANK_PROVIDER_UNAVAILABLE" },
    });
    expect(JSON.stringify(body)).not.toContain("v1.iv.tag");
    expect(body.data[0].providerSessionCiphertext).toBeUndefined();
  });

  it("returns the connection detail only to its owner", async () => {
    repositories.connections.push({
      id: "conn-1",
      userId,
      provider: "fake",
      institutionName: "Banco Demonstração",
      status: "active",
      accounts: [],
      syncJobs: [{ id: "job-1", status: "completed", trigger: "initial" }],
    });

    const response = await fetch(`${baseUrl}/api/open-banking/connections/conn-1`, {
      headers: { Authorization: authorization() },
    });
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.data.lastSyncJob).toMatchObject({ id: "job-1", status: "completed" });

    const forbidden = await fetch(`${baseUrl}/api/open-banking/connections/conn-1`, {
      headers: { Authorization: authorization(otherUserId) },
    });
    expect(forbidden.status).toBe(404);
    expect((await forbidden.json()).error.code).toBe("BANK_CONNECTION_NOT_FOUND");
  });

  it("never stores the raw state, only its hash", async () => {
    const { body } = await startAuthorization();
    const authorizationId = new URL(body.data.authorizationUrl).searchParams.get(
      "authorizationId",
    )!;
    const { state } = provider.completeAuthorization(authorizationId);

    expect(repositories.attempts[0]!.stateHash).toBe(sha256Hex(state));
    expect(JSON.stringify(repositories.attempts)).not.toContain(state);
  });
});

describe("open banking callback in production", () => {
  it("requires HTTPS", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("OPEN_BANKING_ENABLED", "true");
    vi.stubEnv("OPEN_BANKING_PROVIDER", "fake");
    vi.stubEnv("FRONTEND_ORIGIN", "https://app.example.com");
    vi.stubEnv("OPEN_BANKING_CALLBACK_URL", "https://api.example.com/api/open-banking/callback");
    vi.stubEnv("OPEN_BANKING_CRON_SECRET", "test-cron-secret-with-at-least-32-characters");
    vi.stubEnv("OPEN_BANKING_DATA_KEY_B64", Buffer.alloc(32, 3).toString("base64"));
    vi.resetModules();

    const { default: productionRoutes } = await import("./openBanking.js");
    const { errorHandler: productionErrorHandler } = await import("../middleware.js");
    const app = express();
    app.use("/api/open-banking", productionRoutes);
    app.use(productionErrorHandler);
    const server = app.listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const address = server.address() as AddressInfo;

    try {
      const response = await fetch(
        `http://127.0.0.1:${address.port}/api/open-banking/callback?code=abc&state=def`,
        { redirect: "manual" },
      );
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.error.code).toBe("INSECURE_CALLBACK");
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
      vi.unstubAllEnvs();
      vi.resetModules();
    }
  });
});
