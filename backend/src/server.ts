import { app } from './app.js';
import { env } from './config.js';
import { prisma } from './prisma.js';

const server = app.listen(env.PORT, () => {
  console.log(`ExpenseSnap API disponível em http://localhost:${env.PORT}/api`);
});

async function shutdown() {
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
