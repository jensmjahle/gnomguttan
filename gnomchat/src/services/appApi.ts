import { config } from '@/config';
import { useAuthStore } from '@/store/authStore';

// Talks to the Gnomguttan backend (/app-api) with our own session token as
// X-API-Key, like the website's src/services/appApi.ts.

const APP_API_PREFIX = '/app-api';

export class AppApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = 'AppApiError';
  }
}

export interface AppApiRequestInit extends Omit<RequestInit, 'body' | 'headers'> {
  skipAuth?: boolean;
  headers?: Record<string, string>;
  body?: unknown;
}

/** The server's `{ error }` text when there is one, so it can be shown as-is. */
function errorMessage(body: string, status: number): string {
  try {
    const parsed = JSON.parse(body) as { error?: unknown };
    if (typeof parsed?.error === 'string') return parsed.error;
  } catch { /* not JSON */ }
  if (status >= 500) return 'Serveren svarte ikke som den skulle. Prøv igjen om litt.';
  return body || `Noe gikk galt (${status}).`;
}

export function appUrl(path: string): string {
  return `${config.appApiHost}${APP_API_PREFIX}${path}`;
}

/** For images/streams that can't send headers: the token goes in the query string. */
export function authedUrl(path: string, params: Record<string, string> = {}): string {
  const token = useAuthStore.getState().token;
  const query = new URLSearchParams({ ...params, ...(token ? { token } : {}) }).toString();
  return `${appUrl(path)}${query ? `${path.includes('?') ? '&' : '?'}${query}` : ''}`;
}

async function request<T>(path: string, init: AppApiRequestInit = {}): Promise<T> {
  const { skipAuth, headers, body, ...requestInit } = init;
  const token = skipAuth ? null : useAuthStore.getState().token;
  const requestHeaders: Record<string, string> = { Accept: 'application/json', ...(headers ?? {}) };
  let requestBody: BodyInit | undefined;

  if (body !== undefined && body !== null) {
    if (typeof body === 'string') {
      requestHeaders['Content-Type'] ??= 'text/plain';
      requestBody = body;
    } else if (body instanceof FormData || body instanceof ArrayBuffer || ArrayBuffer.isView(body)) {
      requestBody = body as BodyInit;
    } else {
      requestHeaders['Content-Type'] ??= 'application/json';
      requestBody = JSON.stringify(body);
    }
  }

  let res: Response;
  try {
    res = await fetch(appUrl(path), {
      ...requestInit,
      body: requestBody,
      headers: { ...(token ? { 'X-API-Key': token } : {}), ...requestHeaders },
    });
  } catch {
    throw new AppApiError(0, 'Ingen forbindelse. Sjekk nettet og prøv igjen.');
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    // The session expired or was revoked (e.g. "Logg ut alle andre enheter" on the website).
    if (!skipAuth && res.status === 401 && token && useAuthStore.getState().token === token) {
      useAuthStore.getState().clearAuth('Du ble logget ut. Logg inn igjen.');
    }
    throw new AppApiError(res.status, errorMessage(text, res.status));
  }

  const text = await res.text();
  return text ? (JSON.parse(text) as T) : (undefined as T);
}

export const appApi = {
  get: <T>(path: string, init?: AppApiRequestInit) => request<T>(path, init),
  post: <T>(path: string, body?: unknown, init?: AppApiRequestInit) => request<T>(path, { ...init, method: 'POST', body }),
  put: <T>(path: string, body?: unknown, init?: AppApiRequestInit) => request<T>(path, { ...init, method: 'PUT', body }),
  patch: <T>(path: string, body?: unknown, init?: AppApiRequestInit) => request<T>(path, { ...init, method: 'PATCH', body }),
  delete: <T>(path: string, init?: AppApiRequestInit) => request<T>(path, { ...init, method: 'DELETE' }),
};

export function errorText(error: unknown, fallback = 'Noe gikk galt.'): string {
  return error instanceof Error && error.message ? error.message : fallback;
}
