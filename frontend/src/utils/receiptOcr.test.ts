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
});
