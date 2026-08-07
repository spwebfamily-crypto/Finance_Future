import Tesseract from 'tesseract.js';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

const MAX_TEXT_PAGES = 20;
const MAX_OCR_PAGES = 5;
const MAX_CANVAS_PIXELS = 4_000_000;

interface PositionedTextItem {
  str: string;
  hasEOL?: boolean;
  transform?: number[];
}

export interface PdfReadResult {
  text: string;
  pageCount: number;
  usedOcr: boolean;
}

async function fileBytes(file: File) {
  const maybeArrayBuffer = file as File & { arrayBuffer?: () => Promise<ArrayBuffer> };
  const buffer = maybeArrayBuffer.arrayBuffer
    ? await maybeArrayBuffer.arrayBuffer()
    : await new Promise<ArrayBuffer>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = () => reject(reader.error || new Error('Não foi possível ler o PDF.'));
      reader.readAsArrayBuffer(file);
    });
  return new Uint8Array(buffer);
}

function pageText(items: PositionedTextItem[]) {
  const lines: Array<{ y: number; parts: Array<{ x: number; value: string }> }> = [];
  for (const item of items) {
    const value = item.str.replace(/\s+/g, ' ').trim();
    if (!value) continue;
    const x = item.transform?.[4] ?? 0;
    const y = item.transform?.[5] ?? 0;
    let line = lines.find((candidate) => Math.abs(candidate.y - y) <= 2.5);
    if (!line) {
      line = { y, parts: [] };
      lines.push(line);
    }
    line.parts.push({ x, value });
  }

  return lines
    .sort((left, right) => right.y - left.y)
    .map((line) => line.parts.sort((left, right) => left.x - right.x).map((part) => part.value).join(' '))
    .join('\n');
}

function needsOcr(text: string) {
  const compact = text.replace(/\s+/g, ' ').trim();
  const letters = compact.match(/[A-Za-zÀ-ÿ]/g)?.length ?? 0;
  const hasMoney = /\d{1,3}(?:[.\s]\d{3})*(?:,\d{2})|\d+[.]\d{2}/.test(compact);
  return compact.length < 60 || letters < 25 || !hasMoney;
}

export async function readPdfReceipt(
  file: File,
  onProgress?: (progress: number, status: string) => void,
): Promise<PdfReadResult> {
  onProgress?.(0.03, 'A abrir o PDF…');
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
  const loadingTask = pdfjs.getDocument({ data: await fileBytes(file), isEvalSupported: false });
  const pdfDocument = await loadingTask.promise;

  try {
    const textPages: string[] = [];
    const pagesToRead = Math.min(pdfDocument.numPages, MAX_TEXT_PAGES);
    for (let pageNumber = 1; pageNumber <= pagesToRead; pageNumber += 1) {
      onProgress?.(0.05 + (pageNumber / pagesToRead) * 0.3, `A ler texto da página ${pageNumber} de ${pdfDocument.numPages}…`);
      const page = await pdfDocument.getPage(pageNumber);
      const content = await page.getTextContent({ includeMarkedContent: false });
      const items: PositionedTextItem[] = content.items.flatMap((item) => 'str' in item
        ? [{ str: item.str, hasEOL: item.hasEOL, transform: item.transform }]
        : []);
      const text = pageText(items);
      if (text) textPages.push(`Página ${pageNumber}\n${text}`);
      page.cleanup();
    }

    const extractedText = textPages.join('\n\n');
    if (!needsOcr(extractedText)) {
      onProgress?.(1, 'Texto do PDF identificado.');
      return { text: extractedText, pageCount: pdfDocument.numPages, usedOcr: false };
    }

    const ocrPages: string[] = [];
    const pagesToOcr = Math.min(pdfDocument.numPages, MAX_OCR_PAGES);
    const worker = await Tesseract.createWorker('por+eng', Tesseract.OEM.LSTM_ONLY);
    try {
      for (let pageNumber = 1; pageNumber <= pagesToOcr; pageNumber += 1) {
        const page = await pdfDocument.getPage(pageNumber);
        const baseViewport = page.getViewport({ scale: 1 });
        const targetScale = Math.min(2.2, Math.sqrt(MAX_CANVAS_PIXELS / (baseViewport.width * baseViewport.height)));
        const viewport = page.getViewport({ scale: Math.max(1.35, targetScale) });
        const canvas = document.createElement('canvas');
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        const context = canvas.getContext('2d', { alpha: false });
        if (!context) throw new Error('O navegador não conseguiu preparar a página do PDF.');
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, canvas.width, canvas.height);
        onProgress?.(0.35 + ((pageNumber - 1) / pagesToOcr) * 0.62, `OCR local na página ${pageNumber} de ${pagesToOcr}…`);
        await page.render({ canvasContext: context, viewport }).promise;
        const result = await worker.recognize(canvas);
        if (result.data.text.trim()) ocrPages.push(`Página ${pageNumber}\n${result.data.text.trim()}`);
        canvas.width = 1;
        canvas.height = 1;
        page.cleanup();
      }
    } finally {
      await worker.terminate();
    }

    onProgress?.(1, 'Leitura local concluída.');
    return {
      text: [extractedText, ...ocrPages].filter(Boolean).join('\n\n'),
      pageCount: pdfDocument.numPages,
      usedOcr: true,
    };
  } finally {
    await pdfDocument.destroy();
  }
}
