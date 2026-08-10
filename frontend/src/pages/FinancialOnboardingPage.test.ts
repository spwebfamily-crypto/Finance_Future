import { describe, expect, it } from 'vitest';
import { parseMoney } from './FinancialOnboardingPage';

describe('financial onboarding money input', () => {
  it.each([
    ['1.500', 1500],
    ['1.500,50', 1500.5],
    ['1 500,50', 1500.5],
    ['1,234.56', 1234.56],
    ['1500,5', 1500.5],
    ['0', 0],
  ])('parses a valid grouped amount: %s', (input, expected) => {
    expect(parseMoney(input)).toBe(expected);
  });

  it.each(['1.2.3', '12..34', '1 23', '1.2345', '10,1234', 'abc'])('rejects an ambiguous amount: %s', (input) => {
    expect(parseMoney(input)).toBeNaN();
  });
});
