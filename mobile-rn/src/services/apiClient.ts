/**
 * Low-level HTTP client for the FlupFlap backend.
 *
 * Attaches the NextAuth session cookie on every request and persists
 * any new Set-Cookie value received from the server (mirrors the
 * Flutter ApiClient behaviour).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import {BASE_URL, SESSION_COOKIE_KEY} from '@/constants/api';

export interface ApiResponse<T = unknown> {
  ok: boolean;
  status: number;
  data: T | null;
  error: string | null;
}

async function getSessionCookie(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(SESSION_COOKIE_KEY);
  } catch {
    return null;
  }
}

async function maybeStoreCookie(headers: Headers): Promise<void> {
  const setCookie = headers.get('set-cookie');
  if (setCookie) {
    const cookieValue = setCookie.split(';')[0]?.trim() ?? '';
    if (cookieValue) {
      try {
        await AsyncStorage.setItem(SESSION_COOKIE_KEY, cookieValue);
      } catch {
        // Non-fatal — the session will just not persist.
      }
    }
  }
}

async function buildHeaders(json = true): Promise<Record<string, string>> {
  const cookie = await getSessionCookie();
  return {
    ...(json ? {'Content-Type': 'application/json'} : {}),
    Accept: 'application/json',
    ...(cookie ? {Cookie: cookie} : {}),
  };
}

function parseError(status: number, body: unknown): string {
  if (body && typeof body === 'object') {
    const b = body as Record<string, unknown>;
    if (typeof b['error'] === 'string') return b['error'];
    if (typeof b['message'] === 'string') return b['message'];
  }
  return `Request failed (${status})`;
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<ApiResponse<T>> {
  const url = `${BASE_URL}${path}`;
  const headers = await buildHeaders();

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers,
      ...(body !== undefined ? {body: JSON.stringify(body)} : {}),
    });
  } catch (err) {
    return {
      ok: false,
      status: 0,
      data: null,
      error: err instanceof Error ? err.message : 'Network error',
    };
  }

  await maybeStoreCookie(response.headers);

  let parsed: unknown;
  try {
    parsed = await response.json();
  } catch {
    parsed = null;
  }

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      data: null,
      error: parseError(response.status, parsed),
    };
  }

  return {ok: true, status: response.status, data: parsed as T, error: null};
}

export const apiClient = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
  delete: <T>(path: string) => request<T>('DELETE', path),

  /** Remove the persisted session cookie (call on logout). */
  clearSession: () => AsyncStorage.removeItem(SESSION_COOKIE_KEY),
};
