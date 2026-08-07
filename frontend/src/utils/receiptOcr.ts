import Tesseract from 'tesseract.js';
import type { Category } from '../types';

export interface ReceiptOcrResult {
  rawText: string;
  source: 'image' | 'pdf';
  description?: string;
  location?: string;
  amount?: string;
  date?: string;
  categoryId?: string;
}

function normalizeText(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function parseAmount(text: string) {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const moneyPattern = /(?:€|eur)?\s*([\d.\s]+(?:[,\.]\d{2})|\d+[,\.]\d{2})\b/gi;
  const candidates = lines.flatMap((line) => {
    const matches = [...line.matchAll(moneyPattern)];
    return matches.map((match) => ({ line, value: match[1] || '' }));
  });
  const totalCandidate = candidates.find(({ line }) => /total|pagar|importe|valor|amount|due/i.test(line));
  const fallback = candidates.at(-1);
  const raw = totalCandidate?.value || fallback?.value;
  if (!raw) return undefined;

  const normalized = raw.replace(/\s/g, '').replace(/\.(?=\d{3}(?:[,.]|$))/g, '').replace(',', '.');
  const amount = Number(normalized);
  return Number.isFinite(amount) && amount > 0 ? amount.toFixed(2) : undefined;
}

function parseDate(text: string) {
  const match = text.match(/\b(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})\b/);
  if (!match) return undefined;
  const [, day, month, yearValue] = match;
  const year = yearValue.length === 2 ? `20${yearValue}` : yearValue;
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  if (date.getFullYear() !== Number(year) || date.getMonth() !== Number(month) - 1 || date.getDate() !== Number(day)) return undefined;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function usefulLines(text: string) {
  const ignored = /^(total|subtotal|iva|nif|www\.|tel|telefone|fatura|tal[aã]o|recibo|data|hora|obrigado|troco|multibanco)/i;
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line.length >= 3 && !ignored.test(line) && !/^[-\d\s.,€]+$/.test(line));
}

function parseDescription(lines: string[]) {
  return lines.find((line) => /[a-záàâãéêíóôõúç]{3}/i.test(line) && line.length <= 80);
}

function parseLocation(lines: string[]) {
  return lines.find((line) => /^(rua|r\.?|avenida|av\.?|largo|travessa|estrada|praça|praca)\b/i.test(line))?.slice(0, 120);
}

const categorySignals: Record<string, string[]> = {
  alimentacao: ['aliment', 'mercado', 'supermercado', 'restaurante', 'cafe', 'talho', 'padaria', 'mercearia'],
  transportes: ['transport', 'combust', 'gasolina', 'uber', 'bolt', 'metro', 'comboio', 'portagem', 'estacionamento'],
  casa: ['casa', 'renda', 'aluguer', 'luz', 'agua', 'eletric', 'gas', 'internet'],
  saude: ['saude', 'farmacia', 'hospital', 'consulta', 'dentista', 'clinica'],
  compras: ['compras', 'loja', 'roupa', 'calcado', 'shopping'],
};

function inferCategory(text: string, categories: Category[]) {
  const normalized = normalizeText(text);
  const exact = categories.find((category) => normalized.includes(normalizeText(category.name)));
  if (exact) return exact;
  return categories.find((category) => {
    const categoryName = normalizeText(category.name);
    const key = Object.keys(categorySignals).find((signal) => categoryName.includes(signal));
    return key ? categorySignals[key].some((signal) => normalized.includes(signal)) : false;
  });
}

export function parseReceiptText(text: string, categories: Category[] = []): ReceiptOcrResult {
  const lines = usefulLines(text);
  const matchedCategory = inferCategory(text, categories);

  return {
    rawText: text,
    source: 'image',
    description: parseDescription(lines),
    location: parseLocation(lines),
    amount: parseAmount(text),
    date: parseDate(text),
    categoryId: matchedCategory?.id,
  };
}

function decodePdfLiteral(value: string) {
  const unescaped = value
    .replace(/\\([nrt()\\])/g, (_match, character: string) => ({ n: '\n', r: '\r', t: '\t', '(': '(', ')': ')', '\\': '\\' }[character] || character))
    .replace(/\\[0-7]{1,3}/g, (match) => String.fromCharCode(Number.parseInt(match.slice(1), 8)));
  return unescaped.replace(/\s+/g, ' ').trim();
}

