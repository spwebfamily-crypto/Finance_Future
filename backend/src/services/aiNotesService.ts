import { z } from 'zod';

export type NoteSeverity = 'info' | 'warning' | 'critical';
export type SpendingSignalLevel = 'normal' | 'high' | 'critical' | 'insufficient_data';

export interface FinancialTotalsSnapshot {
  spent: number;
  income?: number;
  balance?: number;
}

export interface FinancialCategorySnapshot {
  id?: string;
  name: string;
  amount: number;
}

export interface FinancialLevelSnapshot {
  categoryId?: string;
  categoryName: string;
  level: SpendingSignalLevel;
}

export interface FinancialBudgetSnapshot {
  categoryId?: string;
  categoryName: string;
  limit: number;
  spent: number;
}

/** The minimum, serialisable context sent to the note generator. */
export interface FinancialSnapshot {
  currency: string;
  month: string;
  totals: FinancialTotalsSnapshot;
  categories: FinancialCategorySnapshot[];
  levels: FinancialLevelSnapshot[];
  budgets: FinancialBudgetSnapshot[];
}

export interface FinancialNote {
  content: string;
  severity: NoteSeverity;
  relatedCategory: string | null;
  source: 'local' | 'claude';
}

export type FetchImplementation = (input: string, init: RequestInit) => Promise<{
  ok: boolean;
  json(): Promise<unknown>;
}>;

export interface GenerateFinancialNoteOptions {
  apiKey?: string;
  model?: string;
  fetchImpl?: FetchImplementation;
}

const claudeNoteSchema = z.object({
  content: z.string().min(1).max(300),
  severity: z.enum(['info', 'warning', 'critical']),
  relatedCategory: z.string().nullable(),
}).strict();

const claudeResponseSchema = z.object({
  content: z.array(z.object({
    type: z.string(),
    text: z.string().optional(),
  })).min(1),
}).passthrough();

/** Parses only a JSON object or one complete JSON code fence; arbitrary prose is never accepted. */
export function parseClaudeNote(text: string): Omit<FinancialNote, 'source'> | null {
  const candidate = extractJson(text);
  if (candidate === null) return null;

  try {
    return claudeNoteSchema.parse(JSON.parse(candidate));
  } catch {
    return null;
  }
}

export async function generateFinancialNote(
  snapshot: FinancialSnapshot,
  options: GenerateFinancialNoteOptions = {},
): Promise<FinancialNote> {
  if (!options.apiKey) return localNote(snapshot);

  try {
    const fetchImpl = options.fetchImpl ?? globalThis.fetch;
    if (!fetchImpl) return localNote(snapshot);

    const response = await fetchImpl('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': options.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: options.model ?? 'claude-sonnet-5',
        max_tokens: 160,
        messages: [{ role: 'user', content: buildPrompt(snapshot) }],
      }),
    });
    if (!response.ok) return localNote(snapshot);

    const payload = claudeResponseSchema.safeParse(await response.json());
    const text = payload.success
      ? payload.data.content.find((part) => part.type === 'text')?.text
      : undefined;
    const parsed = text ? parseClaudeNote(text) : null;
    return parsed ? { ...parsed, source: 'claude' } : localNote(snapshot);
  } catch {
    return localNote(snapshot);
  }
}

function extractJson(text: string): string | null {
  const trimmed = text.trim();
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) return trimmed;

  const fenced = /^```(?:json)?\s*\r?\n([\s\S]*?)\r?\n```$/i.exec(trimmed);
  const candidate = fenced?.[1];
  return candidate?.trim() || null;
}

function buildPrompt(snapshot: FinancialSnapshot) {
  return [
    'Escreve uma nota financeira útil em português de Portugal, com exatamente duas frases e tom calmo, não alarmista.',
    'Responde apenas com JSON estrito, sem markdown, neste formato: {"content":"...","severity":"info|warning|critical","relatedCategory":"nome ou null"}.',
    'Usa apenas este resumo financeiro:',
    JSON.stringify(snapshot),
  ].join('\n');
}

function localNote(snapshot: FinancialSnapshot): FinancialNote {
  const signal = mostSevereSignal(snapshot.levels);
  const relatedCategory = signal?.categoryName ?? null;

  if (signal?.level === 'critical') {
    return {
      content: `Os gastos em ${signal.categoryName} merecem atenção neste mês. Reveja as próximas despesas para manter o orçamento sob controlo.`,
      severity: 'critical',
      relatedCategory,
      source: 'local',
    };
  }
  if (signal?.level === 'high') {
    return {
      content: `Os gastos em ${signal.categoryName} estão próximos do limite previsto. Acompanhe esta categoria nas próximas compras para evitar ultrapassagens.`,
      severity: 'warning',
      relatedCategory,
      source: 'local',
    };
  }
  return {
    content: `Registou ${formatAmount(snapshot.totals.spent, snapshot.currency)} em despesas em ${snapshot.month}. Continue a acompanhar os movimentos para manter uma visão clara das suas finanças.`,
    severity: 'info',
    relatedCategory: null,
    source: 'local',
  };
}

function mostSevereSignal(levels: FinancialLevelSnapshot[]) {
  const score: Record<SpendingSignalLevel, number> = { insufficient_data: 0, normal: 1, high: 2, critical: 3 };
  return levels.reduce<FinancialLevelSnapshot | undefined>((current, level) => {
    if (!current || score[level.level] > score[current.level]) return level;
    return current;
  }, undefined);
}

function formatAmount(amount: number, currency: string) {
  return new Intl.NumberFormat('pt-PT', {
    style: 'currency',
    currency: currency || 'EUR',
    maximumFractionDigits: 2,
  }).format(amount);
}
