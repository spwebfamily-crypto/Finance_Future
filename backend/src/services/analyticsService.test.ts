import { describe, expect, it } from "vitest";
import {
  calculateSpendingLevel,
  currentMonthContext,
  monthsEndingAt,
  shiftMonth,
} from "./analyticsService.js";

function historyRatio(currentAmount: string) {
  return calculateSpendingLevel({
    currentAmount,
    historyAmounts: ["100", "100", "100"],
    isCurrentMonth: false,
    elapsedDays: 31,
    daysInMonth: 31,
  });
}

describe("spending level calculation", () => {
  it("keeps the exact historical thresholds in their lower level", () => {
    expect(historyRatio("110").level).toBe("normal");
    expect(historyRatio("110.01").level).toBe("high");
    expect(historyRatio("140").level).toBe("high");
    expect(historyRatio("140.01").level).toBe("critical");
  });

  it("uses actual spend against a budget and gives it precedence", () => {
    const atEighty = calculateSpendingLevel({
      currentAmount: "80",
      historyAmounts: ["1", "1", "1"],
      monthlyLimit: "100",
      isCurrentMonth: true,
      elapsedDays: 1,
      daysInMonth: 31,
    });
    const budgetInput = {
      historyAmounts: ["1", "1", "1"],
      monthlyLimit: "100",
      isCurrentMonth: true,
      elapsedDays: 1,
      daysInMonth: 31,
    };
    const atLimit = calculateSpendingLevel({ ...budgetInput, currentAmount: "100" });
    const aboveLimit = calculateSpendingLevel({ ...budgetInput, currentAmount: "100.01" });

    expect(atEighty.level).toBe("normal");
    expect(atLimit.level).toBe("high");
    expect(aboveLimit.level).toBe("critical");
    expect(atEighty.basis).toBe("budget");
  });

  it("projects the current month linearly", () => {
    const result = calculateSpendingLevel({
      currentAmount: "10",
      historyAmounts: ["300", "300", "300"],
      isCurrentMonth: true,
      elapsedDays: 1,
      daysInMonth: 30,
    });

    expect(result.projectedAmount.toString()).toBe("300");
    expect(result.level).toBe("normal");
  });

  it("does not mark a first-ever spend as critical", () => {
    const result = calculateSpendingLevel({
      currentAmount: "500",
      historyAmounts: ["0", "0", "0"],
      isCurrentMonth: true,
      elapsedDays: 7,
      daysInMonth: 31,
    });

    expect(result.level).toBe("insufficient_data");
    expect(result.basis).toBe("none");
  });

  it("treats spend against a zero budget defensively as critical", () => {
    const result = calculateSpendingLevel({
      currentAmount: "0.01",
      historyAmounts: [],
      monthlyLimit: "0",
      isCurrentMonth: false,
      elapsedDays: 31,
      daysInMonth: 31,
    });

    expect(result.level).toBe("critical");
  });

  it("uses decimal arithmetic at classification boundaries", () => {
    const result = calculateSpendingLevel({
      currentAmount: "0.30",
      historyAmounts: ["0.10", "0.20", "0.60"],
      isCurrentMonth: false,
      elapsedDays: 30,
      daysInMonth: 30,
    });

    expect(result.comparisonRatio?.toDecimalPlaces(4).toString()).toBe("1");
    expect(result.level).toBe("normal");
  });
});

describe("month helpers", () => {
  it("handles leap years and the user timezone", () => {
    const context = currentMonthContext(new Date("2024-02-29T23:30:00.000Z"), "Europe/Lisbon");
    expect(context).toEqual({ month: "2024-02", elapsedDays: 29, daysInMonth: 29 });
  });

  it("crosses year boundaries in chronological order", () => {
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(monthsEndingAt("2026-02", 3)).toEqual(["2025-12", "2026-01", "2026-02"]);
  });

  it("rejects invalid month and day inputs instead of silently normalizing them", () => {
    expect(() => shiftMonth("2026-13", 1)).toThrow(RangeError);
    expect(() =>
      calculateSpendingLevel({
        currentAmount: "10",
        historyAmounts: ["10"],
        isCurrentMonth: true,
        elapsedDays: 0,
        daysInMonth: 31,
      }),
    ).toThrow(RangeError);
  });
});
