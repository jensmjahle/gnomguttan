import { useAuthStore } from '@/store/authStore';
import type { User } from '@/types';

export class AppApiError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
    this.name = 'AppApiError';
  }
}

interface AppApiRequestInit extends Omit<RequestInit, 'body' | 'headers'> {
  skipAuth?: boolean;
  headers?: HeadersInit;
  body?: unknown;
}

const APP_API_PREFIX = '/app-api';

/** The server's `{ error }` text when there is one, so callers can show it as-is. */
function errorMessage(body: string): string {
  try {
    const parsed = JSON.parse(body) as { error?: unknown };
    if (typeof parsed?.error === 'string') return parsed.error;
  } catch { /* not JSON */ }
  return body;
}

async function request<T>(path: string, init: AppApiRequestInit = {}): Promise<T> {
  const { skipAuth, headers, body, ...requestInit } = init;
  const token = skipAuth ? null : useAuthStore.getState().token;
  const requestHeaders = new Headers(headers ?? {});
  let requestBody: BodyInit | null | undefined = undefined;

  if (body !== undefined && body !== null) {
    if (typeof body === 'string') {
      if (!requestHeaders.has('Content-Type')) {
        requestHeaders.set('Content-Type', 'text/plain');
      }
      requestBody = body;
    } else if (
      body instanceof FormData ||
      body instanceof Blob ||
      body instanceof URLSearchParams ||
      body instanceof ArrayBuffer
    ) {
      requestBody = body as BodyInit;
    } else if (ArrayBuffer.isView(body)) {
      requestBody = body as unknown as BodyInit;
    } else {
      if (!requestHeaders.has('Content-Type')) {
        requestHeaders.set('Content-Type', 'application/json');
      }
      requestBody = JSON.stringify(body);
    }
  }

  const res = await fetch(`${APP_API_PREFIX}${path}`, {
    ...requestInit,
    body: requestBody,
    headers: {
      ...(token ? { 'X-API-Key': token } : {}),
      ...Object.fromEntries(requestHeaders.entries()),
    },
  });

  if (!res.ok) {
    const responseBody = await res.text().catch(() => '');
    // The session expired or was revoked (e.g. "Logg ut alle andre enheter" elsewhere).
    if (!skipAuth && res.status === 401 && token && useAuthStore.getState().token === token) {
      useAuthStore.getState().clearAuth();
      if (window.location.pathname !== '/login') window.location.assign('/login');
    }
    throw new AppApiError(res.status, errorMessage(responseBody) || `HTTP ${res.status}: ${path}`);
  }

  const text = await res.text();
  return text ? (JSON.parse(text) as T) : (undefined as T);
}

export async function syncCurrentAppUser(): Promise<User | null> {
  try {
    return await request<User>('/me');
  } catch {
    return null;
  }
}

export const appApi = {
  get: <T>(path: string, init?: AppApiRequestInit) => request<T>(path, init),
  post: <T>(path: string, body?: unknown, init?: AppApiRequestInit) =>
    request<T>(path, { ...init, method: 'POST', body }),
  put: <T>(path: string, body?: unknown, init?: AppApiRequestInit) =>
    request<T>(path, { ...init, method: 'PUT', body }),
  patch: <T>(path: string, body?: unknown, init?: AppApiRequestInit) =>
    request<T>(path, { ...init, method: 'PATCH', body }),
  delete: <T>(path: string, init?: AppApiRequestInit) => request<T>(path, { ...init, method: 'DELETE' }),
};
