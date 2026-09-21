import { Prisma } from "@prisma/client";
import { localDateKey, monthKeyForDate } from "./analyticsService.js";

export type ExpenseAggregationRow = {
  categoryId: string;
  amount: Prisma.Decimal;
  currency?: string | null;
  account?: { currency?: string | null } | null;
  date: Date;
};

export type ExpenseAggregate = {
  byMonthCurrencyCategory: Map<string, Map<string, Map<string, Prisma.Decimal>>>;
  byMonthCurrency: Map<string, Map<string, Prisma.Decimal>>;
  byDayCurrency: Map<string, Map<string, Prisma.Decimal>>;
};

function add(map: Map<string, Prisma.Decimal>, key: string, value: Prisma.Decimal) {
  map.set(key, (map.get(key) ?? new Prisma.Decimal(0)).add(value));
}

/**
 * A única agregação de despesas usada por analytics e dashboard.
 * BankTransaction nunca é somado aqui: uma transação bancária contabilizada
 * já possui exatamente uma projeção Expense.
 */
export function aggregateExpenses(
  rows: readonly ExpenseAggregationRow[],
  timeZone: string,
  fallbackCurrency: string,
): ExpenseAggregate {
  const byMonthCurrencyCategory = new Map<string, Map<string, Map<string, Prisma.Decimal>>>();
  const byMonthCurrency = new Map<string, Map<string, Prisma.Decimal>>();
  const byDayCurrency = new Map<string, Map<string, Prisma.Decimal>>();

  for (const row of rows) {
    const currency = row.currency || row.account?.currency || fallbackCurrency;
    const month = monthKeyForDate(row.date, timeZone);
    const day = localDateKey(row.date, timeZone);
    const monthCurrencies = byMonthCurrencyCategory.get(month) ?? new Map();
    const categoryTotals = monthCurrencies.get(currency) ?? new Map();
    add(categoryTotals, row.categoryId, row.amount);
    monthCurrencies.set(currency, categoryTotals);
    byMonthCurrencyCategory.set(month, monthCurrencies);

    const monthTotals = byMonthCurrency.get(month) ?? new Map();
    add(monthTotals, currency, row.amount);
    byMonthCurrency.set(month, monthTotals);

    const dayTotals = byDayCurrency.get(day) ?? new Map();
    add(dayTotals, currency, row.amount);
    byDayCurrency.set(day, dayTotals);
  }

  return { byMonthCurrencyCategory, byMonthCurrency, byDayCurrency };
}
