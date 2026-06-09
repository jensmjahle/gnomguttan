import { config } from '@/config';
import { useAuthStore } from '@/store/authStore';
import { clearVoceChatSession, ensureFreshVoceChatToken, refreshVoceChatToken } from '@/services/session';

// Ported from the website's src/services/api.ts. Same X-API-Key auth and
// 401 → renew → retry flow. On terminal 401 we just clear the session; the
// navigation auth-gate reacts to the empty token and shows the login screen
// (no window.location like on web).

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface ApiRequestInit extends Omit<RequestInit, 'body' | 'headers'> {
  skipAuth?: boolean;
  headers?: Record<string, string>;
  body?: unknown;
  retryOn401?: boolean;
}

async function request<T>(path: string, init: ApiRequestInit = {}): Promise<T> {
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

  const res = await fetch(`${config.vocechatHost}${path}`, {
    ...requestInit,
    body: requestBody,
    headers: {
      ...(token ? { 'X-API-Key': token } : {}),
      ...requestHeaders,
    },
  });

  if (!res.ok) {
    const errorBody = await res.text().catch(() => '');
    console.error(`[API] ${res.status} ${path}`, errorBody);
    if (!skipAuth && res.status === 401 && !retryOn401) {
      const refreshed = await refreshVoceChatToken(true);
      if (refreshed) {
        return request<T>(path, { ...init, retryOn401: true });
      }
      if (!useAuthStore.getState().token) {
        clearVoceChatSession();
      }
    }
    throw new ApiError(res.status, `HTTP ${res.status}: ${path}`);
  }

  const text = await res.text();
  return text ? (JSON.parse(text) as T) : (undefined as T);
}

export const api = {
  get: <T>(path: string, init?: ApiRequestInit) => request<T>(path, init),
  post: <T>(path: string, body?: unknown, init?: ApiRequestInit) =>
    request<T>(path, { ...init, method: 'POST', body }),
  put: <T>(path: string, body?: unknown, init?: ApiRequestInit) =>
    request<T>(path, { ...init, method: 'PUT', body }),
  delete: <T>(path: string, init?: ApiRequestInit) => request<T>(path, { ...init, method: 'DELETE' }),
};
