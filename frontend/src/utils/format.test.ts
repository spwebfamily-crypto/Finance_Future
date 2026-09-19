import { describe, expect, it, vi } from "vitest";
import {
  formatCurrency,
  formatDate,
  formatSignedCurrency,
  parseMoney,
  parseSignedMoney,
  toDateInputValue,
  todayInputValue,
} from "./format";

describe("format helpers", () => {
  it("formats decimal strings as euros", () => {
    expect(formatCurrency("12345.50").replace(/\s/g, "")).toContain("12345,50");
    expect(formatCurrency("not-a-number")).toContain("0,00");
  });

  it("never renders negative zero and exposes signs only for non-zero values", () => {
    expect(formatCurrency(-0.001)).not.toMatch(/[-−]\s?0[,.]00/);
    expect(formatSignedCurrency(-0.001)).not.toMatch(/[-−]\s?0[,.]00/);
    expect(formatSignedCurrency(12.5).replace(/\s/g, "")).toMatch(/^\+12,50/);
    expect(formatSignedCurrency(-12.5).replace(/\s/g, "")).toMatch(/^-12,50/);
  });

  it("keeps the calendar date when preparing an input", () => {
    expect(toDateInputValue("2026-08-07T00:00:00.000Z")).toBe("2026-08-07");
    expect(formatDate("2026-08-07T00:00:00.000Z")).toMatch(/07/);
  });

  it("formats dates with an explicit locale and options", () => {
    expect(formatDate("2026-08-07", "en-GB", { dateStyle: "medium" })).toContain("7 Aug 2026");
    expect(formatDate("2026-08-07", "es-ES", { dateStyle: "medium" })).toContain("7 ago 2026");
  });

  it("parses grouped and signed monetary form values", () => {
    expect(parseMoney("1 500,50")).toBe(1500.5);
    expect(parseMoney("1.500,50")).toBe(1500.5);
    expect(parseSignedMoney("-1 500,50")).toBe(-1500.5);
    expect(parseSignedMoney("1.2.3")).toBeNaN();
  });

  it("uses the local calendar date for new expenses", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-07T10:00:00.000Z"));

    expect(todayInputValue()).toMatch(/^2026-08-0[67]$/);

    vi.useRealTimers();
  });
});
