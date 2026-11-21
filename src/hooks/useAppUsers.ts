import { useEffect } from 'react';
import { create } from 'zustand';
import { loadAppUsers } from '@/services/users';
import type { CommunityEventPerson } from '@/types';

const MAX_AGE_MS = 5 * 60_000;

interface UserDirectory {
  users: CommunityEventPerson[];
  usersByUid: Map<number, CommunityEventPerson>;
  loadedAt: number;
}

// Shared by every comment and mention box on the page.
const useDirectory = create<UserDirectory>(() => ({ users: [], usersByUid: new Map(), loadedAt: 0 }));
let pending: Promise<void> | null = null;

/** Reload the user list if it is older than `maxAgeMs` (so people who just joined can be @mentioned). */
export function refreshAppUsers(maxAgeMs = MAX_AGE_MS): Promise<void> {
  if (pending) return pending;
  if (Date.now() - useDirectory.getState().loadedAt < maxAgeMs) return Promise.resolve();
  pending = loadAppUsers()
    .then((users) => {
      useDirectory.setState({ users, usersByUid: new Map(users.map((user) => [user.uid, user] as const)), loadedAt: Date.now() });
    })
    .catch(() => {})
    .finally(() => { pending = null; });
  return pending;
}

/** All app users, for @mention suggestions and up-to-date names and avatars. */
export function useAppUsers(): Pick<UserDirectory, 'users' | 'usersByUid'> {
  const users = useDirectory((state) => state.users);
  const usersByUid = useDirectory((state) => state.usersByUid);

  useEffect(() => { void refreshAppUsers(); }, []);

  return { users, usersByUid };
}
