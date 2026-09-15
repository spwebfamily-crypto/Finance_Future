ALTER TABLE "Expense" ADD COLUMN "currency" TEXT;
ALTER TABLE "Income" ADD COLUMN "currency" TEXT;
ALTER TABLE "Transfer" ADD COLUMN "currency" TEXT;

UPDATE "Expense" AS movement
SET "currency" = COALESCE(
  (
    SELECT account."currency"
    FROM "Account" AS account
    WHERE account."id" = movement."accountId"
  ),
  owner."currency"
)
FROM "User" AS owner
WHERE owner."id" = movement."userId";

UPDATE "Income" AS movement
SET "currency" = COALESCE(
  (
    SELECT account."currency"
    FROM "Account" AS account
    WHERE account."id" = movement."accountId"
  ),
  owner."currency"
)
FROM "User" AS owner
WHERE owner."id" = movement."userId";

UPDATE "Transfer" AS movement
SET "currency" = account."currency"
FROM "Account" AS account
WHERE account."id" = movement."fromAccountId"
  AND account."currency" = (
    SELECT destination."currency"
    FROM "Account" AS destination
    WHERE destination."id" = movement."toAccountId"
  );
