-- AlterTable
ALTER TABLE "BankAccountLink" ADD COLUMN     "providerIbanHash" TEXT;

-- CreateIndex
CREATE INDEX "BankAccountLink_providerIbanHash_idx" ON "BankAccountLink"("providerIbanHash");
