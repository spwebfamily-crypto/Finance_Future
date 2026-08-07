import { describe, expect, it, vi } from 'vitest';
import { formatCurrency, toDateInputValue, todayInputValue } from './format';

describe('format helpers', () => {
  it('formats decimal strings as euros', () => {
    expect(formatCurrency('12345.50').replace(/\s/g, '')).toContain('12345,50');
    expect(formatCurrency('not-a-number')).toContain('0,00');
  });

  it('keeps the calendar date when preparing an input', () => {
    expect(toDateInputValue('2026-08-07T00:00:00.000Z')).toBe('2026-08-07');
  });

  it('uses the local calendar date for new expenses', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-07T10:00:00.000Z'));

    expect(todayInputValue()).toMatch(/^2026-08-0[67]$/);

    vi.useRealTimers();
  });
});
