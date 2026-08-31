import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { getOpenBankingConfig } from "./config.js";

const ENVELOPE_VERSION = "v1";
const IV_BYTES = 12;
const KEY_BYTES = 32;

export class DecryptionError extends Error {
  constructor() {
    super("Não foi possível desencriptar o dado guardado.");
    this.name = "DecryptionError";
  }
}

function dataKey(): Buffer {
  const { dataKey } = getOpenBankingConfig();
  if (dataKey.length !== KEY_BYTES) {
    throw new Error("Chave de cifragem de Open Banking indisponível.");
  }
  return dataKey;
}

/**
 * Cifra com AES-256-GCM: IV aleatório por mensagem e authentication tag
 * verificada na leitura. O envelope tem versão para permitir rotação de chaves.
 */
export function encryptString(plaintext: string, key: Buffer = dataKey()): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return [
    ENVELOPE_VERSION,
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".");
}

export function decryptString(payload: string, key: Buffer = dataKey()): string {
  const [version, ivPart, tagPart, dataPart] = payload.split(".");
  if (version !== ENVELOPE_VERSION || !ivPart || !tagPart || !dataPart) throw new DecryptionError();
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivPart, "base64url"));
    decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(dataPart, "base64url")),
      decipher.final(),
    ]);
    return plaintext.toString("utf8");
  } catch {
    // Ciphertext adulterado, chave errada ou envelope corrompido.
    throw new DecryptionError();
  }
}

export function encryptJson(value: unknown, key: Buffer = dataKey()): string {
  return encryptString(JSON.stringify(value), key);
}

export function decryptJson<T>(payload: string, key: Buffer = dataKey()): T {
  return JSON.parse(decryptString(payload, key)) as T;
}

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

/** HMAC estável para identificadores e chaves de deduplicação. */
export function hmacHex(value: string, key: Buffer = dataKey()): string {
  return createHmac("sha256", key).update(value, "utf8").digest("hex");
}

export function constantTimeEquals(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}

export function normalizeIban(value: string): string {
  return value.replace(/[\s-]/g, "").toUpperCase();
}

/**
 * Máscara de apresentação. O IBAN completo nunca é guardado nem devolvido:
 * fica apenas o país, os dígitos de controlo e os últimos 4 caracteres.
 */
export function maskIban(value: string | null | undefined): string | null {
  if (!value) return null;
  const iban = normalizeIban(value);
  if (iban.length < 8) return "*".repeat(iban.length);
  const head = iban.slice(0, 4);
  const tail = iban.slice(-4);
  const groups = Math.min(4, Math.max(1, Math.round((iban.length - 8) / 4)));
  return `${head} ${Array.from({ length: groups }, () => "****").join(" ")} ${tail}`;
}
