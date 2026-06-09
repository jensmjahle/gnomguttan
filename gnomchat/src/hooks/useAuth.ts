import { useCallback } from 'react';
import { useAuthStore } from '@/store/authStore';
import { useChatStore } from '@/store/chatStore';
import { vocechatService } from '@/services/vocechat';
import { storeVoceChatSession, clearVoceChatSession } from '@/services/session';
import type { LoginCredentials } from '@/types';

export function useAuth() {
  const user = useAuthStore((s) => s.user);
  const token = useAuthStore((s) => s.token);
  const hydrated = useAuthStore((s) => s.hydrated);

  const login = useCallback(async (credentials: LoginCredentials) => {
    const res = await vocechatService.login(credentials);
    storeVoceChatSession(
      {
        uid: res.user.uid,
        name: res.user.name,
        email: res.user.email ?? '',
        avatarUpdatedAt: res.user.avatar_updated_at,
        isAdmin: res.user.is_admin,
      },
      {
        token: res.token,
        refresh_token: res.refresh_token,
        expired_in: res.expired_in,
      },
    );
  }, []);

  const logout = useCallback(() => {
    clearVoceChatSession();
    useChatStore.getState().reset();
  }, []);

  return {
    user,
    token,
    hydrated,
    isAuthenticated: !!token && !!user?.uid && !!user?.name,
    login,
    logout,
  };
}
