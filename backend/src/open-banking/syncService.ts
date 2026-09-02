import { Prisma } from "@prisma/client";
import type { BankAccountLink, BankConnection, BankSyncJob, BankTransaction } from "@prisma/client";
import { prisma } from "../prisma.js";
import { getOpenBankingConfig } from "./config.js";
import { encryptString } from "./crypto.js";
import { dedupeKeyFromTransaction, findPendingCandidate } from "./dedupe.js";
import { ProviderError } from "./contracts.js";
import type {
  OpenBankingProvider,
  ProviderAccount,
  ProviderBalance,
  ProviderTransaction,
  ProviderSession,
} from "./contracts.js";
import { createOpenBankingProvider } from "./providerFactory.js";
import { decryptSessionId } from "./authorizationService.js";
import { materializeBookedTransactions, type MaterializationCounters } from "./materialize.js";
import { matchInternalTransfers, type TransferMatchResult } from "./transferMatcher.js";

const MAX_PAGES_PER_ACCOUNT = 100;
const MAX_ACCOUNTS_PER_SYNC = 25;
const RETRY_BACKOFF_MINUTES = [15, 60, 240];

export interface SyncCounters {
  accountsProcessed: number;
  transactionsCreated: number;
  transactionsUpdated: number;
  transactionsSkipped: number;
}

export type JobOutcome = "completed" | "partial" | "failed";

export interface DueBatchResult {
  claimed: number;
  completed: number;
  failed: number;
  accountsProcessed: number;
  transactionsCreated: number;
  transactionsUpdated: number;
}

interface SyncOutcome extends SyncCounters {
  status: JobOutcome;
  errorCode?: string | null;
  materialization?: MaterializationCounters;
  transfers?: TransferMatchResult;
}

/**
 * Reclama um job de forma atómica: dois processos nunca ficam com o mesmo job.
 * Devolve `null` quando o job já foi reclamado por outro worker.
 */
export async function claimSyncJob(jobId: string): Promise<BankSyncJob | null> {
  const claimed = await prisma.bankSyncJob.updateMany({
    where: { id: jobId, status: "queued" },
    data: { status: "running", startedAt: new Date(), attemptCount: { increment: 1 } },
  });
  if (claimed.count === 0) return null;

  return prisma.bankSyncJob.findUnique({ where: { id: jobId } });
}

/** Ligações com sincronização agendada em atraso, para o processo de cron. */
export async function findDueConnectionIds(limit: number): Promise<string[]> {
  const connections = await prisma.bankConnection.findMany({
    where: {
      status: "active",
      disconnectedAt: null,
      nextSyncAt: { lte: new Date() },
    },
    select: { id: true },
    orderBy: { nextSyncAt: "asc" },
    take: limit,
  });
  return connections.map((connection) => connection.id);
}

/**
 * Reserva atómica de uma ligação para sincronização: devolve `false` quando
 * outro processo já a reclamou (ou ela deixou de estar em atraso).
 */
export async function claimConnection(connectionId: string, leaseMinutes = 15): Promise<boolean> {
  const claimed = await prisma.bankConnection.updateMany({
    where: {
      id: connectionId,
      status: "active",
      disconnectedAt: null,
      nextSyncAt: { lte: new Date() },
    },
    data: { nextSyncAt: new Date(Date.now() + leaseMinutes * 60_000) },
  });
  return claimed.count === 1;
}

/**
 * Processa um lote de ligações em atraso. Usado pelo cron e pelo comando CLI:
 * nunca devolve dados bancários, apenas contagens.
 */
export async function processDueConnections(limit: number): Promise<DueBatchResult> {
  const result: DueBatchResult = {
    claimed: 0,
    completed: 0,
    failed: 0,
    accountsProcessed: 0,
    transactionsCreated: 0,
    transactionsUpdated: 0,
  };

  const connectionIds = await findDueConnectionIds(limit);
  for (const connectionId of connectionIds) {
    if (!(await claimConnection(connectionId))) continue;
    result.claimed += 1;

    const job = await prisma.bankSyncJob.create({
      data: { userId: await ownerOfConnection(connectionId), connectionId, trigger: "scheduled" },
      select: { id: true },
    });

    const outcome = await processSyncJob(job.id);
    if (!outcome) continue;

    result.accountsProcessed += outcome.accountsProcessed;
    result.transactionsCreated += outcome.transactionsCreated;
    result.transactionsUpdated += outcome.transactionsUpdated;
    if (outcome.status === "completed") result.completed += 1;
    if (outcome.status === "failed") result.failed += 1;
  }

  return result;
}

