import { appApi } from '@/services/appApi';
import { refreshAppUsers } from '@/hooks/useAppUsers';
import { useAuthStore } from '@/store/authStore';
import { useFeedStore } from '@/store/feedStore';
import { useFeedFilterStore, visibleTypesParam } from '@/store/feedFilterStore';
import { prepareImageForUpload } from '@/utils/imageResize';
import type { HideableField, ProfileFieldKey } from '@/constants/profileFields';
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
  /** Only on your own profile. */
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

export const getProfile = (uid: number) => appApi.get<Profile>(`/profiles/${uid}`);

/** Keeps the logged-in user and the shared directory (names, pictures, bios) in step. */
function afterOwnChange(patch: { name?: string; avatarUpdatedAt?: number; email?: string }) {
  const { user, setUser } = useAuthStore.getState();
  if (user) setUser({ ...user, ...patch });
  void refreshAppUsers(0);
}

export async function saveProfile(input: ProfileInput): Promise<Profile> {
  const profile = await appApi.put<Profile>('/profile', input);
  afterOwnChange({ name: profile.name });
  return profile;
}

export async function changeEmail(email: string, password: string): Promise<Profile> {
  const profile = await appApi.put<Profile>('/profile/email', { email, password });
  afterOwnChange({ email: profile.email });
  return profile;
}

export async function uploadAvatar(file: File): Promise<number> {
  const imageDataUrl = await prepareImageForUpload(file, 512, 0.86);
  const { avatarUpdatedAt } = await appApi.post<{ avatarUpdatedAt: number }>('/profile/avatar', { imageDataUrl });
  afterOwnChange({ avatarUpdatedAt });
  return avatarUpdatedAt;
}

export async function removeAvatar(): Promise<number> {
  const { avatarUpdatedAt } = await appApi.delete<{ avatarUpdatedAt: number }>('/profile/avatar');
  afterOwnChange({ avatarUpdatedAt });
  return avatarUpdatedAt;
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

export const getProfileEvents = (uid: number) =>
  appApi.get<{ upcoming: ProfileEvent[]; previous: ProfileEvent[] }>(`/profiles/${uid}/events`);

export const getQuotesAbout = (uid: number) => appApi.get<{ firstName: string; quotes: OverheardQuote[] }>(`/profiles/${uid}/quotes`);

/**
 * One page of someone's own posts, with the main feed's filter. The posts go into the
 * feed store as standalone items, so live comments and reactions reach them too.
 */
export async function loadProfileFeedPage(uid: number, before?: number): Promise<{ ids: string[]; hasMore: boolean; last?: number }> {
  const params = new URLSearchParams({ actor: String(uid), limit: '10', types: visibleTypesParam(useFeedFilterStore.getState().enabled) });
  if (before !== undefined) params.set('before', String(before));
  const page = await appApi.get<FeedPage>(`/feed?${params}`);
  const { setStandaloneItem } = useFeedStore.getState();
  page.items.forEach(setStandaloneItem);
  return { ids: page.items.map((item) => item.id), hasMore: page.hasMore, last: page.items[page.items.length - 1]?.createdAt };
}
