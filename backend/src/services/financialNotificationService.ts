import { FinancialNotificationType, Prisma } from "@prisma/client";
import { prisma } from "../prisma.js";
import { deliverWebPush } from "./webPushAdapter.js";

type PendingNotification = {
  type: FinancialNotificationType;
  sourceId: string;
  scheduledFor: Date;
  title: string;
  body: string;
};

function dateKey(value: Date, timeZone: string) {
  const fields = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const values = Object.fromEntries(fields.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function dateFromKey(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function daysBetween(from: string, to: string) {
  return Math.round((dateFromKey(to).getTime() - dateFromKey(from).getTime()) / 86_400_000);
}

function dueCopy(days: number) {
  if (days < 0) return "está em atraso";
  if (days === 0) return "vence hoje";
  if (days === 1) return "vence amanhã";
  return `vence em ${days} dias`;
}

/**
 * Creates reminder records, never financial records. The single interface is
 * idempotent: running it again for the same user/source/date creates nothing.
 */
export async function generateFinancialNotifications(now = new Date(), horizonDays = 3) {
  const users = await prisma.user.findMany({
    select: {
      id: true,
      timeZone: true,
      notificationPreference: { select: { inAppEnabled: true, pushEnabled: true } },
    },
  });
  let created = 0;

  for (const user of users) {
    if (user.notificationPreference?.inAppEnabled === false) continue;
    const timeZone = user.timeZone || "Europe/Lisbon";
    const today = dateKey(now, timeZone);
    const finalDate = dateFromKey(today);
    finalDate.setUTCDate(finalDate.getUTCDate() + horizonDays);

    const [expenses, incomes, debts, goals] = await Promise.all([
      prisma.recurringExpense.findMany({
        where: { userId: user.id, isActive: true, nextDueDate: { lte: finalDate } },
        select: { id: true, description: true, nextDueDate: true },
      }),
      prisma.recurringIncome.findMany({
        where: { userId: user.id, isActive: true, nextDueDate: { lte: finalDate } },
        select: { id: true, description: true, nextDueDate: true },
      }),
      prisma.debt.findMany({
        where: { userId: user.id, nextPaymentDate: { lte: finalDate } },
        select: { id: true, name: true, nextPaymentDate: true },
      }),
      prisma.savingsGoal.findMany({
        where: { userId: user.id, currentAmount: { gte: prisma.savingsGoal.fields.targetAmount } },
        select: { id: true, name: true, createdAt: true },
      }),
    ]);

    const candidates: PendingNotification[] = [
      ...expenses.map((item) => {
        const scheduled = dateKey(item.nextDueDate, timeZone);
        return {
          type: FinancialNotificationType.recurring_expense_due,
          sourceId: item.id,
          scheduledFor: dateFromKey(scheduled),
          title: "Despesa recorrente",
          body: `${item.description} ${dueCopy(daysBetween(today, scheduled))}.`,
        };
      }),
      ...incomes.map((item) => {
        const scheduled = dateKey(item.nextDueDate, timeZone);
        return {
          type: FinancialNotificationType.recurring_income_due,
          sourceId: item.id,
          scheduledFor: dateFromKey(scheduled),
          title: "Rendimento recorrente",
          body: `${item.description} ${dueCopy(daysBetween(today, scheduled))}.`,
        };
      }),
      ...debts.flatMap((item) => {
        if (!item.nextPaymentDate) return [];
        const scheduled = dateKey(item.nextPaymentDate, timeZone);
        return [
          {
            type: FinancialNotificationType.debt_payment_due,
            sourceId: item.id,
            scheduledFor: dateFromKey(scheduled),
            title: "Pagamento de dívida",
            body: `${item.name} ${dueCopy(daysBetween(today, scheduled))}.`,
          } satisfies PendingNotification,
        ];
      }),
      ...goals.map((item) => ({
        type: FinancialNotificationType.goal_reached,
        sourceId: item.id,
        // A stable source date means a reached goal notifies once, rather than
        // every day that its balance remains above the target.
        scheduledFor: dateFromKey(dateKey(item.createdAt, timeZone)),
        title: "Meta atingida",
        body: `A meta “${item.name}” foi atingida.`,
      })),
    ];
    if (!candidates.length) continue;
    const createdForUser = [] as PendingNotification[];
    for (const candidate of candidates) {
      try {
        await prisma.financialNotification.create({ data: { ...candidate, userId: user.id } });
        createdForUser.push(candidate);
        created += 1;
      } catch (error) {
        // PostgreSQL's unique constraint is the idempotency lock. Other errors
        // must still surface rather than silently dropping a reminder.
        if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") {
          throw error;
        }
      }
    }
    if (!createdForUser.length || user.notificationPreference?.pushEnabled !== true) continue;
    const subscriptions = await prisma.webPushSubscription.findMany({
      where: { userId: user.id },
      select: { id: true, endpoint: true, p256dh: true, auth: true },
    });
    await Promise.all(
      subscriptions.flatMap((subscription) =>
        createdForUser.map(async (item) => {
          const result = await deliverWebPush(
            {
              endpoint: subscription.endpoint,
              keys: { p256dh: subscription.p256dh, auth: subscription.auth },
            },
            { title: item.title, body: item.body, type: item.type },
          );
          if (result.expired)
            await prisma.webPushSubscription.delete({ where: { id: subscription.id } });
        }),
      ),
    );
  }
  return { usersProcessed: users.length, notificationsCreated: created };
}
