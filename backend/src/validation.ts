import {
  FinancialExperience,
  FinancialGoal,
  FinancialHorizon,
  RiskTolerance,
} from '@prisma/client';
import { z } from 'zod';

const dateOnly = /^\d{4}-\d{2}-\d{2}$/;
const money = /^\d{1,8}(?:[.,]\d{1,2})?$/;
const monthKey = /^\d{4}-(0[1-9]|1[0-2])$/;
const profileMoney = /^\d{1,10}(?:[.,]\d{1,2})?$/;

const monthlyLimit = z.union([z.string(), z.number()]).transform(String).transform((value) => value.replace(',', '.')).refine(
  (value) => money.test(value) && Number(value) > 0 && Number(value) <= 99_999_999.99,
  'O valor deve ser superior a zero e não pode exceder 99999999,99.',
);

export const registerSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
  password: z.string().min(8).max(128),
});

export const loginSchema = z.object({
  email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
  password: z.string().min(1).max(128),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

export const categoryCreateSchema = z.object({
  name: z.string().trim().min(1).max(60),
  icon: z.string().trim().max(12).optional(),
});

export const categoryUpdateSchema = categoryCreateSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  'Indique pelo menos um campo.',
);

export const expenseCreateSchema = z.object({
  description: z.string().trim().min(1).max(200),
  location: z.string().trim().min(1).max(200),
  amount: z.union([z.string(), z.number()]).transform(String).transform((value) => value.replace(',', '.')).refine(
    (value) => money.test(value) && Number(value) > 0,
    'O valor deve ser positivo e ter no máximo duas casas decimais.',
  ),
  date: z.string().regex(dateOnly, 'Use uma data no formato YYYY-MM-DD.').transform((value) => new Date(`${value}T00:00:00.000Z`)),
  categoryId: z.string().uuid(),
});

const booleanFromRequest = z.union([z.boolean(), z.enum(['true', 'false'])])
  .transform((value) => value === true || value === 'true');

export const expenseUpdateSchema = z.object({
  description: expenseCreateSchema.shape.description.optional(),
  location: expenseCreateSchema.shape.location.optional(),
  amount: expenseCreateSchema.shape.amount.optional(),
  date: expenseCreateSchema.shape.date.optional(),
  categoryId: expenseCreateSchema.shape.categoryId.optional(),
  // JSON envia boolean; multipart/form-data envia texto. O contrato aceita ambos.
  removeReceipt: booleanFromRequest.optional(),
}).refine((value) => Object.keys(value).length > 0, 'Indique pelo menos um campo.');

export const expenseFiltersSchema = z.object({
  category: z.string().uuid().optional(),
  from: z.string().regex(dateOnly).optional(),
  to: z.string().regex(dateOnly).optional(),
}).refine(
  ({ from, to }) => !from || !to || from <= to,
  { message: 'A data inicial não pode ser posterior à data final.', path: ['from'] },
);

const planningAmount = z.union([z.string(), z.number()])
  .transform(String)
  .transform((value) => value.replace(',', '.'))
  .refine(
    (value) => profileMoney.test(value) && Number(value) >= 0,
    'Use um valor entre 0 e 9999999999,99, com no máximo duas casas decimais.',
  );

const positivePlanningAmount = planningAmount.refine(
  (value) => Number(value) > 0,
  'O valor deve ser superior a zero.',
);

const planningDate = z.string()
  .regex(dateOnly, 'Use uma data no formato YYYY-MM-DD.')
  .transform((value) => new Date(`${value}T00:00:00.000Z`));

export const incomeCreateSchema = z.object({
  description: z.string().trim().min(1).max(160),
  source: z.string().trim().max(120).optional(),
  amount: positivePlanningAmount,
  date: planningDate,
});

export const incomeUpdateSchema = incomeCreateSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  'Indique pelo menos um campo.',
);

export const savingsGoalCreateSchema = z.object({
  name: z.string().trim().min(1).max(100),
  icon: z.string().trim().max(32).optional(),
  targetAmount: positivePlanningAmount,
  currentAmount: planningAmount.optional().default('0'),
  targetDate: planningDate.optional(),
});

export const savingsGoalUpdateSchema = z.object({
  name: savingsGoalCreateSchema.shape.name.optional(),
  icon: savingsGoalCreateSchema.shape.icon.optional(),
  targetAmount: savingsGoalCreateSchema.shape.targetAmount.optional(),
  currentAmount: planningAmount.optional(),
  targetDate: planningDate.nullable().optional(),
}).refine(
  (value) => Object.keys(value).length > 0,
  'Indique pelo menos um campo.',
);

export const recurringExpenseCreateSchema = z.object({
  description: z.string().trim().min(1).max(160),
  location: z.string().trim().min(1).max(160),
  amount: positivePlanningAmount,
  categoryId: z.string().uuid(),
  dayOfMonth: z.coerce.number().int().min(1).max(31),
});

export const recurringExpenseUpdateSchema = z.object({
  description: recurringExpenseCreateSchema.shape.description.optional(),
  location: recurringExpenseCreateSchema.shape.location.optional(),
  amount: recurringExpenseCreateSchema.shape.amount.optional(),
  categoryId: recurringExpenseCreateSchema.shape.categoryId.optional(),
  dayOfMonth: recurringExpenseCreateSchema.shape.dayOfMonth.optional(),
  isActive: booleanFromRequest.optional(),
}).refine(
  (value) => Object.keys(value).length > 0,
  'Indique pelo menos um campo.',
);

export const budgetCreateSchema = z.object({
  categoryId: z.string().uuid(),
  monthlyLimit,
});

export const budgetUpdateSchema = z.object({
  monthlyLimit,
});

const financialProfileAmount = z.union([z.string(), z.number()])
  .transform(String)
  .transform((value) => value.replace(',', '.'))
  .refine(
    (value) => profileMoney.test(value) && Number(value) <= 9_999_999_999.99,
    'Use um valor entre 0 e 9999999999,99, com no máximo duas casas decimais.',
  );

const positiveFinancialProfileAmount = financialProfileAmount.refine(
  (value) => Number(value) > 0,
  'O rendimento mensal líquido deve ser superior a zero.',
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
  month: z.string().regex(monthKey, 'Use o mês no formato YYYY-MM.').optional(),
});

export const analyticsTrendSchema = z.object({
  months: z.coerce.number().int().min(1).max(24).default(6),
  month: z.string().regex(monthKey, 'Use o mês no formato YYYY-MM.').optional(),
});
