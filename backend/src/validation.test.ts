import { describe, expect, it } from 'vitest';
import {
  expenseCreateSchema,
  expenseFiltersSchema,
  expenseUpdateSchema,
  financialProfileUpsertSchema,
  registerSchema,
} from './validation.js';

describe('request validation', () => {
  it('rejects malformed registration data', () => {
    expect(() => registerSchema.parse({ name: 'A', email: 'invalid', password: 'x' })).toThrow();
  });

  it('normalizes a decimal amount and a date-only value', () => {
    const value = expenseCreateSchema.parse({
      description: 'Café',
      location: 'Lisboa',
      amount: '2,50',
      date: '2026-08-07',
      categoryId: '7c8f0f14-1f87-4dfb-a2bf-85bf170a79c8',
    });

    expect(value.amount).toBe('2.50');
    expect(value.date.toISOString()).toBe('2026-08-07T00:00:00.000Z');
  });

  it('rejects an inverted date range', () => {
    expect(() => expenseFiltersSchema.parse({ from: '2026-08-08', to: '2026-08-01' })).toThrow();
  });

  it('accepts receipt removal from JSON and multipart requests', () => {
    expect(expenseUpdateSchema.parse({ removeReceipt: true }).removeReceipt).toBe(true);
    expect(expenseUpdateSchema.parse({ removeReceipt: 'true' }).removeReceipt).toBe(true);
    expect(expenseUpdateSchema.parse({ removeReceipt: false }).removeReceipt).toBe(false);
    expect(expenseUpdateSchema.parse({ removeReceipt: 'false' }).removeReceipt).toBe(false);
  });

  it('normalizes a complete financial profile without deriving recommendations', () => {
    const value = financialProfileUpsertSchema.parse({
      monthlyNetIncome: '2450,75',
      monthlyEssentialCosts: '520,40',
      monthlyHousingCosts: 850,
      monthlyDebtPayments: 0,
      currentSavings: '4200.00',
      goal: 'emergency_fund',
      horizon: 'medium_term',
      experience: 'beginner',
      riskTolerance: 'moderate',
    });

    expect(value).toEqual({
      monthlyNetIncome: '2450.75',
      monthlyEssentialCosts: '520.40',
      monthlyHousingCosts: '850',
      monthlyDebtPayments: '0',
      currentSavings: '4200.00',
      goal: 'emergency_fund',
      horizon: 'medium_term',
      experience: 'beginner',
      riskTolerance: 'moderate',
    });
    expect(value).not.toHaveProperty('recommendation');
  });

  it('rejects negative profile values and unsupported onboarding options', () => {
    const base = {
      monthlyNetIncome: '2450.75',
      monthlyEssentialCosts: '520.40',
      monthlyHousingCosts: '850',
      monthlyDebtPayments: '0',
      currentSavings: '4200.00',
      goal: 'emergency_fund',
      horizon: 'medium_term',
      experience: 'beginner',
      riskTolerance: 'moderate',
    };

    expect(() => financialProfileUpsertSchema.parse({ ...base, currentSavings: '-1' })).toThrow();
    expect(() => financialProfileUpsertSchema.parse({ ...base, riskTolerance: 'unlimited' })).toThrow();
  });
});