async function ownerOfConnection(connectionId: string): Promise<string> {
  const connection = await prisma.bankConnection.findUnique({
    where: { id: connectionId },
    select: { userId: true },
  });
  return connection?.userId ?? "";
}

/**
 * Retenção: apaga tentativas de autorização antigas e limpa payloads de
 * diagnóstico fora do prazo. Nunca toca em movimentos nem em registos manuais.
 */
export async function cleanupOpenBankingData(retentionDays = 30): Promise<{
  attemptsDeleted: number;
  rawPayloadsCleared: number;
}> {
  const threshold = new Date(Date.now() - retentionDays * 86_400_000);
  const attempts = await prisma.bankAuthorizationAttempt.deleteMany({
    where: { OR: [{ expiresAt: { lt: threshold } }, { usedAt: { lt: threshold } }] },
  });
  const payloads = await prisma.bankTransaction.updateMany({
    where: { lastSeenAt: { lt: threshold } },
    data: { rawDataEncrypted: null },
  });
  return { attemptsDeleted: attempts.count, rawPayloadsCleared: payloads.count };
}

export async function hasActiveJob(connectionId: string): Promise<boolean> {
  const active = await prisma.bankSyncJob.findFirst({
    where: { connectionId, status: { in: ["queued", "running"] } },
    select: { id: true },
  });
  return active !== null;
}

function connectionStatusFor(providerStatus: string): BankConnection["status"] {
  switch (providerStatus) {
    case "expired":
      return "expired";
    case "revoked":
    case "closed":
      return "reauth_required";
    case "pending":
      return "pending";
    default:
      return "error";
  }
}

function backoffMinutes(attemptCount: number) {
  return RETRY_BACKOFF_MINUTES[Math.min(attemptCount - 1, RETRY_BACKOFF_MINUTES.length - 1)] ?? 240;
}

function accountTypeFor(type: string): "current" | "savings" | "cash" | "credit_card" | "other" {
  switch (type) {
    case "current":
      return "current";
    case "savings":
      return "savings";
    case "card":
      return "credit_card";
    default:
      return "other";
  }
}

/** Escolhe o saldo mais atual e o disponível a partir dos snapshots do banco. */
export function selectBalances(balances: ProviderBalance[]) {
  const current =
    balances.find((balance) => balance.kind === "expected") ??
    balances.find((balance) => balance.kind === "interim_booked") ??
    balances.find((balance) => balance.kind === "closing_booked") ??
    balances.find((balance) => balance.kind === "previously_closed_booked") ??
    balances.find((balance) => balance.kind === "opening_booked") ??
    null;
  const available =
    balances.find((balance) => balance.kind === "interim_available") ??
    balances.find((balance) => balance.kind === "closing_available") ??
    null;
  return {
    current: current ? new Prisma.Decimal(current.amount) : null,
    available: available ? new Prisma.Decimal(available.amount) : null,
    currency: current?.currency ?? available?.currency ?? null,
  };
}

async function ensureAccount(
  connection: BankConnection,
  link: { displayName: string; currency: string; accountType: string },
  existingAccountId: string | null,
): Promise<string> {
  if (existingAccountId) return existingAccountId;

  const baseName = link.displayName.slice(0, 80);
  const candidates = [baseName, `${baseName} (${connection.institutionName})`];
  for (let index = 0; index < candidates.length; index += 1) {
    const name = candidates[index]!.slice(0, 80);
    const clash = await prisma.account.findFirst({
      where: { userId: connection.userId, name },
      select: { id: true },
    });
    if (clash && index === candidates.length - 1) continue;
    if (clash) continue;
    const account = await prisma.account.create({
      data: {
        userId: connection.userId,
        name,
        type: accountTypeFor(link.accountType),
        source: "bank",
        currency: link.currency,
      },
      select: { id: true },
    });
    return account.id;
  }

  const uniqueName = `${baseName} ${connection.institutionName} ${Date.now()}`.slice(0, 80);
  const account = await prisma.account.create({
    data: {
      userId: connection.userId,
      name: uniqueName,
      type: accountTypeFor(link.accountType),
      source: "bank",
      currency: link.currency,
    },
    select: { id: true },
  });
  return account.id;
}

