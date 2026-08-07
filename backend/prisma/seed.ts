import bcrypt from 'bcrypt';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const categories = [
  { name: 'Alimentação', icon: 'utensils', isDefault: true },
  { name: 'Transportes', icon: 'car', isDefault: true },
  { name: 'Casa', icon: 'house', isDefault: true },
  { name: 'Saúde', icon: 'heart-pulse', isDefault: true },
  { name: 'Lazer', icon: 'party-popper', isDefault: true },
  { name: 'Compras', icon: 'shopping-bag', isDefault: true },
  { name: 'Outros', icon: 'sparkles', isDefault: true },
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
