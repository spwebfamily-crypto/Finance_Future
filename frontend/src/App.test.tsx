import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import App from "./App";
import { GuestRoute } from "./auth/ProtectedRoute";

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

const resetToken = "a".repeat(64);

function LocationProbe() {
  return <output aria-label="Rota atual">{useLocation().pathname}</output>;
}

describe("auth email routes", () => {
  it("lets a logged-in user open /reset-password with a token", () => {
    render(
      <MemoryRouter initialEntries={[`/reset-password?token=${resetToken}`]}>
        <App />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: "Escolha uma palavra-passe" })).toBeInTheDocument();
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
