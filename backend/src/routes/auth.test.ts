import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import jwt from "jsonwebtoken";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { errorHandler } from "../middleware.js";
import { signRefreshToken } from "../lib/auth.js";
import authRoutes, { authLimiter } from "./auth.js";

const repositories = vi.hoisted(() => ({
  refreshTokenDeleteMany: vi.fn(),
  userFindUnique: vi.fn(),
  userUpdate: vi.fn(),
  userCreate: vi.fn(),
  refreshTokenCreate: vi.fn(),
  refreshTokenFindUnique: vi.fn(),
  refreshTokenDelete: vi.fn(),
  emailVerificationTokenFindUnique: vi.fn(),
  emailVerificationTokenDelete: vi.fn(),
  emailVerificationTokenUpsert: vi.fn(),
  transaction: vi.fn(),
  transactionArray: vi.fn(),
}));

// bcrypt a custo 12 torna o suite lento; as provas de hash já existem em
// src/lib/auth.test.ts. Os segredos/assinatura JWT continuam reais.
vi.mock("../lib/auth.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/auth.js")>();
  return {
    ...actual,
    hashPassword: async (value: string) => `hashed:${value}`,
    verifyPassword: async (value: string, hash: string) => hash === `hashed:${value}`,
  };
});

const emailMocks = vi.hoisted(() => ({
  sendVerificationEmail: vi.fn(),
}));

vi.mock("../services/emailService.js", () => ({
  sendVerificationEmail: emailMocks.sendVerificationEmail,
}));

vi.mock("../prisma.js", () => {
  const transactionClient = {
    refreshToken: {
      create: repositories.refreshTokenCreate,
      delete: repositories.refreshTokenDelete,
    },
    user: { create: repositories.userCreate },
  };
  return {
    prisma: {
      user: {
        findUnique: repositories.userFindUnique,
        create: repositories.userCreate,
        update: repositories.userUpdate,
      },
      refreshToken: {
        create: repositories.refreshTokenCreate,
        findUnique: repositories.refreshTokenFindUnique,
        delete: repositories.refreshTokenDelete,
        deleteMany: repositories.refreshTokenDeleteMany,
      },
      emailVerificationToken: {
        findUnique: repositories.emailVerificationTokenFindUnique,
        delete: repositories.emailVerificationTokenDelete,
        upsert: repositories.emailVerificationTokenUpsert,
      },
      $transaction: repositories.transaction.mockImplementation((input) =>
        typeof input === "function" ? input(transactionClient) : Promise.all(input),
      ),
    },
  };
});

const processEnvAccessSecret =
  process.env.JWT_ACCESS_SECRET ?? "test-access-secret-with-more-than-32-chars";
const userId = "7c8f0f14-1f87-4dfb-a2bf-85bf170a79c8";

function authorization() {
  const token = jwt.sign({ type: "access", email: "owner@example.com" }, processEnvAccessSecret, {
    subject: userId,
    expiresIn: "5m",
  });
  return `Bearer ${token}`;
}

// O authLimiter é um singleton de módulo: sem reset, as contagens de um
// describe esgotam o limite dos seguintes (todos os pedidos vêm de 127.0.0.1).
async function resetAuthLimiter() {
  await authLimiter.resetKey("127.0.0.1");
}

