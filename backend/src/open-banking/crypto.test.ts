import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  DecryptionError,
  constantTimeEquals,
  decryptJson,
  decryptString,
  encryptJson,
  encryptString,
  hmacHex,
  maskIban,
  sha256Hex,
} from "./crypto.js";
import { installTestOpenBankingConfig } from "./testSupport.js";

installTestOpenBankingConfig();

const key = randomBytes(32);
const otherKey = randomBytes(32);

describe("open banking encryption at rest", () => {
  it("round-trips a value encrypted with AES-256-GCM", () => {
    const payload = encryptString("sessão-12345", key);

    expect(payload.split(".")).toHaveLength(4);
    expect(payload.startsWith("v1.")).toBe(true);
    expect(payload).not.toContain("sessão-12345");
    expect(decryptString(payload, key)).toBe("sessão-12345");
  });

  it("uses a fresh IV on every call", () => {
    expect(encryptString("mesmo-valor", key)).not.toBe(encryptString("mesmo-valor", key));
  });

  it("detects tampering in the ciphertext, tag or IV", () => {
    const payload = encryptString("PT50000201231234567890154", key);
    const [version, iv, tag, data] = payload.split(".");

    const tamperedData = Buffer.from(data, "base64url");
    tamperedData[0] = (tamperedData[0]! + 1) % 256;
    expect(() =>
      decryptString([version, iv, tag, tamperedData.toString("base64url")].join("."), key),
    ).toThrow(DecryptionError);

    const tamperedTag = Buffer.from(tag, "base64url");
    tamperedTag[0] = (tamperedTag[0]! + 1) % 256;
    expect(() =>
      decryptString([version, iv, tamperedTag.toString("base64url"), data].join("."), key),
    ).toThrow(DecryptionError);

    const tamperedIv = Buffer.from(iv, "base64url");
    tamperedIv[0] = (tamperedIv[0]! + 1) % 256;
    expect(() =>
      decryptString([version, tamperedIv.toString("base64url"), tag, data].join("."), key),
    ).toThrow(DecryptionError);
  });

  it("rejects a wrong key, a wrong version and a truncated envelope", () => {
    const payload = encryptString("valor", key);

    expect(() => decryptString(payload, otherKey)).toThrow(DecryptionError);
    expect(() => decryptString(payload.replace("v1.", "v2."), key)).toThrow(DecryptionError);
    expect(() => decryptString("v1.abc", key)).toThrow(DecryptionError);
    expect(() => decryptString("", key)).toThrow(DecryptionError);
  });

  it("encrypts and decrypts JSON payloads", () => {
    const payload = encryptJson({ sessionId: "abc", accounts: ["1", "2"] }, key);
    expect(decryptJson<{ sessionId: string; accounts: string[] }>(payload, key)).toEqual({
      sessionId: "abc",
      accounts: ["1", "2"],
    });
  });

  it("refuses to work without a 32 byte key", () => {
    expect(() => encryptString("valor", randomBytes(16))).toThrow();
    expect(() => encryptString("valor", Buffer.alloc(0))).toThrow();
  });
});

describe("open banking hashing helpers", () => {
  it("produces stable digests and never returns the input", () => {
    const hash = sha256Hex("state-aleatório");
    expect(hash).toBe(sha256Hex("state-aleatório"));
    expect(hash).not.toContain("state-aleatório");
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("produces different HMACs for different inputs", () => {
    expect(hmacHex("iban:PT50...")).not.toBe(hmacHex("iban:PT51..."));
    expect(hmacHex("iban:PT50...")).toMatch(/^[a-f0-9]{64}$/);
  });

  it("compares secrets in constant time", () => {
    expect(constantTimeEquals("abc", "abc")).toBe(true);
    expect(constantTimeEquals("abc", "abd")).toBe(false);
    expect(constantTimeEquals("abc", "abcd")).toBe(false);
    expect(constantTimeEquals("", "")).toBe(true);
  });
});

describe("iban masking", () => {
  it("keeps only the country, check digits and last four characters", () => {
    const masked = maskIban("PT50 0002 0123 1234 5678 9015 4");

    expect(masked).not.toBeNull();
    expect(masked).toContain("PT50");
    expect(masked?.endsWith("0154")).toBe(true);
    expect(masked).not.toContain("00020123");
    expect(masked?.replace(/\s/g, "")).toMatch(/^PT50\*+0154$/);
  });

  it("returns null for a missing IBAN and masks short values entirely", () => {
    expect(maskIban(null)).toBeNull();
    expect(maskIban(undefined)).toBeNull();
    expect(maskIban("")).toBeNull();
    expect(maskIban("PT50")).toBe("****");
  });
});
