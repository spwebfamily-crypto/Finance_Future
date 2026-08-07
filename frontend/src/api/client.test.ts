import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiRequest, ApiError } from './client';
import { clearSession, saveSession } from './token-store';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('API client', () => {
  beforeEach(() => {
    clearSession();
  });

  it('rotates the refresh token and retries one unauthorized request', async () => {
    saveSession('expired-access', 'valid-refresh');
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ error: { message: 'expired' } }, 401))
      .mockResolvedValueOnce(jsonResponse({ accessToken: 'fresh-access', refreshToken: 'fresh-refresh' }))
      .mockResolvedValueOnce(jsonResponse({ data: [{ id: 'category-1' }] }));

    const payload = await apiRequest<{ data: Array<{ id: string }> }>('/categories');

    expect(payload.data[0]?.id).toBe('category-1');
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(new Headers(fetchMock.mock.calls[2]?.[1]?.headers).get('Authorization')).toBe('Bearer fresh-access');
    expect(window.localStorage.getItem('expensesnap.refresh-token')).toBe('fresh-refresh');
  });

  it('surfaces the structured API error', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      jsonResponse({ error: { code: 'VALIDATION_ERROR', message: 'Campo inválido' } }, 400),
    );

    await expect(apiRequest('/auth/login', { method: 'POST', auth: false, body: {} }))
      .rejects.toMatchObject({ status: 400, code: 'VALIDATION_ERROR', message: 'Campo inválido' } satisfies Partial<ApiError>);
  });
});
