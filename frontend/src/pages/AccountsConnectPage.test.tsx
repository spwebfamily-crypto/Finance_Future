import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AccountsConnectPage } from "./AccountsConnectPage";
import type { BankInstitution } from "../types";

const api = vi.hoisted(() => ({
  institutions: vi.fn(),
  authorize: vi.fn(),
}));

vi.mock("../api/resources", () => ({ openBankingApi: api }));

const institutions: BankInstitution[] = [
  {
    id: "PT|Banco Demonstração",
    name: "Banco Demonstração",
    country: "PT",
    logoUrl: null,
    supportsPersonal: true,
    supportsBusiness: false,
  },
  {
    id: "PT|Outro Banco",
    name: "Outro Banco",
    country: "PT",
    logoUrl: null,
    supportsPersonal: true,
    supportsBusiness: true,
  },
];

function setOnline(value: boolean) {
  Object.defineProperty(window.navigator, "onLine", { value, configurable: true });
}

describe("AccountsConnectPage", () => {
  let assign: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    assign = vi.fn();
    Object.defineProperty(window, "location", {
      value: { ...window.location, assign },
      writable: true,
      configurable: true,
    });
    setOnline(true);
    api.institutions.mockReset().mockResolvedValue(institutions);
    api.authorize.mockReset().mockResolvedValue({
      authorizationUrl: "https://banco.example/autorizar",
      expiresAt: new Date(Date.now() + 600_000).toISOString(),
      institutionName: "Banco Demonstração",
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function renderPage() {
    return render(
      <MemoryRouter>
        <AccountsConnectPage />
      </MemoryRouter>,
    );
  }

  it("shows the loading state and then the available banks", async () => {
    renderPage();
    expect(screen.getByText(/A carregar os bancos disponíveis/)).toBeInTheDocument();
    expect(await screen.findByText("Banco Demonstração")).toBeInTheDocument();
    expect(screen.getByText("Outro Banco")).toBeInTheDocument();
  });

  it("shows an error state with a retry when the list fails", async () => {
    api.institutions.mockRejectedValueOnce(new Error("indisponível"));
    renderPage();
    expect(await screen.findByText("indisponível")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tentar novamente" })).toBeInTheDocument();
  });

  it("filters banks by name", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Banco Demonstração");

    await user.type(screen.getByLabelText("Pesquisar banco"), "Outro");

    expect(screen.queryByText("Banco Demonstração")).not.toBeInTheDocument();
    expect(screen.getByText("Outro Banco")).toBeInTheDocument();
  });

  it("requires a bank before continuing and then redirects to the bank", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Banco Demonstração");

    const continueButton = screen.getByRole("button", { name: "Continuar no banco" });
    expect(continueButton).toBeDisabled();

    await user.click(screen.getByRole("button", { name: /Banco Demonstração/ }));
    await user.click(continueButton);

    await waitFor(() =>
      expect(api.authorize).toHaveBeenCalledWith({
        institutionId: "PT|Banco Demonstração",
        country: "PT",
        psuType: "personal",
        returnPath: "/accounts",
      }),
    );
    expect(assign).toHaveBeenCalledWith("https://banco.example/autorizar");
  });

  it("explains that the password is never shared", async () => {
    renderPage();
    await screen.findByText("Banco Demonstração");
    expect(screen.getByText(/recebe nem guarda a sua palavra-passe/i)).toBeInTheDocument();
  });

  it("disables the flow when the browser is offline", async () => {
    setOnline(false);
    renderPage();
    await screen.findByText("Banco Demonstração");

    expect(screen.getByRole("button", { name: "Continuar no banco" })).toBeDisabled();
    expect(screen.getByText(/Sem ligação/)).toBeInTheDocument();
  });
});
