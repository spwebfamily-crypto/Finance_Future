CREATE TYPE "AccountType" AS ENUM ('current', 'savings', 'cash', 'credit_card', 'other');

CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "AccountType" NOT NULL,
    "openingBalance" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "creditLimit" DECIMAL(12,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Account_creditLimit_nonnegative" CHECK ("creditLimit" IS NULL OR "creditLimit" >= 0)
);

ALTER TABLE "Expense" ADD COLUMN "accountId" TEXT;
ALTER TABLE "Income" ADD COLUMN "accountId" TEXT;
ALTER TABLE "RecurringExpense" ADD COLUMN "accountId" TEXT;

CREATE TABLE "Transfer" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fromAccountId" TEXT NOT NULL,
    "toAccountId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "description" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Transfer_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Transfer_accounts_different" CHECK ("fromAccountId" <> "toAccountId"),
    CONSTRAINT "Transfer_amount_positive" CHECK ("amount" > 0)
);

CREATE TABLE "RecurringIncome" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accountId" TEXT,
    "description" TEXT NOT NULL,
    "source" TEXT,
    "amount" DECIMAL(12,2) NOT NULL,
    "dayOfMonth" INTEGER NOT NULL,
    "nextDueDate" TIMESTAMP(3) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastReceivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecurringIncome_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "RecurringIncome_amount_positive" CHECK ("amount" > 0),
    CONSTRAINT "RecurringIncome_dayOfMonth_valid" CHECK ("dayOfMonth" BETWEEN 1 AND 31)
);

CREATE TABLE "Debt" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "lender" TEXT NOT NULL,
    "currentBalance" DECIMAL(12,2) NOT NULL,
    "annualInterestRate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "monthlyPayment" DECIMAL(12,2) NOT NULL,
    "nextPaymentDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Debt_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Debt_balance_nonnegative" CHECK ("currentBalance" >= 0),
    CONSTRAINT "Debt_interest_rate_valid" CHECK ("annualInterestRate" BETWEEN 0 AND 100),
    CONSTRAINT "Debt_monthlyPayment_positive" CHECK ("monthlyPayment" > 0)
);

CREATE UNIQUE INDEX "Account_userId_name_key" ON "Account"("userId", "name");
CREATE INDEX "Account_userId_type_idx" ON "Account"("userId", "type");
CREATE INDEX "Expense_userId_accountId_date_idx" ON "Expense"("userId", "accountId", "date");
CREATE INDEX "Income_userId_accountId_date_idx" ON "Income"("userId", "accountId", "date");
CREATE INDEX "RecurringExpense_userId_accountId_idx" ON "RecurringExpense"("userId", "accountId");
CREATE INDEX "Transfer_userId_date_idx" ON "Transfer"("userId", "date");
CREATE INDEX "Transfer_fromAccountId_date_idx" ON "Transfer"("fromAccountId", "date");
CREATE INDEX "Transfer_toAccountId_date_idx" ON "Transfer"("toAccountId", "date");
CREATE INDEX "RecurringIncome_userId_isActive_nextDueDate_idx" ON "RecurringIncome"("userId", "isActive", "nextDueDate");
CREATE INDEX "RecurringIncome_userId_accountId_idx" ON "RecurringIncome"("userId", "accountId");
CREATE INDEX "Debt_userId_nextPaymentDate_idx" ON "Debt"("userId", "nextPaymentDate");

ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Income" ADD CONSTRAINT "Income_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RecurringExpense" ADD CONSTRAINT "RecurringExpense_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Transfer" ADD CONSTRAINT "Transfer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Transfer" ADD CONSTRAINT "Transfer_fromAccountId_fkey" FOREIGN KEY ("fromAccountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Transfer" ADD CONSTRAINT "Transfer_toAccountId_fkey" FOREIGN KEY ("toAccountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RecurringIncome" ADD CONSTRAINT "RecurringIncome_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RecurringIncome" ADD CONSTRAINT "RecurringIncome_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Debt" ADD CONSTRAINT "Debt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
