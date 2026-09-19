import type { ApiErrorCode, ApiErrorPayload, RefreshResponse } from "../types";
import {
  clearSession,
  getAccessToken,
  getRefreshToken,
  getStoredUser,
  saveSession,
} from "./token-store";
import { cacheGet, cacheSet, clearOfflineCache } from "./offline-cache";

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
  readonly code?: ApiErrorCode | string;
  readonly details?: unknown;

  constructor(message: string, status: number, code?: ApiErrorCode | string, details?: unknown) {
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
  // Aggregate reads are user-private snapshots. Any successful authenticated
  // mutation (including a confirmed bank review) invalidates them together.
  if (auth && method !== "GET") clearOfflineCache(getStoredUser());
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
  const fallback =
    error instanceof Error ? error.message : "Ocorreu um erro inesperado. Tente novamente.";
  const code = error instanceof ApiError ? error.code : undefined;
  return code
    ? localizedErrorMessage(code, document.documentElement.lang || "pt-PT", fallback)
    : fallback;
}

const errorMessages: Record<string, Record<string, string>> = {
  "pt-PT": {
    TIMEOUT: "A API não respondeu a tempo. Verifique a ligação e tente novamente.",
    NETWORK_ERROR: "Não foi possível ligar ao servidor. Verifique a ligação e tente novamente.",
    SESSION_EXPIRED: "A sua sessão terminou. Inicie sessão novamente.",
    UNAUTHORIZED: "Não tem autorização para executar esta ação.",
    NOT_FOUND: "O recurso pedido não foi encontrado.",
    VALIDATION_ERROR: "Existem campos inválidos. Reveja os dados e tente novamente.",
    CONFLICT: "Já existe um registo com estes dados.",
    RESOURCE_IN_USE: "Este registo está em utilização e não pode ser eliminado.",
    INVALID_RECEIPT: "Não foi possível processar o comprovativo.",
    BANK_EXPENSE_REVIEW_RATE_LIMITED:
      "Pode confirmar até 10 despesas a cada 3 minutos. Aguarde antes de continuar.",
    INTERNAL_ERROR: "Ocorreu um erro inesperado. Tente novamente.",
  },
  "en-GB": {
    TIMEOUT: "The API took too long to respond. Check your connection and try again.",
    NETWORK_ERROR: "Could not reach the server. Check your connection and try again.",
    SESSION_EXPIRED: "Your session has ended. Please sign in again.",
    UNAUTHORIZED: "You are not authorised to perform this action.",
    NOT_FOUND: "The requested resource was not found.",
    VALIDATION_ERROR: "Some fields are invalid. Review the data and try again.",
    CONFLICT: "A record with these details already exists.",
    RESOURCE_IN_USE: "This record is in use and cannot be deleted.",
    INVALID_RECEIPT: "The receipt could not be processed.",
    BANK_EXPENSE_REVIEW_RATE_LIMITED:
      "You can confirm up to 10 expenses every 3 minutes. Wait before continuing.",
    INTERNAL_ERROR: "An unexpected error occurred. Please try again.",
  },
  "es-ES": {
    TIMEOUT: "La API tardó demasiado en responder. Comprueba la conexión e inténtalo de nuevo.",
    NETWORK_ERROR: "No se pudo conectar al servidor. Comprueba la conexión e inténtalo de nuevo.",
    SESSION_EXPIRED: "Tu sesión ha terminado. Inicia sesión de nuevo.",
    UNAUTHORIZED: "No tienes autorización para realizar esta acción.",
    NOT_FOUND: "No se encontró el recurso solicitado.",
    VALIDATION_ERROR: "Hay campos no válidos. Revisa los datos e inténtalo de nuevo.",
    CONFLICT: "Ya existe un registro con estos datos.",
    RESOURCE_IN_USE: "Este registro está en uso y no se puede eliminar.",
    INVALID_RECEIPT: "No se pudo procesar el comprobante.",
    BANK_EXPENSE_REVIEW_RATE_LIMITED:
      "Puedes confirmar hasta 10 gastos cada 3 minutos. Espera antes de continuar.",
    INTERNAL_ERROR: "Ocurrió un error inesperado. Inténtalo de nuevo.",
  },
};

export function localizedErrorMessage(code: string, locale: string, fallback: string) {
  return errorMessages[locale]?.[code] ?? errorMessages["pt-PT"]?.[code] ?? fallback;
}
