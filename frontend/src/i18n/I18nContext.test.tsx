import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { I18nProvider, LanguageSwitcher, useI18n } from "./I18nContext";

function Example() {
  const { t } = useI18n();
  return <p>{t("Contas e cartões")}</p>;
}

describe("I18nProvider", () => {
  beforeEach(() => window.localStorage.clear());

  it("changes language immediately and persists the choice", async () => {
    const user = userEvent.setup();
    render(
      <I18nProvider>
        <LanguageSwitcher />
        <Example />
      </I18nProvider>,
    );

    expect(screen.getByText("Contas e cartões")).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Idioma / Language / Idioma"), "en-GB");

    expect(screen.getByText("Accounts and cards")).toBeInTheDocument();
    await waitFor(() => {
      expect(document.documentElement.lang).toBe("en-GB");
      expect(window.localStorage.getItem("expensesnap:locale")).toBe("en-GB");
    });
  });
});
