import { PrismaClient } from '@prisma/client';

declare global {
  // eslint-disable-next-line no-var
  var expenseSnapPrisma: PrismaClient | undefined;
}

export const prisma = globalThis.expenseSnapPrisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalThis.expenseSnapPrisma = prisma;
}
