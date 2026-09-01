import { beforeEach, describe, expect, it, vi } from "vitest";
import { openBankingApi } from "./resources";

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
