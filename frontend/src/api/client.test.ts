import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiRequest, ApiError, REQUEST_TIMEOUT_MS, resolveApiUrl } from "./client";
import { clearSession, saveSession } from "./token-store";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("API client", () => {
  beforeEach(() => {
    clearSession();
  });

  it("rotates the refresh token and retries one unauthorized request", async () => {
    saveSession("expired-access", "valid-refresh");
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse({ error: { message: "expired" } }, 401))
      .mockResolvedValueOnce(
        jsonResponse({ accessToken: "fresh-access", refreshToken: "fresh-refresh" }),
      )
      .mockResolvedValueOnce(jsonResponse({ data: [{ id: "category-1" }] }));

    const payload = await apiRequest<{ data: Array<{ id: string }> }>("/categories");

    expect(payload.data[0]?.id).toBe("category-1");
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(new Headers(fetchMock.mock.calls[2]?.[1]?.headers).get("Authorization")).toBe(
      "Bearer fresh-access",
    );
    expect(window.localStorage.getItem("expensesnap.refresh-token")).toBe("fresh-refresh");
  });

  it("surfaces the structured API error", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      jsonResponse({ error: { code: "VALIDATION_ERROR", message: "Campo inválido" } }, 400),
    );

    await expect(
      apiRequest("/auth/login", { method: "POST", auth: false, body: {} }),
    ).rejects.toMatchObject({
      status: 400,
      code: "VALIDATION_ERROR",
      message: "Campo inválido",
    } satisfies Partial<ApiError>);
  });

  it("retries a GET once after 503", async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse({ error: { message: "indisponível" } }, 503))
      .mockResolvedValueOnce(jsonResponse({ data: [{ id: "category-1" }] }));

    const pending = apiRequest<{ data: Array<{ id: string }> }>("/categories");
    await vi.advanceTimersByTimeAsync(400);
    const payload = await pending;

    expect(payload.data[0]?.id).toBe("category-1");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it("does not retry a POST after 503", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse({ error: { message: "indisponível" } }, 503));

    await expect(
      apiRequest("/auth/login", { method: "POST", auth: false, body: {} }),
    ).rejects.toMatchObject({ status: 503 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("aborts after 20s with a Portuguese timeout message", async () => {
    vi.useFakeTimers();
    vi.spyOn(globalThis, "fetch").mockImplementation(
      (_input, init) =>
        new Promise((_, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("Aborted", "AbortError"));
          });
        }),
    );

    const pending = apiRequest("/categories", { auth: false });
    const expectation = expect(pending).rejects.toMatchObject({
      code: "TIMEOUT",
      message: "A API não respondeu a tempo. Verifique a ligação e tente novamente.",
    });
    await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS);
    await expectation;
    vi.useRealTimers();
  });

  it("requires VITE_API_URL in production and defaults to /api in development", () => {
    expect(resolveApiUrl(undefined, false)).toBe("/api");
    expect(resolveApiUrl(" https://api.example.com/api/ ", false)).toBe(
      "https://api.example.com/api",
    );
    expect(() => resolveApiUrl(undefined, true)).toThrow(/VITE_API_URL/);
  });
});
