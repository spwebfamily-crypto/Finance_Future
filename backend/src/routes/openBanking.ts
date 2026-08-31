import { Router, type Request, type Response } from "express";
import type { Prisma } from "@prisma/client";
import rateLimit from "express-rate-limit";
import { env } from "../config.js";
import { requireAuth, sendError } from "../middleware.js";
import { prisma } from "../prisma.js";
import type { AuthenticatedRequest } from "../types.js";
import {
  openBankingAuthorizationSchema,
  openBankingCallbackSchema,
  openBankingDisconnectSchema,
  openBankingInstitutionsSchema,
  openBankingReauthorizeSchema,
  openBankingTransactionFiltersSchema,
  openBankingTransactionReviewSchema,
} from "../validation.js";
import {
  buildFrontendRedirectUrl,
  getOpenBankingConfig,
  isOpenBankingEnabled,
  OPEN_BANKING_RETURN_PATH_DEFAULT,
} from "../open-banking/config.js";
import {
  consumeAuthorizationAttempt,
  createConnection,
  invalidateAuthorizationAttempt,
  startAuthorization,
} from "../open-banking/authorizationService.js";
import { bankError, sendProviderError } from "../open-banking/errors.js";
import { ProviderError } from "../open-banking/contracts.js";
import { sha256Hex } from "../open-banking/crypto.js";
import { FakeOpenBankingProvider } from "../open-banking/fakeOpenBankingProvider.js";
import { createOpenBankingProvider } from "../open-banking/providerFactory.js";
import { hasActiveJob, processSyncJob } from "../open-banking/syncService.js";
import { disconnectConnection, replaceSession } from "../open-banking/disconnectService.js";

/**
 * Open Banking está sempre atrás de feature flag. Com a flag desligada as rotas
 * respondem OPEN_BANKING_DISABLED e nada na aplicação muda: contas manuais,
 * dinheiro e importação CSV continuam exatamente iguais.
 */
export function requireOpenBankingEnabled(
  _request: unknown,
  response: Response,
  next: (error?: unknown) => void,
) {
  if (!isOpenBankingEnabled()) {
    return sendError(
      response,
      403,
      "OPEN_BANKING_DISABLED",
      "A ligação bancária está desativada neste momento.",
    );
  }
  return next();
}

const tooManyRequests = (response: Response) =>
  sendError(
    response,
    429,
    "RATE_LIMITED",
    "Foram feitos demasiados pedidos. Aguarde alguns minutos e tente novamente.",
  );

/** Limiter por utilizador autenticado (o global da API continua a aplicar-se). */
const authenticatedLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 60,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: (request) =>
    (request as AuthenticatedRequest).user?.id ?? request.ip ?? "anonymous",
  handler: (_request, response) => tooManyRequests(response),
});

/** O callback é público: o limite é mais estrito e feito por IP. */
const callbackLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 20,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  handler: (_request, response) => tooManyRequests(response),
});

function isSecureRequest(request: Request) {
  if (env.NODE_ENV !== "production") return true;
  const forwarded = request.headers["x-forwarded-proto"];
  const protocol = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  return request.secure || protocol?.split(",")[0]?.trim() === "https";
}

/** Códigos seguros devolvidos ao frontend; nunca incluem dados do provedor. */
const callbackReasons: Record<string, string> = {
  BANK_AUTH_STATE_INVALID: "invalid_state",
  BANK_AUTH_STATE_EXPIRED: "expired",
  BANK_AUTH_STATE_REPLAYED: "replayed",
  BANK_AUTHORIZATION_FAILED: "authorization_failed",
  BANK_INSTITUTION_NOT_FOUND: "institution_unavailable",
  BANK_PROVIDER_UNAVAILABLE: "provider_unavailable",
  BANK_PROVIDER_RATE_LIMITED: "rate_limited",
  BANK_PROVIDER_INVALID_RESPONSE: "provider_error",
};

function redirectToFrontend(
  response: Response,
  returnPath: string,
  outcome: "success" | "error",
  reason = "unexpected_error",
) {
  const url = new URL(buildFrontendRedirectUrl(returnPath));
  url.searchParams.set("bankConnection", outcome);
  if (outcome === "error") url.searchParams.set("reason", reason);
  response.set("Cache-Control", "no-store");
  response.set("Referrer-Policy", "no-referrer");
  return response.redirect(303, url.toString());
}

