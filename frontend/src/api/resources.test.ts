import { beforeEach, describe, expect, it, vi } from "vitest";
import { authApi, openBankingApi } from "./resources";

describe("Open Banking resource requests", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("includes the connection country when renewing consent", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            authorizationUrl: "https://bank.example/authorize",
            expiresAt: "2026-09-01T00:00:00.000Z",
            institutionName: "Banco",
          },
        }),
        { status: 201, headers: { "Content-Type": "application/json" } },
      ),
    );

    await openBankingApi.reauthorize("connection-1", "personal", "ES");

    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      country: "ES",
      psuType: "personal",
      returnPath: "/accounts/connections",
    });
  });
});

describe("password reset resource requests", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("unwraps { data: { ok: true } } from forgot-password", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ data: { ok: true } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(authApi.forgotPassword("  Nome@Exemplo.pt ")).resolves.toEqual({ ok: true });
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      email: "nome@exemplo.pt",
    });
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("/auth/forgot-password");
  });

  it("unwraps { data: { ok: true } } from reset-password", async () => {
    const token = "a".repeat(64);
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ data: { ok: true } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(authApi.resetPassword(token, "nova-passe-segura")).resolves.toEqual({ ok: true });
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      token,
      password: "nova-passe-segura",
    });
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("/auth/reset-password");
  });
});
