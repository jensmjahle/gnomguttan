import { appApi } from '@/services/appApi';
import type { CommunityEventPerson } from '@/types';

export async function loadAppUsers(): Promise<CommunityEventPerson[]> {
  const users = await appApi.get<CommunityEventPerson[]>('/users');
  return users
    .map((user) => ({
      uid: Number(user.uid),
      name: String(user.name ?? '').trim(),
      avatarUpdatedAt: typeof user.avatarUpdatedAt === 'number' ? user.avatarUpdatedAt : undefined,
    }))
    .filter((user) => Number.isFinite(user.uid) && user.name.length > 0);
}
