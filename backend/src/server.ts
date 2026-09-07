import { app } from "./app.js";
import { env } from "./config.js";
import { getOpenBankingConfig } from "./open-banking/config.js";
import { prisma } from "./prisma.js";
import { processDueConnections } from "./open-banking/syncService.js";

// Falha no arranque (e não no primeiro pedido) se Open Banking estiver ativo
// com configuração incompleta ou inválida.
const openBanking = getOpenBankingConfig();

const server = app.listen(env.PORT, "0.0.0.0", () => {
  console.log(`ExpenseSnap API disponível em http://localhost:${env.PORT}/api`);
  if (openBanking.enabled) {
    console.log(
      `Open Banking ativo (provedor ${openBanking.provider}, intervalo ${openBanking.syncIntervalMinutes} min).`,
    );
  }
});

// O cron continua suportado, mas o próprio servidor também reclama ligações
// vencidas. O claim atómico impede sincronizações duplicadas se houver mais de
// uma instância ou se o cron externo correr ao mesmo tempo.
const AUTO_SYNC_TICK_MS = 60_000;
let automaticSyncRunning = false;
async function runAutomaticSync() {
  if (!openBanking.enabled || automaticSyncRunning) return;
  automaticSyncRunning = true;
  try {
    await processDueConnections(10);
  } catch (error) {
    console.error(
      "[open-banking] falha na sincronização automática:",
      error instanceof Error ? error.message : error,
    );
  } finally {
    automaticSyncRunning = false;
  }
}

const automaticSyncTimer = openBanking.enabled
  ? setInterval(() => void runAutomaticSync(), AUTO_SYNC_TICK_MS)
  : null;
automaticSyncTimer?.unref();
if (openBanking.enabled) void runAutomaticSync();

// Evita que uploads deliberadamente lentos retenham os poucos slots de
// processamento da instância indefinidamente, sem penalizar uma rede móvel normal.
server.headersTimeout = 15_000;
server.requestTimeout = 120_000;
server.keepAliveTimeout = 5_000;

async function shutdown() {
  if (automaticSyncTimer) clearInterval(automaticSyncTimer);
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
