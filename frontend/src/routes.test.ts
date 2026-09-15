import { describe, expect, it } from "vitest";
import { routes } from "./routes";

describe("routes", () => {
  it("encodes dynamic identifiers before using them in navigation", () => {
    expect(routes.account("account/one")).toBe("/accounts/account%2Fone");
    expect(routes.editExpense("expense one")).toBe("/expenses/expense%20one/edit");
  });

  it("keeps the canonical entry route aligned with the dashboard", () => {
    expect(routes.home).toBe(routes.dashboard);
  });
});
