import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BankBalance } from "./BankBalance";

describe("BankBalance", () => {
  it("shows only the balance supplied by the bank", () => {
    render(<BankBalance currentBalance={100} balanceSource="provider" currency="EUR" />);

    expect(screen.getByText("Valor fornecido pelo banco")).toBeInTheDocument();
    expect(screen.queryByText(/diferença/)).not.toBeInTheDocument();
  });

  it("does not invent a balance while the bank snapshot is unavailable", () => {
    render(<BankBalance currentBalance={null} balanceSource="unavailable" currency="EUR" />);

    expect(screen.getAllByText("Ainda sem sincronização")).toHaveLength(2);
    expect(screen.queryByText(/0,00/)).not.toBeInTheDocument();
  });
});
