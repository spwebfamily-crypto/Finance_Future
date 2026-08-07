import { Prisma } from '@prisma/client';

export type SpendingLevel = 'normal' | 'high' | 'critical' | 'insufficient_data';
export type LevelBasis = 'budget' | 'history' | 'none';
export type MonthKey = `${number}-${string}`;

export interface LevelCalculationInput {
  currentAmount: Prisma.Decimal.Value;
  historyAmounts: Prisma.Decimal.Value[];
  monthlyLimit?: Prisma.Decimal.Value | null;
  isCurrentMonth: boolean;
  elapsedDays: number;
  daysInMonth: number;
}

export interface LevelCalculation {
  level: SpendingLevel;
  basis: LevelBasis;
  currentAmount: Prisma.Decimal;
  projectedAmount: Prisma.Decimal;
  baselineAmount: Prisma.Decimal | null;
  comparisonRatio: Prisma.Decimal | null;
}

const monthPattern = /^(\d{4})-(0[1-9]|1[0-2])$/;

function decimal(value: Prisma.Decimal.Value) {
  return new Prisma.Decimal(value);
}

export function calculateSpendingLevel(input: LevelCalculationInput): LevelCalculation {
  const currentAmount = decimal(input.currentAmount);
  if (!Number.isInteger(input.daysInMonth) || input.daysInMonth < 1) {
    throw new RangeError('daysInMonth must be a positive integer');
  }
  if (!Number.isInteger(input.elapsedDays) || input.elapsedDays < 1 || input.elapsedDays > input.daysInMonth) {
    throw new RangeError('elapsedDays must be within the month');
  }
  if (currentAmount.isNegative()) throw new RangeError('currentAmount cannot be negative');

  const elapsedDays = input.elapsedDays;
  const projectedAmount = input.isCurrentMonth
    ? currentAmount.mul(input.daysInMonth).div(elapsedDays)
    : currentAmount;

  if (input.monthlyLimit !== null && input.monthlyLimit !== undefined) {
    const baselineAmount = decimal(input.monthlyLimit);
    if (baselineAmount.isNegative()) throw new RangeError('monthlyLimit cannot be negative');
    const comparisonRatio = baselineAmount.isZero() ? null : currentAmount.div(baselineAmount);
    const level: SpendingLevel = baselineAmount.isZero()
      ? currentAmount.isZero() ? 'normal' : 'critical'
      : comparisonRatio!.lte(0.8)
      ? 'normal'
      : comparisonRatio!.lte(1)
        ? 'high'
        : 'critical';

    return {
      level,
      basis: 'budget',
      currentAmount,
      projectedAmount,
      baselineAmount,
      comparisonRatio,
    };
  }

  const history = input.historyAmounts.map(decimal);
  if (history.some((value) => value.isNegative())) throw new RangeError('historyAmounts cannot be negative');
  const historyTotal = history.reduce((total, value) => total.add(value), decimal(0));
  if (history.length === 0 || historyTotal.isZero()) {
    return {
      level: 'insufficient_data',
      basis: 'none',
      currentAmount,
      projectedAmount,
      baselineAmount: null,
      comparisonRatio: null,
    };
  }

  const baselineAmount = historyTotal.div(history.length);
  const comparisonRatio = projectedAmount.div(baselineAmount);
  const level: SpendingLevel = comparisonRatio.lte(1.1)
    ? 'normal'
    : comparisonRatio.lte(1.4)
      ? 'high'
      : 'critical';

  return {
    level,
    basis: 'history',
    currentAmount,
    projectedAmount,
    baselineAmount,
    comparisonRatio,
  };
}

export function currentMonthContext(now: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const year = Number(values.year);
  const month = Number(values.month);
  const day = Number(values.day);

  return {
    month: `${year}-${String(month).padStart(2, '0')}` as MonthKey,
    elapsedDays: day,
    daysInMonth: new Date(Date.UTC(year, month, 0)).getUTCDate(),
  };
}

export function shiftMonth(month: string, offset: number): MonthKey {
  const [year, monthNumber] = parseMonthParts(month);
  if (!Number.isInteger(offset)) throw new RangeError('month offset must be an integer');
  const shifted = new Date(Date.UTC(year!, monthNumber! - 1 + offset, 1));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}` as MonthKey;
}

export function monthBounds(month: string) {
  const [year, monthNumber] = parseMonthParts(month);
  return {
    start: new Date(Date.UTC(year!, monthNumber! - 1, 1)),
    end: new Date(Date.UTC(year!, monthNumber!, 1)),
  };
}

export function monthsEndingAt(month: string, count: number) {
  if (!Number.isInteger(count) || count < 1 || count > 24) {
    throw new RangeError('month count must be an integer between 1 and 24');
  }
  return Array.from({ length: count }, (_value, index) => shiftMonth(month, index - count + 1));
}

export function moneyNumber(value: Prisma.Decimal.Value) {
  return decimal(value).toDecimalPlaces(2).toNumber();
}

function parseMonthParts(month: string): [number, number] {
  const match = monthPattern.exec(month);
  if (!match) throw new RangeError('month must use the YYYY-MM format');
  return [Number(match[1]), Number(match[2])];
}
