import { describe, expect, it, vi } from 'vitest';
import { extractReceipt, parseReceiptText } from './ocrService.js';

describe('parseReceiptText', () => {
  it('extracts a Portuguese total, date and merchant while ignoring NIF and telephone', () => {
    const result = parseReceiptText(`MERCADO DA RUA, LDA\nNIF: 509 123 456\nTel: 912 345 678\nData: 04/08/2026\nSubtotal 10,00 €\nVALOR A PAGAR 12,34 €`);

    expect(result).toMatchObject({ amount: '12.34', date: '2026-08-04', merchant: 'MERCADO DA RUA, LDA' });
    expect(result.confidence).toBe(1);
  });

  it('normalizes ISO dates and thousands separators', () => {
    expect(parseReceiptText('Loja Exemplo\n2026-01-09\nTOTAL 1.234,56')).toMatchObject({
      amount: '1234.56', date: '2026-01-09', merchant: 'Loja Exemplo',
    });
  });
});

describe('extractReceipt', () => {
  it('uses Google Vision when it returns text', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ responses: [{ fullTextAnnotation: { text: 'CAFÉ TESTE\nTOTAL 5,50' } }] }) });
    const tesseractRecognize = vi.fn();

    const result = await extractReceipt(Buffer.from('image'), 'image/jpeg', { googleApiKey: 'key', fetchImpl, tesseractRecognize });

    expect(result.provider).toBe('google');
    expect(result.amount).toBe('5.50');
    expect(tesseractRecognize).not.toHaveBeenCalled();
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it('falls back to Tesseract when Google Vision fails, without a real network call', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 503 });
    const tesseractRecognize = vi.fn().mockResolvedValue({ data: { text: 'PADARIA CENTRAL\nTOTAL 3,20' } });

    const result = await extractReceipt(Buffer.from('image'), 'image/png', { googleApiKey: 'key', fetchImpl, tesseractRecognize });

    expect(result).toMatchObject({ provider: 'tesseract', amount: '3.20', merchant: 'PADARIA CENTRAL' });
    expect(tesseractRecognize).toHaveBeenCalledWith(expect.any(Buffer), 'por');
  });

  it('uses the injected Tesseract recognizer when no Google key exists', async () => {
    const tesseractRecognize = vi.fn().mockResolvedValue('RESTAURANTE\nTOTAL 9.90');
    const result = await extractReceipt(Buffer.from('image'), 'image/png', { tesseractRecognize });

    expect(result.provider).toBe('tesseract');
    expect(tesseractRecognize).toHaveBeenCalledOnce();
  });
});