function errorCodeOf(error: unknown) {
  if (error instanceof ProviderError) {
    if (error.code === "provider_rate_limited") return "BANK_PROVIDER_RATE_LIMITED";
    if (error.code === "provider_timeout" || error.code === "provider_unavailable") {
      return "BANK_PROVIDER_UNAVAILABLE";
    }
    if (error.code === "consent_expired" || error.code === "consent_revoked") {
      return "BANK_AUTHORIZATION_FAILED";
    }
    return "BANK_PROVIDER_INVALID_RESPONSE";
  }
  if (error && typeof error === "object" && "code" in error) {
    return String((error as { code: unknown }).code);
  }
  return null;
}

const router = Router();
router.use(requireOpenBankingEnabled);

router.get(
  "/institutions",
  requireAuth,
  authenticatedLimiter,
  async (request: AuthenticatedRequest, response, next) => {
    try {
      const filters = openBankingInstitutionsSchema.parse(request.query);
      const provider = createOpenBankingProvider();
      const institutions = await provider.listInstitutions({
        country: filters.country,
        psuType: filters.psuType,
      });
      return response.json({ data: institutions });
    } catch (error) {
      if (error instanceof ProviderError)
        return sendProviderError(response, error, "authorization");
      return next(error);
    }
  },
);

router.post(
  "/authorizations",
  requireAuth,
  authenticatedLimiter,
  async (request: AuthenticatedRequest, response, next) => {
    try {
      const input = openBankingAuthorizationSchema.parse(request.body);
      const result = await startAuthorization({
        userId: request.user!.id,
        institutionId: input.institutionId,
        country: input.country,
        psuType: input.psuType,
        returnPath: input.returnPath,
      });
      return response.status(201).json({ data: result });
    } catch (error) {
      if (error instanceof ProviderError)
        return sendProviderError(response, error, "authorization");
      return next(error);
    }
  },
);

/**
 * Callback público chamado pelo banco/provedor depois da autorização. Não usa
 * `requireAuth` porque o browser não envia o token neste redirecionamento: a
 * validação é feita pelo `state`, que só existe como hash na base de dados.
 */
router.get("/callback", callbackLimiter, async (request, response, next) => {
  let returnPath = OPEN_BANKING_RETURN_PATH_DEFAULT;
  try {
    if (!isSecureRequest(request)) {
      return sendError(response, 400, "INSECURE_CALLBACK", "O callback do banco requer HTTPS.");
    }

    const query = openBankingCallbackSchema.parse(request.query);
    const attemptPreview = query.state
      ? await prisma.bankAuthorizationAttempt.findUnique({
          where: { stateHash: sha256Hex(query.state) },
          select: { returnPath: true },
        })
      : null;
    if (attemptPreview) returnPath = attemptPreview.returnPath;

    if (query.error) {
      await invalidateAuthorizationAttempt(query.state);
      const reason = query.error === "access_denied" ? "cancelled" : "authorization_failed";
      return redirectToFrontend(response, returnPath, "error", reason);
    }

    if (!query.code || !query.state) {
      return redirectToFrontend(response, returnPath, "error", "invalid_state");
    }

    const attempt = await consumeAuthorizationAttempt(query.state);
    returnPath = attempt.returnPath;

    const provider = createOpenBankingProvider();
    const session = await provider.exchangeAuthorizationCode(query.code);

    let connectionId = attempt.connectionId;
    if (connectionId) {
      // Renovação: substitui a sessão cifrada sem apagar contas nem movimentos.
      await replaceSession(connectionId, session.providerSessionId);
    } else {
      const connection = await createConnection(attempt, session);
      connectionId = connection.id;
    }

    const job = await prisma.bankSyncJob.create({
      data: {
        userId: attempt.userId,
        connectionId,
        trigger: attempt.connectionId ? "reauthorization" : "initial",
      },
      select: { id: true },
    });

    // A primeira sincronização arranca de imediato, fora do pedido: o
    // utilizador é reencaminhado sem esperar pelo banco.
    void processSyncJob(job.id).catch(() => undefined);

    return redirectToFrontend(response, returnPath, "success");
  } catch (error) {
    if (error instanceof ProviderError || errorCodeOf(error)) {
      const code = errorCodeOf(error) ?? "BANK_PROVIDER_INVALID_RESPONSE";
      return redirectToFrontend(
        response,
        returnPath,
        "error",
        callbackReasons[code] ?? "unexpected_error",
      );
    }
    return next(error);
  }
});

