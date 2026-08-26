import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { SpendingHeatmap } from "./SpendingHeatmap";

describe("SpendingHeatmap", () => {
  it("renders daily totals with relative intensity levels", () => {
    const { container } = render(
      <MemoryRouter>
        <SpendingHeatmap
          month="2026-08"
          currency="EUR"
          byDay={[
            { day: "2026-08-03", total: 10 },
            { day: "2026-08-12", total: 100 },
          ]}
        />
      </MemoryRouter>,
    );

    expect(screen.getByLabelText(/3 de agosto: 10,00/)).toBeInTheDocument();
    expect(screen.getByLabelText(/12 de agosto: 100,00/)).toBeInTheDocument();
    expect(container.querySelectorAll(".heatmap__cell--level-4")).toHaveLength(2);
    expect(container.querySelector("[title*='12 de agosto']")).toHaveClass(
      "heatmap__cell--level-4",
    );
  });

  it("shows a useful empty state when there are no daily totals", () => {
    render(
      <MemoryRouter>
        <SpendingHeatmap month="2026-08" currency="EUR" byDay={[]} />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: "Sem despesas neste mês" })).toBeInTheDocument();
  });
});
