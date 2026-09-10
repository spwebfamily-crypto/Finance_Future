import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { GlyphPortal } from "./glyph-portal";

describe("GlyphPortal", () => {
  it("renders a readable fallback, entry action and accessible letter picker", () => {
    const { container } = render(
      <GlyphPortal
        word="EXPENSESNAP"
        ariaLabel="ExpenseSnap visual portal"
        enterLabel="Enter section"
        chooseLetterLabel="Choose a letter"
      >
        <h2>What comes next</h2>
      </GlyphPortal>,
    );

    expect(screen.getByRole("region", { name: "ExpenseSnap visual portal" })).toBeInTheDocument();
    expect(screen.getAllByText("EXPENSESNAP").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole("link", { name: /Enter section/ })).toHaveAttribute("href");
    expect(container.querySelector('[role="radiogroup"][aria-label="Choose a letter"]')).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "What comes next" })).toBeInTheDocument();
  });
});
