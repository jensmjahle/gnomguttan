import { useCallback } from 'react';
import { useAuthStore } from '@/store/authStore';
import { vocechatService } from '@/services/vocechat';
import { syncCurrentAppUser } from '@/services/appApi';
import type { LoginCredentials } from '@/types';

export function useAuth() {
  const { user, token, setAuth, clearAuth } = useAuthStore();

  const login = useCallback(
    async (credentials: LoginCredentials) => {
      const res = await vocechatService.login(credentials);
      setAuth(
        {
          uid: res.user.uid,
          name: res.user.name,
          email: res.user.email ?? '',
          avatarUpdatedAt: res.user.avatar_updated_at,
          isAdmin: res.user.is_admin,
        },
        res.token
      );
      const syncedUser = await syncCurrentAppUser();
      if (syncedUser) {
        setAuth(syncedUser, res.token);
      }
    },
    [setAuth]
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
