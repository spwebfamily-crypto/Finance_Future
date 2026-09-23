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
const account = {
  id: "account-main",
  name: "Conta principal",
  type: "current",
  source: "manual",
  currency: "EUR",
  openingBalance: 1200,
  currentBalance: 1840.4,
  availableBalance: 1840.4,
  derivedBalance: 1840.4,
  balanceSource: "derived",
  balanceLabel: "Saldo contabilístico",
  createdAt: "2026-09-01T12:00:00.000Z",
  updatedAt: "2026-09-19T12:00:00.000Z",
};
const expenses = [
  {
    id: "expense-market",
    categoryId: category.id,
    category,
    account,
    accountId: account.id,
    description: "Mercado semanal",
    location: "Mercado do bairro",
    amount: "64.20",
    currency: "EUR",
    date: "2026-09-19",
    source: "bank",
  },
  {
    id: "expense-metro",
    categoryId: "transport",
    category: { id: "transport", name: "Transportes", icon: "train-front", isDefault: true },
    description: "Passe mensal",
    location: "Lisboa",
    amount: "40.00",
    currency: "EUR",
    date: "2026-09-18",
    source: "manual",
  },
  {
    id: "expense-coffee",
    categoryId: "leisure",
    category: { id: "leisure", name: "Lazer", icon: "coffee", isDefault: true },
    description: "Café com amigos",
    location: "Baixa",
    amount: "8.50",
    currency: "EUR",
    date: "2026-09-17",
    source: "manual",
  },
];
const categories = [
  category,
  { id: "transport", name: "Transportes", icon: "train-front", isDefault: true },
  { id: "leisure", name: "Lazer", icon: "coffee", isDefault: true },
  { id: "health", name: "Saúde", icon: "heart-pulse", isDefault: false },
];
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
            : path === "/expenses"
              ? {
                  data: expenses,
                  meta: { page: 1, pageSize: 500, total: expenses.length, pageCount: 1 },
                }
              : path === "/categories"
                ? categories
                : path === "/accounts"
                  ? [account]
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

