import { appApi } from '@/services/appApi';
import { broadcastLogout } from '@/services/authTabs';
import { vocechatService } from '@/services/vocechat';
import { storeVoceChatSession } from '@/services/vocechatSession';
import { useAuthStore } from '@/store/authStore';
import type { User } from '@/types';

export interface SessionResponse {
  token: string;
  expiresAt: number;
  remember: boolean;
  user: User;
  /** VoceChat's chat is still in use (before the cutoff), so log into it too. */
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
  accountSource: 'vocechat-login' | 'vocechat-import' | 'invite' | 'reset' | null;
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

const REMEMBER_CHOICE_KEY = 'gnomguttan-remember-choice';

/** The "Husk meg" box starts the way it was left last time. */
export function lastRememberChoice(): boolean {
  try { return localStorage.getItem(REMEMBER_CHOICE_KEY) === '1'; } catch { return false; }
}

function applySession(session: SessionResponse) {
  try { localStorage.setItem(REMEMBER_CHOICE_KEY, session.remember ? '1' : '0'); } catch { /* private mode */ }
  useAuthStore.getState().setAuth(session);
  useAuthStore.getState().setVoceChat(null);
}

/** Best effort: until the cutoff the chat, gallery and archive still read VoceChat directly. */
async function connectVoceChat(email: string, password: string) {
  try {
    const res = await vocechatService.login({ email, password });
    storeVoceChatSession(res);
  } catch {
    // Their VoceChat password may differ (e.g. after a reset); those pages will say so.
  }
}

export async function login(email: string, password: string, remember: boolean) {
  const session = await appApi.post<SessionResponse>('/auth/login', { email, password, remember }, { skipAuth: true });
  applySession(session);
  if (session.vocechatLegacy) await connectVoceChat(email, password);
}

export function checkInvite(token: string) {
  return appApi.post<{ expiresAt: number; invitedBy: string }>('/auth/invite/check', { token }, { skipAuth: true });
}

export async function register(input: { token: string; name: string; email: string; password: string; remember: boolean }) {
  applySession(await appApi.post<SessionResponse>('/auth/register', input, { skipAuth: true }));
}

export function checkReset(token: string) {
  return appApi.post<{ expiresAt: number; name: string }>('/auth/reset/check', { token }, { skipAuth: true });
}

export async function resetPassword(input: { token: string; password: string; remember: boolean }) {
  const session = await appApi.post<SessionResponse>('/auth/reset', input, { skipAuth: true });
  applySession(session);
  if (session.vocechatLegacy) await connectVoceChat(session.user.email, input.password);
}

export async function logout() {
  await appApi.post('/auth/logout').catch(() => {});
  const vocechat = useAuthStore.getState().vocechat;
  if (vocechat) void vocechatService.logout(vocechat.token).catch(() => {});
  useAuthStore.getState().clearAuth();
  broadcastLogout();
}

export function changePassword(currentPassword: string, newPassword: string) {
  return appApi.post<{ signedOut: number; vocechatSynced: boolean }>('/auth/password', { currentPassword, newPassword });
}

export const listSessions = () => appApi.get<ActiveSession[]>('/auth/sessions');
export const revokeSession = (id: string) => appApi.delete(`/auth/sessions/${encodeURIComponent(id)}`);
export const revokeOtherSessions = () => appApi.post<{ signedOut: number }>('/auth/sessions/revoke-others');

export const listUsersForAdmin = () => appApi.get<AdminUser[]>('/auth/admin/users');
export const setAdminRole = (uid: number, isAdmin: boolean) => appApi.put(`/auth/admin/users/${uid}/admin`, { isAdmin });
export const createResetLink = (uid: number) => appApi.post<CreatedLink>(`/auth/admin/users/${uid}/reset-link`);
export const listInvites = () => appApi.get<PendingInvite[]>('/auth/admin/invites');
export const createInvite = (note: string) => appApi.post<CreatedLink>('/auth/admin/invites', { note });
export const deleteInvite = (id: string) => appApi.delete(`/auth/admin/invites/${encodeURIComponent(id)}`);

let takenToken: { path: string; token: string } | null = null;

/**
 * Reads the one-time token from the URL fragment and removes it from the address bar and
 * history. Safe to call twice (React StrictMode runs state initializers twice).
 */
export function takeTokenFromUrl(): string {
  const token = window.location.hash.replace(/^#/, '');
  if (token) {
    takenToken = { path: window.location.pathname, token };
    window.history.replaceState(null, '', window.location.pathname);
    return token;
  }
  return takenToken?.path === window.location.pathname ? takenToken.token : '';
}
