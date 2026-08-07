export interface ReceiptParseResult {
  amount: string | null;
  date: string | null;
  merchant: string | null;
  confidence: number;
}

export interface ReceiptExtractionResult extends ReceiptParseResult {
  rawText: string;
  provider: 'google' | 'tesseract';
}

export interface ExtractReceiptOptions {
  googleApiKey?: string;
  fetchImpl?: typeof fetch;
  tesseractRecognize?: TesseractRecognize;
}

export type TesseractRecognize = (image: Buffer, language?: string) => Promise<unknown>;

const totalLabel = /\b(?:total(?:\s+(?:a\s+)?pagar)?|valor\s+(?:total|a\s+pagar)|montante\s+a\s+pagar|importe\s+total)\b/i;
const excludedMerchant = /\b(?:nif|n\.?\s*contribuinte|tel(?:efone)?|fax|www\.|https?:|email|fatura|factura|recibo|tal[aã]o|documento|caixa|terminal|cart[aã]o|multibanco|atcud|qr\s*code|subtotal|total|valor\s+a\s+pagar)\b/i;
const phoneOrTaxNumber = /(?:\b(?:nif|tel(?:efone)?)\b|\b\d[\d\s-]{7,}\d\b)/i;
const amountToken = /(?:€\s*)?(?:\d{1,3}(?:[.,\s]\d{3})+(?:[.,]\d{2})?|\d+(?:[,.]\d{2})?|\d+)(?:\s*€)?/g;

/** Extracts the most useful receipt fields from OCR text; values are normalized for storage. */
export function parseReceiptText(rawText: string): ReceiptParseResult {
  const lines = rawText.replace(/\r/g, '').split('\n').map((line) => line.trim()).filter(Boolean);
  const amountInfo = findAmount(lines);
  const date = findDate(rawText);
  const merchant = findMerchant(lines);
  const confidence = Math.min(1, Number((
    (amountInfo.amount ? 0.45 : 0)
    + (amountInfo.fromTotalLabel ? 0.15 : 0)
    + (date ? 0.15 : 0)
    + (merchant ? 0.25 : 0)
  ).toFixed(2)));

  return { amount: amountInfo.amount, date, merchant, confidence };
}

export async function extractReceipt(
  buffer: Buffer,
  mime: string,
  options: ExtractReceiptOptions = {},
): Promise<ReceiptExtractionResult> {
  const key = options.googleApiKey?.trim();
  if (key) {
    try {
      const rawText = await extractWithGoogle(buffer, mime, key, options.fetchImpl ?? fetch);
      return { ...parseReceiptText(rawText), rawText, provider: 'google' };
    } catch {
      // OCR providers can fail independently. Continue without exposing receipt contents.
    }
  }

  const rawText = await extractWithTesseract(buffer, options.tesseractRecognize);
  return { ...parseReceiptText(rawText), rawText, provider: 'tesseract' };
}

