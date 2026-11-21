import { useCallback } from 'react';
import { useAuthStore } from '@/store/authStore';
import * as authService from '@/services/auth';

export function useAuth() {
  const { user, token } = useAuthStore();

  const login = useCallback(
    (email: string, password: string, remember: boolean) => authService.login(email, password, remember),
    []
  );
  const logout = useCallback(() => authService.logout(), []);

  return {
    user,
    token,
    isAuthenticated: !!token && !!user?.uid && !!user?.name,
    login,
    logout,
  };
}
