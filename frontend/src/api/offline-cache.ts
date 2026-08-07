import type { User } from '../types';

const PREFIX = 'expensesnap.offline.';
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

function key(user: User, path: string) {
  return `${PREFIX}${user.id}.${encodeURIComponent(path)}`;
}

export function cacheGet<T>(user: User | null, path: string): T | null {
  if (!user || typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(key(user, path));
    if (!raw) return null;
    const entry = JSON.parse(raw) as { cachedAt: number; payload: T };
    if (!entry || Date.now() - entry.cachedAt > MAX_AGE_MS) return null;
    return entry.payload;
  } catch {
    return null;
  }
}

export function cacheSet<T>(user: User | null, path: string, payload: T) {
  if (!user || typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key(user, path), JSON.stringify({ cachedAt: Date.now(), payload }));
  } catch {
    // Storage can be full or disabled; the online path remains usable.
  }
}

export function clearOfflineCache(user?: User | null) {
  if (typeof window === 'undefined') return;
  const prefix = user ? `${PREFIX}${user.id}.` : PREFIX;
  try {
    for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
      const storageKey = window.localStorage.key(index);
      if (storageKey?.startsWith(prefix)) window.localStorage.removeItem(storageKey);
    }
  } catch {
    // Ignore disabled storage.
  }
}
