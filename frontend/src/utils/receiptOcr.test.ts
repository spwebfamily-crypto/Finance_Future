import { describe, expect, it } from 'vitest';
import { parseReceiptText } from './receiptOcr';

describe('receipt OCR parsing', () => {
  it('extracts the useful fields without requiring a currency symbol', () => {
    const result = parseReceiptText(
      'MERCADO CENTRAL\nRua das Flores, 12\nData 07/08/2026\nTOTAL 12,50',
      [{ id: 'food', name: 'Alimentação', icon: 'utensils', isDefault: true }],
    );

    expect(result.description).toBe('MERCADO CENTRAL');
    expect(result.location).toBe('Rua das Flores, 12');
    expect(result.amount).toBe('12.50');
    expect(result.date).toBe('2026-08-07');
  });

  it('matches a category when its name appears in the extracted text', () => {
    const result = parseReceiptText('COMPRA DE ALIMENTAÇÃO\nTotal 8,90', [
      { id: 'food', name: 'Alimentação', icon: 'utensils', isDefault: true },
    ]);

    expect(result.categoryId).toBe('food');
  });

  it('reads text embedded in a PDF locally and suggests the amount/category', async () => {
    const pdf = new File(['%PDF-1.4\n(MERCADO CENTRAL)\n(ALIMENTACAO)\n(Rua das Flores, 12)\n(Data 07/08/2026)\n(TOTAL 12,50)\n%%EOF'], 'fatura.pdf', { type: 'application/pdf' });
    const { readReceiptFile } = await import('./receiptOcr');
    const result = await readReceiptFile(pdf, [{ id: 'food', name: 'Alimentacao', icon: 'utensils', isDefault: true }]);

    expect(result.source).toBe('pdf');
    expect(result.amount).toBe('12.50');
    expect(result.categoryId).toBe('food');
  });
});
