import { useCallback } from 'react';
import { useAuthStore } from '@/store/authStore';
import { vocechatService } from '@/services/vocechat';
import { syncCurrentAppUser } from '@/services/appApi';
import { storeVoceChatSession } from '@/services/vocechatSession';
import type { LoginCredentials } from '@/types';

export function useAuth() {
  const { user, token, clearAuth } = useAuthStore();

  const login = useCallback(
    async (credentials: LoginCredentials) => {
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
        }
      );
      const syncedUser = await syncCurrentAppUser();
      if (syncedUser) {
        storeVoceChatSession(syncedUser, {
          token: res.token,
          refresh_token: res.refresh_token,
          expired_in: res.expired_in,
        });
      }
    },
    []
  );

  const logout = useCallback(() => clearAuth(), [clearAuth]);

  return {
    user,
    token,
    isAuthenticated: !!token && !!user?.uid && !!user?.name,
    login,
    logout,
  };
}