router.get(
  "/connections",
  requireAuth,
  authenticatedLimiter,
  async (request: AuthenticatedRequest, response, next) => {
    try {
      const connections = await prisma.bankConnection.findMany({
        where: { userId: request.user!.id },
        select: {
          id: true,
          institutionId: true,
          institutionName: true,
          institutionCountry: true,
          status: true,
          consentExpiresAt: true,
          lastSyncedAt: true,
          nextSyncAt: true,
          lastErrorCode: true,
          lastErrorAt: true,
          createdAt: true,
          accounts: {
            select: {
              id: true,
              accountId: true,
              displayName: true,
              maskedIban: true,
              currency: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
      });

      return response.json({
        data: connections.map((connection) => ({
          id: connection.id,
          institutionId: connection.institutionId,
          institutionName: connection.institutionName,
          institutionCountry: connection.institutionCountry,
          status: connection.status,
          consentExpiresAt: connection.consentExpiresAt,
          lastSyncedAt: connection.lastSyncedAt,
          nextSyncAt: connection.nextSyncAt,
          error: connection.lastErrorCode
            ? { code: connection.lastErrorCode, at: connection.lastErrorAt }
            : null,
          accountCount: connection.accounts.length,
          accounts: connection.accounts,
          createdAt: connection.createdAt,
        })),
      });
    } catch (error) {
      return next(error);
    }
  },
);

router.get(
  "/connections/:connectionId",
  requireAuth,
  authenticatedLimiter,
  async (request: AuthenticatedRequest, response, next) => {
    try {
      const connection = await prisma.bankConnection.findFirst({
        where: { id: request.params.connectionId, userId: request.user!.id },
        select: {
          id: true,
          institutionId: true,
          institutionName: true,
          institutionCountry: true,
          status: true,
          consentExpiresAt: true,
          lastSyncedAt: true,
          nextSyncAt: true,
          lastErrorCode: true,
          lastErrorAt: true,
          createdAt: true,
          accounts: {
            select: {
              id: true,
              accountId: true,
              displayName: true,
              maskedIban: true,
              currency: true,
              lastTransactionSyncAt: true,
              account: { select: { id: true, name: true, type: true, source: true } },
            },
          },
          syncJobs: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: {
              id: true,
              status: true,
              trigger: true,
              startedAt: true,
              finishedAt: true,
              transactionsCreated: true,
              transactionsUpdated: true,
              errorCode: true,
            },
          },
        },
      });
      if (!connection) throw bankError(404, "BANK_CONNECTION_NOT_FOUND");

      const { syncJobs, ...details } = connection;
      return response.json({
        data: {
          ...details,
          error: connection.lastErrorCode
            ? { code: connection.lastErrorCode, at: connection.lastErrorAt }
            : null,
          lastSyncJob: syncJobs[0] ?? null,
        },
      });
    } catch (error) {
      return next(error);
    }
  },
);

/**
 * Sincronização manual. Não executa no pedido: cria um job `queued` que é
 * processado pelo worker, garantindo que duas sincronizações da mesma ligação
 * nunca correm em paralelo.
 */
router.post(
  "/connections/:connectionId/sync",
  requireAuth,
  authenticatedLimiter,
  async (request: AuthenticatedRequest, response, next) => {
    try {
      const connection = await prisma.bankConnection.findFirst({
        where: { id: request.params.connectionId, userId: request.user!.id },
        select: { id: true, status: true, disconnectedAt: true },
      });
      if (!connection || connection.disconnectedAt) {
        throw bankError(404, "BANK_CONNECTION_NOT_FOUND");
      }
      if (connection.status === "revoked" || connection.status === "expired") {
        throw bankError(409, "BANK_CONNECTION_EXPIRED");
      }
      if (connection.status !== "active" && connection.status !== "reauth_required") {
        throw bankError(409, "BANK_CONNECTION_REAUTH_REQUIRED");
      }

      if (await hasActiveJob(connection.id)) throw bankError(409, "BANK_SYNC_IN_PROGRESS");

      const job = await prisma.bankSyncJob.create({
        data: {
          userId: request.user!.id,
          connectionId: connection.id,
          trigger: connection.status === "reauth_required" ? "reauthorization" : "manual",
        },
        select: { id: true, status: true },
      });

      // O job é processado de imediato quando não há outro em curso.
      void processSyncJob(job.id).catch(() => undefined);

      return response.status(202).json({ data: { jobId: job.id, status: job.status } });
    } catch (error) {
      return next(error);
    }
  },
);

router.get(
  "/sync-jobs/:jobId",
  requireAuth,
  authenticatedLimiter,
  async (request: AuthenticatedRequest, response, next) => {
    try {
      const job = await prisma.bankSyncJob.findFirst({
        where: { id: request.params.jobId, userId: request.user!.id },
        select: {
          id: true,
          connectionId: true,
          status: true,
          trigger: true,
          attemptCount: true,
          startedAt: true,
          finishedAt: true,
          accountsProcessed: true,
          transactionsCreated: true,
          transactionsUpdated: true,
          transactionsSkipped: true,
          errorCode: true,
          createdAt: true,
        },
      });
      if (!job) throw bankError(404, "BANK_SYNC_JOB_NOT_FOUND");
      return response.json({ data: job });
    } catch (error) {
      return next(error);
    }
  },
);

/**
 * Renova o consentimento sem apagar contas ou movimentos anteriores: cria uma
 * nova tentativa de autorização para a mesma instituição.
 */
router.post(
  "/connections/:connectionId/reauthorize",
  requireAuth,
  authenticatedLimiter,
  async (request: AuthenticatedRequest, response, next) => {
    try {
      const input = openBankingReauthorizeSchema.parse(request.body ?? {});
      const connection = await prisma.bankConnection.findFirst({
        where: { id: request.params.connectionId, userId: request.user!.id },
        select: { id: true, institutionId: true, institutionCountry: true, status: true },
      });
      if (!connection) throw bankError(404, "BANK_CONNECTION_NOT_FOUND");

      const result = await startAuthorization({
        userId: request.user!.id,
        institutionId: connection.institutionId,
        country: connection.institutionCountry || input.country,
        psuType: input.psuType,
        returnPath: input.returnPath,
        connectionId: connection.id,
      });

      return response.status(201).json({ data: result });
    } catch (error) {
      if (error instanceof ProviderError)
        return sendProviderError(response, error, "authorization");
      return next(error);
    }
  },
);

router.get(
  "/transactions",
  requireAuth,
  authenticatedLimiter,
  async (request: AuthenticatedRequest, response, next) => {
    try {
      const filters = openBankingTransactionFiltersSchema.parse(request.query);
      const where: Prisma.BankTransactionWhereInput = { userId: request.user!.id };
      const linkFilter: Prisma.BankAccountLinkWhereInput = {
        connection: { userId: request.user!.id },
      };
      if (filters.accountId) linkFilter.accountId = filters.accountId;
      if (filters.connectionId) linkFilter.connectionId = filters.connectionId;
      if (filters.accountId || filters.connectionId) where.bankAccountLink = linkFilter;
      if (filters.status) where.status = filters.status;
      if (filters.classification) where.classification = filters.classification;
      if (filters.from || filters.to) {
        where.bookingDate = {
          ...(filters.from ? { gte: new Date(`${filters.from}T00:00:00.000Z`) } : {}),
          ...(filters.to ? { lte: new Date(`${filters.to}T23:59:59.999Z`) } : {}),
        };
      }

      const [transactions, total] = await Promise.all([
        prisma.bankTransaction.findMany({
          where,
          orderBy: [{ bookingDate: "desc" }, { createdAt: "desc" }],
          skip: (filters.page - 1) * filters.pageSize,
          take: filters.pageSize,
          select: {
            id: true,
            status: true,
            direction: true,
            amount: true,
            currency: true,
            bookingDate: true,
            valueDate: true,
            transactionDate: true,
            description: true,
            counterpartyName: true,
            classification: true,
            excludedFromAnalytics: true,
            expenseId: true,
            incomeId: true,
            transferId: true,
            bankAccountLinkId: true,
            bankAccountLink: {
              select: {
                id: true,
                displayName: true,
                maskedIban: true,
                accountId: true,
                connectionId: true,
              },
            },
            expense: {
              select: {
                id: true,
                categoryId: true,
                category: { select: { id: true, name: true, icon: true } },
              },
            },
          },
        }),
        prisma.bankTransaction.count({ where }),
      ]);

      return response.json({
        data: transactions.map((transaction) => ({
          ...transaction,
          amount: transaction.amount.toDecimalPlaces(2).toNumber(),
          expense: transaction.expense
            ? { ...transaction.expense, category: transaction.expense.category }
            : null,
        })),
        meta: {
          page: filters.page,
          pageSize: filters.pageSize,
          total,
          pageCount: Math.max(1, Math.ceil(total / filters.pageSize)),
        },
      });
    } catch (error) {
      return next(error);
    }
  },
);

router.patch(
  "/transactions/:transactionId",
  requireAuth,
  authenticatedLimiter,
  async (request: AuthenticatedRequest, response, next) => {
    try {
      const input = openBankingTransactionReviewSchema.parse(request.body ?? {});
      const transaction = await prisma.bankTransaction.findFirst({
        where: { id: request.params.transactionId, userId: request.user!.id },
        select: {
          id: true,
          classification: true,
          expenseId: true,
          incomeId: true,
          transferId: true,
          bankAccountLink: { select: { accountId: true } },
        },
      });
      if (!transaction) throw bankError(404, "BANK_TRANSACTION_NOT_FOUND");

      if (input.classification === "internal_transfer") {
        // Só com transferência já emparelhada ou confirmação explícita.
        if (!transaction.transferId && !input.confirmInternalTransfer) {
          throw bankError(409, "BANK_TRANSFER_REVIEW_REQUIRED");
        }
      }

      if (input.categoryId) {
        const category = await prisma.category.findFirst({
          where: { id: input.categoryId, userId: request.user!.id },
          select: { id: true },
        });
        if (!category) throw bankError(404, "CATEGORY_NOT_FOUND");
      }

      const updated = await prisma.$transaction(async (client) => {
        if (input.categoryId && transaction.expenseId) {
          // A categoria da despesa é atualizada na mesma transação de base de dados.
          await client.expense.update({
            where: { id: transaction.expenseId },
            data: { categoryId: input.categoryId },
          });
        }

        return client.bankTransaction.update({
          where: { id: transaction.id },
          data: {
            ...(input.classification ? { classification: input.classification } : {}),
            ...(input.excludedFromAnalytics !== undefined
              ? { excludedFromAnalytics: input.excludedFromAnalytics }
              : {}),
          },
          select: {
            id: true,
            classification: true,
            excludedFromAnalytics: true,
            expense: { select: { id: true, categoryId: true } },
          },
        });
      });

      return response.json({ data: updated });
    } catch (error) {
      return next(error);
    }
  },
);

router.post(
  "/connections/:connectionId/disconnect",
  requireAuth,
  authenticatedLimiter,
  async (request: AuthenticatedRequest, response, next) => {
    try {
      const input = openBankingDisconnectSchema.parse(request.body ?? {});
      const result = await disconnectConnection(
        request.params.connectionId ?? "",
        request.user!.id,
        input.retention,
      );
      return response.json({ data: result });
    } catch (error) {
      return next(error);
    }
  },
);

/**
 * Simula o ambiente do banco nos testes E2E e no desenvolvimento.
 * Só existe quando o provedor configurado é o fake e o ambiente não é produção.
 */
router.get("/fake-authorize", async (request, response) => {
  if (env.NODE_ENV === "production" || getOpenBankingConfig().provider !== "fake") {
    return sendError(response, 404, "NOT_FOUND", "Rota não encontrada.");
  }

  const authorizationId =
    typeof request.query.authorizationId === "string" ? request.query.authorizationId : "";
  const provider = createOpenBankingProvider();
  if (!(provider instanceof FakeOpenBankingProvider) || !authorizationId) {
    return sendError(response, 400, "BANK_AUTHORIZATION_FAILED", "Pedido de autorização inválido.");
  }

  try {
    const { code, state } = provider.completeAuthorization(authorizationId);
    const callback = new URL(getOpenBankingConfig().callbackUrl);
    callback.searchParams.set("code", code);
    callback.searchParams.set("state", state);
    response.set("Cache-Control", "no-store");
    response.set("Referrer-Policy", "no-referrer");
    return response.redirect(303, callback.toString());
  } catch {
    return sendError(
      response,
      400,
      "BANK_AUTHORIZATION_FAILED",
      "O banco não confirmou a autorização. Tente novamente.",
    );
  }
});

export default router;
