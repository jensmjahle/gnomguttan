import { config } from '@/config';
import { useAuthStore } from '@/store/authStore';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = useAuthStore.getState().token;

  const res = await fetch(`${config.vocechatHost}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {}),
    },
  });

  if (!res.ok) {
    throw new ApiError(res.status, `HTTP ${res.status}: ${path}`);
  }

  const text = await res.text();
  return text ? (JSON.parse(text) as T) : (undefined as T);
}

export const api = {
  get:    <T>(path: string)                     => request<T>(path),
  post:   <T>(path: string, body?: unknown)     => request<T>(path, { method: 'POST',   body: body != null ? JSON.stringify(body) : undefined }),
  put:    <T>(path: string, body?: unknown)     => request<T>(path, { method: 'PUT',    body: body != null ? JSON.stringify(body) : undefined }),
  delete: <T>(path: string)                     => request<T>(path, { method: 'DELETE' }),
};
