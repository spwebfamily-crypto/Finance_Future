import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DisconnectBankDialog } from "./DisconnectBankDialog";

describe("DisconnectBankDialog", () => {
  it("keeps imported data by default and asks for confirmation to delete", async () => {
    const onConfirm = vi.fn();
    const user = userEvent.setup();
    render(
      <DisconnectBankDialog
        open
        institutionName="Banco Demonstração"
        onCancel={() => undefined}
        onConfirm={onConfirm}
      />,
    );

    expect(screen.getByText(/Desligar Banco Demonstração/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Desligar e conservar" }));
    expect(onConfirm).toHaveBeenCalledWith("keep_imported");

    await user.click(screen.getByLabelText(/Eliminar os dados importados/i));
    const destructive = screen.getByRole("button", { name: "Eliminar e desligar" });
    expect(destructive).toBeDisabled();

    await user.type(screen.getByLabelText(/Escreva/i), "eliminar");
    expect(destructive).toBeEnabled();
    await user.click(destructive);
    expect(onConfirm).toHaveBeenCalledWith("delete_imported");
  });
});
