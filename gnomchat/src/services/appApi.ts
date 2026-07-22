import { config } from '@/config';
import { useAuthStore } from '@/store/authStore';
import { clearVoceChatSession, ensureFreshVoceChatToken, refreshVoceChatToken } from '@/services/session';

// Talks to the Gnomguttan website backend (/app-api) — albums live there, not in
// VoceChat. Auth is the same VoceChat token as X-API-Key; the backend resolves it
// via VoceChat. Mirrors the website's src/services/appApi.ts and the app's api.ts.

const APP_API_PREFIX = '/app-api';

export class AppApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'AppApiError';
  }
}

interface AppApiRequestInit extends Omit<RequestInit, 'body' | 'headers'> {
  skipAuth?: boolean;
  headers?: Record<string, string>;
  body?: unknown;
  retryOn401?: boolean;
}

async function request<T>(path: string, init: AppApiRequestInit = {}): Promise<T> {
  const { skipAuth, headers, body, retryOn401 = false, ...requestInit } = init;
  if (!skipAuth) {
    await ensureFreshVoceChatToken();
  }
  const token = skipAuth ? null : useAuthStore.getState().token;
  const requestHeaders: Record<string, string> = { ...(headers ?? {}) };
  let requestBody: BodyInit | undefined;

  if (body !== undefined && body !== null) {
    if (typeof body === 'string') {
      if (!('Content-Type' in requestHeaders)) requestHeaders['Content-Type'] = 'text/plain';
      requestBody = body;
    } else {
      if (!('Content-Type' in requestHeaders)) requestHeaders['Content-Type'] = 'application/json';
      requestBody = JSON.stringify(body);
    }
  }

  const res = await fetch(`${config.appApiHost}${APP_API_PREFIX}${path}`, {
    ...requestInit,
    body: requestBody,
    headers: {
      ...(token ? { 'X-API-Key': token } : {}),
      ...requestHeaders,
    },
  });

  if (!res.ok) {
    const errorBody = await res.text().catch(() => '');
    console.error(`[AppApi] ${res.status} ${path}`, errorBody);
    if (!skipAuth && res.status === 401 && !retryOn401) {
      const refreshed = await refreshVoceChatToken(true);
      if (refreshed) {
        return request<T>(path, { ...init, retryOn401: true });
      }
      if (!useAuthStore.getState().token) {
        clearVoceChatSession();
      }
    }
    throw new AppApiError(res.status, errorBody || `HTTP ${res.status}: ${path}`);
  }

  const text = await res.text();
  return text ? (JSON.parse(text) as T) : (undefined as T);
}

export const appApi = {
  get: <T>(path: string, init?: AppApiRequestInit) => request<T>(path, init),
  post: <T>(path: string, body?: unknown, init?: AppApiRequestInit) =>
    request<T>(path, { ...init, method: 'POST', body }),
  delete: <T>(path: string, init?: AppApiRequestInit) => request<T>(path, { ...init, method: 'DELETE' }),
};
