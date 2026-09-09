import { render, screen, within } from "@testing-library/react";
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
        name: /^Para onde vai o seu dinheiro\? Agora consegue ver\.$/,
      }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Começar grátis" })[0]).toHaveAttribute(
      "href",
      liveAppUrl("/register"),
    );
    expect(screen.getByRole("link", { name: "Entrar" })).toHaveAttribute(
      "href",
      liveAppUrl("/login"),
    );
    expect(screen.getByRole("link", { name: "Começar" })).toHaveAttribute(
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
        name: /^Para onde vai o seu dinheiro\? Agora consegue ver\.$/,
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
  it("shows dashboard information and the monthly budget percentage", () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <App />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole("heading", { name: "Para onde vai o seu dinheiro? Agora consegue ver." }),
    ).toBeInTheDocument();
    expect(screen.getByText("Total de despesas em setembro")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Orçamento utilizado" })).toHaveAttribute(
      "aria-valuenow",
      "81",
    );
    expect(screen.getByText("12,6%", { exact: false })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Criar conta grátis" })).toHaveAttribute(
      "href",
      liveAppUrl("/register"),
    );
    expect(
      within(screen.getByRole("contentinfo")).getByRole("link", { name: "Privacidade" }),
    ).toHaveAttribute("href", liveAppUrl("/privacy"));
  });
});
