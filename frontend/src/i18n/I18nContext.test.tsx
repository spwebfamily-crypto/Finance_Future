import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import {
  I18nProvider,
  LanguageSwitcher,
  semanticMessages,
  supportedLocales,
  useI18n,
} from "./I18nContext";
import { pageMessages } from "./pageMessages";

function Example() {
  const { t } = useI18n();
  return (
    <>
      <p>{t("Contas e cartões")}</p>
      <p>{t("Movimento do dia")}</p>
    </>
  );
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
    expect(screen.getByText("Today's activity")).toBeInTheDocument();
    await waitFor(() => {
      expect(document.documentElement.lang).toBe("en-GB");
      expect(window.localStorage.getItem("expensesnap:locale")).toBe("en-GB");
    });
  });

  it("keeps semantic keys complete across supported locales", () => {
    const keys = Object.keys(semanticMessages["pt-PT"]).sort();
    for (const locale of supportedLocales) {
      expect(Object.keys(semanticMessages[locale]).sort()).toEqual(keys);
    }
  });

  it("keeps page catalogs complete across supported locales", () => {
    const keys = Object.keys(pageMessages["pt-PT"]).sort();
    for (const locale of supportedLocales) {
      expect(Object.keys(pageMessages[locale]).sort()).toEqual(keys);
    }
  });

  it("formats numbers, dates and currencies using the selected locale", async () => {
    function Formats() {
      const { locale, formatCurrency, formatDate, formatNumber, setLocale } = useI18n();
      return (
        <>
          <output aria-label="locale">{locale}</output>
          <output aria-label="number">{formatNumber(1234.5)}</output>
          <output aria-label="currency">{formatCurrency(1234.5, "EUR")}</output>
          <output aria-label="date">{formatDate("2026-08-07", { dateStyle: "medium" })}</output>
          <button type="button" onClick={() => setLocale("es-ES")}>
            ES
          </button>
        </>
      );
    }

    const user = userEvent.setup();
    render(
      <I18nProvider>
        <Formats />
      </I18nProvider>,
    );
    await user.click(screen.getByRole("button", { name: "ES" }));
    expect(screen.getByLabelText("locale")).toHaveTextContent("es-ES");
    expect(screen.getByLabelText("number")).toHaveTextContent("1234,5");
    expect(screen.getByLabelText("currency")).toHaveTextContent("€");
    expect(screen.getByLabelText("date")).toHaveTextContent("ago");
  });
});