async function upsertAccountLink(
  connection: BankConnection,
  providerAccount: ProviderAccount,
): Promise<BankAccountLink> {
  const existing = await prisma.bankAccountLink.findFirst({
    where: {
      connectionId: connection.id,
      providerAccountHash: providerAccount.providerAccountHash,
    },
    select: { id: true, accountId: true, displayName: true, currency: true },
  });
  const accountId = await ensureAccount(connection, providerAccount, existing?.accountId ?? null);

  const data = {
    connectionId: connection.id,
    accountId,
    providerAccountIdCiphertext: encryptString(providerAccount.providerAccountId),
    providerAccountHash: providerAccount.providerAccountHash,
    displayName: providerAccount.displayName,
    maskedIban: providerAccount.maskedIban,
    providerIbanHash: providerAccount.ibanHash,
    currency: providerAccount.currency,
    accountType: providerAccount.accountType,
  };

  if (existing) {
    return prisma.bankAccountLink.update({ where: { id: existing.id }, data });
  }
  return prisma.bankAccountLink.create({ data });
}

interface TransactionUpsertResult {
  created: boolean;
  transaction: BankTransaction;
}

async function upsertTransaction(
  link: BankAccountLink,
  userId: string,
  provider: string,
  providerAccountHash: string,
  transaction: ProviderTransaction,
): Promise<TransactionUpsertResult> {
  const dedupeKey = dedupeKeyFromTransaction(transaction, { provider, providerAccountHash });
  const dates = {
    bookingDate: transaction.bookingDate ? new Date(transaction.bookingDate) : null,
    valueDate: transaction.valueDate ? new Date(transaction.valueDate) : null,
    transactionDate: transaction.transactionDate ? new Date(transaction.transactionDate) : null,
  };
  const values = {
    status: transaction.status,
    direction: transaction.direction,
    amount: new Prisma.Decimal(transaction.amount),
    currency: transaction.currency,
    ...dates,
    description: transaction.description,
    counterpartyName: transaction.counterpartyName,
    counterpartyAccountHash: transaction.counterpartyAccountHash,
    merchantCategoryCode: transaction.merchantCategoryCode,
    bankTransactionCode: transaction.bankTransactionCode,
    providerEntryReference: transaction.entryReference,
    providerTransactionId: transaction.providerTransactionId,
    lastSeenAt: new Date(),
  };

  const existing = await prisma.bankTransaction.findUnique({
    where: { bankAccountLinkId_dedupeKey: { bankAccountLinkId: link.id, dedupeKey } },
  });
  if (existing) {
    const updated = await prisma.bankTransaction.update({
      where: { id: existing.id },
      data: values,
    });
    return { created: false, transaction: updated };
  }

  // Quando o banco atribui agora uma referência estável (ou o movimento era
  // pendente sem referência), tenta casar com o registo pendente da mesma conta.
  if (transaction.status === "booked") {
    const pending = await prisma.bankTransaction.findMany({
      where: {
        bankAccountLinkId: link.id,
        status: "pending",
        direction: transaction.direction,
        amount: new Prisma.Decimal(transaction.amount),
        currency: transaction.currency,
      },
      select: {
        id: true,
        dedupeKey: true,
        providerEntryReference: true,
        bookingDate: true,
        valueDate: true,
        transactionDate: true,
        description: true,
        counterpartyAccountHash: true,
      },
    });
    const candidate = findPendingCandidate(transaction, pending);
    if (candidate && "match" in candidate) {
      const updated = await prisma.bankTransaction.update({
        where: { id: candidate.match.id },
        data: { ...values, dedupeKey },
      });
      return { created: false, transaction: updated };
    }
    // Ambíguo ou sem candidato: cria-se o registo contabilizado sem apagar o pendente.
  }

  const created = await prisma.bankTransaction.create({
    data: {
      userId,
      bankAccountLinkId: link.id,
      dedupeKey,
      classification: "unreviewed",
      ...values,
    },
  });
  return { created: true, transaction: created };
}

