import {
  AccountType,
  FinancialExperience,
  FinancialGoal,
  FinancialHorizon,
  RiskTolerance,
} from "@prisma/client";
import { z } from "zod";

const dateOnly = /^\d{4}-\d{2}-\d{2}$/;
const money = /^\d{1,8}(?:[.,]\d{1,2})?$/;
const monthKey = /^\d{4}-(0[1-9]|1[0-2])$/;
const profileMoney = /^\d{1,10}(?:[.,]\d{1,2})?$/;

const monthlyLimit = z
  .union([z.string(), z.number()])
  .transform(String)
  .transform((value) => value.replace(",", "."))
  .refine(
    (value) => money.test(value) && Number(value) > 0 && Number(value) <= 99_999_999.99,
    "O valor deve ser superior a zero e não pode exceder 99999999,99.",
  );

export const registerSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z
    .string()
    .trim()
    .email()
    .max(254)
    .transform((value) => value.toLowerCase()),
  password: z.string().min(8).max(128),
});

export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .email()
    .max(254)
    .transform((value) => value.toLowerCase()),
  password: z.string().min(1).max(128),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

const supportedTimeZones = new Set<string>(Intl.supportedValuesOf("timeZone"));

export const profileUpdateSchema = z
  .object({
    name: z.string().trim().min(2).max(100).optional(),
    currency: z
      .string()
      .trim()
      .length(3)
      .regex(/^[a-zA-Z]{3}$/, "Use um código de moeda ISO 4217 com três letras.")
      .transform((value) => value.toUpperCase())
      .optional(),
    timeZone: z
      .string()
      .trim()
      .min(1)
      .max(60)
      .refine((value) => supportedTimeZones.has(value), "Fuso horário não reconhecido.")
      .optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "Indique pelo menos um campo.");

export const categoryCreateSchema = z.object({
  name: z.string().trim().min(1).max(60),
  icon: z.string().trim().max(12).optional(),
});

export const categoryUpdateSchema = categoryCreateSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, "Indique pelo menos um campo.");

export const expenseCreateSchema = z.object({
  description: z.string().trim().min(1).max(200),
  location: z.string().trim().min(1).max(200),
  amount: z
    .union([z.string(), z.number()])
    .transform(String)
    .transform((value) => value.replace(",", "."))
    .refine(
      (value) => money.test(value) && Number(value) > 0,
      "O valor deve ser positivo e ter no máximo duas casas decimais.",
    ),
  date: z
    .string()
    .regex(dateOnly, "Use uma data no formato YYYY-MM-DD.")
    .transform((value) => new Date(`${value}T00:00:00.000Z`)),
  categoryId: z.string().uuid(),
  accountId: z
    .union([z.string().uuid(), z.literal(""), z.null()])
    .transform((value) => value || null)
    .optional(),
});

const booleanFromRequest = z
  .union([z.boolean(), z.enum(["true", "false"])])
  .transform((value) => value === true || value === "true");

export const expenseUpdateSchema = z
  .object({
    description: expenseCreateSchema.shape.description.optional(),
    location: expenseCreateSchema.shape.location.optional(),
    amount: expenseCreateSchema.shape.amount.optional(),
    date: expenseCreateSchema.shape.date.optional(),
    categoryId: expenseCreateSchema.shape.categoryId.optional(),
    accountId: expenseCreateSchema.shape.accountId.optional(),
    // JSON envia boolean; multipart/form-data envia texto. O contrato aceita ambos.
    removeReceipt: booleanFromRequest.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "Indique pelo menos um campo.");

export const expenseImportSchema = z.object({
  items: z.array(expenseCreateSchema).min(1).max(250),
});

export const expenseFiltersSchema = z
  .object({
    category: z.string().uuid().optional(),
    from: z.string().regex(dateOnly).optional(),
    to: z.string().regex(dateOnly).optional(),
    page: z.coerce.number().int().min(1).max(10_000).optional(),
    pageSize: z.coerce.number().int().min(1).max(500).optional(),
  })
  .refine(({ from, to }) => !from || !to || from <= to, {
    message: "A data inicial não pode ser posterior à data final.",
    path: ["from"],
  });

const planningAmount = z
  .union([z.string(), z.number()])
  .transform(String)
  .transform((value) => value.replace(",", "."))
  .refine(
    (value) => profileMoney.test(value) && Number(value) >= 0,
    "Use um valor entre 0 e 9999999999,99, com no máximo duas casas decimais.",
  );

const positivePlanningAmount = planningAmount.refine(
  (value) => Number(value) > 0,
  "O valor deve ser superior a zero.",
);

const accountBalance = z
  .union([z.string(), z.number()])
  .transform(String)
  .transform((value) => value.replace(",", "."))
  .refine(
    (value) =>
      /^-?\d{1,10}(?:\.\d{1,2})?$/.test(value) && Math.abs(Number(value)) <= 9_999_999_999.99,
    "Use um saldo entre -9999999999,99 e 9999999999,99, com no maximo duas casas decimais.",
  );

const planningDate = z
  .string()
  .regex(dateOnly, "Use uma data no formato YYYY-MM-DD.")
  .transform((value) => new Date(`${value}T00:00:00.000Z`));

export const incomeCreateSchema = z.object({
  description: z.string().trim().min(1).max(160),
  source: z.string().trim().max(120).optional(),
  amount: positivePlanningAmount,
  date: planningDate,
  accountId: expenseCreateSchema.shape.accountId,
});

export const incomeUpdateSchema = incomeCreateSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, "Indique pelo menos um campo.");

export const savingsGoalCreateSchema = z.object({
  name: z.string().trim().min(1).max(100),
  icon: z.string().trim().max(32).optional(),
  targetAmount: positivePlanningAmount,
  currentAmount: planningAmount.optional().default("0"),
  targetDate: planningDate.optional(),
});