async function extractWithGoogle(buffer: Buffer, mime: string, apiKey: string, fetchImpl: typeof fetch) {
  const response = await fetchImpl(`https://vision.googleapis.com/v1/images:annotate?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      requests: [{
        image: { content: buffer.toString('base64') },
        features: [{ type: 'TEXT_DETECTION' }],
      }],
    }),
  });
  if (!response.ok) throw new Error(`Google Vision request failed (${response.status})`);
  const body = await response.json() as { responses?: Array<{ fullTextAnnotation?: { text?: string }; textAnnotations?: Array<{ description?: string }> }> };
  const text = body.responses?.[0]?.fullTextAnnotation?.text ?? body.responses?.[0]?.textAnnotations?.[0]?.description;
  if (!text?.trim()) throw new Error('Google Vision returned no text');
  return text;
}

async function extractWithTesseract(buffer: Buffer, recognizer?: TesseractRecognize) {
  const recognize = recognizer ?? await loadTesseractRecognizer();
  const result = await recognize(buffer, 'por');
  const text = textFromTesseractResult(result);
  if (!text.trim()) throw new Error('Tesseract returned no text');
  return text;
}

async function loadTesseractRecognizer(): Promise<TesseractRecognize> {
  // Indirection keeps tesseract.js optional until OCR fallback is actually needed.
  const imported = await Function('name', 'return import(name)')('tesseract.js') as { recognize?: TesseractRecognize; default?: { recognize?: TesseractRecognize } };
  const recognize = imported.recognize ?? imported.default?.recognize;
  if (!recognize) throw new Error('Tesseract recognizer is unavailable');
  return recognize;
}

function textFromTesseractResult(result: unknown) {
  if (typeof result === 'string') return result;
  if (result && typeof result === 'object') {
    const value = result as { text?: unknown; data?: { text?: unknown } };
    if (typeof value.text === 'string') return value.text;
    if (typeof value.data?.text === 'string') return value.data.text;
  }
  return '';
}

function findAmount(lines: string[]) {
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!;
    if (!totalLabel.test(line) || /sub\s*total/i.test(line)) continue;
    const ownAmount = lastAmount(line);
    const nextAmount = !ownAmount ? lastAmount(lines[index + 1] ?? '') : null;
    if (ownAmount ?? nextAmount) return { amount: ownAmount ?? nextAmount, fromTotalLabel: true };
  }

  const monetaryAmounts = lines.flatMap((line) => [...line.matchAll(amountToken)]
    .filter((match) => /[,.€]/.test(match[0]!))
    .map((match) => normalizeAmount(match[0]!))
    .filter((amount): amount is string => amount !== null));
  return { amount: monetaryAmounts.at(-1) ?? null, fromTotalLabel: false };
}

function lastAmount(line: string) {
  const candidates = [...line.matchAll(amountToken)]
    .map((match) => normalizeAmount(match[0]!))
    .filter((amount): amount is string => amount !== null);
  return candidates.at(-1) ?? null;
}

function normalizeAmount(value: string) {
  let normalized = value.replace(/[€\s]/g, '');
  const comma = normalized.lastIndexOf(',');
  const dot = normalized.lastIndexOf('.');
  const decimalIndex = Math.max(comma, dot);
  if (decimalIndex >= 0 && normalized.length - decimalIndex - 1 === 2) {
    normalized = normalized.slice(0, decimalIndex).replace(/[.,]/g, '') + '.' + normalized.slice(decimalIndex + 1);
  } else {
    normalized = normalized.replace(/[.,]/g, '') + '.00';
  }
  const numeric = Number(normalized);
  return Number.isFinite(numeric) && numeric >= 0 ? numeric.toFixed(2) : null;
}

function findDate(text: string) {
  for (const match of text.matchAll(/\b(?:(\d{2})\/(\d{2})\/(\d{4})|(\d{4})-(\d{2})-(\d{2}))\b/g)) {
    const year = Number(match[3] ?? match[4]);
    const month = Number(match[2] ?? match[5]);
    const day = Number(match[1] ?? match[6]);
    const candidate = new Date(Date.UTC(year, month - 1, day));
    if (candidate.getUTCFullYear() === year && candidate.getUTCMonth() === month - 1 && candidate.getUTCDate() === day) {
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }
  return null;
}

function findMerchant(lines: string[]) {
  for (const line of lines.slice(0, 8)) {
    const cleaned = line.replace(/\s+/g, ' ').trim();
    if (cleaned.length < 2 || !/[A-Za-zÀ-ÖØ-öø-ÿ]/.test(cleaned)) continue;
    if (excludedMerchant.test(cleaned) || phoneOrTaxNumber.test(cleaned) || /\bdata\s*:/i.test(cleaned)) continue;
    if (/^\d|\b\d{2}[/-]\d{2}[/-]\d{4}\b/.test(cleaned)) continue;
    return cleaned.slice(0, 120);
  }
  return null;
}
