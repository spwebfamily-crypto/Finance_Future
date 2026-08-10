import { describe, expect, it, vi } from 'vitest';
import { composePdfPages, readPdfReceipt, reconstructPageText, type PositionedTextItem } from './pdfReceiptReader';

vi.mock('pdfjs-dist', async () => vi.importActual('pdfjs-dist/legacy/build/pdf.mjs'));
vi.mock('pdfjs-dist/build/pdf.worker.min.mjs?url', async () => {
  const [{ resolve }, { pathToFileURL }] = await Promise.all([import('node:path'), import('node:url')]);
  return { default: pathToFileURL(resolve(process.cwd(), 'node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs')).href };
});

function item(str: string, x: number, y: number, width: number, height = 10): PositionedTextItem {
  return { str, width, height, transform: [1, 0, 0, height, x, y] };
}

function validTextPdf() {
  const stream = [
    'BT',
    '/F1 12 Tf',
    '20 170 Td',
    '(MERCADO LOCAL) Tj',
    '0 -22 Td',
    '(Avenida Central 10) Tj',
    '0 -22 Td',
    '(Data de emissao 07/08/2026) Tj',
    '0 -22 Td',
    '(TOTAL A PAGAR 12,30) Tj',
    'ET',
  ].join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 320 220] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];
  let source = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(source.length);
    source += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = source.length;
  source += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  source += offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
  source += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return new File([source], 'fatura-real.pdf', { type: 'application/pdf' });
}

describe('PDF receipt text layout', () => {
  it('restores top-to-bottom lines and left-to-right values from positioned items', () => {
    const text = reconstructPageText([
      item('12,30', 190, 60, 35),
      item('Rua Central 4', 10, 35, 80),
      item('TOTAL A PAGAR', 10, 60, 90),
      item('MERCADO LOCAL', 10, 10, 95),
    ]);

    expect(text).toBe('MERCADO LOCAL\nRua Central 4\nTOTAL A PAGAR 12,30');
  });

  it('joins adjacent PDF fragments without corrupting a decimal amount', () => {
    const text = reconstructPageText([
      item('TOTAL', 10, 20, 35),
      item('12', 100, 20, 12),
      item(',', 112, 20, 2),
      item('30', 114, 20, 12),
      item('TOTAL', 10.4, 20.2, 35),
    ]);

    expect(text).toBe('TOTAL 12,30');
  });

  it('composes pages in numeric order even when extraction or OCR finishes out of order', () => {
    const text = composePdfPages([
      { pageNumber: 3, text: 'TOTAL 30,00' },
      { pageNumber: 1, text: 'LOJA CENTRAL' },
      { pageNumber: 2, text: 'Detalhes' },
    ], 3);

    expect(text).toBe('Página 1 de 3\nLOJA CENTRAL\n\nPágina 2 de 3\nDetalhes\n\nPágina 3 de 3\nTOTAL 30,00');
  });

  it('extracts ordered lines from a structurally valid PDF instead of regexing raw bytes', async () => {
    const result = await readPdfReceipt(validTextPdf());

    expect(result.usedOcr).toBe(false);
    expect(result.pageCount).toBe(1);
    expect(result.text).toContain('MERCADO LOCAL');
    expect(result.text).toContain('Avenida Central 10');
    expect(result.text).toContain('Data de emissao 07/08/2026');
    expect(result.text).toContain('TOTAL A PAGAR 12,30');
  });

  it('stops before loading PDF.js when a newer receipt cancels the read', async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(readPdfReceipt(validTextPdf(), undefined, controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('does not continue opening a PDF cancelled while its bytes are being read', async () => {
    let releaseBytes!: (value: ArrayBuffer) => void;
    let markStarted!: () => void;
    const started = new Promise<void>((resolve) => { markStarted = resolve; });
    const delayedFile = {
      name: 'fatura-lenta.pdf',
      type: 'application/pdf',
      arrayBuffer: () => {
        markStarted();
        return new Promise<ArrayBuffer>((resolve) => { releaseBytes = resolve; });
      },
    } as File;
    const controller = new AbortController();
    const reading = readPdfReceipt(delayedFile, undefined, controller.signal);

    await started;
    controller.abort();
    releaseBytes(new ArrayBuffer(8));

    await expect(reading).rejects.toMatchObject({ name: 'AbortError' });
  });
});