async function syncAccount(
  connection: BankConnection,
  provider: OpenBankingProvider,
  sessionId: string,
  providerAccount: ProviderAccount,
  counters: SyncCounters,
) {
  const link = await upsertAccountLink(connection, providerAccount);
  const context = { sessionId, providerAccountId: providerAccount.providerAccountId };

  const balances = await provider.getBalances(context);
  const snapshot = selectBalances(balances);
  if (snapshot.current !== null || snapshot.available !== null) {
    await prisma.account.update({
      where: { id: link.accountId },
      data: {
        ...(snapshot.current !== null ? { providerCurrentBalance: snapshot.current } : {}),
        ...(snapshot.available !== null ? { providerAvailableBalance: snapshot.available } : {}),
        providerBalanceUpdatedAt: new Date(),
      },
    });
  }

  let continuationKey: string | null = null;
  let pages = 0;
  do {
    const page = await provider.getTransactions({ ...context, continuationKey });
    continuationKey = page.continuationKey;
    for (const transaction of page.transactions) {
      const result = await upsertTransaction(
        link,
        connection.userId,
        connection.provider,
        providerAccount.providerAccountHash,
        transaction,
      );
      if (result.created) counters.transactionsCreated += 1;
      else counters.transactionsUpdated += 1;
    }
    pages += 1;
    // Continua mesmo quando uma página vem vazia mas devolve outra chave.
  } while (continuationKey !== null && pages < MAX_PAGES_PER_ACCOUNT);

  await prisma.bankAccountLink.update({
    where: { id: link.id },
    data: { lastTransactionSyncAt: new Date() },
  });
  counters.accountsProcessed += 1;
}

function sanitizedErrorCode(error: unknown): string {
  if (error instanceof ProviderError) return `PROVIDER_${error.code.toUpperCase()}`;
  return "SYNC_FAILED";
}

