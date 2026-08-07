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
  confidence: {
    amount: number;
    date: number;
    category: number;
  };
  pdf?: {
    pageCount: number;
    usedOcr: boolean;
  };
}

interface ParsedValue<T> {
  value?: T;
  confidence: number;
}

function normalizeText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function textLines(text: string) {
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

function parseMoney(raw: string) {
  const compact = raw.replace(/\s/g, '');
  const decimalIndex = Math.max(compact.lastIndexOf(','), compact.lastIndexOf('.'));
  if (decimalIndex < 0) return undefined;
  const integer = compact.slice(0, decimalIndex).replace(/[.,]/g, '');
  const decimals = compact.slice(decimalIndex + 1).replace(/\D/g, '');
  if (!integer || decimals.length !== 2) return undefined;
  const amount = Number(`${integer}.${decimals}`);
  return Number.isFinite(amount) && amount > 0 && amount <= 99_999_999.99 ? amount : undefined;
}

function parseAmount(text: string): ParsedValue<string> {
  const lines = textLines(text);
  const moneyPattern = /(?<![\d.,])(\d{1,3}(?:[.\s,]\d{3})+[.,]\d{2}|\d+[.,]\d{2})(?!\d)/g;
  const candidates: Array<{ value: number; score: number; index: number }> = [];

  lines.forEach((line, index) => {
    const normalized = normalizeText(line);
    let score = (index / Math.max(lines.length, 1)) * 12;
    if (/\b(total a pagar|montante a pagar|valor a pagar|importe a pagar|grand total|amount due|payment due|saldo a pagar)\b/.test(normalized)) score += 150;
    else if (/\btotal\b/.test(normalized) && !/\bsub\s*total\b/.test(normalized)) score += 85;
    else if (/\b(pagar|montante|importe|valor)\b/.test(normalized)) score += 38;
    if (/\b(sub\s*total|iva|vat|imposto|taxa|base tributavel|incidencia|desconto|troco|entregue|retencao)\b/.test(normalized)) score -= 125;
    if (/\b(preco unitario|unitario|quantidade|qtd)\b/.test(normalized)) score -= 70;
    if (/\bd{1,2}\s*%\b/.test(normalized)) score -= 70;

    for (const match of line.matchAll(moneyPattern)) {
      const value = parseMoney(match[1]);
      if (value !== undefined) candidates.push({ value, score, index });
    }
  });

  if (!candidates.length) return { confidence: 0 };
  const labelled = candidates.filter((candidate) => candidate.score >= 35);
  const pool = labelled.length ? labelled : candidates;
  const best = [...pool].sort((left, right) => right.score - left.score || right.value - left.value || right.index - left.index)[0];
  const confidence = best.score >= 120 ? 0.99 : best.score >= 75 ? 0.9 : best.score >= 35 ? 0.78 : 0.58;
  return { value: best.value.toFixed(2), confidence };
}

function validDate(year: number, month: number, day: number) {
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

function parseDate(text: string): ParsedValue<string> {
  const lines = textLines(text);
  const candidates: Array<{ value: string; score: number; index: number }> = [];
  lines.forEach((line, index) => {
    const normalized = normalizeText(line);
    let score = 15 - (index / Math.max(lines.length, 1)) * 5;
    if (/\b(data de emissao|data emissao|emitido em|data da fatura|data fatura|data do documento)\b/.test(normalized)) score += 90;
    else if (/\bdata\b/.test(normalized)) score += 45;
    if (/\b(vencimento|validade|limite de pagamento|pagar ate)\b/.test(normalized)) score -= 110;

    for (const match of line.matchAll(/\b(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})\b/g)) {
      const day = Number(match[1]);
      const month = Number(match[2]);
      const year = Number(match[3].length === 2 ? `20${match[3]}` : match[3]);
      if (validDate(year, month, day)) candidates.push({ value: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`, score, index });
    }
    for (const match of line.matchAll(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/g)) {
      const year = Number(match[1]);
      const month = Number(match[2]);
      const day = Number(match[3]);
      if (validDate(year, month, day)) candidates.push({ value: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`, score, index });
    }
  });
  if (!candidates.length) return { confidence: 0 };
  const best = [...candidates].sort((left, right) => right.score - left.score || left.index - right.index)[0];
  return { value: best.value, confidence: best.score >= 80 ? 0.96 : best.score >= 40 ? 0.82 : 0.62 };
}

function usefulLines(text: string) {
  const ignored = /^(pagina \d+|total|sub\s*total|iva|vat|nif|nipc|www\.|tel|telefone|fatura|fatura recibo|talao|recibo|data|hora|obrigado|troco|multibanco|contribuinte)\b/i;
  return textLines(text).filter((line) => {
    const normalized = normalizeText(line);
    return line.length >= 3
      && line.length <= 100
      && !ignored.test(normalized)
      && /[a-z]{3}/.test(normalized)
      && !/^[-\d\s.,€:$%/]+$/.test(line);
  });
}

function parseDescription(lines: string[]) {
  return lines.find((line) => !/\b(rua|avenida|av|largo|travessa|estrada|praca|codigo postal)\b/.test(normalizeText(line)))?.slice(0, 120);
}

function parseLocation(lines: string[]) {
  return lines.find((line) => /\b(rua|avenida|av|largo|travessa|estrada|praca)\b/.test(normalizeText(line)))?.slice(0, 120);
}

const categorySignals: Record<string, Array<[RegExp, number]>> = {
  alimentacao: [
    [/\b(supermercado|hipermercado|mercearia|mercado|restaurante|cafe|cafeteria|padaria|pastelaria|talho|refeicao|delivery|glovo|ubereats|continente|pingo doce|lidl|aldi|auchan|intermarche)\b/, 90],
    [/\b(alimentacao|comida|bebida)\b/, 55],
  ],
  transportes: [
    [/\b(combustivel|gasolina|gasoleo|posto|portagem|estacionamento|metro|comboio|autocarro|uber|bolt|freennow|cp|fertagus)\b/, 90],
    [/\b(transporte|mobilidade|viagem)\b/, 50],
  ],
  casa: [
    [/\b(renda|aluguer|condominio|eletricidade|energia|agua|internet|telecomunicacoes|mobiliario|ikea|leroy merlin)\b/, 85],
    [/\b(habitacao|domestico)\b/, 50],
  ],
  saude: [
    [/\b(farmacia|hospital|clinica|consulta|dentista|medicamento|analises|saude)\b/, 90],
  ],
  lazer: [
    [/\b(cinema|teatro|concerto|bilhete|festival|jogo|streaming|netflix|spotify|lazer)\b/, 85],
  ],
  compras: [
    [/\b(roupa|calcado|vestuario|shopping|loja|zara|primark|decathlon|amazon)\b/, 75],
  ],
};

function inferCategory(text: string, categories: Category[]): ParsedValue<string> {
  const normalized = normalizeText(text);
  const scored = categories.map((category) => {
    const name = normalizeText(category.name);
    let score = 0;
    if (name.length >= 5 && new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(normalized)) score += 100;
    const ruleKey = Object.keys(categorySignals).find((key) => name.includes(key));
    if (ruleKey) {
      for (const [pattern, weight] of categorySignals[ruleKey]) if (pattern.test(normalized)) score += weight;
    }
    return { category, score };
  }).sort((left, right) => right.score - left.score);
  const best = scored[0];
  if (!best || best.score < 50) return { confidence: 0 };
  return { value: best.category.id, confidence: best.score >= 100 ? 0.95 : best.score >= 80 ? 0.86 : 0.72 };
}

export function parseReceiptText(text: string, categories: Category[] = []): ReceiptOcrResult {
  const lines = usefulLines(text);
  const amount = parseAmount(text);
  const date = parseDate(text);
  const category = inferCategory(text, categories);
  return {
    rawText: text,
    source: 'image',
    description: parseDescription(lines),
    location: parseLocation(lines),
    amount: amount.value,
    date: date.value,
    categoryId: category.value,
    confidence: { amount: amount.confidence, date: date.confidence, category: category.confidence },
  };
}

export async function readReceiptFile(
  file: File,
  categories: Category[],
  onProgress?: (progress: number, status: string) => void,
) {
  if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
    const { readPdfReceipt } = await import('./pdfReceiptReader');
    const pdf = await readPdfReceipt(file, onProgress);
    return { ...parseReceiptText(pdf.text, categories), rawText: pdf.text, source: 'pdf' as const, pdf: { pageCount: pdf.pageCount, usedOcr: pdf.usedOcr } };
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
