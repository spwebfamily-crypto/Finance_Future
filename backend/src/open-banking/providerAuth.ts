import { createSign } from "node:crypto";
import { ProviderError, type ProviderErrorCode } from "./contracts.js";

export const ENABLE_BANKING_BASE_URL = "https://api.enablebanking.com";
/** A documentação fixa o TTL máximo do JWT da aplicação em 24 h; 5 min é suficiente. */
export const ENABLE_BANKING_JWT_TTL_SECONDS = 300;
const DEFAULT_TIMEOUT_MS = 15_000;

export interface EnableBankingCredentials {
  appId: string;
  /** PEM da chave privada RSA, usada apenas no backend. */
  privateKey: string;
}

function base64url(value: string | Buffer) {
  return Buffer.from(value).toString("base64url");
}

/**
 * JWT da aplicação: RS256, `kid` = application id, `iss` = enablebanking.com e
 * `aud` = api.enablebanking.com, como exigido pela documentação.
 */
export function createEnableBankingJwt(
  credentials: EnableBankingCredentials,
  now: Date = new Date(),
): string {
  const issuedAt = Math.floor(now.getTime() / 1000);
  const header = { typ: "JWT", alg: "RS256", kid: credentials.appId };
  const payload = {
    iss: "enablebanking.com",
    aud: "api.enablebanking.com",
    iat: issuedAt,
    exp: issuedAt + ENABLE_BANKING_JWT_TTL_SECONDS,
  };
  const data = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
  const signature = createSign("RSA-SHA256").update(data).sign(credentials.privateKey, "base64url");
  return `${data}.${signature}`;
}

interface EnableBankingErrorBody {
  message?: unknown;
  error?: unknown;
}

const permanentConsentErrors = new Set([
  "EXPIRED_SESSION",
  "CLOSED_SESSION",
  "SESSION_DOES_NOT_EXIST",
  "REVOKED_SESSION",
]);
const authorizationErrors = new Set([
  "WRONG_AUTHORIZATION_CODE",
  "EXPIRED_AUTHORIZATION_CODE",
  "ALREADY_AUTHORIZED",
  "ACCESS_DENIED",
  "WRONG_ASPSP_PROVIDED",
  "NO_ACCOUNTS_ADDED",
  "WRONG_CREDENTIALS_PROVIDED",
]);

/**
 * Traduz a resposta de erro do provedor num código interno. O `message` do
 * provedor nunca é propagado nem registado: pode conter dados do PSU.
 */
export function mapEnableBankingError(status: number, body: unknown): ProviderError {
  const errorBody = (body ?? {}) as EnableBankingErrorBody;
  const providerCode = typeof errorBody.error === "string" ? errorBody.error : null;

  if (providerCode && permanentConsentErrors.has(providerCode)) {
    return new ProviderError(
      providerCode === "REVOKED_SESSION" ? "consent_revoked" : "consent_expired",
      status,
      providerCode,
    );
  }
  if (providerCode && authorizationErrors.has(providerCode)) {
    return new ProviderError("authorization_failed", status, providerCode);
  }
  if (providerCode === "ASPSP_RATE_LIMIT_EXCEEDED") {
    return new ProviderError("provider_rate_limited", status, providerCode);
  }
  if (providerCode === "ASPSP_TIMEOUT") {
    return new ProviderError("provider_timeout", status, providerCode);
  }
  if (providerCode === "UNAUTHORIZED_ACCESS" || providerCode === "UNAUTHORIZED_IP") {
    return new ProviderError("unauthorized", status, providerCode);
  }
  if (status === 401 || status === 403) {
    return new ProviderError("unauthorized", status, providerCode);
  }
  if (status === 408 || status === 504) {
    return new ProviderError("provider_timeout", status, providerCode);
  }
  if (status === 429) {
    return new ProviderError("provider_rate_limited", status, providerCode);
  }
  if (status >= 500) {
    return new ProviderError("provider_unavailable", status, providerCode);
  }
  if (status >= 400) {
    return new ProviderError("invalid_request", status, providerCode);
  }
  return new ProviderError("provider_invalid_response", status, providerCode);
}

export interface EnableBankingRequestOptions {
  credentials: EnableBankingCredentials;
  method?: "GET" | "POST" | "DELETE";
  body?: unknown;
  query?: Record<string, string | null | undefined>;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export async function enableBankingRequest<T>(
  path: string,
  options: EnableBankingRequestOptions,
): Promise<T> {
  const {
    credentials,
    method = "GET",
    body,
    query,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    fetchImpl = fetch,
  } = options;

  const url = new URL(`${ENABLE_BANKING_BASE_URL}${path}`);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, value);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const headers: Record<string, string> = {
    Accept: "application/json",
    Authorization: `Bearer ${createEnableBankingJwt(credentials)}`,
  };
  if (body !== undefined) headers["Content-Type"] = "application/json";

  try {
    const response = await fetchImpl(url.toString(), {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });

    const text = await response.text();
    let parsed: unknown = null;
    if (text) {
      try {
        parsed = JSON.parse(text) as unknown;
      } catch {
        throw new ProviderError("provider_invalid_response", response.status);
      }
    }

    if (!response.ok) {
      const debugCode =
        parsed && typeof parsed === "object" && "error" in parsed
          ? (parsed as { error?: unknown }).error
          : null;
      console.error("[Enable Banking debug]", path, response.status, debugCode);
      throw mapEnableBankingError(response.status, parsed);
    }
    return parsed as T;
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new ProviderError("provider_timeout");
    }
    throw new ProviderError("provider_unavailable");
  } finally {
    clearTimeout(timeout);
  }
}

export type { ProviderErrorCode };
