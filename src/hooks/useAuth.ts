import { useCallback } from 'react';
import { useAuthStore } from '@/store/authStore';
import { vocechatService } from '@/services/vocechat';
import type { LoginCredentials } from '@/types';

export function useAuth() {
  const { user, token, setAuth, clearAuth } = useAuthStore();

  const login = useCallback(
    async (credentials: LoginCredentials) => {
      const res = await vocechatService.login(credentials);
      setAuth(
        {
          uid: res.uid,
          name: res.name,
          email: res.email,
          avatarUpdatedAt: res.avatar_updated_at,
          isAdmin: res.is_admin,
        },
        res.token
      );
    },
    [setAuth]
  );

  const logout = useCallback(() => clearAuth(), [clearAuth]);

  return {
    user,
    token,
    isAuthenticated: !!token && !!user,
    login,
    logout,
  };
}
