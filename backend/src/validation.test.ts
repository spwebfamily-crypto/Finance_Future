import { describe, expect, it } from "vitest";
import {
  accountCreateSchema,
  debtCreateSchema,
  expenseCreateSchema,
  expenseFiltersSchema,
  expenseUpdateSchema,
  financialProfileUpsertSchema,
  incomeCreateSchema,
  registerSchema,
  recurringExpenseCreateSchema,
  recurringIncomeCreateSchema,
  savingsGoalCreateSchema,
} from "./validation.js";

describe("request validation", () => {
  it("rejects malformed registration data", () => {
    expect(() => registerSchema.parse({ name: "A", email: "invalid", password: "x" })).toThrow();
  });

  it("normalizes a decimal amount and a date-only value", () => {
    const value = expenseCreateSchema.parse({
      description: "Café",
      location: "Lisboa",
      amount: "2,50",
      date: "2026-08-07",
      categoryId: "7c8f0f14-1f87-4dfb-a2bf-85bf170a79c8",
    });

    expect(value.amount).toBe("2.50");
    expect(value.date.toISOString()).toBe("2026-08-07T00:00:00.000Z");
  });

  it("rejects an inverted date range", () => {
    expect(() => expenseFiltersSchema.parse({ from: "2026-08-08", to: "2026-08-01" })).toThrow();
  });

  it("coerces pagination params and enforces the pageSize ceiling", () => {
    expect(expenseFiltersSchema.parse({ page: "3", pageSize: "25" })).toEqual({
      page: 3,
      pageSize: 25,
    });
    expect(() => expenseFiltersSchema.parse({ page: "0" })).toThrow();
    expect(() => expenseFiltersSchema.parse({ pageSize: "501" })).toThrow();
  });

  it("accepts receipt removal from JSON and multipart requests", () => {
    expect(expenseUpdateSchema.parse({ removeReceipt: true }).removeReceipt).toBe(true);
    expect(expenseUpdateSchema.parse({ removeReceipt: "true" }).removeReceipt).toBe(true);
    expect(expenseUpdateSchema.parse({ removeReceipt: false }).removeReceipt).toBe(false);
    expect(expenseUpdateSchema.parse({ removeReceipt: "false" }).removeReceipt).toBe(false);
  });

  it("normalizes a complete financial profile without deriving recommendations", () => {
    const value = financialProfileUpsertSchema.parse({
      monthlyNetIncome: "2450,75",
      monthlyEssentialCosts: "520,40",
      monthlyHousingCosts: 850,
      monthlyDebtPayments: 0,
      currentSavings: "4200.00",
      goal: "emergency_fund",
      horizon: "medium_term",
      experience: "beginner",
      riskTolerance: "moderate",
    });

    expect(value).toEqual({
      monthlyNetIncome: "2450.75",
      monthlyEssentialCosts: "520.40",
      monthlyHousingCosts: "850",
      monthlyDebtPayments: "0",
      currentSavings: "4200.00",
      goal: "emergency_fund",
      horizon: "medium_term",
      experience: "beginner",
      riskTolerance: "moderate",
    });
    expect(value).not.toHaveProperty("recommendation");
  });

  it("rejects negative profile values and unsupported onboarding options", () => {
    const base = {
      monthlyNetIncome: "2450.75",
      monthlyEssentialCosts: "520.40",
      monthlyHousingCosts: "850",
      monthlyDebtPayments: "0",
      currentSavings: "4200.00",
      goal: "emergency_fund",
      horizon: "medium_term",
      experience: "beginner",
      riskTolerance: "moderate",
    };

    expect(() => financialProfileUpsertSchema.parse({ ...base, currentSavings: "-1" })).toThrow();
    expect(() =>
      financialProfileUpsertSchema.parse({ ...base, riskTolerance: "unlimited" }),
    ).toThrow();
  });

  it("normalizes planning data and keeps dates date-only", () => {
    const income = incomeCreateSchema.parse({
      description: "Salário",
      source: "Empresa",
      amount: "1500,50",
      date: "2026-08-25",
    });
    const goal = savingsGoalCreateSchema.parse({
      name: "Reserva",
      targetAmount: "3000",
      currentAmount: "450,25",
      targetDate: "2027-01-31",
    });

    expect(income.amount).toBe("1500.50");
    expect(income.date.toISOString()).toBe("2026-08-25T00:00:00.000Z");
    expect(goal.currentAmount).toBe("450.25");
    expect(goal.targetDate?.toISOString()).toBe("2027-01-31T00:00:00.000Z");
  });

  it("accepts recurring expense days through the 31st and rejects invalid values", () => {
    const base = {
      description: "Renda",
      location: "Senhorio",
      amount: "850",
      categoryId: "7c8f0f14-1f87-4dfb-a2bf-85bf170a79c8",
      dayOfMonth: 31,
    };
    expect(recurringExpenseCreateSchema.parse(base).dayOfMonth).toBe(31);
    expect(() => recurringExpenseCreateSchema.parse({ ...base, dayOfMonth: 32 })).toThrow();
  });

  it("validates accounts, transfers and recurring income compatible values", () => {
    const account = accountCreateSchema.parse({
      name: "Cartao pessoal",
      type: "credit_card",
      openingBalance: "-25,50",
      creditLimit: "1200",
    });
    const recurringIncome = recurringIncomeCreateSchema.parse({
      description: "Salario",
      amount: "1500,00",
      dayOfMonth: 25,
      accountId: "",
    });

    expect(account.openingBalance).toBe("-25.50");
    expect(account.creditLimit).toBe("1200");
    expect(recurringIncome.accountId).toBeNull();
    expect(() =>
      accountCreateSchema.parse({ name: "Conta", type: "current", creditLimit: "100" }),
    ).toThrow();
  });

  it("accepts debt tracking values and blocks invalid interest rates", () => {
    const debt = debtCreateSchema.parse({
      name: "Credito",
      lender: "Banco",
      currentBalance: "5000",
      annualInterestRate: "4,25",
      monthlyPayment: "160",
      nextPaymentDate: "2026-09-10",
    });

    expect(debt.annualInterestRate).toBe("4.25");
    expect(debt.nextPaymentDate?.toISOString()).toBe("2026-09-10T00:00:00.000Z");
    expect(() => debtCreateSchema.parse({ ...debt, annualInterestRate: "125" })).toThrow();
  });
});
