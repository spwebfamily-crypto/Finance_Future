import { describe, expect, it, vi } from 'vitest';
import { parseReceiptText, readReceiptFile } from './receiptOcr';

vi.mock('./pdfReceiptReader', () => ({
  readPdfReceipt: vi.fn(async () => ({
    text: 'MERCADO CENTRAL\nALIMENTACAO\nRua das Flores, 12\nData 07/08/2026\nTOTAL A PAGAR 12,50',
    pageCount: 1,
    usedOcr: false,
  })),
}));

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

  it('prioritizes total to pay over subtotal and tax values', () => {
    const result = parseReceiptText('SUBTOTAL 10,00\nIVA 2,30\nTOTAL A PAGAR 12,30');

    expect(result.amount).toBe('12.30');
    expect(result.confidence.amount).toBeGreaterThan(0.9);
  });

  it('prioritizes the issue date over the due date', () => {
    const result = parseReceiptText('Data de emissão 05/08/2026\nData de vencimento 20/08/2026');

    expect(result.date).toBe('2026-08-05');
  });

  it('does not classify merchant names by partial words', () => {
    const result = parseReceiptText('CASA CHINA GASTRONOMIA\nTOTAL 18,00', [
      { id: 'home', name: 'Casa', icon: 'house', isDefault: true },
      { id: 'transport', name: 'Transportes', icon: 'car', isDefault: true },
    ]);

    expect(result.categoryId).toBeUndefined();
  });

  it('uses the PDF reader result locally and suggests the amount/category', async () => {
    const pdf = new File(['valid-pdf-placeholder'], 'fatura.pdf', { type: 'application/pdf' });
    const result = await readReceiptFile(pdf, [{ id: 'food', name: 'Alimentacao', icon: 'utensils', isDefault: true }]);

    expect(result.source).toBe('pdf');
    expect(result.amount).toBe('12.50');
    expect(result.categoryId).toBe('food');
    expect(result.pdf).toEqual({ pageCount: 1, usedOcr: false });
  });
});
