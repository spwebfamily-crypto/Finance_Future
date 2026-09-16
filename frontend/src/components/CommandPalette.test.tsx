import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { CommandPalette, CommandPaletteTrigger } from "./CommandPalette";
import { ThemeProvider } from "./ThemeProvider";

function LocationProbe() {
  return <output aria-label="Rota atual">{useLocation().pathname}</output>;
}

describe("CommandPalette", () => {
  it("opens with the platform shortcut, filters and navigates with Enter", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/dashboard"]}>
        <ThemeProvider>
          <CommandPalette />
          <LocationProbe />
        </ThemeProvider>
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

  it("offers a direct command to return to the system theme", async () => {
    render(
      <MemoryRouter>
        <ThemeProvider>
          <CommandPalette />
          <CommandPaletteTrigger />
        </ThemeProvider>
      </MemoryRouter>,
    );
    fireEvent.keyDown(window, { key: "k", metaKey: true });
    expect(await screen.findByRole("option", { name: /tema: sistema/i })).toBeInTheDocument();
  });
});
