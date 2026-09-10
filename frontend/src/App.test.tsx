import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import App from "./App";
import { GuestRoute } from "./auth/ProtectedRoute";
import { liveAppUrl } from "./config/liveApp";

vi.mock("./auth/AuthContext", () => ({
  useAuth: () => ({
    isAuthenticated: true,
    isInitializing: false,
    user: { id: "user-1", name: "Rita", email: "rita@example.com", currency: "EUR" },
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
    applyUser: vi.fn(),
  }),
}));

function LocationProbe() {
  return <output aria-label="Rota atual">{useLocation().pathname}</output>;
}

describe("auth email routes", () => {
  it("apresenta a landing page na rota pública inicial", () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <App />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: /^Saiba para onde vai o seu dinheiro\. Decida o que vem a seguir\.$/,
      }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Começar grátis" })[0]).toHaveAttribute(
      "href",
      liveAppUrl("/register"),
    );
    expect(screen.getAllByRole("link", { name: "Entrar" })[0]).toHaveAttribute(
      "href",
      liveAppUrl("/login"),
    );
    expect(screen.getByRole("link", { name: "Experimentar" })).toHaveAttribute(
      "href",
      liveAppUrl("/register"),
    );
  });

  it("redirects app routes back to the landing page", () => {
    render(
      <MemoryRouter initialEntries={["/dashboard"]}>
        <App />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: /^Saiba para onde vai o seu dinheiro\. Decida o que vem a seguir\.$/,
      }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Hoje" })).not.toBeInTheDocument();
  });

  it("keeps /forgot-password as a guest-only page", () => {
    render(
      <MemoryRouter initialEntries={["/forgot-password"]}>
        <Routes>
          <Route element={<GuestRoute />}>
            <Route path="/forgot-password" element={<p>Esqueceu a palavra-passe?</p>} />
          </Route>
          <Route path="/dashboard" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByLabelText("Rota atual")).toHaveTextContent("/dashboard");
    expect(screen.queryByText("Esqueceu a palavra-passe?")).not.toBeInTheDocument();
  });
});

describe("public landing page", () => {
  it("closes the mobile navigation with Escape and returns focus to its trigger", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/"]}>
        <App />
      </MemoryRouter>,
    );

    const menuButton = screen.getByRole("button", { name: "Abrir menu" });
    await user.click(menuButton);
    expect(menuButton).toHaveAttribute("aria-controls", "landing-navigation");
    expect(menuButton).toHaveAttribute("aria-expanded", "true");

    await user.keyboard("{Escape}");
    expect(menuButton).toHaveAttribute("aria-expanded", "false");
    expect(menuButton).toHaveFocus();
  });

  it("shows dashboard information and the monthly budget percentage", () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <App />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole("heading", {
        name: "Saiba para onde vai o seu dinheiro. Decida o que vem a seguir.",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("3 gastos para confirmar")).toBeInTheDocument();
    expect(screen.getByText("68%")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Orçamento mensal utilizado" })).toHaveAttribute(
      "aria-valuenow",
      "81",
    );
    expect(
      screen.getByLabelText("Pré-visualização do dashboard do ExpenseSnap num iPhone"),
    ).toBeInTheDocument();
    expect(screen.getByText("Disponível até ao fim do mês")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Começar grátis" }).at(-1)).toHaveAttribute(
      "href",
      liveAppUrl("/register"),
    );
    expect(
      within(screen.getByRole("contentinfo")).getByRole("link", { name: "Privacidade" }),
    ).toHaveAttribute("href", liveAppUrl("/privacy"));
  });
});
