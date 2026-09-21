import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { aggregateExpenses } from "./financialAggregationService.js";

describe("financial expense aggregation", () => {
  it("keeps currencies and local dates separate", () => {
    const aggregate = aggregateExpenses(
      [
        {
          categoryId: "food",
          amount: new Prisma.Decimal("10.00"),
          currency: null,
          account: { currency: "EUR" },
          date: new Date("2026-09-21T23:30:00.000Z"),
        },
        {
          categoryId: "food",
          amount: new Prisma.Decimal("20.00"),
          currency: "USD",
          date: new Date("2026-09-21T23:30:00.000Z"),
        },
      ],
      "Europe/Lisbon",
      "EUR",
    );

    expect(aggregate.byMonthCurrency.get("2026-09")?.get("EUR")?.toString()).toBe("10");
    expect(aggregate.byMonthCurrency.get("2026-09")?.get("USD")?.toString()).toBe("20");
    expect(aggregate.byDayCurrency.get("2026-09-22")?.get("EUR")?.toString()).toBe("10");
  });
});
