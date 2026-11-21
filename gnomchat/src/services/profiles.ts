import { appApi } from '@/services/appApi';
import { queryClient, qk } from '@/data/queryClient';
import { useAuthStore } from '@/store/authStore';
import type { HideableField, ProfileFieldKey } from '@/utils/profileFields.generated';
import type { FeedPage, OverheardQuote } from '@/types';

export interface Profile {
  uid: number;
  name: string;
  avatarUpdatedAt: number;
  hasAvatar: boolean;
  isAdmin: boolean;
  bio: string;
  fullName?: string;
  email?: string;
  lastSeenAt?: number;
  fields: Partial<Record<ProfileFieldKey, string>>;
  isSelf?: boolean;
  hiddenFields?: HideableField[];
}

export interface ProfileInput {
  name?: string;
  fullName?: string;
  bio?: string;
  fields?: Partial<Record<ProfileFieldKey, string>>;
  hiddenFields?: HideableField[];
}

export interface ProfileEvent {
  id: string;
  title: string;
  startsAt: string | null;
  endsAt: string | null;
  location: string;
  timeMode: 'fixed' | 'proposed';
  organizer: boolean;
  coming: number;
}

export const getProfile = (uid: number) => appApi.get<Profile>(`/profiles/${uid}`);
export const getProfileEvents = (uid: number) => appApi.get<{ upcoming: ProfileEvent[]; previous: ProfileEvent[] }>(`/profiles/${uid}/events`);
export const getQuotesAbout = (uid: number) => appApi.get<{ firstName: string; quotes: OverheardQuote[] }>(`/profiles/${uid}/quotes`);

export function loadProfileFeed(uid: number, types: string, before?: number) {
  const params = new URLSearchParams({ actor: String(uid), limit: '10', types });
  if (before !== undefined) params.set('before', String(before));
  return appApi.get<FeedPage>(`/feed?${params}`);
}

function afterOwnChange(patch: { name?: string; avatarUpdatedAt?: number; email?: string }) {
  const { user, setUser } = useAuthStore.getState();
  if (user) setUser({ ...user, ...patch });
  void queryClient.invalidateQueries({ queryKey: qk.users });
  if (user) void queryClient.invalidateQueries({ queryKey: qk.profile(user.uid) });
}

export async function saveProfile(input: ProfileInput) {
  const profile = await appApi.put<Profile>('/profile', input);
  afterOwnChange({ name: profile.name });
  return profile;
}

export async function changeEmail(email: string, password: string) {
  const profile = await appApi.put<Profile>('/profile/email', { email, password });
  afterOwnChange({ email: profile.email });
  return profile;
}

export async function uploadAvatar(imageDataUrl: string) {
  const { avatarUpdatedAt } = await appApi.post<{ avatarUpdatedAt: number }>('/profile/avatar', { imageDataUrl });
  afterOwnChange({ avatarUpdatedAt });
  return avatarUpdatedAt;
}

export async function removeAvatar() {
  const { avatarUpdatedAt } = await appApi.delete<{ avatarUpdatedAt: number }>('/profile/avatar');
  afterOwnChange({ avatarUpdatedAt });
  return avatarUpdatedAt;
}
