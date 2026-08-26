import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { CommandPalette } from "./CommandPalette";

function LocationProbe() {
  return <output aria-label="Rota atual">{useLocation().pathname}</output>;
}

describe("CommandPalette", () => {
  it("opens with the platform shortcut, filters and navigates with Enter", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/dashboard"]}>
        <CommandPalette />
        <LocationProbe />
      </MemoryRouter>,
    );

    fireEvent.keyDown(window, { key: "k", metaKey: true });
    const input = await screen.findByRole("textbox", { name: "Pesquisar comandos" });
    await user.type(input, "registar");

    expect(screen.getByRole("option", { name: /Registar despesa/ })).toBeInTheDocument();
    await user.keyboard("{Enter}");

    expect(screen.getByLabelText("Rota atual")).toHaveTextContent("/expenses/new");
    expect(screen.queryByRole("dialog", { name: "Pesquisa rápida" })).not.toBeInTheDocument();
  });
});
