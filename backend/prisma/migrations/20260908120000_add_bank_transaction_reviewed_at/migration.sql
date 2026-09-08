BEGIN;

ALTER TABLE "BankTransaction"
ADD COLUMN "reviewedAt" TIMESTAMP(3);

-- Limpeza única pedida para setembro de 2026. O deploy do Render executa
-- `prisma migrate deploy` antes de iniciar a API, portanto estes movimentos
-- desaparecem antes de a nova versão ficar disponível.
DELETE FROM "BankTransaction"
WHERE COALESCE("bookingDate", "valueDate", "transactionDate", "firstSeenAt") >= TIMESTAMP '2026-09-01 00:00:00'
  AND COALESCE("bookingDate", "valueDate", "transactionDate", "firstSeenAt") < TIMESTAMP '2026-10-01 00:00:00';

DELETE FROM "Expense"
WHERE "date" >= TIMESTAMP '2026-09-01 00:00:00'
  AND "date" < TIMESTAMP '2026-10-01 00:00:00';

DELETE FROM "Income"
WHERE "date" >= TIMESTAMP '2026-09-01 00:00:00'
  AND "date" < TIMESTAMP '2026-10-01 00:00:00';

DELETE FROM "Transfer"
WHERE "date" >= TIMESTAMP '2026-09-01 00:00:00'
  AND "date" < TIMESTAMP '2026-10-01 00:00:00';

DELETE FROM "BankSyncJob"
WHERE "createdAt" >= TIMESTAMP '2026-09-01 00:00:00'
  AND "createdAt" < TIMESTAMP '2026-10-01 00:00:00';

UPDATE "RecurringExpense"
SET "lastPaidAt" = NULL
WHERE "lastPaidAt" >= TIMESTAMP '2026-09-01 00:00:00'
  AND "lastPaidAt" < TIMESTAMP '2026-10-01 00:00:00';

UPDATE "RecurringIncome"
SET "lastReceivedAt" = NULL
WHERE "lastReceivedAt" >= TIMESTAMP '2026-09-01 00:00:00'
  AND "lastReceivedAt" < TIMESTAMP '2026-10-01 00:00:00';

-- Mantém as ligações bancárias, mas remove snapshots antigos. A próxima
-- sincronização manual volta a preencher movimentos e saldos.
UPDATE "BankAccountLink"
SET "lastTransactionSyncAt" = NULL;

UPDATE "BankConnection"
SET "lastSyncedAt" = NULL,
    "nextSyncAt" = NULL;

UPDATE "Account"
SET "providerCurrentBalance" = NULL,
    "providerAvailableBalance" = NULL,
    "providerBalanceUpdatedAt" = NULL
WHERE "source" = 'bank';

COMMIT;
