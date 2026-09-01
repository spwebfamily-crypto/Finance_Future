import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BankBalance } from "./BankBalance";

describe("BankBalance", () => {
  it("does not mention a reconciliation gap when the values match", () => {
    render(
      <BankBalance
        currentBalance={100}
        derivedBalance={100}
        balanceDelta={0}
        balanceSource="provider"
        currency="EUR"
      />,
    );

    expect(screen.getByText("Valor fornecido pelo banco")).toBeInTheDocument();
    expect(screen.queryByText(/diferença/)).not.toBeInTheDocument();
  });

  it("shows the in-app total when it differs from the bank snapshot", () => {
    render(
      <BankBalance
        currentBalance={1250}
        derivedBalance={1180}
        balanceDelta={70}
        balanceSource="provider"
        currency="EUR"
      />,
    );

    expect(screen.getByText(/Na app:/)).toBeInTheDocument();
    expect(screen.getByText(/diferença/)).toBeInTheDocument();
  });
});
