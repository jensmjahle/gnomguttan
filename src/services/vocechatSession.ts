import { config } from '@/config';
import { useAuthStore } from '@/store/authStore';
import type { LoginResponse, User } from '@/types';

const REFRESH_MARGIN_MS = 20_000;

type TokenPayload = Pick<LoginResponse, 'token' | 'refresh_token' | 'expired_in'>;

let refreshPromise: Promise<boolean> | null = null;

function createSession(user: User, payload: TokenPayload) {
  return {
    user,
    token: payload.token,
    refreshToken: payload.refresh_token,
    expiresAt: Date.now() + Math.max(0, payload.expired_in) * 1000,
  };
}

function getSessionState() {
  const { token, refreshToken, expiresAt } = useAuthStore.getState();
  return { token, refreshToken, expiresAt };
}

export function storeVoceChatSession(user: User, payload: TokenPayload) {
  useAuthStore.getState().setAuth(createSession(user, payload));
}

export function updateVoceChatSession(payload: TokenPayload) {
  const user = useAuthStore.getState().user;
  if (!user) {
    return;
  }

  useAuthStore.getState().setAuth(createSession(user, payload));
}

export function clearVoceChatSession() {
  useAuthStore.getState().clearAuth();
}

export function hasVoceChatSession() {
  const { user, token } = useAuthStore.getState();
  return !!token && !!user?.uid && !!user?.name;
}

export async function ensureFreshVoceChatToken(force = false): Promise<string | null> {
  const session = getSessionState();
  if (!session.token) {
    return null;
  }

  if (!session.refreshToken || session.expiresAt === null) {
    return session.token;
  }

  if (!force && Date.now() < session.expiresAt - REFRESH_MARGIN_MS) {
    return session.token;
  }

  await refreshVoceChatToken(true);
  return useAuthStore.getState().token;
}

export async function refreshVoceChatToken(force = false): Promise<boolean> {
  const session = getSessionState();
  const accessToken = session.token;
  const refreshToken = session.refreshToken;
  if (!accessToken || !refreshToken) {
    return false;
  }

  if (!force && session.expiresAt !== null && Date.now() < session.expiresAt - REFRESH_MARGIN_MS) {
    return true;
  }

  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = (async () => {
    try {
      const res = await fetch(`${config.vocechatHost}/api/token/renew`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': accessToken,
        },
        body: JSON.stringify({
          token: accessToken,
          refresh_token: refreshToken,
        }),
      });

      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          clearVoceChatSession();
        }
        return false;
      }

      const payload = (await res.json()) as TokenPayload;
      const currentUser = useAuthStore.getState().user;
      if (!currentUser?.uid || !currentUser?.name) {
        return false;
      }

      useAuthStore.getState().setAuth(createSession(currentUser, payload));
      return true;
    } catch {
      return false;
    }
  })();

  try {
    return await refreshPromise;
  } finally {
    refreshPromise = null;
  }
}
