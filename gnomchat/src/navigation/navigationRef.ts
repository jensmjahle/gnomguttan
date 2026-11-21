import { createNavigationContainerRef } from '@react-navigation/native';
import type { RootStackParamList } from '@/navigation/types';

export const navigationRef = createNavigationContainerRef<RootStackParamList>();

let pending: (() => void) | null = null;

/** Navigate now, or as soon as the navigator is mounted (e.g. when a push opens the app). */
export function navigateWhenReady(go: () => void) {
  if (navigationRef.isReady()) go();
  else pending = go;
}

export function flushPendingNavigation() {
  const go = pending;
  pending = null;
  go?.();
}

/**
 * Opens an in-app path from the website (notification links, mentions, …) on the
 * matching native screen. Returns false when there is no native screen for it.
 */
export function openAppLink(link: string): boolean {
  const path = link.replace(/^https?:\/\/[^/]+/, '');
  const [pathname, hash = ''] = path.split('#');
  const commentId = hash.startsWith('c-') ? hash.slice(2) : undefined;
  const parts = pathname.split('/').filter(Boolean).map(decodeURIComponent);
  const go = (fn: () => void) => { navigateWhenReady(fn); return true; };

  if (parts[0] === 'innlegg' && parts[1]) return go(() => navigationRef.navigate('FeedPost', { feedItemId: parts[1], commentId }));
  if (parts[0] === 'arrangementer' && parts[1] && parts[1] !== 'ny') return go(() => navigationRef.navigate('EventDetail', { eventId: parts[1], commentId }));
  if (parts[0] === 'profil') return go(() => navigationRef.navigate('Profile', { uid: parts[1] ? Number(parts[1]) : undefined }));
  if (parts[0] === 'galleri' && parts[1] === 'album' && parts[2]) return go(() => navigationRef.navigate('Album', { albumId: parts[2] }));
  if (parts[0] === 'olbors' && parts[1]) return go(() => navigationRef.navigate('Olbors', { eventId: parts[1] }));
  const simple: Record<string, keyof RootStackParamList> = {
    kino: 'Kino', valheim: 'Valheim', olbors: 'Olbors', spin: 'Spin', lampa: 'Lampa', turnering: 'Tournament',
    'kast-grisene': 'Pigs', krokodil: 'Krokodil', sitater: 'Quotes', dev: 'Dev', archive: 'Archive', buss: 'Buss',
  };
  const screen = simple[parts[0] ?? ''];
  if (screen) return go(() => (navigationRef.navigate as (name: string, params?: object) => void)(screen, {}));
  if (parts.length === 0) return go(() => navigationRef.navigate('Tabs', { screen: 'HomeTab' }));
  return false;
}
