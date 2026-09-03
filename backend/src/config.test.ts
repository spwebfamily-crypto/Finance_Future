import { afterEach, describe, expect, it, vi } from "vitest";

const originalEnv = { ...process.env };

async function loadEnv(overrides: Record<string, string | undefined>) {
  vi.resetModules();
  process.env = { ...originalEnv };
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  return import("./config.js");
}

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("environment config", () => {
  it("keeps the first FRONTEND_ORIGIN as canonical and exposes the full list", async () => {
    const { env } = await loadEnv({
      FRONTEND_ORIGIN:
        "https://app.example.com, https://www.example.com, https://preview.example.com",
    });

    expect(env.FRONTEND_ORIGIN).toBe("https://app.example.com");
    expect(env.FRONTEND_ORIGINS).toEqual([
      "https://app.example.com",
      "https://www.example.com",
      "https://preview.example.com",
    ]);
  });

  it("strips a trailing slash from each origin", async () => {
    const { env } = await loadEnv({
      FRONTEND_ORIGIN: "http://localhost:5173/",
    });

    expect(env.FRONTEND_ORIGIN).toBe("http://localhost:5173");
    expect(env.FRONTEND_ORIGINS).toEqual(["http://localhost:5173"]);
  });

  it("rejects JWT secrets that start with change-me in production", async () => {
    await expect(
      loadEnv({
        NODE_ENV: "production",
        JWT_ACCESS_SECRET: "change-me-access-secret-with-at-least-32-characters",
        JWT_REFRESH_SECRET: "a-real-refresh-secret-with-more-than-32-chars",
      }),
    ).rejects.toThrow(/change-me/);
  });

  it("allows change-me JWT secrets outside production", async () => {
    const { env } = await loadEnv({
      NODE_ENV: "development",
      JWT_ACCESS_SECRET: "change-me-access-secret-with-at-least-32-characters",
      JWT_REFRESH_SECRET: "change-me-refresh-secret-with-at-least-32-characters",
    });

    expect(env.JWT_ACCESS_SECRET.startsWith("change-me")).toBe(true);
  });
});
