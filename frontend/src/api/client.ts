import type { ApiErrorPayload, RefreshResponse } from "../types";
import {
  clearSession,
  getAccessToken,
  getRefreshToken,
  getStoredUser,
  saveSession,
} from "./token-store";
import { cacheGet, cacheSet } from "./offline-cache";

export const REQUEST_TIMEOUT_MS = 20_000;
const TRANSIENT_RETRY_DELAY_MS = 400;
const TIMEOUT_MESSAGE = "A API não respondeu a tempo. Verifique a ligação e tente novamente.";

export function resolveApiUrl(viteApiUrl: string | undefined, isProd: boolean) {
  const configured = viteApiUrl?.trim().replace(/\/$/, "");
  if (configured) return configured;
  if (isProd) {
    throw new Error(
      "VITE_API_URL é obrigatório em produção. Defina a URL absoluta da API no Render.",
    );
  }
  return "/api";
}

export const API_URL = resolveApiUrl(import.meta.env.VITE_API_URL, import.meta.env.PROD);

export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly details?: unknown;

  constructor(message: string, status: number, code?: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

let refreshPromise: Promise<string> | null = null;

async function parseResponse(response: Response) {
  if (response.status === 204) return null;
  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function buildError(payload: unknown, status: number) {
  const body = (payload && typeof payload === "object" ? payload : {}) as ApiErrorPayload;
  return new ApiError(
    body.error?.message || body.message || "Não foi possível concluir o pedido.",
    status,
    body.error?.code,
    body.error?.details,
  );
}

function isTransientStatus(status: number) {
  return status === 429 || status === 502 || status === 503;
}

function wait(ms: number) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function createTimeout(existing?: AbortSignal | null) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const onAbort = () => controller.abort();
  existing?.addEventListener("abort", onAbort);
  if (existing?.aborted) controller.abort();
  return {
    signal: controller.signal,
    didTimeout: () => controller.signal.aborted && !existing?.aborted,
    cleanup: () => {
      window.clearTimeout(timeoutId);
      existing?.removeEventListener("abort", onAbort);
    },
  };
}

async function fetchWithTimeout(url: string, init: RequestInit = {}) {
  const timeout = createTimeout(init.signal);
  try {
    return await fetch(url, { ...init, signal: timeout.signal });
  } catch (error) {
    if (timeout.didTimeout()) {
      throw new ApiError(TIMEOUT_MESSAGE, 0, "TIMEOUT");
    }
    throw error;
  } finally {
    timeout.cleanup();
  }
}

export async function refreshAccessToken() {
  if (refreshPromise) return refreshPromise;

  const refreshToken = getRefreshToken();
  if (!refreshToken) throw new ApiError("A sua sessão terminou.", 401, "SESSION_EXPIRED");

  refreshPromise = (async () => {
    const response = await fetchWithTimeout(`${API_URL}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ refreshToken }),
    });
    const payload = await parseResponse(response);

    if (!response.ok) {
      clearSession();
      window.dispatchEvent(new Event("expensesnap:session-expired"));
      throw buildError(payload, response.status);
    }

    const tokens = payload as RefreshResponse;
    saveSession(tokens.accessToken, tokens.refreshToken);
    return tokens.accessToken;
  })().finally(() => {
    refreshPromise = null;
  });

  return refreshPromise;
}

interface RequestOptions extends Omit<RequestInit, "body"> {
  body?: BodyInit | Record<string, unknown> | null;
  auth?: boolean;
  retryOnUnauthorized?: boolean;
  retryOnTransient?: boolean;
  cacheResponse?: boolean;
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const {
    auth = true,
    retryOnUnauthorized = true,
    retryOnTransient = true,
    cacheResponse = true,
    headers: suppliedHeaders,
    body,
    ...requestInit
  } = options;
  const headers = new Headers(suppliedHeaders);
  headers.set("Accept", "application/json");

  const isFormData = body instanceof FormData;
  if (body && !isFormData && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const token = auth ? getAccessToken() : null;
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const method = (requestInit.method || "GET").toUpperCase();

  let response: Response;
  try {
    response = await fetchWithTimeout(`${API_URL}${path}`, {
      ...requestInit,
      headers,
      body: body == null || isFormData || typeof body === "string" ? body : JSON.stringify(body),
    });
  } catch (error) {
    if (auth && cacheResponse && method === "GET") {
      const cached = cacheGet<T>(getStoredUser(), path);
      if (cached !== null) return cached;
    }
    throw error;
  }

  if (response.status === 401 && auth && retryOnUnauthorized && getRefreshToken()) {
    const nextToken = await refreshAccessToken();
    headers.set("Authorization", `Bearer ${nextToken}`);
    return apiRequest<T>(path, {
      ...requestInit,
      headers,
      body,
      auth,
      retryOnUnauthorized: false,
      retryOnTransient,
      cacheResponse,
    });
  }

  if (method === "GET" && retryOnTransient && isTransientStatus(response.status)) {
    await wait(TRANSIENT_RETRY_DELAY_MS);
    return apiRequest<T>(path, {
      ...requestInit,
      headers,
      body,
      auth,
      retryOnUnauthorized,
      retryOnTransient: false,
      cacheResponse,
    });
  }

  const payload = await parseResponse(response);
  if (!response.ok) throw buildError(payload, response.status);
  if (auth && cacheResponse && method === "GET") cacheSet(getStoredUser(), path, payload);
  return payload as T;
}

/** Fetches a protected binary resource and refreshes the access token once if needed. */
export async function apiBlobRequest(
  path: string,
  options: Omit<RequestOptions, "body" | "cacheResponse"> = {},
): Promise<Blob> {
  const {
    auth = true,
    retryOnUnauthorized = true,
    retryOnTransient = true,
    headers: suppliedHeaders,
    ...requestInit
  } = options;
  const headers = new Headers(suppliedHeaders);
  const token = auth ? getAccessToken() : null;
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const method = (requestInit.method || "GET").toUpperCase();

  // API responses use /api/... URLs, while API_URL already includes that prefix.
  const requestPath = path.startsWith("/api/") ? path.slice(4) : path;
  const response = await fetchWithTimeout(`${API_URL}${requestPath}`, { ...requestInit, headers });
  if (response.status === 401 && auth && retryOnUnauthorized && getRefreshToken()) {
    const nextToken = await refreshAccessToken();
    headers.set("Authorization", `Bearer ${nextToken}`);
    return apiBlobRequest(path, {
      ...requestInit,
      headers,
      auth,
      retryOnUnauthorized: false,
      retryOnTransient,
    });
  }
  if (method === "GET" && retryOnTransient && isTransientStatus(response.status)) {
    await wait(TRANSIENT_RETRY_DELAY_MS);
    return apiBlobRequest(path, {
      ...requestInit,
      headers,
      auth,
      retryOnUnauthorized,
      retryOnTransient: false,
    });
  }
  if (!response.ok) throw buildError(await parseResponse(response), response.status);
  return response.blob();
}

export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Ocorreu um erro inesperado. Tente novamente.";
}
