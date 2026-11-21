import { Platform } from 'react-native';
import * as Device from 'expo-device';
import { appApi } from '@/services/appApi';
import { useAuthStore } from '@/store/authStore';
import type { User } from '@/types';

export interface SessionResponse {
  token: string;
  expiresAt: number;
  remember: boolean;
  user: User;
  vocechatLegacy: boolean;
}

export interface ActiveSession {
  id: string;
  current: boolean;
  remember: boolean;
  createdAt: number;
  lastUsedAt: number;
  userAgent: string;
  ip: string;
}

export interface AdminUser extends User {
  lastSeenAt: number | null;
  hasAccount: boolean;
  accountSource: string | null;
  lastLoginAt: number | null;
}

export interface PendingInvite {
  id: string;
  note: string;
  createdBy: { uid: number; name: string };
  createdAt: number;
  expiresAt: number;
}

export interface CreatedLink {
  id: string;
  url: string;
  expiresAt: number;
}

/** Shown in "Aktive økter" on the website, so people can tell their phone apart. */
const deviceHeader = () => ({ 'User-Agent': `GnomChat/${Platform.OS} (${Device.modelName ?? Device.deviceName ?? 'mobil'})` });

function applySession(session: SessionResponse) {
  useAuthStore.getState().setAuth({ user: session.user, token: session.token, expiresAt: session.expiresAt });
}

/** The phone stays signed in ("Husk meg": 30 days after last use). */
export async function login(email: string, password: string) {
  applySession(await appApi.post<SessionResponse>('/auth/login', { email: email.trim(), password, remember: true }, { skipAuth: true, headers: deviceHeader() }));
}

export function checkInvite(token: string) {
  return appApi.post<{ expiresAt: number; invitedBy: string }>('/auth/invite/check', { token }, { skipAuth: true });
}

export async function register(input: { token: string; name: string; email: string; password: string }) {
  applySession(await appApi.post<SessionResponse>('/auth/register', { ...input, remember: true }, { skipAuth: true, headers: deviceHeader() }));
}

export function checkReset(token: string) {
  return appApi.post<{ expiresAt: number; name: string }>('/auth/reset/check', { token }, { skipAuth: true });
}

export async function resetPassword(input: { token: string; password: string }) {
  applySession(await appApi.post<SessionResponse>('/auth/reset', { ...input, remember: true }, { skipAuth: true, headers: deviceHeader() }));
}

export async function logout() {
  await appApi.post('/auth/logout').catch(() => {});
  useAuthStore.getState().clearAuth();
}

export function refreshMe() {
  return appApi.get<User>('/me').then((user) => { useAuthStore.getState().setUser(user); return user; });
}

export const changePassword = (currentPassword: string, newPassword: string) =>
  appApi.post<{ signedOut: number; vocechatSynced: boolean }>('/auth/password', { currentPassword, newPassword });
export const listSessions = () => appApi.get<ActiveSession[]>('/auth/sessions');
export const revokeSession = (id: string) => appApi.delete(`/auth/sessions/${encodeURIComponent(id)}`);
export const revokeOtherSessions = () => appApi.post<{ signedOut: number }>('/auth/sessions/revoke-others');
export const listUsersForAdmin = () => appApi.get<AdminUser[]>('/auth/admin/users');
export const setAdminRole = (uid: number, isAdmin: boolean) => appApi.put(`/auth/admin/users/${uid}/admin`, { isAdmin });
export const createResetLink = (uid: number) => appApi.post<CreatedLink>(`/auth/admin/users/${uid}/reset-link`);
export const listInvites = () => appApi.get<PendingInvite[]>('/auth/admin/invites');
export const createInvite = (note: string) => appApi.post<CreatedLink>('/auth/admin/invites', { note });
export const deleteInvite = (id: string) => appApi.delete(`/auth/admin/invites/${encodeURIComponent(id)}`);

/** Reads the one-time token from an invite or reset link (…/registrer#token). */
export function tokenFromLink(link: string): string {
  const trimmed = link.trim();
  const hash = trimmed.indexOf('#');
  return hash >= 0 ? trimmed.slice(hash + 1) : trimmed;
}
