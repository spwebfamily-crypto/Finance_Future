import "dotenv/config";
import { prisma } from "../prisma.js";
import { cleanupStableBankTransactionDuplicates } from "../open-banking/duplicateCleanup.js";

async function main() {
  const apply = process.argv.includes("--apply");
  const result = await cleanupStableBankTransactionDuplicates({ apply });
  console.warn(
    JSON.stringify({
      mode: apply ? "apply" : "audit",
      ...result,
    }),
  );
}

main()
  .catch((error) => {
    console.error(
      "[open-banking] falha ao verificar movimentos repetidos:",
      error instanceof Error ? error.message : error,
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
