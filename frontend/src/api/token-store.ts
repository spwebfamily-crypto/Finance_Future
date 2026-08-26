import type { User } from "../types";

const ACCESS_TOKEN_KEY = "expensesnap.access-token";
const REFRESH_TOKEN_KEY = "expensesnap.refresh-token";
const USER_KEY = "expensesnap.user";

let accessToken: string | null = null;

function storageAvailable(storage: Storage) {
  try {
    const key = "__expensesnap_storage_test__";
    storage.setItem(key, key);
    storage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

export function getAccessToken() {
  if (accessToken) return accessToken;
  if (typeof window === "undefined" || !storageAvailable(window.sessionStorage)) return null;
  accessToken = window.sessionStorage.getItem(ACCESS_TOKEN_KEY);
  return accessToken;
}

export function getRefreshToken() {
  if (typeof window === "undefined" || !storageAvailable(window.localStorage)) return null;
  return window.localStorage.getItem(REFRESH_TOKEN_KEY);
}

export function getStoredUser(): User | null {
  if (typeof window === "undefined" || !storageAvailable(window.localStorage)) return null;
  const rawUser = window.localStorage.getItem(USER_KEY);
  if (!rawUser) return null;

  try {
    return JSON.parse(rawUser) as User;
  } catch {
    window.localStorage.removeItem(USER_KEY);
    return null;
  }
}

export function saveSession(nextAccessToken: string, nextRefreshToken: string, user?: User) {
  accessToken = nextAccessToken;
  if (typeof window === "undefined") return;

  if (storageAvailable(window.sessionStorage)) {
    window.sessionStorage.setItem(ACCESS_TOKEN_KEY, nextAccessToken);
  }
  if (storageAvailable(window.localStorage)) {
    window.localStorage.setItem(REFRESH_TOKEN_KEY, nextRefreshToken);
    if (user) window.localStorage.setItem(USER_KEY, JSON.stringify(user));
  }
}

export function clearSession() {
  accessToken = null;
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(ACCESS_TOKEN_KEY);
  window.localStorage.removeItem(REFRESH_TOKEN_KEY);
  window.localStorage.removeItem(USER_KEY);
}
