-- Non-destructive foundation for public API create retries.
CREATE TABLE "ApiIdempotencyKey" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "scope" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "statusCode" INTEGER NOT NULL,
  "response" JSONB NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ApiIdempotencyKey_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ApiIdempotencyKey_userId_scope_key_key" ON "ApiIdempotencyKey"("userId", "scope", "key");
CREATE INDEX "ApiIdempotencyKey_expiresAt_idx" ON "ApiIdempotencyKey"("expiresAt");
ALTER TABLE "ApiIdempotencyKey" ADD CONSTRAINT "ApiIdempotencyKey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
