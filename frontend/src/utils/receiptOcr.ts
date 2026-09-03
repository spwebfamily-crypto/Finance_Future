import type { Category } from "../types";
import { ensureLocalOcrAssets, localOcrOptions } from "./localOcr";

async function raceWithAbort<T>(operation: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return operation;
  signal.throwIfAborted();
  let abort: (() => void) | null = null;
  const cancelled = new Promise<never>((_resolve, reject) => {
    abort = () =>
      reject(signal.reason ?? new DOMException("A leitura foi cancelada.", "AbortError"));
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
  });
  try {
    return await Promise.race([operation, cancelled]);
  } finally {
    if (abort) signal.removeEventListener("abort", abort);
  }
}

export interface ReceiptOcrResult {
  rawText: string;
  source: "image" | "pdf";
  description?: string;
  location?: string;
  amount?: string;
  date?: string;
  categoryId?: string;
  confidence: {
    amount: number;
    date: number;
    category: number;
    description: number;
    location: number;
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

interface ReceiptLine {
  raw: string;
  normalized: string;
  index: number;
}

interface ScoredCandidate<T> {
  value: T;
  score: number;
  index: number;
}

const MAX_IMAGE_PIXELS = 4_000_000;
const MONEY_DIGITS = "0-9OoQqDdIl|SsB";
const MONEY_PATTERN = new RegExp(
  `(?<![A-Za-zÀ-ÿ0-9])(?:(?:€|eur)\\s*)?([${MONEY_DIGITS}]{1,3}(?:[.\\s,'’][${MONEY_DIGITS}]{3})*[.,]\\s*[${MONEY_DIGITS}]{2}|[${MONEY_DIGITS}]{1,8}[.,]\\s*[${MONEY_DIGITS}]{2})(?:\\s*(?:€|eur))?(?![A-Za-zÀ-ÿ0-9])`,
  "gi",
);

function cleanOcrText(value: string) {
  return value
    .normalize("NFKC")
    .replace(/\r\n?/g, "\n")
    .replace(/[\u00a0\u2007\u202f]/g, " ")
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .split("\n")
    .map((line) => line.replace(/[\t ]+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

function normalizeText(value: string) {
  return cleanOcrText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\b[5s]ub\s*t[0oq]ta[1li]\b/g, "subtotal")
    .replace(/\bt[0oq]ta[1li]\b/g, "total")
    .replace(/\b[1il]va\b/g, "iva")
    .replace(/[^a-z0-9%]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function receiptLines(text: string): ReceiptLine[] {
  return cleanOcrText(text)
    .split("\n")
    .map((raw, index) => ({ raw, normalized: normalizeText(raw), index }))
    .filter((line) => line.normalized.length > 0);
}

function normalizeOcrDigits(value: string) {
  return value
    .replace(/[OoQqDd]/g, "0")
    .replace(/[Il|!]/g, "1")
    .replace(/[Ss]/g, "5")
    .replace(/[Bb]/g, "8");
}

function parseMoney(raw: string) {
  const normalized = normalizeOcrDigits(raw)
    .replace(/[\s'’]/g, "")
    .replace(/[^\d.,]/g, "");
  const decimalIndex = Math.max(normalized.lastIndexOf(","), normalized.lastIndexOf("."));
  if (decimalIndex < 1) return undefined;
  const integer = normalized.slice(0, decimalIndex).replace(/[.,]/g, "");
  const decimals = normalized.slice(decimalIndex + 1).replace(/\D/g, "");
  if (!integer || decimals.length !== 2) return undefined;
  const amount = Number(`${integer}.${decimals}`);
  return Number.isFinite(amount) && amount > 0 && amount <= 99_999_999.99 ? amount : undefined;
}

const strongTotal =
  /\b(total a pagar|montante a pagar|valor a pagar|importe a pagar|total do documento|total da fatura|total fatura|total liquido|total geral|grand total|amount due|payment due|balance due|saldo a pagar)\b/;
const ordinaryTotal = /\b(total|valor total|montante total|importe total|total pago|valor pago)\b/;
const excludedAmount =
  /\b(subtotal|sub total|total sem iva|total iva|iva|vat|imposto|taxa|base tributavel|incidencia|desconto|poupanca|troco|entregue|recebido|retencao|arredondamento)\b/;
const unitAmount =
  /\b(preco unitario|valor unitario|unitario|quantidade|qtd|unit price|preco un)\b/;

function amountLabelScore(
  line: ReceiptLine,
  matchIndex: number,
  matchLength: number,
  previous?: ReceiptLine,
) {
  const prefix = normalizeText(line.raw.slice(Math.max(0, matchIndex - 72), matchIndex));
  const suffix = normalizeText(
    line.raw.slice(matchIndex + matchLength, matchIndex + matchLength + 36),
  );
  const previousText = previous?.normalized ?? "";

  // The label immediately beside a value is more reliable than other words on the same row.
  if (
    /(?:total a pagar|montante a pagar|valor a pagar|importe a pagar|total do documento|total da fatura|total liquido|total geral|grand total|amount due|payment due|balance due|saldo a pagar)\s*$/.test(
      prefix,
    )
  )
    return 190;
  if (
    /(?:subtotal|sub total|total sem iva|total iva|iva|vat|imposto|taxa|base tributavel|incidencia|desconto|poupanca|troco|entregue|recebido|retencao|arredondamento)\s*$/.test(
      prefix,
    )
  )
    return -180;
  if (
    /(?:preco unitario|valor unitario|unitario|quantidade|qtd|unit price|preco un)\s*$/.test(prefix)
  )
    return -110;
  if (/(?:valor total|montante total|importe total|total pago|valor pago|total)\s*$/.test(prefix))
    return 125;

  if (/^(?:total a pagar|valor a pagar|montante a pagar|total)\b/.test(suffix)) return 115;
  if (/^(?:iva|vat|imposto|desconto|troco)\b/.test(suffix)) return -150;

  const lineMoneyCount = [
    ...line.raw.matchAll(new RegExp(MONEY_PATTERN.source, MONEY_PATTERN.flags)),
  ].length;
  if (lineMoneyCount === 1 && strongTotal.test(line.normalized)) return 175;
  if (lineMoneyCount === 1 && excludedAmount.test(line.normalized)) return -145;
  if (
    lineMoneyCount === 1 &&
    ordinaryTotal.test(line.normalized) &&
    !/\bsubtotal\b/.test(line.normalized)
  )
    return 105;

  if (
    /^(?:total a pagar|montante a pagar|valor a pagar|importe a pagar|total do documento|total da fatura|total liquido|grand total|amount due|payment due|balance due|saldo a pagar)(?: eur)?$/.test(
      previousText,
    )
  )
    return 170;
  if (/^(?:subtotal|sub total|total iva|iva|vat|imposto|desconto|troco)$/.test(previousText))
    return -140;
  if (
    /^(?:valor total|montante total|importe total|total pago|valor pago|total)(?: eur)?$/.test(
      previousText,
    )
  )
    return 110;

  return 0;
}

function parseAmount(text: string): ParsedValue<string> {
  const lines = receiptLines(text);
  const candidates: Array<ScoredCandidate<number>> = [];

  lines.forEach((line, lineIndex) => {
    for (const match of line.raw.matchAll(new RegExp(MONEY_PATTERN.source, MONEY_PATTERN.flags))) {
      const value = parseMoney(match[1]);
      if (value === undefined) continue;
      const labelScore = amountLabelScore(
        line,
        match.index ?? 0,
        match[0].length,
        lines[lineIndex - 1],
      );
      const decimalIndex = Math.max(match[1].lastIndexOf(","), match[1].lastIndexOf("."));
      if (!/\d/.test(match[1].slice(0, decimalIndex)) && labelScore < 60) continue;
      let score = labelScore + (lineIndex / Math.max(lines.length - 1, 1)) * 18;
      const nearbyRaw = line.raw.slice(
        Math.max(0, (match.index ?? 0) - 5),
        (match.index ?? 0) + match[0].length + 5,
      );
      if (/%/.test(nearbyRaw)) score -= 130;
      if (/\b\d{1,2}[:h]\d{2}\b/.test(line.normalized)) score -= 35;
      if (unitAmount.test(line.normalized) && labelScore <= 0) score -= 65;
      if (/[€]/.test(match[0]) || /\beur\b/i.test(match[0])) score += 5;
      candidates.push({ value, score, index: lineIndex });
    }
  });

  const eligible = candidates.filter((candidate) => candidate.score > -25);
  if (!eligible.length) return { confidence: 0 };
  const sorted = [...eligible].sort(
    (left, right) =>
      right.score - left.score || right.value - left.value || right.index - left.index,
  );
  const best = sorted[0];
  const competing = sorted.find((candidate) => candidate.value !== best.value);
  let confidence =
    best.score >= 175 ? 0.99 : best.score >= 110 ? 0.94 : best.score >= 60 ? 0.82 : 0.58;
  if (competing && best.score - competing.score < 18) confidence = Math.min(confidence, 0.7);
  return { value: best.value.toFixed(2), confidence };
}

function validDate(year: number, month: number, day: number) {
  if (year < 1990 || year > 2100) return false;
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

function fullYear(value: string) {
  const year = Number(normalizeOcrDigits(value));
  if (value.length > 2) return year;
  return year >= 80 ? 1900 + year : 2000 + year;
}

function isoDate(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

const issueDateLabel =
  /\b(data de emissao|data emissao|emitido em|data da fatura|data fatura|data do documento|document date|issue date)\b/;
const excludedDateLabel =
  /\b(data de vencimento|vencimento|validade|limite de pagamento|pagar ate|due date|data entrega|entrega prevista)\b/;

function dateLabelScore(line: ReceiptLine, matchIndex: number, previous?: ReceiptLine) {
  const prefix = normalizeText(line.raw.slice(Math.max(0, matchIndex - 80), matchIndex));
  const previousText = previous?.normalized ?? "";
  if (
    /(?:data de vencimento|vencimento|validade|limite de pagamento|pagar ate|due date|data entrega|entrega prevista)\s*$/.test(
      prefix,
    )
  )
    return -175;
  if (
    /(?:data de emissao|data emissao|emitido em|data da fatura|data fatura|data do documento|document date|issue date)\s*$/.test(
      prefix,
    )
  )
    return 135;
  if (/(?:data|date)\s*$/.test(prefix)) return 65;
  if (excludedDateLabel.test(line.normalized)) return -130;
  if (issueDateLabel.test(line.normalized)) return 110;
  if (excludedDateLabel.test(previousText)) return -140;
  if (issueDateLabel.test(previousText)) return 115;
  if (/^(?:data|date)$/.test(previousText)) return 55;
  return 0;
}

const monthNumbers: Record<string, number> = {
  jan: 1,
  janeiro: 1,
  january: 1,
  fev: 2,
  fevereiro: 2,
  feb: 2,
  february: 2,
  mar: 3,
  marco: 3,
  march: 3,
  abr: 4,
  abril: 4,
  apr: 4,
  april: 4,
  mai: 5,
  maio: 5,
  may: 5,
  jun: 6,
  junho: 6,
  june: 6,
  jul: 7,
  julho: 7,
  july: 7,
  ago: 8,
  agosto: 8,
  aug: 8,
  august: 8,
  set: 9,
  setembro: 9,
  sep: 9,
  september: 9,
  out: 10,
  outubro: 10,
  oct: 10,
  october: 10,
  nov: 11,
  novembro: 11,
  november: 11,
  dez: 12,
  dezembro: 12,
  dec: 12,
  december: 12,
};

function parseDate(text: string): ParsedValue<string> {
  const lines = receiptLines(text);
  const candidates: Array<ScoredCandidate<string>> = [];
  const digit = "[0-9OoQqDdIl|SsB]";

  lines.forEach((line, lineIndex) => {
    const baseScore = 12 - (lineIndex / Math.max(lines.length - 1, 1)) * 4;
    const previous = lines[lineIndex - 1];
    const push = (year: number, month: number, day: number, matchIndex: number) => {
      if (!validDate(year, month, day)) return;
      candidates.push({
        value: isoDate(year, month, day),
        score: baseScore + dateLabelScore(line, matchIndex, previous),
        index: lineIndex,
      });
    };

    const isoPattern = new RegExp(
      `\\b(${digit}{4})\\s*[-/.]\\s*(${digit}{1,2})\\s*[-/.]\\s*(${digit}{1,2})\\b`,
      "g",
    );
    for (const match of line.raw.matchAll(isoPattern)) {
      push(
        Number(normalizeOcrDigits(match[1])),
        Number(normalizeOcrDigits(match[2])),
        Number(normalizeOcrDigits(match[3])),
        match.index ?? 0,
      );
    }

    const localPattern = new RegExp(
      `\\b(${digit}{1,2})\\s*[./-]\\s*(${digit}{1,2})\\s*[./-]\\s*(${digit}{2}|${digit}{4})\\b`,
      "g",
    );
    for (const match of line.raw.matchAll(localPattern)) {
      push(
        fullYear(match[3]),
        Number(normalizeOcrDigits(match[2])),
        Number(normalizeOcrDigits(match[1])),
        match.index ?? 0,
      );
    }

    const normalized = line.normalized;
    const wordDigit = "[0-9oqdil|sb]";
    const wordsPattern = new RegExp(
      `\\b(${wordDigit}{1,2})\\s+(?:de\\s+)?([a-z]+)\\s+(?:de\\s+)?(${wordDigit}{2}|${wordDigit}{4})\\b`,
      "g",
    );
    for (const match of normalized.matchAll(wordsPattern)) {
      const month = monthNumbers[match[2]];
      if (month)
        push(fullYear(match[3]), month, Number(normalizeOcrDigits(match[1])), match.index ?? 0);
    }
  });

  const eligible = candidates.filter((candidate) => candidate.score > -30);
  if (!eligible.length) return { confidence: 0 };
  const sorted = [...eligible].sort(
    (left, right) => right.score - left.score || left.index - right.index,
  );
  const best = sorted[0];
  const competing = sorted.find((candidate) => candidate.value !== best.value);
  let confidence =
    best.score >= 120 ? 0.98 : best.score >= 65 ? 0.9 : best.score >= 25 ? 0.78 : 0.6;
  if (competing && best.score - competing.score < 18) confidence = Math.min(confidence, 0.7);
  return { value: best.value, confidence };
}

function hasMoney(line: string) {
  return /\d{1,3}(?:[.\s,'’]\d{3})*[.,]\s*\d{2}|\d{1,8}[.,]\s*\d{2}/.test(line);
}

function upperCaseRatio(line: string) {
  const letters = line.match(/[A-Za-zÀ-ÿ]/g) ?? [];
  if (!letters.length) return 0;
  return letters.filter((letter) => letter === letter.toUpperCase()).length / letters.length;
}

const addressWords =
  /\b(rua|avenida|av|largo|travessa|estrada|praca|alameda|rotunda|calcada|centro comercial)\b/;
const documentMetadata =
  /\b(pagina|page|fatura|invoice|fatura recibo|recibo|talao|nif|nipc|contribuinte|documento|original|duplicado|data|hora|caixa|operador|cliente|consumidor final|iban|swift|atcud)\b/;
const contactMetadata = /\b(www|http|email|telefone|telemovel|tel|fax)\b/;

function parseMerchant(lines: ReceiptLine[]): ParsedValue<string> {
  const occurrences = new Map<string, number>();
  for (const line of lines)
    occurrences.set(line.normalized, (occurrences.get(line.normalized) ?? 0) + 1);

  const candidates: Array<ScoredCandidate<string>> = [];
  for (const line of lines) {
    if (line.raw.length < 3 || line.raw.length > 100 || !/[a-z]{3}/.test(line.normalized)) continue;
    let score = 42 - Math.min(line.index, 12) * 3;
    if (upperCaseRatio(line.raw) >= 0.7) score += 22;
    if (
      /\b(lda|sa|unipessoal|limitada|store|shop|mercado|supermercado|farmacia|restaurante|cafe|hotel)\b/.test(
        line.normalized,
      )
    )
      score += 16;
    if ((occurrences.get(line.normalized) ?? 0) > 1) score += 7;
    if (addressWords.test(line.normalized) || /\b\d{4}\s*-\s*\d{3}\b/.test(line.raw)) score -= 90;
    if (documentMetadata.test(line.normalized)) score -= 85;
    if (contactMetadata.test(line.normalized) || /[@]/.test(line.raw)) score -= 80;
    if (hasMoney(line.raw) || /\b\d{1,2}\s*%\b/.test(line.normalized)) score -= 80;
    if (
      /^[\d\W]+$/.test(line.raw) ||
      /\b(qtd|quantidade|preco|artigo|codigo|ref)\b/.test(line.normalized)
    )
      score -= 45;
    candidates.push({ value: line.raw.slice(0, 120), score, index: line.index });
  }

  const best = candidates.sort(
    (left, right) => right.score - left.score || left.index - right.index,
  )[0];
  if (!best || best.score < 10) return { confidence: 0 };
  return { value: best.value, confidence: best.score >= 60 ? 0.92 : best.score >= 35 ? 0.8 : 0.62 };
}

function parseLocation(lines: ReceiptLine[]): ParsedValue<string> {
  const candidates: Array<ScoredCandidate<string>> = [];
  lines.forEach((line, lineIndex) => {
    const previous = lines[lineIndex - 1];
    const next = lines[lineIndex + 1];
    const hasAddress = addressWords.test(line.normalized) || /^r[.]\s+/i.test(line.raw);
    const hasPostalCode = /\b\d{4}\s*-\s*\d{3}\b/.test(line.raw);
    const hasLocationLabel = /^(morada|endereco|local|loja|estabelecimento)\b/.test(
      line.normalized,
    );
    if (!hasAddress && !hasPostalCode && !hasLocationLabel) return;

    let score = hasAddress ? 100 : hasPostalCode ? 72 : 58;
    score -= Math.min(line.index, 20) * 0.8;
    if (
      /\b(cliente|morada de faturacao|faturar a|destinatario|bill to|ship to)\b/.test(
        `${previous?.normalized ?? ""} ${line.normalized}`,
      )
    )
      score -= 150;
    if (contactMetadata.test(line.normalized) || hasMoney(line.raw)) score -= 80;

    let value = line.raw.replace(/^(?:morada|endere[cç]o|local)\s*:\s*/i, "").trim();
    if (hasAddress && next && /\b\d{4}\s*-\s*\d{3}\b/.test(next.raw) && !hasMoney(next.raw)) {
      value = `${value}, ${next.raw}`;
      score += 18;
    } else if (hasPostalCode && previous && addressWords.test(previous.normalized)) {
      value = `${previous.raw}, ${value}`;
      score += 12;
    }
    candidates.push({ value: value.slice(0, 120), score, index: line.index });
  });

  const best = candidates.sort(
    (left, right) => right.score - left.score || left.index - right.index,
  )[0];
  if (!best || best.score < 35) return { confidence: 0 };
  return {
    value: best.value,
    confidence: best.score >= 105 ? 0.94 : best.score >= 75 ? 0.84 : 0.68,
  };
}

interface CategoryFamily {
  categoryName: RegExp;
  signals: Array<[RegExp, number]>;
}

const categoryFamilies: CategoryFamily[] = [
  {
    categoryName: /\b(alimentacao|comida|food)\b/,
    signals: [
      [
        /\b(supermercado|hipermercado|mercearia|mercado|restaurante|cafeteria|cafe|padaria|pastelaria|talho|refeicao|continente|pingo doce|lidl|aldi|auchan|intermarche)\b/,
        95,
      ],
      [/\b(glovo|uber\s*eats|ubereats|bolt\s*food|delivery)\b/, 105],
      [/\b(alimentacao|comida|bebida)\b/, 65],
    ],
  },
  {
    categoryName: /\b(transportes|transporte|mobilidade)\b/,
    signals: [
      [
        /\b(combustivel|gasolina|gasoleo|portagem|estacionamento|metro|comboio|autocarro|fertagus)\b/,
        100,
      ],
      [/\b(cp|rede expressos|carris|via verde|free\s*now|freenow)\b/, 90],
      [/\b(uber|bolt|taxi)\b(?!\s*eats|\s*food)/, 82],
      [/\b(transporte|mobilidade|viagem)\b/, 55],
      [/\b(posto medico|metro quadrado|uber\s*eats|bolt\s*food)\b/, -115],
    ],
  },
  {
    categoryName: /\b(casa|habitacao|lar)\b/,
    signals: [
      [
        /\b(renda|aluguer|condominio|eletricidade|energia|agua|internet|telecomunicacoes|mobiliario|ikea|leroy merlin)\b/,
        95,
      ],
      [/\b(habitacao|domestico)\b/, 60],
    ],
  },
  {
    categoryName: /\b(saude|health)\b/,
    signals: [
      [
        /\b(farmacia|hospital|clinica|consulta|dentista|medico|medica|medicamento|analises|laboratorio|saude)\b/,
        100,
      ],
    ],
  },
  {
    categoryName: /\b(lazer|entretenimento)\b/,
    signals: [
      [
        /\b(cinema|teatro|concerto|festival|streaming|netflix|spotify|lazer|museu|parque tematico)\b/,
        95,
      ],
      [/\b(bilhete|jogo)\b/, 52],
    ],
  },
  {
    categoryName: /\b(compras|shopping)\b/,
    signals: [
      [/\b(roupa|calcado|vestuario|shopping|zara|primark|decathlon|amazon|worten|fnac)\b/, 85],
      [/\b(loja de roupa|loja online)\b/, 72],
    ],
  },
];

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function exactPhrasePattern(value: string) {
  const words = normalizeText(value).split(" ").filter(Boolean).map(escapeRegExp);
  return words.length ? new RegExp(`\\b${words.join("\\s+")}\\b`) : null;
}

function inferCategory(text: string, categories: Category[]): ParsedValue<string> {
  const normalized = normalizeText(text);
  const scored = categories
    .map((category) => {
      const name = normalizeText(category.name);
      const namePattern = exactPhrasePattern(name);
      let score = 0;
      if (
        namePattern &&
        new RegExp(`\\b(?:categoria|category)\\s*:?\\s*${namePattern.source}`).test(normalized)
      )
        score += 145;
      else if (name.length >= 5 && namePattern?.test(normalized)) score += 62;

      const family = categoryFamilies.find((candidate) => candidate.categoryName.test(name));
      if (family) {
        for (const [pattern, weight] of family.signals)
          if (pattern.test(normalized)) score += weight;
      }
      return { category, score };
    })
    .sort((left, right) => right.score - left.score);

  const best = scored[0];
  const second = scored[1];
  if (!best || best.score < 58) return { confidence: 0 };
  const margin = best.score - (second?.score ?? 0);
  if (second && margin < 15 && best.score < 140) return { confidence: 0 };
  const confidence =
    best.score >= 140
      ? 0.98
      : best.score >= 100 && margin >= 25
        ? 0.92
        : best.score >= 80
          ? 0.84
          : 0.72;
  return { value: best.category.id, confidence };
}

function imageElement(
  file: File,
): Promise<{ source: CanvasImageSource; width: number; height: number; cleanup: () => void }> {
  if (typeof createImageBitmap === "function") {
    return createImageBitmap(file).then((bitmap) => ({
      source: bitmap,
      width: bitmap.width,
      height: bitmap.height,
      cleanup: () => bitmap.close(),
    }));
  }

  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () =>
      resolve({
        source: image,
        width: image.naturalWidth,
        height: image.naturalHeight,
        cleanup: () => URL.revokeObjectURL(url),
      });
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Não foi possível preparar a imagem do comprovativo."));
    };
    image.src = url;
  });
}

function enhanceLowContrastCanvas(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
) {
  try {
    const image = context.getImageData(0, 0, width, height);
    const histogram = new Uint32Array(256);
    const sampleStride = Math.max(1, Math.floor(Math.sqrt((width * height) / 250_000)));
    let samples = 0;
    for (let y = 0; y < height; y += sampleStride) {
      for (let x = 0; x < width; x += sampleStride) {
        const offset = (y * width + x) * 4;
        const luminance = Math.round(
          image.data[offset] * 0.2126 +
            image.data[offset + 1] * 0.7152 +
            image.data[offset + 2] * 0.0722,
        );
        histogram[luminance] += 1;
        samples += 1;
      }
    }
    const percentile = (ratio: number) => {
      const target = samples * ratio;
      let count = 0;
      for (let value = 0; value < histogram.length; value += 1) {
        count += histogram[value];
        if (count >= target) return value;
      }
      return 255;
    };
    const low = percentile(0.02);
    const high = percentile(0.98);
    const span = high - low;
    // Blank/noisy pages and already crisp images are safer left untouched.
    if (span < 28 || span >= 145) return false;
    const scale = 235 / span;
    for (let offset = 0; offset < image.data.length; offset += 4) {
      const luminance =
        image.data[offset] * 0.2126 +
        image.data[offset + 1] * 0.7152 +
        image.data[offset + 2] * 0.0722;
      const adjusted = Math.max(8, Math.min(243, Math.round((luminance - low) * scale + 8)));
      image.data[offset] = adjusted;
      image.data[offset + 1] = adjusted;
      image.data[offset + 2] = adjusted;
    }
    context.putImageData(image, 0, 0);
    return true;
  } catch {
    return false;
  }
}

async function prepareImageForOcr(
  file: File,
): Promise<{ source: File | HTMLCanvasElement; cleanup: () => void }> {
  if (typeof document === "undefined") return { source: file, cleanup: () => undefined };
  try {
    const decoded = await imageElement(file);
    try {
      const pixelScale = Math.sqrt(MAX_IMAGE_PIXELS / Math.max(decoded.width * decoded.height, 1));
      const smallImageBoost = Math.min(
        1.5,
        1200 / Math.max(Math.min(decoded.width, decoded.height), 1),
      );
      const scale = Math.min(pixelScale, Math.max(1, smallImageBoost));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(decoded.width * scale));
      canvas.height = Math.max(1, Math.round(decoded.height * scale));
      const context = canvas.getContext("2d", { alpha: false });
      if (!context) return { source: file, cleanup: () => undefined };
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "high";
      // Browser decoding already applies trustworthy EXIF orientation; no heuristic rotation is attempted.
      context.drawImage(decoded.source, 0, 0, canvas.width, canvas.height);
      enhanceLowContrastCanvas(context, canvas.width, canvas.height);
      return {
        source: canvas,
        cleanup: () => {
          canvas.width = 1;
          canvas.height = 1;
        },
      };
    } finally {
      decoded.cleanup();
    }
  } catch {
    return { source: file, cleanup: () => undefined };
  }
}

export function parseReceiptText(text: string, categories: Category[] = []): ReceiptOcrResult {
  const cleaned = cleanOcrText(text);
  const lines = receiptLines(cleaned);
  const merchant = parseMerchant(lines);
  const location = parseLocation(lines);
  const amount = parseAmount(cleaned);
  const date = parseDate(cleaned);
  const category = inferCategory(cleaned, categories);
  return {
    rawText: text,
    source: "image",
    description: merchant.value,
    location: location.value,
    amount: amount.value,
    date: date.value,
    categoryId: category.value,
    confidence: {
      amount: amount.confidence,
      date: date.confidence,
      category: category.confidence,
      description: merchant.confidence,
      location: location.confidence,
    },
  };
}

export async function readReceiptFile(
  file: File,
  categories: Category[],
  onProgress?: (progress: number, status: string) => void,
  signal?: AbortSignal,
) {
  signal?.throwIfAborted();
  if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
    const { readPdfReceipt } = await import("./pdfReceiptReader");
    signal?.throwIfAborted();
    const pdf = await readPdfReceipt(file, onProgress, signal);
    return {
      ...parseReceiptText(pdf.text, categories),
      rawText: pdf.text,
      source: "pdf" as const,
      pdf: { pageCount: pdf.pageCount, usedOcr: pdf.usedOcr },
    };
  }

  onProgress?.(0.01, "A preparar a leitura local…");
  const prepared = await prepareImageForOcr(file);
  try {
    signal?.throwIfAborted();
    await ensureLocalOcrAssets();
    signal?.throwIfAborted();
    const { default: Tesseract } = await import("tesseract.js");
    signal?.throwIfAborted();
    const pendingWorker = Tesseract.createWorker("por+eng", Tesseract.OEM.LSTM_ONLY, {
      ...localOcrOptions,
      logger: ({ progress, status }) => onProgress?.(progress, status),
    });
    let worker: Awaited<typeof pendingWorker>;
    try {
      worker = await raceWithAbort(pendingWorker, signal);
    } catch (error) {
      void pendingWorker.then((lateWorker) => lateWorker.terminate()).catch(() => undefined);
      throw error;
    }
    let terminationPromise: Promise<void> | null = null;
    const terminateWorker = () => {
      terminationPromise ??= worker
        .terminate()
        .then(() => undefined)
        .catch(() => undefined);
      return terminationPromise;
    };
    const abortOcr = () => {
      void terminateWorker();
    };
    signal?.addEventListener("abort", abortOcr, { once: true });
    try {
      if (signal?.aborted) void terminateWorker();
      signal?.throwIfAborted();
      const result = await raceWithAbort(worker.recognize(prepared.source), signal);
      signal?.throwIfAborted();
      return parseReceiptText(result.data.text, categories);
    } finally {
      signal?.removeEventListener("abort", abortOcr);
      await terminateWorker();
    }
  } finally {
    prepared.cleanup();
  }
}

export async function readReceiptImage(
  file: File,
  categories: Category[],
  onProgress?: (progress: number, status: string) => void,
  signal?: AbortSignal,
) {
  return readReceiptFile(file, categories, onProgress, signal);
}
