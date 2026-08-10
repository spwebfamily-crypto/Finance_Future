-- Store new receipts in PostgreSQL. The legacy filesystem column remains so
-- installations can still read attachments created before this migration.
ALTER TABLE "Expense"
ADD COLUMN "receiptData" BYTEA,
ADD COLUMN "receiptMimeType" TEXT,
ADD COLUMN "receiptFileName" TEXT,
ADD COLUMN "receiptFileSize" INTEGER;

ALTER TABLE "Expense"
ADD CONSTRAINT "Expense_receiptFileSize_nonnegative"
CHECK ("receiptFileSize" IS NULL OR "receiptFileSize" BETWEEN 0 AND 10485760),
ADD CONSTRAINT "Expense_receiptMimeType_allowed"
CHECK ("receiptMimeType" IS NULL OR "receiptMimeType" IN ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
ADD CONSTRAINT "Expense_receiptData_metadata_consistent"
CHECK (
    (
        "receiptData" IS NULL
        AND "receiptMimeType" IS NULL
        AND "receiptFileName" IS NULL
        AND "receiptFileSize" IS NULL
    )
    OR
    (
        "receiptData" IS NOT NULL
        AND "receiptMimeType" IS NOT NULL
        AND "receiptFileName" IS NOT NULL
        AND "receiptFileSize" IS NOT NULL
        AND octet_length("receiptData") = "receiptFileSize"
    )
);
