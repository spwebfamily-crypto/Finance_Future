import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  $queryRaw: vi.fn(),
}));

vi.mock("./prisma.js", () => ({
  prisma: prismaMock,
}));

const { app } = await import("./app.js");

describe("GET /api/health", () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    await new Promise<void>((resolve) => {
      server = app.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  });

  beforeEach(() => {
    prismaMock.$queryRaw.mockReset().mockResolvedValue([{ "?column?": 1 }]);
  });

  it("returns ok when Postgres answers SELECT 1", async () => {
    const response = await fetch(`${baseUrl}/api/health`);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ data: { status: "ok" } });
    expect(prismaMock.$queryRaw).toHaveBeenCalled();
  });

  it("returns 503 when the database is down", async () => {
    prismaMock.$queryRaw.mockRejectedValue(new Error("connect ECONNREFUSED"));

    const response = await fetch(`${baseUrl}/api/health`);
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toEqual({ data: { status: "unavailable" } });
  });
});
