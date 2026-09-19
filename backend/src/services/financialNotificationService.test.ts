import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const repositories = vi.hoisted(() => ({
  userFindMany: vi.fn(),
  recurringExpenseFindMany: vi.fn(),
  recurringIncomeFindMany: vi.fn(),
  debtFindMany: vi.fn(),
  savingsGoalFindMany: vi.fn(),
  notificationCreate: vi.fn(),
  subscriptionFindMany: vi.fn(),
  subscriptionDelete: vi.fn(),
}));

vi.mock("../prisma.js", () => ({
  prisma: {
    user: { findMany: repositories.userFindMany },
    recurringExpense: { findMany: repositories.recurringExpenseFindMany },
    recurringIncome: { findMany: repositories.recurringIncomeFindMany },
    debt: { findMany: repositories.debtFindMany },
    savingsGoal: {
      findMany: repositories.savingsGoalFindMany,
      fields: { targetAmount: "targetAmount" },
    },
    financialNotification: { create: repositories.notificationCreate },
    webPushSubscription: {
      findMany: repositories.subscriptionFindMany,
      delete: repositories.subscriptionDelete,
    },
  },
}));

const { generateFinancialNotifications } = await import("./financialNotificationService.js");

describe("financial reminder generation", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    repositories.userFindMany.mockResolvedValue([
      {
        id: "user-1",
        timeZone: "Europe/Lisbon",
        notificationPreference: { inAppEnabled: true, pushEnabled: false },
      },
    ]);
    repositories.recurringExpenseFindMany.mockResolvedValue([
      {
        id: "recurring-1",
        description: "Renda",
        nextDueDate: new Date("2026-09-20T00:00:00.000Z"),
      },
    ]);
    repositories.recurringIncomeFindMany.mockResolvedValue([]);
    repositories.debtFindMany.mockResolvedValue([]);
    repositories.savingsGoalFindMany.mockResolvedValue([]);
    repositories.notificationCreate.mockResolvedValue({ id: "notice-1" });
    repositories.subscriptionFindMany.mockResolvedValue([]);
  });

  it("creates one due reminder without materialising an expense", async () => {
    const result = await generateFinancialNotifications(new Date("2026-09-19T12:00:00.000Z"));

    expect(result).toEqual({ usersProcessed: 1, notificationsCreated: 1 });
    expect(repositories.notificationCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "user-1",
        sourceId: "recurring-1",
        type: "recurring_expense_due",
      }),
    });
  });

  it("treats the unique key as an idempotency lock", async () => {
    repositories.notificationCreate.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("duplicate", {
        code: "P2002",
        clientVersion: "6.12.0",
      }),
    );

    await expect(
      generateFinancialNotifications(new Date("2026-09-19T12:00:00.000Z")),
    ).resolves.toEqual({
      usersProcessed: 1,
      notificationsCreated: 0,
    });
  });
});
