-- CreateEnum
CREATE TYPE "AccountSource" AS ENUM ('manual', 'bank');

-- CreateEnum
CREATE TYPE "BankProvider" AS ENUM ('enable_banking', 'fake');

-- CreateEnum
CREATE TYPE "BankConnectionStatus" AS ENUM ('pending', 'active', 'reauth_required', 'expired', 'revoked', 'disconnected', 'error');

-- CreateEnum
CREATE TYPE "BankTransactionStatus" AS ENUM ('pending', 'booked', 'rejected', 'removed');

-- CreateEnum
CREATE TYPE "BankTransactionDirection" AS ENUM ('debit', 'credit');

-- CreateEnum
CREATE TYPE "BankTransactionClassification" AS ENUM ('unreviewed', 'expense', 'income', 'internal_transfer', 'ignored', 'refund');

-- CreateEnum
CREATE TYPE "BankSyncJobStatus" AS ENUM ('queued', 'running', 'completed', 'partial', 'failed');

-- CreateEnum
CREATE TYPE "BankSyncTrigger" AS ENUM ('initial', 'manual', 'scheduled', 'reauthorization');

-- AlterTable
ALTER TABLE "Account" ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'EUR',
ADD COLUMN     "providerAvailableBalance" DECIMAL(12,2),
ADD COLUMN     "providerBalanceUpdatedAt" TIMESTAMP(3),
ADD COLUMN     "providerCurrentBalance" DECIMAL(12,2),
ADD COLUMN     "source" "AccountSource" NOT NULL DEFAULT 'manual';

-- CreateTable
CREATE TABLE "BankAuthorizationAttempt" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" "BankProvider" NOT NULL,
    "institutionId" TEXT NOT NULL,
    "institutionName" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "psuType" TEXT NOT NULL,
    "stateHash" TEXT NOT NULL,
    "providerAuthorizationId" TEXT,
    "returnPath" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BankAuthorizationAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankConnection" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" "BankProvider" NOT NULL,
    "providerSessionCiphertext" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "institutionName" TEXT NOT NULL,
    "institutionCountry" TEXT NOT NULL,
    "status" "BankConnectionStatus" NOT NULL,
    "consentExpiresAt" TIMESTAMP(3),
    "lastSyncedAt" TIMESTAMP(3),
    "nextSyncAt" TIMESTAMP(3),
    "lastErrorCode" TEXT,
    "lastErrorAt" TIMESTAMP(3),
    "disconnectedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BankConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankAccountLink" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerAccountIdCiphertext" TEXT NOT NULL,
    "providerAccountHash" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "maskedIban" TEXT,
    "currency" TEXT NOT NULL,
    "accountType" TEXT NOT NULL,
    "lastTransactionSyncAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BankAccountLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankTransaction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "bankAccountLinkId" TEXT NOT NULL,
    "providerEntryReference" TEXT,
    "providerTransactionId" TEXT,
    "dedupeKey" TEXT NOT NULL,
    "status" "BankTransactionStatus" NOT NULL,
    "direction" "BankTransactionDirection" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "bookingDate" TIMESTAMP(3),
    "valueDate" TIMESTAMP(3),
    "transactionDate" TIMESTAMP(3),
    "description" TEXT NOT NULL,
    "counterpartyName" TEXT,
    "counterpartyAccountHash" TEXT,
    "merchantCategoryCode" TEXT,
    "bankTransactionCode" TEXT,
    "classification" "BankTransactionClassification" NOT NULL DEFAULT 'unreviewed',
    "excludedFromAnalytics" BOOLEAN NOT NULL DEFAULT false,
    "expenseId" TEXT,
    "incomeId" TEXT,
    "transferId" TEXT,
    "rawDataEncrypted" BYTEA,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BankTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankSyncJob" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "trigger" "BankSyncTrigger" NOT NULL,
    "status" "BankSyncJobStatus" NOT NULL DEFAULT 'queued',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "accountsProcessed" INTEGER NOT NULL DEFAULT 0,
    "transactionsCreated" INTEGER NOT NULL DEFAULT 0,
    "transactionsUpdated" INTEGER NOT NULL DEFAULT 0,
    "transactionsSkipped" INTEGER NOT NULL DEFAULT 0,
    "errorCode" TEXT,
    "errorDetailSanitized" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BankSyncJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BankAuthorizationAttempt_stateHash_key" ON "BankAuthorizationAttempt"("stateHash");

