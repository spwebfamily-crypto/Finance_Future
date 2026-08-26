import { describe, expect, it } from "vitest";
import { hashPassword, hashToken, verifyPassword } from "./auth.js";

describe("auth helpers", () => {
  it("uses a one-way bcrypt password hash", async () => {
    const hash = await hashPassword("Uma-password-segura");

    expect(hash).not.toContain("Uma-password-segura");
    expect(await verifyPassword("Uma-password-segura", hash)).toBe(true);
    expect(await verifyPassword("incorreta", hash)).toBe(false);
  });

  it("hashes refresh tokens deterministically without storing their value", () => {
    const first = hashToken("refresh-token");

    expect(first).toBe(hashToken("refresh-token"));
    expect(first).not.toBe("refresh-token");
    expect(first).toHaveLength(64);
  });
});
