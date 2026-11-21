import { useAuthStore } from '@/store/authStore';

/**
 * A profile picture, served by our own server. `v` changes with every new picture, so
 * browsers can cache each version for good. An Ølbørs kiosk (no login) passes its key.
 * People without a picture get a 404, and <Avatar> shows their initials instead.
 */
export function avatarUrl(uid: number, avatarUpdatedAt?: number, kiosk?: { eventId: string; key: string }): string {
  const params = new URLSearchParams({ v: String(avatarUpdatedAt ?? 0) });
  if (kiosk) {
    params.set('kiosk', kiosk.eventId);
    params.set('key', kiosk.key);
  } else {
    const token = useAuthStore.getState().token;
    if (token) params.set('token', token);
  }
  return `/app-api/avatars/${uid}?${params.toString()}`;
}