-- CreateIndex
CREATE INDEX "BankAuthorizationAttempt_userId_createdAt_idx" ON "BankAuthorizationAttempt"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "BankAuthorizationAttempt_expiresAt_idx" ON "BankAuthorizationAttempt"("expiresAt");

-- CreateIndex
CREATE INDEX "BankConnection_userId_status_idx" ON "BankConnection"("userId", "status");

-- CreateIndex
CREATE INDEX "BankConnection_status_nextSyncAt_idx" ON "BankConnection"("status", "nextSyncAt");

-- CreateIndex
CREATE UNIQUE INDEX "BankAccountLink_accountId_key" ON "BankAccountLink"("accountId");

-- CreateIndex
CREATE INDEX "BankAccountLink_connectionId_idx" ON "BankAccountLink"("connectionId");

-- CreateIndex
CREATE UNIQUE INDEX "BankAccountLink_connectionId_providerAccountHash_key" ON "BankAccountLink"("connectionId", "providerAccountHash");

-- CreateIndex
CREATE UNIQUE INDEX "BankTransaction_expenseId_key" ON "BankTransaction"("expenseId");

-- CreateIndex
CREATE UNIQUE INDEX "BankTransaction_incomeId_key" ON "BankTransaction"("incomeId");

-- CreateIndex
CREATE INDEX "BankTransaction_userId_status_bookingDate_idx" ON "BankTransaction"("userId", "status", "bookingDate");

-- CreateIndex
CREATE INDEX "BankTransaction_userId_classification_bookingDate_idx" ON "BankTransaction"("userId", "classification", "bookingDate");

-- CreateIndex
CREATE INDEX "BankTransaction_transferId_idx" ON "BankTransaction"("transferId");

-- CreateIndex
CREATE UNIQUE INDEX "BankTransaction_bankAccountLinkId_dedupeKey_key" ON "BankTransaction"("bankAccountLinkId", "dedupeKey");

-- CreateIndex
CREATE INDEX "BankSyncJob_userId_createdAt_idx" ON "BankSyncJob"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "BankSyncJob_status_createdAt_idx" ON "BankSyncJob"("status", "createdAt");

-- CreateIndex
CREATE INDEX "BankSyncJob_connectionId_status_idx" ON "BankSyncJob"("connectionId", "status");

-- AddForeignKey
ALTER TABLE "BankAuthorizationAttempt" ADD CONSTRAINT "BankAuthorizationAttempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankConnection" ADD CONSTRAINT "BankConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankAccountLink" ADD CONSTRAINT "BankAccountLink_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "BankConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankAccountLink" ADD CONSTRAINT "BankAccountLink_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankTransaction" ADD CONSTRAINT "BankTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankTransaction" ADD CONSTRAINT "BankTransaction_bankAccountLinkId_fkey" FOREIGN KEY ("bankAccountLinkId") REFERENCES "BankAccountLink"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankTransaction" ADD CONSTRAINT "BankTransaction_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "Expense"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankTransaction" ADD CONSTRAINT "BankTransaction_incomeId_fkey" FOREIGN KEY ("incomeId") REFERENCES "Income"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankTransaction" ADD CONSTRAINT "BankTransaction_transferId_fkey" FOREIGN KEY ("transferId") REFERENCES "Transfer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankSyncJob" ADD CONSTRAINT "BankSyncJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankSyncJob" ADD CONSTRAINT "BankSyncJob_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "BankConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
