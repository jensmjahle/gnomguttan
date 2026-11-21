import { useQuery } from '@tanstack/react-query';
import { appApi } from '@/services/appApi';
import { qk } from '@/data/queryClient';
import type { CommunityEventPerson } from '@/types';

export async function loadAppUsers(): Promise<CommunityEventPerson[]> {
  const users = await appApi.get<CommunityEventPerson[]>('/users');
  return users
    .map((user) => ({ uid: Number(user.uid), name: String(user.name ?? '').trim(), avatarUpdatedAt: typeof user.avatarUpdatedAt === 'number' ? user.avatarUpdatedAt : undefined, bio: typeof user.bio === 'string' ? user.bio : '' }))
    .filter((user) => Number.isFinite(user.uid) && user.name.length > 0);
}

/** Everyone in the gang, cached for a while (used for mentions, names and avatars). */
export function useAppUsers() {
  return useQuery({ queryKey: qk.users, queryFn: loadAppUsers, staleTime: 10 * 60_000 });
}
