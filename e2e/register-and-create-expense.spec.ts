import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 390, height: 844 }, isMobile: true });

test("permite registar uma conta e criar uma despesa com fotografia", async ({ page }) => {
  test.setTimeout(120_000);
  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `e2e.${runId}@example.com`;
  const description = `Almoço E2E ${runId}`;
  await page.goto("about:blank");
  const receiptDataUrl = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 1_200;
    canvas.height = 700;
    const context = canvas.getContext("2d")!;
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#111111";
    context.font = "700 64px Arial";
    context.fillText("RECIBO DE TESTE", 90, 180);
    context.font = "48px Arial";
    context.fillText("Anexo manual", 90, 320);
    return canvas.toDataURL("image/png");
  });
  const receiptPng = Buffer.from(receiptDataUrl.split(",")[1]!, "base64");

  await page.goto("/register");
  await page.getByLabel("Nome").fill("Utilizador E2E");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Palavra-passe").fill("Teste-E2E-2026!");

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
  await page.goto("/expenses");

  await expect(page.locator(".mobile-nav")).toBeVisible();
  const manifest = await page.request.get("/manifest.webmanifest");
  expect(manifest.ok()).toBeTruthy();

  await page.goto("/expenses/new");
  const category = page.getByLabel("Categoria");
  await expect.poll(() => category.locator("option").count()).toBeGreaterThan(1);
  await category.selectOption({ index: 1 });

  await page.getByLabel("Foto ou PDF do recibo").setInputFiles({
    name: "recibo-e2e.png",
    mimeType: "image/png",
    buffer: receiptPng,
  });

  await expect(page.getByRole("button", { name: "Ler recibo" })).toHaveCount(0);

  await page.getByLabel("Descrição").fill(description);
  await page.getByLabel("Local").fill("Lisboa");
  await page.getByLabel("Valor").fill("12.34");
  await page.getByLabel("Data").fill(new Date().toISOString().slice(0, 10));

  await Promise.all([
    page.waitForURL(/\/expenses(?:\?.*)?$/),
    page.getByRole("button", { name: "Guardar despesa" }).click(),
  ]);

  await expect(page.getByText(description, { exact: true })).toBeVisible();
  await expect(page.getByLabel(`Recibo de ${description} — imagem guardada`)).toBeVisible();
  await Promise.all([
    page.waitForURL(/\/expenses\/[^/]+\/edit$/),
    page.getByRole("link", { name: `Editar ${description}` }).click(),
  ]);
  await expect(page.locator(".receipt-preview__image-link img")).toBeVisible();

  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "O pulso das suas despesas" })).toBeVisible();
  await expect(page.locator("#total-title")).toContainText("12,34");

  await page.locator(".budget-create select").selectOption({ index: 1 });
  await page.locator(".budget-create input").fill("10");
  await page.getByRole("button", { name: "Definir limite" }).click();

  await expect(page.locator('.toast[role="status"]')).toContainText("Orçamento criado");
  await expect(page.getByText("Crítico", { exact: true }).first()).toBeVisible();
});
