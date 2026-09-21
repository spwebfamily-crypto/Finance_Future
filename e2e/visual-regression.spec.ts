import { AxeBuilder } from "@axe-core/playwright";
import { expect, test, type Page, type TestInfo } from "@playwright/test";

const user = {
  id: "visual-user",
  name: "Ana Ribeiro",
  email: "ana@example.test",
  currency: "EUR",
  timeZone: "Europe/Lisbon",
  emailVerified: true,
};

const category = {
  id: "groceries",
  name: "Alimentação e casa",
  icon: "shopping-cart",
  isDefault: true,
};
const summary = {
  month: "2026-09",
  timeZone: "Europe/Lisbon",
  currency: "EUR",
  total: 1248.6,
  previousMonthTotal: 1130.2,
  changeAmount: 118.4,
  changePercent: 10.5,
  byDay: [{ day: "2026-09-04", total: 64.2 }],
  byCategory: [
    {
      category,
      amount: 412.75,
      previousAmount: 320.4,
      changeAmount: 92.35,
      changePercent: 28.8,
      sharePercent: 33.1,
    },
  ],
};

const dashboard = {
  summary,
  today: {
    date: "2026-09-19",
    timeZone: "Europe/Lisbon",
    currency: "EUR",
    expenseTotal: 18.4,
    incomeTotal: 320,
    netTotal: 301.6,
    items: [],
  },
  levels: [],
  trend: {
    timeZone: "Europe/Lisbon",
    currency: "EUR",
    series: [
      { month: "2026-08", total: 1130.2 },
      { month: "2026-09", total: 1248.6 },
    ],
  },
  budgets: [],
  categories: [category],
  accounts: [],
  partialErrors: [],
};

const planning = {
  from: "2026-09-01",
  to: "2026-10-01",
  categories: [category],
  incomes: [],
  goals: [],
  recurringExpenses: [],
  recurringIncomes: [],
  debts: [],
};

const profile = {
  id: "profile-1",
  monthlyNetIncome: 2450,
  monthlyEssentialCosts: 640,
  monthlyHousingCosts: 820,
  monthlyDebtPayments: 120,
  currentSavings: 7200,
  goal: "emergency_fund",
  horizon: "medium_term",
  experience: "beginner",
  riskTolerance: "moderate",
  createdAt: "2026-09-01T12:00:00.000Z",
  updatedAt: "2026-09-01T12:00:00.000Z",
};

async function prepareVisualSession(page: Page, locale: "pt-PT" | "en-GB" = "pt-PT") {
  page.on("pageerror", (error) => console.error(`[visual page error] ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") console.error(`[visual console] ${message.text()}`);
  });
  await page.addInitScript(
    ({ nextUser, nextLocale }) => {
      localStorage.setItem("expensesnap.user", JSON.stringify(nextUser));
      localStorage.setItem("expensesnap:locale", nextLocale);
      sessionStorage.setItem("expensesnap.access-token", "visual-access-token");
    },
    { nextUser: user, nextLocale: locale },
  );

  await page.context().route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    // Vite source modules also live below /src/api/. Only application HTTP
    // requests begin with /api/, otherwise the mock would replace TS modules.
    if (!url.pathname.startsWith("/api/")) {
      await route.continue();
      return;
    }
    const path = url.pathname.replace(/^\/api/, "");
    const payload =
      path === "/dashboard/overview"
        ? dashboard
        : path === "/planning/overview"
          ? planning
          : path === "/analytics/summary"
            ? summary
            : path === "/accounts"
              ? []
              : path === "/financial-profile"
                ? profile
                : path === "/open-banking/connections"
                  ? []
                  : path === "/notifications"
                    ? { items: [], unreadCount: 0 }
                    : path === "/notifications/preferences"
                      ? { inAppEnabled: true, pushEnabled: false }
                      : path === "/notifications/push-config"
                        ? { enabled: false, publicKey: null }
                        : { data: [] };
    await route.fulfill({ contentType: "application/json", body: JSON.stringify(payload) });
  });
}

async function assertNoOverflow(page: Page) {
  const layout = await page.evaluate(() => {
    const width = window.innerWidth;
    return {
      scrollWidth: document.documentElement.scrollWidth,
      width,
      offenders: [...document.querySelectorAll<HTMLElement>("body *")]
        .filter((element) => element.getBoundingClientRect().right > width + 1)
        .slice(0, 5)
        .map((element) => ({
          className: element.className,
          right: element.getBoundingClientRect().right,
        })),
    };
  });
  expect(layout.scrollWidth, JSON.stringify(layout.offenders)).toBeLessThanOrEqual(layout.width);
}

async function capture(page: Page, testInfo: TestInfo, name: string) {
  await page.screenshot({ path: testInfo.outputPath(`${name}.png`), fullPage: true });
}

const viewports = [
  { name: "360x800", width: 360, height: 800 },
  { name: "390x844", width: 390, height: 844 },
  { name: "768x1024", width: 768, height: 1024 },
  { name: "1023x768", width: 1023, height: 768 },
  { name: "1024x768", width: 1024, height: 768 },
  { name: "1280x720", width: 1280, height: 720 },
  { name: "1440x900", width: 1440, height: 900 },
  { name: "844x390", width: 844, height: 390 },
];

test.describe("visual financial surfaces", () => {
  for (const viewport of viewports) {
    test(`Dashboard remains usable at ${viewport.name}`, async ({ page }, testInfo) => {
      await prepareVisualSession(page);
      await page.setViewportSize(viewport);
      await page.goto("/dashboard");
      await expect(page.getByRole("heading", { name: "Hoje, sem complicações" })).toBeVisible();
      if (viewport.width >= 1024) {
        await expect(page.locator(".sidebar .side-nav")).toBeVisible();
        await expect(page.locator(".mobile-nav")).toBeHidden();
      } else {
        await expect(page.locator(".sidebar")).toBeHidden();
        await expect(page.locator(".mobile-nav")).toBeVisible();
      }
      await assertNoOverflow(page);
      await capture(page, testInfo, `dashboard-${viewport.name}`);
    });
  }

  test("Planning and Investments are legible in dark mode and an expanded locale", async ({
    page,
  }, testInfo) => {
    await prepareVisualSession(page, "en-GB");
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });

    await page.goto("/planning");
    await expect(page.getByRole("heading", { name: "Planeie antes de gastar" })).toBeVisible();
    await assertNoOverflow(page);
    await capture(page, testInfo, "planning-dark-en-GB");

    await page.goto("/investments");
    await expect(
      page.getByRole("heading", { name: "Investir começa por compreender" }),
    ).toBeVisible();
    await assertNoOverflow(page);
    await capture(page, testInfo, "investments-dark-en-GB");

    const accessibility = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    expect(
      accessibility.violations.filter((issue) =>
        ["critical", "serious"].includes(issue.impact ?? ""),
      ),
    ).toEqual([]);
  });

  test("System follows the operating system while an explicit theme remains fixed", async ({
    page,
  }, testInfo) => {
    await prepareVisualSession(page);
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
    await page.goto("/dashboard");

    await expect(page.getByRole("heading", { name: "Hoje, sem complicações" })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await capture(page, testInfo, "dashboard-system-dark");

    await page.getByRole("button", { name: /tema.*claro/i }).first().click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");

    await page.emulateMedia({ colorScheme: "dark" });
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  });
});
