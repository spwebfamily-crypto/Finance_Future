import type { AddressInfo } from "node:http";
import type { Server } from "node:http";
import express from "express";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { errorHandler } from "../middleware.js";
import openBankingRoutes from "../routes/openBanking.js";

const originalEnv = process.env;
const validCallback = "http://localhost:3000/api/open-banking/callback";
const cronSecret = "test-cron-secret-with-at-least-32-characters";
const dataKey = Buffer.alloc(32, 7).toString("base64");

async function loadConfig(overrides: Record<string, string | undefined>) {
  vi.resetModules();
  process.env = { ...originalEnv };
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    const module = await import("./config.js");
    return module.getOpenBankingConfig();
  } finally {
    process.env = originalEnv;
  }
}

const enabledFake = {
  OPEN_BANKING_ENABLED: "true",
  OPEN_BANKING_PROVIDER: "fake",
  OPEN_BANKING_CALLBACK_URL: validCallback,
  OPEN_BANKING_CRON_SECRET: cronSecret,
  OPEN_BANKING_DATA_KEY_B64: dataKey,
};

describe("open banking configuration", () => {
  it("is disabled by default and never requires secrets", async () => {
    const config = await loadConfig({
      OPEN_BANKING_ENABLED: undefined,
      OPEN_BANKING_CALLBACK_URL: undefined,
      OPEN_BANKING_DATA_KEY_B64: undefined,
      OPEN_BANKING_CRON_SECRET: undefined,
    });

    expect(config.enabled).toBe(false);
    expect(config.provider).toBe("fake");
    expect(config.defaultCountry).toBe("PT");
    expect(config.syncIntervalMinutes).toBe(360);
    expect(config.dataKey).toHaveLength(0);
  });

  it("loads a valid configuration and normalizes the callback and origin", async () => {
    const config = await loadConfig({ ...enabledFake, FRONTEND_ORIGIN: "http://localhost:5173/" });

    expect(config.enabled).toBe(true);
    expect(config.callbackUrl).toBe(validCallback);
    expect(config.redirectOrigin).toBe("http://localhost:5173");
    expect(config.dataKey).toHaveLength(32);
  });

  it("accepts a trailing slash in the callback URL but rejects a wrong path", async () => {
    await expect(
      loadConfig({ ...enabledFake, OPEN_BANKING_CALLBACK_URL: "http://localhost:3000/api/other" }),
    ).rejects.toThrow(/terminar em \/api\/open-banking\/callback/);
    await expect(
      loadConfig({
        ...enabledFake,
        OPEN_BANKING_CALLBACK_URL: `${validCallback}?code=abc`,
      }),
    ).rejects.toThrow(/query/);
    await expect(loadConfig({ ...enabledFake, OPEN_BANKING_CALLBACK_URL: "" })).rejects.toThrow(
      /CALLBACK_URL é obrigatório/,
    );
  });

  it("falls back to an ephemeral key in tests only", async () => {
    const config = await loadConfig({
      ...enabledFake,
      OPEN_BANKING_DATA_KEY_B64: undefined,
      NODE_ENV: "test",
    });
    expect(config.dataKey).toHaveLength(32);
  });

  it("requires a data key outside tests and enforces exactly 32 bytes", async () => {
    await expect(
      loadConfig({ ...enabledFake, OPEN_BANKING_DATA_KEY_B64: undefined, NODE_ENV: "development" }),
    ).rejects.toThrow(/OPEN_BANKING_DATA_KEY_B64 é obrigatório/);

    await expect(
      loadConfig({
        ...enabledFake,
        OPEN_BANKING_DATA_KEY_B64: Buffer.alloc(31, 1).toString("base64"),
      }),
    ).rejects.toThrow(/32 bytes/);
  });

  it("fails in production when a required variable is missing", async () => {
    const production = {
      ...enabledFake,
      NODE_ENV: "production",
      FRONTEND_ORIGIN: "https://app.example.com",
      OPEN_BANKING_CALLBACK_URL: "https://api.example.com/api/open-banking/callback",
    };

    await expect(
      loadConfig({ ...production, OPEN_BANKING_CRON_SECRET: undefined }),
    ).rejects.toThrow(/OPEN_BANKING_CRON_SECRET é obrigatório/);
    await expect(loadConfig({ ...production, OPEN_BANKING_CRON_SECRET: "curto" })).rejects.toThrow(
      /pelo menos 32 caracteres/,
    );
    await expect(
      loadConfig({ ...production, FRONTEND_ORIGIN: "http://app.example.com" }),
    ).rejects.toThrow(/HTTPS em produção/);
    await expect(
      loadConfig({
        ...production,
        OPEN_BANKING_CALLBACK_URL: "http://api.example.com/api/open-banking/callback",
      }),
    ).rejects.toThrow(/HTTPS em produção/);
  });

  it("requires the provider credentials when enable_banking is selected", async () => {
    await expect(
      loadConfig({ ...enabledFake, OPEN_BANKING_PROVIDER: "enable_banking" }),
    ).rejects.toThrow(/ENABLE_BANKING_APP_ID é obrigatório/);

    const config = await loadConfig({
      ...enabledFake,
      OPEN_BANKING_PROVIDER: "enable_banking",
      ENABLE_BANKING_APP_ID: "00000000-1111-4222-8333-444444444444",
      ENABLE_BANKING_PRIVATE_KEY_B64: Buffer.from(
        "-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----\n",
      ).toString("base64"),
    });
    expect(config.enableBanking?.appId).toBe("00000000-1111-4222-8333-444444444444");
    expect(config.enableBanking?.privateKey).toContain("BEGIN PRIVATE KEY");
    expect(config.enableBanking?.environment).toBe("sandbox");
  });

  it("rejects an unsupported provider", async () => {
    await expect(
      loadConfig({ ...enabledFake, OPEN_BANKING_PROVIDER: "salt_edge" }),
    ).rejects.toThrow(/configuração inválida/);
  });

  it("never builds a redirect outside the configured frontend origin", async () => {
    vi.resetModules();
    process.env = { ...originalEnv, ...enabledFake, FRONTEND_ORIGIN: "http://localhost:5173" };
    try {
      const module = await import("./config.js");
      expect(module.buildFrontendRedirectUrl("/accounts")).toBe("http://localhost:5173/accounts");
      expect(module.buildFrontendRedirectUrl("/accounts/connections")).toBe(
        "http://localhost:5173/accounts/connections",
      );
      expect(module.buildFrontendRedirectUrl("https://evil.example.com")).toBe(
        "http://localhost:5173/accounts",
      );
    } finally {
      process.env = originalEnv;
    }
  });
});

describe("open banking routes without the feature flag", () => {
  let server: Server;
  let baseUrl: string;

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

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  });

  it("answers OPEN_BANKING_DISABLED on every open banking route", async () => {
    const response = await fetch(`${baseUrl}/api/open-banking/institutions?country=PT`);
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error.code).toBe("OPEN_BANKING_DISABLED");

    const sync = await fetch(`${baseUrl}/api/open-banking/connections/123/sync`, {
      method: "POST",
    });
    expect(sync.status).toBe(403);
    expect((await sync.json()).error.code).toBe("OPEN_BANKING_DISABLED");
  });
});
