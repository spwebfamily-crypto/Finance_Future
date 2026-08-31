-- AlterTable
ALTER TABLE "BankAuthorizationAttempt" ADD COLUMN     "connectionId" TEXT;

-- CreateIndex
CREATE INDEX "BankAuthorizationAttempt_connectionId_idx" ON "BankAuthorizationAttempt"("connectionId");

-- AddForeignKey
ALTER TABLE "BankAuthorizationAttempt" ADD CONSTRAINT "BankAuthorizationAttempt_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "BankConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
