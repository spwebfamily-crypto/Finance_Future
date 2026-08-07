import { describe, expect, it, vi } from 'vitest';
import { generateFinancialNote, parseClaudeNote, type FinancialSnapshot } from './aiNotesService.js';

const snapshot: FinancialSnapshot = {
  currency: 'EUR',
  month: '2026-08',
  totals: { spent: 120 },
  categories: [{ name: 'Alimentação', amount: 120 }],
  levels: [{ categoryName: 'Alimentação', level: 'high' }],
  budgets: [{ categoryName: 'Alimentação', limit: 150, spent: 120 }],
};

describe('parseClaudeNote', () => {
  it('accepts strict JSON, including one complete JSON fence', () => {
    expect(parseClaudeNote('{"content":"Tudo sob controlo.","severity":"info","relatedCategory":null}')).toEqual({
      content: 'Tudo sob controlo.', severity: 'info', relatedCategory: null,
    });
    expect(parseClaudeNote('```json\n{"content":"Reveja alimentação.","severity":"warning","relatedCategory":"Alimentação"}\n```')).toMatchObject({
      severity: 'warning', relatedCategory: 'Alimentação',
    });
  });

  it('rejects prose, invalid JSON, extra fields and invalid schema values', () => {
    expect(parseClaudeNote('Nota: {"content":"x","severity":"info","relatedCategory":null}')).toBeNull();
    expect(parseClaudeNote('{"content":"x","severity":"urgent","relatedCategory":null}')).toBeNull();
    expect(parseClaudeNote('{"content":"x","severity":"info","relatedCategory":null,"extra":true}')).toBeNull();
  });
});

describe('generateFinancialNote', () => {
  it('calls Claude with the required API contract and returns its validated note', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ content: [{ type: 'text', text: '{"content":"Acompanhe a alimentação esta semana.","severity":"warning","relatedCategory":"Alimentação"}' }] }),
    });

    await expect(generateFinancialNote(snapshot, { apiKey: 'test-key', fetchImpl })).resolves.toMatchObject({
      source: 'claude', severity: 'warning', relatedCategory: 'Alimentação',
    });
    expect(fetchImpl).toHaveBeenCalledWith('https://api.anthropic.com/v1/messages', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({ 'x-api-key': 'test-key', 'anthropic-version': '2023-06-01' }),
    }));
  });

  it('uses a deterministic local note when no key, API error or invalid response is available', async () => {
    await expect(generateFinancialNote(snapshot)).resolves.toMatchObject({ source: 'local', severity: 'warning', relatedCategory: 'Alimentação' });
    await expect(generateFinancialNote(snapshot, { apiKey: 'test-key', fetchImpl: vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }) })).resolves.toMatchObject({ source: 'local' });
    await expect(generateFinancialNote(snapshot, { apiKey: 'test-key', fetchImpl: vi.fn().mockResolvedValue({ ok: true, json: async () => ({ content: [{ type: 'text', text: 'não é JSON' }] }) }) })).resolves.toMatchObject({ source: 'local' });
  });
});
