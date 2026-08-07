import Tesseract from 'tesseract.js';
import type { Category } from '../types';

export interface ReceiptOcrResult {
  rawText: string;
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

export function parseReceiptText(text: string, categories: Category[] = []): ReceiptOcrResult {
  const lines = usefulLines(text);
  const normalized = normalizeText(text);
  const matchedCategory = categories.find((category) => normalized.includes(normalizeText(category.name)));

  return {
    rawText: text,
    description: parseDescription(lines),
    location: parseLocation(lines),
    amount: parseAmount(text),
    date: parseDate(text),
    categoryId: matchedCategory?.id,
  };
}

export async function readReceiptImage(
  file: File,
  categories: Category[],
  onProgress?: (progress: number, status: string) => void,
) {
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
