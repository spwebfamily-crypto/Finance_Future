import { createVerify, generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  createEnableBankingJwt,
  mapEnableBankingError,
  enableBankingRequest,
  ENABLE_BANKING_JWT_TTL_SECONDS,
} from "./providerAuth.js";
import type { ProviderErrorCode } from "./contracts.js";

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const credentials = { appId: "00000000-1111-4222-8333-444444444444", privateKey: pem };

function decodeJwt(token: string) {
  const [header, payload, signature] = token.split(".");
  return {
    header: JSON.parse(Buffer.from(header, "base64url").toString("utf8")),
    payload: JSON.parse(Buffer.from(payload, "base64url").toString("utf8")),
    signature: Buffer.from(signature, "base64url"),
    data: `${header}.${payload}`,
  };
}

describe("enable banking application JWT", () => {
  it("uses the header and claims required by the provider", () => {
    const now = new Date("2026-08-31T12:00:00.000Z");
    const token = createEnableBankingJwt(credentials, now);
    const { header, payload, data, signature } = decodeJwt(token);

    expect(header).toEqual({ typ: "JWT", alg: "RS256", kid: credentials.appId });
    expect(payload.iss).toBe("enablebanking.com");
    expect(payload.aud).toBe("api.enablebanking.com");
    expect(payload.iat).toBe(Math.floor(now.getTime() / 1000));
    expect(payload.exp).toBe(payload.iat + ENABLE_BANKING_JWT_TTL_SECONDS);
    // A documentação limita o TTL a 24 horas.
    expect(payload.exp - payload.iat).toBeLessThanOrEqual(86_400);

    const verified = createVerify("RSA-SHA256").update(data).verify(publicKey, signature);
    expect(verified).toBe(true);
  });

  it("is signed with the private key and fails verification with another key", () => {
    const { publicKey: otherPublicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const { data, signature } = decodeJwt(createEnableBankingJwt(credentials));
    expect(createVerify("RSA-SHA256").update(data).verify(otherPublicKey, signature)).toBe(false);
  });
});

describe("enable banking error mapping", () => {
  it("maps consent, authorization and rate limit codes without leaking the message", () => {
    const cases: Array<[number, string, ProviderErrorCode]> = [
      [404, "EXPIRED_SESSION", "consent_expired"],
      [404, "CLOSED_SESSION", "consent_expired"],
      [404, "SESSION_DOES_NOT_EXIST", "consent_expired"],
      [404, "REVOKED_SESSION", "consent_revoked"],
      [400, "WRONG_AUTHORIZATION_CODE", "authorization_failed"],
      [400, "EXPIRED_AUTHORIZATION_CODE", "authorization_failed"],
      [403, "ACCESS_DENIED", "authorization_failed"],
      [429, "ASPSP_RATE_LIMIT_EXCEEDED", "provider_rate_limited"],
      [504, "ASPSP_TIMEOUT", "provider_timeout"],
      [401, "UNAUTHORIZED_ACCESS", "unauthorized"],
      [400, "WRONG_REQUEST_PARAMETERS", "invalid_request"],
      [500, "ASPSP_ERROR", "provider_unavailable"],
      [400, "CODIGO_DESCONHECIDO", "invalid_request"],
    ];

    for (const [status, error, expected] of cases) {
      const mapped = mapEnableBankingError(status, { error, message: "mensagem do banco" });
      expect(mapped.code).toBe(expected);
      expect(mapped.providerCode).toBe(error);
      expect(mapped.message).not.toContain("mensagem do banco");
    }
  });

  it("falls back to the HTTP status when the provider code is missing", () => {
    expect(mapEnableBankingError(429, {}).code).toBe("provider_rate_limited");
    expect(mapEnableBankingError(503, {}).code).toBe("provider_unavailable");
    expect(mapEnableBankingError(408, {}).code).toBe("provider_timeout");
    expect(mapEnableBankingError(401, null).code).toBe("unauthorized");
  });
});

describe("enable banking http client", () => {
  it("sends the JWT, the JSON body and honours the AbortController timeout", async () => {
    let seenUrl = "";
    let seenHeaders: Record<string, string> = {};
    const fetchImpl = (async (url: string, init: RequestInit) => {
      seenUrl = url;
      seenHeaders = init.headers as Record<string, string>;
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as unknown as typeof fetch;

    const result = await enableBankingRequest<{ ok: boolean }>("/sessions", {
      credentials,
      method: "POST",
      body: { code: "abc" },
      query: { date_from: "2026-01-01", ignored: null },
      fetchImpl,
    });

    expect(result).toEqual({ ok: true });
    expect(seenUrl).toBe("https://api.enablebanking.com/sessions?date_from=2026-01-01");
    expect(seenHeaders.Authorization).toMatch(/^Bearer /);
    expect(seenHeaders.Accept).toBe("application/json");
    expect(seenHeaders["Content-Type"]).toBe("application/json");
  });

  it("converts a timeout into a provider timeout error", async () => {
    const fetchImpl = (async (_url: string, init: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => {
          const error = new Error("aborted");
          error.name = "AbortError";
          reject(error);
        });
      });
    }) as unknown as typeof fetch;

    await expect(
      enableBankingRequest("/sessions", { credentials, timeoutMs: 10, fetchImpl }),
    ).rejects.toMatchObject({ code: "provider_timeout" });
  });

  it("treats a non JSON body as an invalid response", async () => {
    const fetchImpl = (async () =>
      new Response("<html>", { status: 200 })) as unknown as typeof fetch;
    await expect(
      enableBankingRequest("/sessions", { credentials, fetchImpl }),
    ).rejects.toMatchObject({ code: "provider_invalid_response" });
  });

  it("maps network failures to an unavailable provider", async () => {
    const fetchImpl = (async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;
    await expect(
      enableBankingRequest("/sessions", { credentials, fetchImpl }),
    ).rejects.toMatchObject({ code: "provider_unavailable" });
  });
});