/** Executa um job já reclamado. Nunca lança: regista o resultado no próprio job. */
export async function runSyncJob(job: BankSyncJob): Promise<SyncOutcome> {
  const counters: SyncCounters = {
    accountsProcessed: 0,
    transactionsCreated: 0,
    transactionsUpdated: 0,
    transactionsSkipped: 0,
  };
  const config = getOpenBankingConfig();
  const connection = await prisma.bankConnection.findUnique({ where: { id: job.connectionId } });
  if (!connection || connection.disconnectedAt) {
    return { ...counters, status: "failed", errorCode: "BANK_CONNECTION_NOT_FOUND" };
  }

  let session: ProviderSession | null = null;
  let provider: ReturnType<typeof createOpenBankingProvider> | null = null;
  let sessionId: string | null = null;
  let syncError: unknown = null;
  const successfulAccountIds: string[] = [];

  try {
    provider = createOpenBankingProvider();
    sessionId = decryptSessionId(connection);

    const sessionResult = await provider.getSession(sessionId);
    if (sessionResult.status !== "authorized") {
      await prisma.bankConnection.update({
        where: { id: connection.id },
        data: {
          status: connectionStatusFor(sessionResult.status),
          lastErrorCode: `PROVIDER_SESSION_${sessionResult.status.toUpperCase()}`,
          lastErrorAt: new Date(),
        },
      });
      return {
        ...counters,
        status: sessionResult.status === "pending" ? "partial" : "failed",
        errorCode: sessionResult.status === "pending" ? null : "BANK_CONNECTION_REAUTH_REQUIRED",
      };
    }
    session = sessionResult;

    const consentExpired =
      session.consentExpiresAt && new Date(session.consentExpiresAt).getTime() <= Date.now();
    if (consentExpired) {
      await prisma.bankConnection.update({
        where: { id: connection.id },
        data: {
          status: "expired",
          lastErrorCode: "BANK_CONNECTION_EXPIRED",
          lastErrorAt: new Date(),
        },
      });
      return { ...counters, status: "failed", errorCode: "BANK_CONNECTION_EXPIRED" };
    }

    for (const providerAccount of session.accounts.slice(0, MAX_ACCOUNTS_PER_SYNC)) {
      try {
        await syncAccount(connection, provider!, sessionId!, providerAccount, counters);
        successfulAccountIds.push(providerAccount.providerAccountId);
      } catch (accountError) {
        // Log but continue with other accounts
        console.error(
          `[open-banking] Falha na sincronização da conta ${providerAccount.providerAccountId}:`,
          accountError,
        );
        syncError = accountError;
      }
    }

    // Materialização e emparelhamento de transferências executam-se sempre
    // para as contas que tiveram sucesso, mesmo que outras tenham falhado.
    let materialization: MaterializationCounters | undefined;
    let transfers: TransferMatchResult | undefined;
    if (successfulAccountIds.length > 0) {
      // Passamos o userId; o materialize filtra por status="booked" nas ligações
      // que foram processadas com sucesso. Como o materialize usa bankAccountLinkId
      // opcional, materializa tudo do utilizador — mas transações de contas que
      // falharam não terão status="booked" novo, então não são afetadas.
      materialization = await materializeBookedTransactions(connection.userId);
      transfers = await matchInternalTransfers(connection.userId);
    }

    const finalStatus = syncError ? "partial" : "completed";
    await prisma.bankConnection.update({
      where: { id: connection.id },
      data: {
        status: finalStatus === "completed" ? "active" : "error",
        lastSyncedAt: new Date(),
        nextSyncAt: new Date(Date.now() + config.syncIntervalMinutes * 60_000),
        lastErrorCode: syncError ? sanitizedErrorCode(syncError) : null,
        lastErrorAt: syncError ? new Date() : null,
      },
    });

    return {
      ...counters,
      status: finalStatus,
      errorCode: syncError ? sanitizedErrorCode(syncError) : null,
      materialization,
      transfers,
    };
  } catch (error) {
    // Erro antes do loop de contas (ex.: sessão, consentimento, provider init)
    const code = sanitizedErrorCode(error);
    const isConsentError =
      error instanceof ProviderError &&
      (error.code === "consent_expired" || error.code === "consent_revoked");
    const isTransient =
      error instanceof ProviderError &&
      ["provider_rate_limited", "provider_timeout", "provider_unavailable"].includes(error.code);

    await prisma.bankConnection.update({
      where: { id: job.connectionId },
      data: {
        status: isConsentError
          ? error.code === "consent_revoked"
            ? "reauth_required"
            : "expired"
          : isTransient
            ? "active"
            : "error",
        lastErrorCode: code,
        lastErrorAt: new Date(),
        nextSyncAt: isConsentError
          ? null
          : new Date(Date.now() + backoffMinutes(job.attemptCount) * 60_000),
      },
    });

    return {
      ...counters,
      status: "failed",
      errorCode: isTransient ? "BANK_PROVIDER_UNAVAILABLE" : code,
    };
  }
}

/** Reclama e executa um job; usado pela rota interna e pelo comando CLI. */
export async function processSyncJob(jobId: string): Promise<SyncOutcome | null> {
  const job = await claimSyncJob(jobId);
  if (!job) return null;

  const outcome = await runSyncJob(job);
  await prisma.bankSyncJob.update({
    where: { id: job.id },
    data: {
      status: outcome.status,
      finishedAt: new Date(),
      accountsProcessed: outcome.accountsProcessed,
      transactionsCreated: outcome.transactionsCreated,
      transactionsUpdated: outcome.transactionsUpdated,
      transactionsSkipped: outcome.transactionsSkipped,
      errorCode: outcome.errorCode ?? null,
      errorDetailSanitized: outcome.errorCode ?? null,
    },
  });
  return outcome;
}
