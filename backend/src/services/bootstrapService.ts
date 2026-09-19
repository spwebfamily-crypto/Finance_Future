import { prisma } from "../prisma.js";

/** Lightweight authenticated shell data; it contains no transaction history. */
export async function getBootstrap(userId: string) {
  const [user, categories, accounts, profile] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        currency: true,
        timeZone: true,
        emailVerifiedAt: true,
      },
    }),
    prisma.category.findMany({
      where: { userId },
      select: { id: true, name: true, icon: true, isDefault: true },
      orderBy: [{ isDefault: "desc" }, { name: "asc" }],
    }),
    prisma.account.findMany({
      where: { userId },
      select: { id: true, name: true, type: true, source: true, currency: true },
      orderBy: [{ type: "asc" }, { name: "asc" }],
    }),
    prisma.financialProfile.findUnique({ where: { userId }, select: { id: true } }),
  ]);
  return { user, categories, accounts, onboardingComplete: Boolean(profile) };
}
