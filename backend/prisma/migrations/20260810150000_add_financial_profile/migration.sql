-- CreateEnum
CREATE TYPE "FinancialGoal" AS ENUM (
    'emergency_fund',
    'debt_repayment',
    'home_purchase',
    'major_purchase',
    'education',
    'retirement',
    'wealth_growth',
    'other'
);

-- CreateEnum
CREATE TYPE "FinancialHorizon" AS ENUM ('short_term', 'medium_term', 'long_term');

-- CreateEnum
CREATE TYPE "FinancialExperience" AS ENUM ('none', 'beginner', 'intermediate', 'advanced');

-- CreateEnum
CREATE TYPE "RiskTolerance" AS ENUM ('conservative', 'moderate', 'aggressive');

-- CreateTable
CREATE TABLE "FinancialProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "monthlyNetIncome" DECIMAL(12,2) NOT NULL,
    "monthlyEssentialCosts" DECIMAL(12,2) NOT NULL,
    "monthlyHousingCosts" DECIMAL(12,2) NOT NULL,
    "monthlyDebtPayments" DECIMAL(12,2) NOT NULL,
    "currentSavings" DECIMAL(12,2) NOT NULL,
    "goal" "FinancialGoal" NOT NULL,
    "horizon" "FinancialHorizon" NOT NULL,
    "experience" "FinancialExperience" NOT NULL,
    "riskTolerance" "RiskTolerance" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinancialProfile_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "FinancialProfile_monthlyNetIncome_positive" CHECK ("monthlyNetIncome" > 0),
    CONSTRAINT "FinancialProfile_monthlyEssentialCosts_nonnegative" CHECK ("monthlyEssentialCosts" >= 0),
    CONSTRAINT "FinancialProfile_monthlyHousingCosts_nonnegative" CHECK ("monthlyHousingCosts" >= 0),
    CONSTRAINT "FinancialProfile_monthlyDebtPayments_nonnegative" CHECK ("monthlyDebtPayments" >= 0),
    CONSTRAINT "FinancialProfile_currentSavings_nonnegative" CHECK ("currentSavings" >= 0)
);

-- A unique index both enforces the one-to-one relation and indexes the foreign key.
CREATE UNIQUE INDEX "FinancialProfile_userId_key" ON "FinancialProfile"("userId");

-- AddForeignKey
ALTER TABLE "FinancialProfile"
ADD CONSTRAINT "FinancialProfile_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
