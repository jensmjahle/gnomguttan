import { config } from '@/config';
import { useAuthStore } from '@/store/authStore';
import type { LoginResponse } from '@/types';

// VoceChat's own short-lived tokens, used only by the pages that still read VoceChat
// (chat, gallery, archive) until the cutoff. Losing them never logs anyone out of the app.

const REFRESH_MARGIN_MS = 20_000;

type TokenPayload = Pick<LoginResponse, 'token' | 'refresh_token' | 'expired_in'>;

let refreshPromise: Promise<boolean> | null = null;

export function storeVoceChatSession(payload: TokenPayload) {
  useAuthStore.getState().setVoceChat({
    token: payload.token,
    refreshToken: payload.refresh_token,
    expiresAt: Date.now() + Math.max(0, payload.expired_in) * 1000,
  });
}

export function clearVoceChatSession() {
  useAuthStore.getState().setVoceChat(null);
}

export function hasVoceChatSession() {
  return Boolean(useAuthStore.getState().vocechat?.token);
}

export async function ensureFreshVoceChatToken(force = false): Promise<string | null> {
  const session = useAuthStore.getState().vocechat;
  if (!session) return null;
  if (!force && Date.now() < session.expiresAt - REFRESH_MARGIN_MS) return session.token;
  await refreshVoceChatToken(true);
  return useAuthStore.getState().vocechat?.token ?? null;
}

export async function refreshVoceChatToken(force = false): Promise<boolean> {
  const session = useAuthStore.getState().vocechat;
  if (!session) return false;
  if (!force && Date.now() < session.expiresAt - REFRESH_MARGIN_MS) return true;
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    try {
      const res = await fetch(`${config.vocechatHost}/api/token/renew`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': session.token },
        body: JSON.stringify({ token: session.token, refresh_token: session.refreshToken }),
      });
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) clearVoceChatSession();
        return false;
      }
      storeVoceChatSession((await res.json()) as TokenPayload);
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
