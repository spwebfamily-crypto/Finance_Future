import type { Response } from "express";
import { ProviderError } from "./contracts.js";
import { ApiError, sendError } from "../middleware.js";

/**
 * Erros públicos de Open Banking. Os detalhes técnicos e os payloads do
 * provedor nunca chegam ao cliente: apenas estes códigos e mensagens em
 * português.
 */
export const bankErrorMessages = {
  OPEN_BANKING_DISABLED: "A ligação bancária está desativada neste momento.",
  BANK_AUTH_STATE_INVALID: "Não foi possível validar o pedido de ligação ao banco.",
  BANK_AUTH_STATE_EXPIRED: "O pedido de ligação ao banco expirou. Tente novamente.",
  BANK_AUTH_STATE_REPLAYED: "Este pedido de ligação ao banco já foi utilizado.",
  BANK_AUTHORIZATION_FAILED: "O banco não confirmou a autorização. Tente novamente.",
  BANK_INSTITUTION_NOT_FOUND:
    "Este banco não está disponível para o país ou tipo de conta indicados.",
  BANK_CONNECTION_NOT_FOUND: "Ligação bancária não encontrada.",
  BANK_CONNECTION_REAUTH_REQUIRED: "É necessário renovar o consentimento do banco.",
  BANK_CONNECTION_EXPIRED: "O consentimento do banco expirou.",
  BANK_SYNC_IN_PROGRESS: "Já existe uma sincronização em curso para esta ligação.",
  BANK_SYNC_JOB_NOT_FOUND: "Sincronização não encontrada.",
  BANK_PROVIDER_UNAVAILABLE: "O serviço do banco não está disponível. Tente novamente mais tarde.",
  BANK_PROVIDER_RATE_LIMITED: "Foram feitos demasiados pedidos ao banco. Aguarde alguns minutos.",
  BANK_PROVIDER_INVALID_RESPONSE: "O banco devolveu uma resposta inesperada.",
  BANK_LINKED_BALANCE_READ_ONLY:
    "O saldo de uma conta ligada ao banco não pode ser corrigido à mão.",
  BANK_LINKED_ACCOUNT_REQUIRES_DISCONNECT: "Desligue o banco antes de remover esta conta.",
  BANK_TRANSACTION_NOT_FOUND: "Movimento bancário não encontrado.",
  BANK_TRANSFER_REVIEW_REQUIRED:
    "Confirme a transferência entre contas próprias antes de a classificar.",
  CATEGORY_NOT_FOUND: "Categoria não encontrada.",
} as const;

export type BankErrorCode = keyof typeof bankErrorMessages;

export function bankError(status: number, code: BankErrorCode): ApiError {
  return new ApiError(status, code, bankErrorMessages[code]);
}

/**
 * Converte um erro do provedor na resposta pública correspondente.
 * `context` distingue autorização (ainda não há ligação) de sincronização
 * (já existe ligação que pode precisar de renovação).
 */
export function sendProviderError(
  response: Response,
  error: unknown,
  context: "authorization" | "connection" = "connection",
) {
  if (error instanceof ApiError) {
    return sendError(response, error.status, error.code, error.message, error.details);
  }
  if (!(error instanceof ProviderError)) throw error;

  switch (error.code) {
    case "provider_rate_limited":
      return sendError(
        response,
        429,
        "BANK_PROVIDER_RATE_LIMITED",
        bankErrorMessages.BANK_PROVIDER_RATE_LIMITED,
      );
    case "provider_timeout":
    case "provider_unavailable":
    case "unauthorized":
      return sendError(
        response,
        503,
        "BANK_PROVIDER_UNAVAILABLE",
        bankErrorMessages.BANK_PROVIDER_UNAVAILABLE,
      );
    case "consent_expired":
      return context === "authorization"
        ? sendError(
            response,
            400,
            "BANK_AUTHORIZATION_FAILED",
            bankErrorMessages.BANK_AUTHORIZATION_FAILED,
          )
        : sendError(
            response,
            409,
            "BANK_CONNECTION_EXPIRED",
            bankErrorMessages.BANK_CONNECTION_EXPIRED,
          );
    case "consent_revoked":
      return context === "authorization"
        ? sendError(
            response,
            400,
            "BANK_AUTHORIZATION_FAILED",
            bankErrorMessages.BANK_AUTHORIZATION_FAILED,
          )
        : sendError(
            response,
            409,
            "BANK_CONNECTION_REAUTH_REQUIRED",
            bankErrorMessages.BANK_CONNECTION_REAUTH_REQUIRED,
          );
    case "authorization_failed":
      return sendError(
        response,
        400,
        "BANK_AUTHORIZATION_FAILED",
        bankErrorMessages.BANK_AUTHORIZATION_FAILED,
      );
    default:
      return sendError(
        response,
        502,
        "BANK_PROVIDER_INVALID_RESPONSE",
        bankErrorMessages.BANK_PROVIDER_INVALID_RESPONSE,
      );
  }
}
