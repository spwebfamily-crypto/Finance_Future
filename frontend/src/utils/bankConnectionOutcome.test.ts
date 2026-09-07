import { describe, expect, it } from "vitest";
import { bankConnectionOutcomeMessage } from "./bankConnectionOutcome";

describe("bankConnectionOutcomeMessage", () => {
  it("turns safe callback reasons into actionable messages", () => {
    expect(bankConnectionOutcomeMessage("error", "cancelled")).toContain("cancelada");
    expect(bankConnectionOutcomeMessage("error", "provider_unavailable")).toContain(
      "temporariamente indisponível",
    );
  });

  it("does not expose unknown provider details", () => {
    expect(bankConnectionOutcomeMessage("error", "secret-provider-error")).toBe(
      "Não foi possível concluir a ligação ao banco. Tente novamente.",
    );
  });
});