describe("auth logout", () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use("/api/auth", authRoutes);
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
    repositories.refreshTokenDeleteMany.mockReset().mockResolvedValue({ count: 1 });
    repositories.userFindUnique.mockReset();
    repositories.userUpdate.mockReset();
    repositories.userCreate.mockReset();
    repositories.refreshTokenCreate.mockReset().mockResolvedValue({});
    repositories.refreshTokenFindUnique.mockReset();
    repositories.refreshTokenDelete.mockReset();
  });

  it("revokes the refresh token hash on the server", async () => {
    const response = await fetch(`${baseUrl}/api/auth/logout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: "token-a-revogar" }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.ok).toBe(true);
    expect(repositories.refreshTokenDeleteMany).toHaveBeenCalledOnce();
    // O token é sempre removido por hash, nunca em texto claro.
    const where = repositories.refreshTokenDeleteMany.mock.calls[0][0].where;
    expect(where.tokenHash).not.toBe("token-a-revogar");
    expect(where.tokenHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("stays idempotent when the token is unknown or already revoked", async () => {
    repositories.refreshTokenDeleteMany.mockResolvedValue({ count: 0 });

    const response = await fetch(`${baseUrl}/api/auth/logout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: "desconhecido" }),
    });

    expect(response.status).toBe(200);
  });

  it("rejects a request without a refresh token", async () => {
    const response = await fetch(`${baseUrl}/api/auth/logout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(repositories.refreshTokenDeleteMany).not.toHaveBeenCalled();
  });
});

describe("auth profile (/me)", () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use("/api/auth", authRoutes);
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
      id: userId,
      name: "Rodrigo",
      email: "owner@example.com",
      currency: "EUR",
      timeZone: "Europe/Lisbon",
    });
    repositories.userUpdate.mockReset().mockImplementation(async ({ data }) => ({
      id: userId,
      name: data.name ?? "Rodrigo",
      email: "owner@example.com",
      currency: data.currency ?? "EUR",
      timeZone: data.timeZone ?? "Europe/Lisbon",
    }));
  });

  it("requires authentication", async () => {
    const response = await fetch(`${baseUrl}/api/auth/me`);

    expect(response.status).toBe(401);
    expect(repositories.userFindUnique).not.toHaveBeenCalled();
  });

  it("returns the current user with currency and time zone", async () => {
    const response = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Authorization: authorization() },
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toMatchObject({
      id: userId,
      currency: "EUR",
      timeZone: "Europe/Lisbon",
    });
  });

  it("updates currency and time zone with normalized values", async () => {
    const response = await fetch(`${baseUrl}/api/auth/me`, {
      method: "PATCH",
      headers: { Authorization: authorization(), "Content-Type": "application/json" },
      body: JSON.stringify({ currency: "brl", timeZone: "America/Sao_Paulo" }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.currency).toBe("BRL");
    expect(body.data.timeZone).toBe("America/Sao_Paulo");
    expect(repositories.userUpdate.mock.calls[0][0].data).toEqual({
      currency: "BRL",
      timeZone: "America/Sao_Paulo",
    });
  });

  it("rejects an unrecognized time zone and an empty update", async () => {
    const invalidTimeZone = await fetch(`${baseUrl}/api/auth/me`, {
      method: "PATCH",
      headers: { Authorization: authorization(), "Content-Type": "application/json" },
      body: JSON.stringify({ timeZone: "Marte/Cratera" }),
    });

    expect(invalidTimeZone.status).toBe(400);

    const emptyBody = await fetch(`${baseUrl}/api/auth/me`, {
      method: "PATCH",
      headers: { Authorization: authorization(), "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(emptyBody.status).toBe(400);
    expect(repositories.userUpdate).not.toHaveBeenCalled();
  });
});

describe("auth session (register, login, refresh)", () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use("/api/auth", authRoutes);
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

  beforeEach(async () => {
    await resetAuthLimiter();
    repositories.userFindUnique.mockReset();
    repositories.userCreate.mockReset();
    repositories.refreshTokenCreate.mockReset().mockResolvedValue({});
    repositories.refreshTokenFindUnique.mockReset();
    repositories.refreshTokenDelete.mockReset();
    repositories.refreshTokenDeleteMany.mockReset().mockResolvedValue({ count: 0 });
    repositories.emailVerificationTokenFindUnique.mockReset();
    repositories.emailVerificationTokenDelete.mockReset();
    repositories.emailVerificationTokenUpsert.mockReset();
    emailMocks.sendVerificationEmail.mockReset().mockResolvedValue(undefined);
    repositories.transaction.mockClear();
  });

  it("registers a user with default categories and issues both tokens", async () => {
    repositories.userFindUnique.mockResolvedValue(null);
    repositories.userCreate.mockImplementation(async ({ data }) => ({
      id: userId,
      email: data.email,
      name: data.name,
      currency: "EUR",
      timeZone: "Europe/Lisbon",
    }));

    const response = await fetch(`${baseUrl}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Rodrigo", email: "novo@example.com", password: "segredo-123" }),
    });
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.user).toMatchObject({ id: userId, email: "novo@example.com" });
    expect(body.accessToken).toBeTruthy();
    expect(body.refreshToken).toBeTruthy();

    const createData = repositories.userCreate.mock.calls[0][0].data;
    expect(createData.passwordHash).toBe("hashed:segredo-123");
    const categoryCount = createData.categories.create.length as number;
    expect(categoryCount).toBeGreaterThanOrEqual(5);

    // Os tokens nascem dentro da transação que cria o utilizador.
    expect(repositories.refreshTokenCreate).toHaveBeenCalledOnce();
  });

  it("rejects a duplicate email without creating anything", async () => {
    repositories.userFindUnique.mockResolvedValue({ id: "outro", email: "novo@example.com" });

    const response = await fetch(`${baseUrl}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Rodrigo", email: "novo@example.com", password: "segredo-123" }),
    });
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error.code).toBe("EMAIL_TAKEN");
    expect(repositories.userCreate).not.toHaveBeenCalled();
  });

  it("logs in with valid credentials and clears expired refresh tokens", async () => {
    repositories.userFindUnique.mockResolvedValue({
      id: userId,
      email: "owner@example.com",
      name: "Rodrigo",
      passwordHash: "hashed:senha-certa",
      currency: "EUR",
      timeZone: "Europe/Lisbon",
    });

    const response = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "owner@example.com", password: "senha-certa" }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.accessToken).toBeTruthy();
    expect(repositories.refreshTokenDeleteMany).toHaveBeenCalledOnce();
    expect(repositories.refreshTokenCreate).toHaveBeenCalledOnce();
  });

  it("rejects wrong credentials with a stable error code", async () => {
    repositories.userFindUnique.mockResolvedValue({
      id: userId,
      email: "owner@example.com",
      passwordHash: "hashed:senha-certa",
    });

    const response = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "owner@example.com", password: "senha-errada" }),
    });
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error.code).toBe("INVALID_CREDENTIALS");
    expect(repositories.refreshTokenCreate).not.toHaveBeenCalled();
  });

  it("rotates the refresh token when presented a stored valid one", async () => {
    const refreshToken = signRefreshToken({ id: userId, email: "owner@example.com" });
    repositories.refreshTokenFindUnique.mockResolvedValue({
      id: "stored-id",
      userId,
      tokenHash: "hash",
      expiresAt: new Date(Date.now() + 60_000),
      user: { id: userId, email: "owner@example.com", name: "Rodrigo" },
    });

    const response = await fetch(`${baseUrl}/api/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.accessToken).toBeTruthy();
    expect(body.refreshToken).toBeTruthy();
    expect(repositories.refreshTokenDelete).toHaveBeenCalledOnce();
    expect(repositories.refreshTokenCreate).toHaveBeenCalledOnce();
  });

  it("refuses a refresh token that is not stored or is expired", async () => {
    const refreshToken = signRefreshToken({ id: userId, email: "owner@example.com" });
    repositories.refreshTokenFindUnique.mockResolvedValue(null);

    const response = await fetch(`${baseUrl}/api/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error.code).toBe("INVALID_REFRESH_TOKEN");
    expect(repositories.refreshTokenDelete).not.toHaveBeenCalled();
  });

  it("sends a verification email on register without blocking the response", async () => {
    repositories.userFindUnique.mockResolvedValue(null);
    repositories.userCreate.mockImplementation(async ({ data }) => ({
      id: userId,
      email: data.email,
      name: data.name,
      currency: "EUR",
      emailVerifiedAt: null,
    }));

    const response = await fetch(`${baseUrl}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Rodrigo", email: "novo@example.com", password: "segredo-123" }),
    });
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.user.emailVerified).toBe(false);
    expect(emailMocks.sendVerificationEmail).toHaveBeenCalledOnce();
    expect(emailMocks.sendVerificationEmail.mock.calls[0][0]).toMatchObject({
      email: "novo@example.com",
      name: "Rodrigo",
    });
  });
});