function extractPdfTokens(binary: string) {
  const literals = [...binary.matchAll(/\((?:\\.|[^\\()]){3,}\)/g)]
    .map((match) => decodePdfLiteral(match[0].slice(1, -1)))
    .filter((value) => /[\p{L}\d]{2}/u.test(value));
  const hexStrings = [...binary.matchAll(/<([0-9a-fA-F]{6,})>/g)].flatMap((match) => {
    const hex = match[1];
    const bytesInString = new Uint8Array(hex.length / 2);
    for (let index = 0; index < bytesInString.length; index += 1) bytesInString[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
    if (bytesInString[0] === 0xfe && bytesInString[1] === 0xff) {
      let value = '';
      for (let index = 2; index + 1 < bytesInString.length; index += 2) value += String.fromCharCode((bytesInString[index] << 8) | bytesInString[index + 1]);
      return [value.trim()];
    }
    return [new TextDecoder('utf-8').decode(bytesInString).trim()];
  }).filter((value) => /[\p{L}\d]{2}/u.test(value));
  return [...literals, ...hexStrings];
}

async function inflatePdfStreams(binary: string) {
  if (typeof DecompressionStream === 'undefined') return [];
  const inflated: string[] = [];
  let filterIndex = binary.indexOf('/FlateDecode');
  while (filterIndex >= 0) {
    const streamIndex = binary.indexOf('stream', filterIndex);
    if (streamIndex < 0 || streamIndex - filterIndex > 200) break;
    const start = binary.slice(streamIndex + 6).search(/[\r\n]/);
    if (start < 0) break;
    const dataStart = streamIndex + 6 + start + (binary[streamIndex + 6 + start] === '\r' && binary[streamIndex + 7 + start] === '\n' ? 2 : 1);
    const end = binary.indexOf('endstream', dataStart);
    if (end < 0) break;
    const compressed = Uint8Array.from(binary.slice(dataStart, end), (character) => character.charCodeAt(0));
    try {
      const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream('deflate'));
      inflated.push(new TextDecoder('latin1').decode(await new Response(stream).arrayBuffer()));
    } catch {
      // A malformed stream should not prevent attaching the original PDF.
    }
    filterIndex = binary.indexOf('/FlateDecode', end);
  }
  return inflated;
}

/**
 * Reads text embedded in a digital PDF without uploading it anywhere.
 * Scanned/image-only PDFs have no text layer; those are reported as empty so
 * the user can still attach the file and complete the fields manually.
 */
async function extractPdfText(file: File, onProgress?: (progress: number, status: string) => void) {
  onProgress?.(0.1, 'A preparar o PDF…');
  const maybeArrayBuffer = file as File & { arrayBuffer?: () => Promise<ArrayBuffer> };
  const buffer = maybeArrayBuffer.arrayBuffer
    ? await maybeArrayBuffer.arrayBuffer()
    : await new Promise<ArrayBuffer>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = () => reject(reader.error || new Error('Não foi possível ler o ficheiro.'));
      reader.readAsArrayBuffer(file);
    });
  const bytes = new Uint8Array(buffer);
  const binary = new TextDecoder('latin1').decode(bytes);
  const streams = await inflatePdfStreams(binary);
  const text = [...new Set([...
    extractPdfTokens(binary),
    ...streams.flatMap((stream) => extractPdfTokens(stream)),
  ])].join('\n');
  onProgress?.(1, text ? 'Texto do PDF identificado.' : 'Este PDF não tem texto selecionável.');
  return text;
}

export async function readReceiptFile(
  file: File,
  categories: Category[],
  onProgress?: (progress: number, status: string) => void,
) {
  if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
    const text = await extractPdfText(file, onProgress);
    return { ...parseReceiptText(text, categories), rawText: text, source: 'pdf' as const };
  }

  const worker = await Tesseract.createWorker('por+eng', Tesseract.OEM.LSTM_ONLY, {
    logger: ({ progress, status }) => onProgress?.(progress, status),
  });

  try {
    const result = await worker.recognize(file);
    return parseReceiptText(result.data.text, categories);
  } finally {
    await worker.terminate();
  }
}

export async function readReceiptImage(
  file: File,
  categories: Category[],
  onProgress?: (progress: number, status: string) => void,
) {
  return readReceiptFile(file, categories, onProgress);
}
