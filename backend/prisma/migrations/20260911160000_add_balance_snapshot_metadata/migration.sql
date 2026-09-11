ALTER TABLE "Account"
ADD COLUMN "providerBalanceType" TEXT,
ADD COLUMN "providerBalanceCurrency" TEXT,
ADD COLUMN "providerBalanceReferenceDate" TIMESTAMP(3),
ADD COLUMN "providerBalanceCorrelationId" TEXT;