async function preparePublicVisualSession(page: Page) {
  page.on("pageerror", (error) => console.error(`[visual page error] ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") console.error(`[visual console] ${message.text()}`);
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
  { name: "414x896", width: 414, height: 896 },
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

    await page
      .getByRole("button", { name: /tema.*claro/i })
      .first()
      .click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");

    await page.emulateMedia({ colorScheme: "dark" });
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  });

  test("operational pages retain the shared system on desktop and mobile", async ({
    page,
  }, testInfo) => {
    await prepareVisualSession(page);
    const surfaces = [
      { path: "/expenses", heading: "Despesas", screenshot: "expenses-mobile" },
      { path: "/accounts", heading: "Contas e cartões", screenshot: "accounts-desktop" },
      { path: "/categories", heading: "Categorias", screenshot: "categories-mobile" },
      {
        path: "/accounts/connections",
        heading: "Bancos ligados",
        screenshot: "connections-desktop",
      },
      { path: "/accounts/connect", heading: "Ligar um banco", screenshot: "connect-mobile" },
    ];

    for (const [index, surface] of surfaces.entries()) {
      await page.setViewportSize(
        index % 2 ? { width: 1280, height: 900 } : { width: 390, height: 844 },
      );
      await page.goto(surface.path);
      await expect(page.getByRole("heading", { name: surface.heading, exact: true })).toBeVisible();
      await assertNoOverflow(page);
      await capture(page, testInfo, surface.screenshot);
    }
  });

  test("mobile category, budget, and movement controls stay usable", async ({ page }) => {
    await prepareVisualSession(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.route("**/api/categories", async (route) => {
      if (route.request().method() !== "POST") {
        await route.fallback();
        return;
      }
      const input = route.request().postDataJSON() as { name: string; icon: string };
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ id: "custom-mobile", ...input, isDefault: false }),
      });
    });

    await page.goto("/categories");
    const createTrigger = page.getByRole("button", { name: "Nova categoria" });
    await createTrigger.click();
    const createDialog = page.getByRole("dialog", { name: "Nova categoria" });
    await expect(createDialog).toBeVisible();
    await expect(createDialog.getByRole("textbox", { name: "Nome da categoria" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(createDialog).toBeHidden();
    await expect(createTrigger).toBeFocused();
    await createTrigger.click();
    await createDialog.getByRole("textbox", { name: "Nome da categoria" }).fill("Telemóvel");
    await createDialog.getByRole("button", { name: "Criar categoria" }).click();
    await expect(createDialog).toBeHidden();
    await expect(page.getByRole("heading", { name: "Telemóvel" })).toBeVisible();
    await assertNoOverflow(page);

    await page.goto("/expenses");
    const firstMovement = page.locator(".expense-row").first();
    await firstMovement.locator("summary").click();
    await expect(firstMovement.getByRole("link", { name: "Editar" })).toBeVisible();
    await expect(firstMovement.getByRole("button", { name: "Eliminar" })).toBeVisible();
    await assertNoOverflow(page);

    await page.goto("/dashboard");
    const budgetTrigger = page.locator(".budget-create-trigger");
    await budgetTrigger.click();
    await expect(page.locator("#budget-create-form")).toBeVisible();
    await expect(page.locator("#budget-create-form select")).toBeFocused();
    await assertNoOverflow(page);
  });

  test("mobile financial surfaces remain readable in dark mode", async ({ page }, testInfo) => {
    await prepareVisualSession(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });

    for (const surface of ["/dashboard", "/expenses", "/categories"]) {
      await page.goto(surface);
      await assertNoOverflow(page);
      await capture(page, testInfo, `${surface.slice(1)}-mobile-dark`);
    }

    await page.getByRole("button", { name: "Nova categoria" }).click();
    const dialog = page.getByRole("dialog", { name: "Nova categoria" });
    await expect(dialog).toBeVisible();
    const dialogBox = await dialog.boundingBox();
    expect(dialogBox?.y).toBeGreaterThan(40);
    expect((dialogBox?.y ?? 0) + (dialogBox?.height ?? 0)).toBeLessThanOrEqual(844);
    await page.screenshot({ path: testInfo.outputPath("categories-create-mobile-dark.png") });
    const accessibility = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    expect(
      accessibility.violations.filter((issue) =>
        ["critical", "serious"].includes(issue.impact ?? ""),
      ),
    ).toEqual([]);
  });

  test("empty mobile libraries and ledgers keep their actions visible", async ({ page }) => {
    await prepareVisualSession(page);
    await page.setViewportSize({ width: 360, height: 800 });
    await page.route("**/api/categories", async (route) => {
      await route.fulfill({ contentType: "application/json", body: "[]" });
    });
    await page.route("**/api/expenses*", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          data: [],
          meta: { page: 1, pageSize: 500, total: 0, pageCount: 0 },
        }),
      });
    });

    await page.goto("/categories");
    await expect(page.getByRole("heading", { name: "Sem categorias" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Nova categoria" })).toBeVisible();
    await assertNoOverflow(page);

    await page.goto("/expenses");
    await expect(page.getByRole("heading", { name: "Ainda não há despesas" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Registar primeira despesa" })).toBeVisible();
    await assertNoOverflow(page);
  });

  test("mobile financial controls keep readable contrast and touch targets", async ({ page }) => {
    await prepareVisualSession(page);
    await page.setViewportSize({ width: 390, height: 844 });

    for (const theme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme: theme });
      for (const path of ["/dashboard", "/expenses", "/categories"]) {
        await page.goto(path);
        const contrast = await new AxeBuilder({ page }).withRules(["color-contrast"]).analyze();
        expect(
          contrast.violations.flatMap((issue) => issue.nodes.map((node) => node.target.join(" "))),
          `${theme} ${path}`,
        ).toEqual([]);
      }
    }

    await page.getByRole("button", { name: "Nova categoria" }).click();
    for (const selector of [".category-create-trigger", ".icon-picker__option--selected"]) {
      const box = await page.locator(selector).boundingBox();
      expect(box?.width).toBeGreaterThanOrEqual(44);
      expect(box?.height).toBeGreaterThanOrEqual(44);
    }
  });

  test("public entry points retain the same clarity on mobile and desktop", async ({
    page,
  }, testInfo) => {
    await preparePublicVisualSession(page);
    const surfaces = [
      {
        path: "/login",
        heading: "Bem-vindo de volta",
        screenshot: "login-mobile",
        viewport: { width: 390, height: 844 },
      },
      {
        path: "/register",
        heading: "Criar conta",
        screenshot: "register-desktop",
        viewport: { width: 1280, height: 900 },
      },
      {
        path: "/forgot-password",
        heading: "Esqueceu a palavra-passe?",
        screenshot: "forgot-mobile",
        viewport: { width: 390, height: 844 },
      },
      {
        path: "/rota-inexistente",
        heading: "Esta conta não fecha.",
        screenshot: "not-found-desktop",
        viewport: { width: 1280, height: 900 },
      },
    ];

    for (const surface of surfaces) {
      await page.setViewportSize(surface.viewport);
      await page.goto(surface.path);
      await expect(page.getByRole("heading", { name: surface.heading, exact: true })).toBeVisible();
      await assertNoOverflow(page);
      await capture(page, testInfo, surface.screenshot);
    }
  });
});
