import { generateKeyPairSync } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../middleware.js";
import { mapEnableBankingError } from "./providerAuth.js";
import { enableBankingRequest } from "./providerAuth.js";
import { installTestOpenBankingConfig } from "./testSupport.js";

installTestOpenBankingConfig();

const secret = {
  iban: "PT50000201231234567890154",
  code: "codigo-autorizacao-do-banco",
  state: "state-super-secreto",
  session: "sessao-do-provedor",
};

const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const credentials = {
  appId: "app-id",
  privateKey: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
};

describe("open banking logging", () => {
  let logs: string[] = [];

  beforeEach(() => {
    logs = [];
    const record = (...args: unknown[]) => {
      logs.push(
        args
          .map((arg) => (arg instanceof Error ? `${arg.name}: ${arg.message}` : String(arg)))
          .join(" "),
      );
    };
    vi.spyOn(console, "error").mockImplementation(record);
    vi.spyOn(console, "warn").mockImplementation(record);
    vi.spyOn(console, "log").mockImplementation(record);
    vi.spyOn(console, "info").mockImplementation(record);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("never logs the provider payload when a request fails", async () => {
    const fetchImpl = (async () =>
      new Response(
        JSON.stringify({
          message: "erro do banco",
          error: "SESSION_DOES_NOT_EXIST",
          detail: `iban ${secret.iban} code ${secret.code} state ${secret.state}`,
        }),
        { status: 404, headers: { "Content-Type": "application/json" } },
      )) as unknown as typeof fetch;

    await expect(
      enableBankingRequest(`/sessions/${secret.session}`, { credentials, fetchImpl }),
    ).rejects.toMatchObject({ code: "consent_expired" });

    expect(logs.join("\n")).not.toContain(secret.iban);
    expect(logs.join("\n")).not.toContain(secret.code);
    expect(logs.join("\n")).not.toContain(secret.state);
    expect(logs.join("\n")).not.toContain(secret.session);
  });

  it("keeps sensitive values out of serialized errors", () => {
    const error = mapEnableBankingError(500, {
      message: `iban ${secret.iban}`,
      error: "ASPSP_ERROR",
    });
    const serialized = JSON.stringify({ error });

    expect(serialized).not.toContain(secret.iban);
    expect(error.message).not.toContain(secret.iban);

    const apiError = new ApiError(502, "BANK_PROVIDER_UNAVAILABLE", error.message);
    expect(JSON.stringify({ apiError })).not.toContain(secret.iban);
  });
});