export const savingsGoalUpdateSchema = z
  .object({
    name: savingsGoalCreateSchema.shape.name.optional(),
    icon: savingsGoalCreateSchema.shape.icon.optional(),
    targetAmount: savingsGoalCreateSchema.shape.targetAmount.optional(),
    currentAmount: planningAmount.optional(),
    targetDate: planningDate.nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "Indique pelo menos um campo.");

export const recurringExpenseCreateSchema = z.object({
  description: z.string().trim().min(1).max(160),
  location: z.string().trim().min(1).max(160),
  amount: positivePlanningAmount,
  categoryId: z.string().uuid(),
  accountId: expenseCreateSchema.shape.accountId,
  dayOfMonth: z.coerce.number().int().min(1).max(31),
});

export const recurringExpenseUpdateSchema = z
  .object({
    description: recurringExpenseCreateSchema.shape.description.optional(),
    location: recurringExpenseCreateSchema.shape.location.optional(),
    amount: recurringExpenseCreateSchema.shape.amount.optional(),
    categoryId: recurringExpenseCreateSchema.shape.categoryId.optional(),
    accountId: expenseCreateSchema.shape.accountId.optional(),
    dayOfMonth: recurringExpenseCreateSchema.shape.dayOfMonth.optional(),
    isActive: booleanFromRequest.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "Indique pelo menos um campo.");

const accountSchema = z.object({
  name: z.string().trim().min(1).max(80),
  type: z.nativeEnum(AccountType),
  openingBalance: accountBalance.optional().default("0"),
  creditLimit: planningAmount.optional(),
});

export const accountCreateSchema = accountSchema.superRefine((value, context) => {
  if (value.type !== "credit_card" && value.creditLimit !== undefined) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "O limite de crédito só se aplica a cartões.",
      path: ["creditLimit"],
    });
  }
});

export const accountUpdateSchema = accountSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, "Indique pelo menos um campo.");

export const accountBalanceCorrectionSchema = z.object({
  currentBalance: accountBalance,
});

export const transferCreateSchema = z
  .object({
    fromAccountId: z.string().uuid(),
    toAccountId: z.string().uuid(),
    amount: positivePlanningAmount,
    description: z.string().trim().max(160).optional(),
    date: planningDate,
  })
  .refine((value) => value.fromAccountId !== value.toAccountId, {
    message: "Escolha duas contas diferentes.",
    path: ["toAccountId"],
  });

export const recurringIncomeCreateSchema = z.object({
  description: z.string().trim().min(1).max(160),
  source: z.string().trim().max(120).optional(),
  amount: positivePlanningAmount,
  accountId: expenseCreateSchema.shape.accountId,
  dayOfMonth: z.coerce.number().int().min(1).max(31),
});

export const recurringIncomeUpdateSchema = z
  .object({
    description: recurringIncomeCreateSchema.shape.description.optional(),
    source: recurringIncomeCreateSchema.shape.source.optional(),
    amount: recurringIncomeCreateSchema.shape.amount.optional(),
    accountId: recurringIncomeCreateSchema.shape.accountId.optional(),
    dayOfMonth: recurringIncomeCreateSchema.shape.dayOfMonth.optional(),
    isActive: booleanFromRequest.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "Indique pelo menos um campo.");

const annualInterestRate = z
  .union([z.string(), z.number()])
  .transform(String)
  .transform((value) => value.replace(",", "."))
  .refine(
    (value) => /^\d{1,3}(?:\.\d{1,2})?$/.test(value) && Number(value) >= 0 && Number(value) <= 100,
    "Use uma taxa entre 0% e 100%.",
  );

export const debtCreateSchema = z.object({
  name: z.string().trim().min(1).max(100),
  lender: z.string().trim().min(1).max(100),
  currentBalance: planningAmount,
  annualInterestRate,
  monthlyPayment: positivePlanningAmount,
  nextPaymentDate: planningDate.optional(),
});

export const debtUpdateSchema = debtCreateSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, "Indique pelo menos um campo.");

export const budgetCreateSchema = z.object({
  categoryId: z.string().uuid(),
  monthlyLimit,
});

export const budgetUpdateSchema = z.object({
  monthlyLimit,
});

const financialProfileAmount = z
  .union([z.string(), z.number()])
  .transform(String)
  .transform((value) => value.replace(",", "."))
  .refine(
    (value) => profileMoney.test(value) && Number(value) <= 9_999_999_999.99,
    "Use um valor entre 0 e 9999999999,99, com no máximo duas casas decimais.",
  );

const positiveFinancialProfileAmount = financialProfileAmount.refine(
  (value) => Number(value) > 0,
  "O rendimento mensal líquido deve ser superior a zero.",
);

export const financialProfileUpsertSchema = z.object({
  monthlyNetIncome: positiveFinancialProfileAmount,
  monthlyEssentialCosts: financialProfileAmount,
  monthlyHousingCosts: financialProfileAmount,
  monthlyDebtPayments: financialProfileAmount,
  currentSavings: financialProfileAmount,
  goal: z.nativeEnum(FinancialGoal),
  horizon: z.nativeEnum(FinancialHorizon),
  experience: z.nativeEnum(FinancialExperience),
  riskTolerance: z.nativeEnum(RiskTolerance),
});

export const analyticsMonthSchema = z.object({
  month: z.string().regex(monthKey, "Use o mês no formato YYYY-MM.").optional(),
});

export const analyticsTrendSchema = z.object({
  months: z.coerce.number().int().min(1).max(24).default(6),
  month: z.string().regex(monthKey, "Use o mês no formato YYYY-MM.").optional(),
});
