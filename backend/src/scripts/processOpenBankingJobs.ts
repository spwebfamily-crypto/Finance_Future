import "dotenv/config";
import { prisma } from "../prisma.js";
import { cleanupOpenBankingData, processDueConnections } from "../open-banking/syncService.js";

/**
 * Comando de agendamento (Render Cron):
 *   npm run open-banking:sync -- --limit 20 --retention-days 30
 *
 * Só escreve contagens no terminal: nunca imprime dados bancários.
 */
function readNumberFlag(name: string, fallback: number) {
  const index = process.argv.indexOf(`--${name}`);
  if (index < 0) return fallback;
  const value = Number(process.argv[index + 1]);
  return Number.isFinite(value) && value > 0 ? Math.trunc(value) : fallback;
}

async function main() {
  const limit = Math.min(readNumberFlag("limit", 10), 50);
  const retentionDays = Math.min(readNumberFlag("retention-days", 30), 365);

  const result = await processDueConnections(limit);
  const cleanup = await cleanupOpenBankingData(retentionDays);

  console.log(
    `[open-banking] sincronizações: ${result.claimed} ligações reclamadas, ${result.completed} concluídas, ${result.failed} falhadas, ${result.accountsProcessed} contas, ${result.transactionsCreated} movimentos novos, ${result.transactionsUpdated} atualizados`,
  );
  console.log(
    `[open-banking] limpeza: ${cleanup.attemptsDeleted} tentativas antigas, ${cleanup.rawPayloadsCleared} payloads de diagnóstico removidos`,
  );
}

main()
  .catch((error) => {
    console.error(
      "[open-banking] falha no agendamento:",
      error instanceof Error ? error.message : error,
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
