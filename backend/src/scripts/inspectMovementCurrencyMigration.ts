import "dotenv/config";
import { Prisma } from "@prisma/client";
import { logger } from "../logger.js";
import { prisma } from "../prisma.js";

const MIGRATION_NAME = "20260911161000_add_movement_currency";

interface MigrationAttempt {
  checksum: string;
  startedAt: Date;
  finishedAt: Date | null;
  rolledBackAt: Date | null;
  appliedStepsCount: number;
}

interface CurrencyColumn {
  tableName: string;
  dataType: string;
  isNullable: string;
}

async function main() {
  const [attempts, columns] = await Promise.all([
    prisma.$queryRaw<MigrationAttempt[]>(Prisma.sql`
      SELECT
        checksum,
        started_at AS "startedAt",
        finished_at AS "finishedAt",
        rolled_back_at AS "rolledBackAt",
        applied_steps_count AS "appliedStepsCount"
      FROM "_prisma_migrations"
      WHERE migration_name = ${MIGRATION_NAME}
      ORDER BY started_at ASC
    `),
    prisma.$queryRaw<CurrencyColumn[]>(Prisma.sql`
      SELECT
        table_name AS "tableName",
        data_type AS "dataType",
        is_nullable AS "isNullable"
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name IN ('Expense', 'Income', 'Transfer')
        AND column_name = 'currency'
      ORDER BY table_name ASC
    `),
  ]);

  const failedAttempts = attempts.filter(
    (attempt) => !attempt.finishedAt && !attempt.rolledBackAt,
  ).length;
  const applied = attempts.some((attempt) => Boolean(attempt.finishedAt));
  const state = applied
    ? "applied"
    : failedAttempts > 0 && columns.length === 0
      ? "failed_transaction_rolled_back"
      : failedAttempts > 0
        ? "partial_schema_detected"
        : attempts.length > 0
          ? "resolved"
          : "not_attempted";

  logger.info("movement_currency_migration_inspection", {
    migrationName: MIGRATION_NAME,
    state,
    failedAttempts,
    attempts,
    columns,
  });

  if (state === "partial_schema_detected") process.exitCode = 2;
}

main()
  .catch((error) => {
    logger.error("movement_currency_migration_inspection_failed", {
      message: error instanceof Error ? error.message : String(error),
    });
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