describe("auth email verification", () => {
  let server: Server;
  let baseUrl: string;
  const validToken = "a".repeat(64);

  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use("/api/auth", authRoutes);
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

  beforeEach(async () => {
    await resetAuthLimiter();
    repositories.userFindUnique.mockReset();
    repositories.userUpdate.mockReset();
    repositories.emailVerificationTokenFindUnique.mockReset();
    repositories.emailVerificationTokenDelete.mockReset();
    repositories.emailVerificationTokenUpsert.mockReset();
    emailMocks.sendVerificationEmail.mockReset().mockResolvedValue(undefined);
  });

  function postVerify(token: unknown) {
    return fetch(`${baseUrl}/api/auth/verify-email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
  }

  it("verifies a valid, unexpired token and marks the user verified", async () => {
    repositories.emailVerificationTokenFindUnique.mockResolvedValue({
      id: "tok-1",
      userId,
      expiresAt: new Date(Date.now() + 60_000),
      user: {
        id: userId,
        name: "Rodrigo",
        email: "owner@example.com",
        currency: "EUR",
        emailVerifiedAt: null,
      },
    });
    repositories.userUpdate.mockResolvedValue({
      id: userId,
      name: "Rodrigo",
      email: "owner@example.com",
      currency: "EUR",
      emailVerifiedAt: new Date(),
    });

    const response = await postVerify(validToken);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.user.emailVerified).toBe(true);
    // O lookup é feito por hash, nunca pelo token em texto claro.
    const where = repositories.emailVerificationTokenFindUnique.mock.calls[0][0].where;
    expect(where.tokenHash).not.toBe(validToken);
    expect(where.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(repositories.emailVerificationTokenDelete).toHaveBeenCalledOnce();
  });

  it("rejects an unknown or expired token", async () => {
    repositories.emailVerificationTokenFindUnique.mockResolvedValue(null);
    const unknown = await postVerify(validToken);
    expect(unknown.status).toBe(400);
    expect((await unknown.json()).error.code).toBe("INVALID_VERIFICATION_TOKEN");

    repositories.emailVerificationTokenFindUnique.mockResolvedValue({
      id: "tok-1",
      userId,
      expiresAt: new Date(Date.now() - 1_000),
      user: { id: userId, emailVerifiedAt: null },
    });
    const expired = await postVerify(validToken);
    expect(expired.status).toBe(400);
    expect(repositories.userUpdate).not.toHaveBeenCalled();
  });

  it("rejects a malformed token without hitting the database", async () => {
    const response = await postVerify("curto");
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("VALIDATION_ERROR");
    expect(repositories.emailVerificationTokenFindUnique).not.toHaveBeenCalled();
  });

  it("is idempotent when the account is already verified", async () => {
    repositories.emailVerificationTokenFindUnique.mockResolvedValue({
      id: "tok-1",
      userId,
      expiresAt: new Date(Date.now() + 60_000),
      user: {
        id: userId,
        name: "Rodrigo",
        email: "owner@example.com",
        currency: "EUR",
        emailVerifiedAt: new Date(),
      },
    });

    const response = await postVerify(validToken);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.user.emailVerified).toBe(true);
    expect(repositories.userUpdate).not.toHaveBeenCalled();
    expect(repositories.emailVerificationTokenDelete).toHaveBeenCalledOnce();
  });

  it("resend requires authentication", async () => {
    const response = await fetch(`${baseUrl}/api/auth/resend-verification`, { method: "POST" });
    expect(response.status).toBe(401);
    expect(repositories.emailVerificationTokenUpsert).not.toHaveBeenCalled();
  });

  it("resend replaces the pending token and sends a new email", async () => {
    repositories.userFindUnique.mockResolvedValue({
      id: userId,
      name: "Rodrigo",
      email: "owner@example.com",
      currency: "EUR",
      emailVerifiedAt: null,
    });

    const response = await fetch(`${baseUrl}/api/auth/resend-verification`, {
      method: "POST",
      headers: { Authorization: authorization() },
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.ok).toBe(true);
    expect(repositories.emailVerificationTokenUpsert).toHaveBeenCalledOnce();
    expect(emailMocks.sendVerificationEmail).toHaveBeenCalledOnce();
  });

  it("resend refuses an already verified account", async () => {
    repositories.userFindUnique.mockResolvedValue({
      id: userId,
      name: "Rodrigo",
      email: "owner@example.com",
      currency: "EUR",
      emailVerifiedAt: new Date(),
    });

    const response = await fetch(`${baseUrl}/api/auth/resend-verification`, {
      method: "POST",
      headers: { Authorization: authorization() },
    });
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error.code).toBe("ALREADY_VERIFIED");
    expect(emailMocks.sendVerificationEmail).not.toHaveBeenCalled();
  });
});
