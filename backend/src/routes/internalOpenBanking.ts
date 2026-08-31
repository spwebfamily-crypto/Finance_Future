import { Router } from "express";
import rateLimit from "express-rate-limit";
import { sendError } from "../middleware.js";
import { prisma } from "../prisma.js";
import { getOpenBankingConfig, isOpenBankingEnabled } from "../open-banking/config.js";
import { constantTimeEquals } from "../open-banking/crypto.js";
import { cleanupOpenBankingData, processDueConnections } from "../open-banking/syncService.js";
import { bankErrorMessages } from "../open-banking/errors.js";

const MAX_BATCH = 50;
const DEFAULT_BATCH = 10;

const internalLimiter = rateLimit({
  windowMs: 60_000,
  limit: 30,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  handler: (_request, response) =>
    sendError(
      response,
      429,
      "RATE_LIMITED",
      "Foram feitos demasiados pedidos. Aguarde alguns minutos e tente novamente.",
    ),
});

function authorized(request: { headers: Record<string, string | string[] | undefined> }) {
  const header = request.headers.authorization;
  const token = typeof header === "string" && header.startsWith("Bearer ") ? header.slice(7) : "";
  const expected = getOpenBankingConfig().cronSecret;
  if (!token || !expected) return false;
  return constantTimeEquals(token, expected);
}

const router = Router();

/**
 * Processa um lote de sincronizações agendadas. Não usa autenticação de
 * utilizador: apenas o segredo do agendamento, comparado em tempo constante.
 * A resposta só contém contagens, nunca dados bancários.
 */
router.post("/open-banking/sync-due", internalLimiter, async (request, response) => {
  if (!isOpenBankingEnabled()) {
    return sendError(
      response,
      403,
      "OPEN_BANKING_DISABLED",
      bankErrorMessages.OPEN_BANKING_DISABLED,
    );
  }
  if (!authorized(request)) {
    return sendError(response, 401, "UNAUTHORIZED", "Segredo de agendamento inválido.");
  }

  const requested = Number(request.query.limit ?? DEFAULT_BATCH);
  const limit = Number.isFinite(requested)
    ? Math.min(Math.max(Math.trunc(requested), 1), MAX_BATCH)
    : DEFAULT_BATCH;

  const result = await processDueConnections(limit);
  return response.json({ data: result });
});

/** Limpeza de tentativas expiradas e payloads de diagnóstico fora do prazo. */
router.post("/open-banking/cleanup", internalLimiter, async (request, response) => {
  if (!isOpenBankingEnabled()) {
    return sendError(
      response,
      403,
      "OPEN_BANKING_DISABLED",
      bankErrorMessages.OPEN_BANKING_DISABLED,
    );
  }
  if (!authorized(request)) {
    return sendError(response, 401, "UNAUTHORIZED", "Segredo de agendamento inválido.");
  }

  const requested = Number(request.query.retentionDays ?? 30);
  const retentionDays = Number.isFinite(requested)
    ? Math.min(Math.max(Math.trunc(requested), 1), 365)
    : 30;
  const result = await cleanupOpenBankingData(retentionDays);
  return response.json({ data: result });
});

/** Contagem agregada para observabilidade: sem qualquer dado bancário. */
router.get("/open-banking/stats", internalLimiter, async (request, response) => {
  if (!isOpenBankingEnabled()) {
    return sendError(
      response,
      403,
      "OPEN_BANKING_DISABLED",
      bankErrorMessages.OPEN_BANKING_DISABLED,
    );
  }
  if (!authorized(request)) {
    return sendError(response, 401, "UNAUTHORIZED", "Segredo de agendamento inválido.");
  }

  const [connections, queued, failed, due] = await Promise.all([
    prisma.bankConnection.count({ where: { status: "active" } }),
    prisma.bankSyncJob.count({ where: { status: { in: ["queued", "running"] } } }),
    prisma.bankSyncJob.count({ where: { status: "failed" } }),
    prisma.bankConnection.count({
      where: { status: "active", nextSyncAt: { lte: new Date() } },
    }),
  ]);

  return response.json({ data: { connections, queued, failed, due } });
});

export default router;
