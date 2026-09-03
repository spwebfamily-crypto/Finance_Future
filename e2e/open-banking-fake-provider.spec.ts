import { expect, test } from "@playwright/test";

/**
 * Fluxo completo de Open Banking com o provedor fake (sem rede):
 * ligar banco → callback → primeira sincronização → saldo → movimento →
 * categorizar → segunda sincronização sem duplicados → desligar conservando.
 */
test.use({ viewport: { width: 390, height: 844 }, isMobile: true });

async function register(page: import("@playwright/test").Page) {
  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await page.goto("/register");
  await page.getByLabel("Nome").fill("Open Banking E2E");
  await page.getByLabel("Email").fill(`e2e.ob.${runId}@example.com`);
  await page.locator('input[name="password"]').fill("Teste-E2E-2026!");
  await page.locator('input[name="confirmPassword"]').fill("Teste-E2E-2026!");
  await page.locator('input[name="confirmPassword"]').fill("Teste-E2E-2026!");
  await Promise.all([
    page.waitForURL(/\/onboarding(?:\?.*)?$/),
    page.getByRole("button", { name: "Criar conta" }).click(),
  ]);

  await page.getByLabel("Rendimento líquido mensal").fill("2500");
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByLabel("Casa e habitação").fill("850");
  await page.getByLabel("Outras despesas essenciais").fill("500");
  await page.getByLabel("Prestações de dívidas").fill("0");
  await page.getByLabel("Poupança disponível hoje").fill("3000");
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByRole("button", { name: "Continuar" }).click();
  await Promise.all([
    page.waitForURL(/\/investments(?:\?.*)?$/),
    page.getByRole("button", { name: "Ver orientação educativa" }).click(),
  ]);
}

test("liga um banco, sincroniza, categoriza e desliga conservando os dados", async ({ page }) => {
  test.setTimeout(180_000);
  await register(page);

  await page.goto("/accounts");
  await page.getByRole("button", { name: "Ligar banco" }).click();
  await expect(page.getByRole("heading", { name: "Ligar um banco" })).toBeVisible();

  await page.getByLabel("Pesquisar banco").fill("Demonstração");
  await page.getByRole("button", { name: /Banco Demonstração/ }).click();
  await expect(page.getByText(/recebe nem guarda a sua palavra-passe/i)).toBeVisible();

  await page.getByRole("button", { name: "Continuar no banco" }).click();

  // O banco (fake) devolve ao callback e este reencaminha para a aplicação.
  await page.waitForURL(/\/accounts\?bankConnection=success$/);
  await expect(page.locator('.toast[role="status"]')).toContainText("Banco ligado");

  // A primeira sincronização corre fora do pedido: a página é recarregada até
  // a conta ligada aparecer (não há websocket nem "tempo real").
  await expect(async () => {
    await page.reload();
    await expect(page.getByText("Ligada ao banco").first()).toBeVisible({ timeout: 5_000 });
  }).toPass({ timeout: 40_000, intervals: [2_000] });
  // O separador de milhares depende da ICU do navegador: aceita-se 1.250,30 e 1250,30.
  await expect(page.getByText(/1\.?250,30/).first()).toBeVisible();

  await page.goto("/expenses");
  await expect(page.getByText("Compra Continente")).toBeVisible();
  await expect(page.locator(".expense-origin", { hasText: "Banco" })).toBeVisible();

  await page.goto("/accounts/connections");
  await expect(page.getByRole("heading", { name: "Bancos ligados" })).toBeVisible();
  await expect(page.getByText("Ligação ativa")).toBeVisible();

  // Segunda sincronização: não cria movimentos duplicados.
  await page.getByRole("button", { name: "Sincronizar" }).click();
  await expect(page.locator('.toast[role="status"]')).toContainText("Sincronização pedida");
  await expect(page.locator('.toast[role="status"]')).toContainText("concluída", {
    timeout: 30_000,
  });

  await page.goto("/accounts");
  const linkedAccount = page.locator(".account-card-large", { hasText: "Conta à ordem" }).first();
  await linkedAccount.getByRole("link").click();
  await expect(page.getByRole("heading", { name: "Conta à ordem" })).toBeVisible();

  const movement = page.getByText("Compra Continente");
  await expect(movement).toBeVisible();
  await expect(
    page.locator(".bank-transaction-row", { hasText: "Pagamento MB WAY" }).getByText("Pendente"),
  ).toBeVisible();

  const categorySelect = page
    .locator(".bank-transaction-row", { hasText: "Compra Continente" })
    .getByRole("combobox");
  await categorySelect.selectOption({ index: 1 });
  await expect(page.locator('.toast[role="status"]')).toContainText("Categoria atualizada");

  // Desligar conservando os dados.
  await page.goto("/accounts/connections");
  await page
    .getByRole("button", { name: /Desligar/ })
    .first()
    .click();
  await expect(page.getByText("Desligar Banco Demonstração?")).toBeVisible();
  await page.getByRole("button", { name: "Desligar e conservar" }).click();
  await expect(page.locator('.toast[role="status"]')).toContainText("conservados");

  await page.goto("/accounts");
  await expect(page.getByText("Manual").first()).toBeVisible();
  // O separador de milhares depende da ICU do navegador: aceita-se 1.250,30 e 1250,30.
  await expect(page.getByText(/1\.?250,30/).first()).toBeVisible();
});

test("desligar eliminando apaga apenas o que veio do banco", async ({ page }) => {
  test.setTimeout(180_000);
  await register(page);

  await page.goto("/accounts");
  await page.getByRole("button", { name: "Ligar banco" }).click();
  await page.getByRole("button", { name: /Banco Demonstração/ }).click();
  await page.getByRole("button", { name: "Continuar no banco" }).click();
  await page.waitForURL(/\/accounts\?bankConnection=success$/);
  await expect(async () => {
    await page.reload();
    await expect(page.getByText("Ligada ao banco").first()).toBeVisible({ timeout: 5_000 });
  }).toPass({ timeout: 40_000, intervals: [2_000] });

  await page.goto("/accounts/connections");
  await page
    .getByRole("button", { name: /Desligar/ })
    .first()
    .click();
  await page.getByLabel(/Eliminar os dados importados/i).check();
  await page.getByLabel(/Escreva/i).fill("ELIMINAR");
  await page.getByRole("button", { name: "Eliminar e desligar" }).click();
  await expect(page.locator('.toast[role="status"]')).toContainText("eliminados");

  await page.goto("/accounts");
  await expect(page.getByText("Ligada ao banco")).toHaveCount(0);
});
