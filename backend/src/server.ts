import { app } from "./app.js";
import { env } from "./config.js";
import { getOpenBankingConfig } from "./open-banking/config.js";
import { prisma } from "./prisma.js";

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

// Evita que uploads deliberadamente lentos retenham os poucos slots de
// processamento da instância indefinidamente, sem penalizar uma rede móvel normal.
server.headersTimeout = 15_000;
server.requestTimeout = 120_000;
server.keepAliveTimeout = 5_000;

async function shutdown() {
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
