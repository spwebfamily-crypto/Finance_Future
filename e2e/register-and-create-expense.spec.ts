import { expect, test } from '@playwright/test';

test('permite registar uma conta e criar uma despesa com fotografia', async ({ page }) => {
  test.setTimeout(120_000);
  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `e2e.${runId}@example.com`;
  const description = `Almoço E2E ${runId}`;
  await page.goto('about:blank');
  const receiptDataUrl = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 1_200;
    canvas.height = 700;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = '#111111';
    context.font = '700 64px Arial';
    context.fillText('MERCADO TESTE', 90, 130);
    context.font = '48px Arial';
    context.fillText('Data: 07/08/2026', 90, 270);
    context.font = '700 58px Arial';
    context.fillText('TOTAL 12,34 EUR', 90, 430);
    return canvas.toDataURL('image/png');
  });
  const receiptPng = Buffer.from(receiptDataUrl.split(',')[1]!, 'base64');

  await page.goto('/register');
  await page.getByLabel('Nome').fill('Utilizador E2E');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Palavra-passe').fill('Teste-E2E-2026!');

  await Promise.all([
    page.waitForURL(/\/expenses(?:\?.*)?$/),
    page.getByRole('button', { name: 'Criar conta' }).click(),
  ]);

  await page.goto('/expenses/new');
  const category = page.getByLabel('Categoria');
  await expect.poll(() => category.locator('option').count()).toBeGreaterThan(1);
  await category.selectOption({ index: 1 });

  await page.getByLabel('Foto do recibo').setInputFiles({
    name: 'recibo-e2e.png',
    mimeType: 'image/png',
    buffer: receiptPng,
  });

  await page.getByRole('button', { name: 'Ler recibo' }).click();
  await expect(page.locator('.ocr-feedback--success')).toContainText('Leitura concluída', { timeout: 90_000 });
  await expect(page.getByLabel('Valor')).toHaveValue('12.34');
  await expect(page.getByLabel('Local')).toHaveValue(/MERCADO TESTE/i);

  await page.getByLabel('Descrição').fill(description);
  await page.getByLabel('Local').fill('Lisboa');
  await page.getByLabel('Valor').fill('12.34');
  await page.getByLabel('Data').fill(new Date().toISOString().slice(0, 10));

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

  await page.getByRole('button', { name: 'Gerar nota' }).click();
  await expect(page.locator('.note-row').first()).toContainText('merecem atenção');
  await expect(page.locator('.note-row').first()).toContainText('Prioridade');
});
