import { randomBytes } from "node:crypto";
import type { BankAuthorizationAttempt, BankConnection } from "@prisma/client";
import { prisma } from "../prisma.js";
import { getOpenBankingConfig } from "./config.js";
import { decryptString, encryptString, sha256Hex } from "./crypto.js";
import { bankError } from "./errors.js";
import { createOpenBankingProvider } from "./providerFactory.js";
import type { ProviderSession } from "./contracts.js";

/** O state é aleatório, de uso único e só é guardado como hash. */
export const STATE_BYTES = 32;
export const STATE_TTL_MINUTES = 10;

export function generateState() {
  return randomBytes(STATE_BYTES).toString("base64url");
}

export interface StartAuthorizationInput {
  userId: string;
  institutionId: string;
  country: string;
  psuType: "personal" | "business";
  returnPath: string;
  /** Presente apenas numa renovação de consentimento. */
  connectionId?: string | null;
}

export interface AuthorizationStartResult {
  authorizationUrl: string;
  expiresAt: string;
  institutionName: string;
}

/**
 * Confirma que a instituição veio da lista do provedor antes de iniciar o
 * fluxo, cria o state e guarda apenas o respetivo hash.
 */
export async function startAuthorization(
  input: StartAuthorizationInput,
): Promise<AuthorizationStartResult> {
  const config = getOpenBankingConfig();
  const provider = createOpenBankingProvider();
  const institutions = await provider.listInstitutions({
    country: input.country,
    psuType: input.psuType,
  });
  const institution = institutions.find((item) => item.id === input.institutionId);
  if (!institution) throw bankError(400, "BANK_INSTITUTION_NOT_FOUND");

  const state = generateState();
  const expiresAt = new Date(Date.now() + STATE_TTL_MINUTES * 60_000);
  const result = await provider.startAuthorization({
    institutionId: institution.id,
    country: institution.country,
    psuType: input.psuType,
    state,
    redirectUrl: config.callbackUrl,
  });

  const attempt = await prisma.bankAuthorizationAttempt.create({
    data: {
      userId: input.userId,
      provider: config.provider,
      institutionId: institution.id,
      institutionName: institution.name,
      country: institution.country,
      psuType: input.psuType,
      stateHash: sha256Hex(state),
      providerAuthorizationId: result.providerAuthorizationId,
      connectionId: input.connectionId ?? null,
      returnPath: input.returnPath,
      expiresAt,
    },
  });

  return {
    authorizationUrl: result.authorizationUrl,
    expiresAt: attempt.expiresAt.toISOString(),
    institutionName: institution.name,
  };
}

/**
 * Consome um state de forma atómica. O `userId` vem do registo da tentativa e
 * nunca do navegador: o callback não confia em dados do cliente.
 */
export async function consumeAuthorizationAttempt(
  state: string,
): Promise<BankAuthorizationAttempt> {
  const attempt = await prisma.bankAuthorizationAttempt.findUnique({
    where: { stateHash: sha256Hex(state) },
  });
  if (!attempt) throw bankError(400, "BANK_AUTH_STATE_INVALID");
  if (attempt.usedAt) throw bankError(400, "BANK_AUTH_STATE_REPLAYED");
  if (attempt.expiresAt.getTime() <= Date.now()) throw bankError(400, "BANK_AUTH_STATE_EXPIRED");

  const claimed = await prisma.bankAuthorizationAttempt.updateMany({
    where: { id: attempt.id, usedAt: null },
    data: { usedAt: new Date() },
  });
  if (claimed.count === 0) throw bankError(400, "BANK_AUTH_STATE_REPLAYED");

  return attempt;
}

/** Marca uma tentativa como usada quando o banco devolve erro ou cancelamento. */
export async function invalidateAuthorizationAttempt(state: string | undefined) {
  if (!state) return;
  await prisma.bankAuthorizationAttempt.updateMany({
    where: { stateHash: sha256Hex(state), usedAt: null },
    data: { usedAt: new Date() },
  });
}

function parseDate(value: string | null): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export async function createConnection(
  attempt: BankAuthorizationAttempt,
  session: ProviderSession,
): Promise<BankConnection> {
  const { syncIntervalMinutes } = getOpenBankingConfig();
  return prisma.bankConnection.create({
    data: {
      userId: attempt.userId,
      provider: attempt.provider,
      // O identificador da sessão só é guardado cifrado.
      providerSessionCiphertext: encryptString(session.providerSessionId),
      institutionId: session.institutionId || attempt.institutionId,
      institutionName: session.institutionName || attempt.institutionName,
      institutionCountry: session.institutionCountry || attempt.country,
      status: "active",
      consentExpiresAt: parseDate(session.consentExpiresAt),
      nextSyncAt: new Date(Date.now() + syncIntervalMinutes * 60_000),
    },
  });
}

/** Desencripta o identificador da sessão apenas em memória. */
export function decryptSessionId(connection: { providerSessionCiphertext: string }): string {
  try {
    return decryptString(connection.providerSessionCiphertext);
  } catch {
    throw bankError(409, "BANK_CONNECTION_REAUTH_REQUIRED");
  }
}
