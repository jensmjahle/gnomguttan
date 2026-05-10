import { useAuthStore } from '@/store/authStore';
import { clearVoceChatSession, ensureFreshVoceChatToken, refreshVoceChatToken } from '@/services/vocechatSession';
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
  retryOn401?: boolean;
}

const APP_API_PREFIX = '/app-api';

async function request<T>(path: string, init: AppApiRequestInit = {}): Promise<T> {
  const { skipAuth, headers, body, retryOn401 = false, ...requestInit } = init;
  if (!skipAuth) {
    await ensureFreshVoceChatToken();
  }
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
    if (!skipAuth && res.status === 401 && !retryOn401) {
      const refreshed = await refreshVoceChatToken(true);
      if (refreshed) {
        return request<T>(path, { ...init, retryOn401: true });
      }

      if (!useAuthStore.getState().token) {
        clearVoceChatSession();
        if (window.location.pathname !== '/login') {
          window.location.assign('/login');
        }
      }
    }
    throw new AppApiError(res.status, responseBody || `HTTP ${res.status}: ${path}`);
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
  delete: <T>(path: string, init?: AppApiRequestInit) => request<T>(path, { ...init, method: 'DELETE' }),
};
