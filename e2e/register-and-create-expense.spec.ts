import { expect, test } from '@playwright/test';

const onePixelPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

test('permite registar uma conta e criar uma despesa com fotografia', async ({ page }) => {
  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `e2e.${runId}@example.com`;
  const description = `Almoço E2E ${runId}`;

  await page.goto('/register');
  await page.getByLabel('Nome').fill('Utilizador E2E');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Palavra-passe').fill('Teste-E2E-2026!');

  await Promise.all([
    page.waitForURL(/\/expenses(?:\?.*)?$/),
    page.getByRole('button', { name: 'Criar conta' }).click(),
  ]);

  await page.goto('/expenses/new');
  await page.getByLabel('Descrição').fill(description);
  await page.getByLabel('Local').fill('Lisboa');
  await page.getByLabel('Valor').fill('12.34');
  await page.getByLabel('Data').fill(new Date().toISOString().slice(0, 10));

  const category = page.getByLabel('Categoria');
  await expect.poll(() => category.locator('option').count()).toBeGreaterThan(1);
  await category.selectOption({ index: 1 });

  await page.getByLabel('Foto do recibo').setInputFiles({
    name: 'recibo-e2e.png',
    mimeType: 'image/png',
    buffer: onePixelPng,
  });

  await Promise.all([
    page.waitForURL(/\/expenses(?:\?.*)?$/),
    page.getByRole('button', { name: 'Guardar despesa' }).click(),
  ]);

  await expect(page.getByText(description, { exact: true })).toBeVisible();
  await expect(page.locator('.expense-row__receipt img')).toBeVisible();

  await page.goto('/dashboard');
  await expect(page.getByRole('heading', { name: 'O pulso das suas despesas' })).toBeVisible();
  await expect(page.locator('#total-title')).toContainText('12,34');

  await page.locator('.budget-create select').selectOption({ index: 1 });
  await page.locator('.budget-create input').fill('10');
  await page.getByRole('button', { name: 'Definir limite' }).click();

  await expect(page.locator('.toast[role="status"]')).toContainText('Orçamento criado');
  await expect(page.getByText('Crítico', { exact: true }).first()).toBeVisible();
});
