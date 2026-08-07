import bcrypt from 'bcrypt';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const categories = [
  { name: 'Alimentação', icon: '🍽️', isDefault: true },
  { name: 'Transportes', icon: '🚇', isDefault: true },
  { name: 'Casa', icon: '🏠', isDefault: true },
  { name: 'Saúde', icon: '🩺', isDefault: true },
  { name: 'Lazer', icon: '🎟️', isDefault: true },
  { name: 'Compras', icon: '🛍️', isDefault: true },
  { name: 'Outros', icon: '✨', isDefault: true },
] as const;

async function main() {
  const email = 'demo@expensesnap.local';
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return;

  await prisma.user.create({
    data: {
      name: 'Conta de demonstração',
      email,
      passwordHash: await bcrypt.hash('Demo-2026!', 12),
      categories: { create: [...categories] },
    },
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
