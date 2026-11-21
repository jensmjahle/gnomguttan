import { AppState, Platform, type AppStateStatus } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { QueryClient, focusManager, onlineManager } from '@tanstack/react-query';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { AppApiError } from '@/services/appApi';

// Everything the app loads from /app-api goes through this client. Results are
// kept on the device (AsyncStorage), so screens show the last known data
// instantly and offline, and refresh in the background when there's a network.

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 7 * 24 * 60 * 60 * 1000,
      networkMode: 'offlineFirst',
      retry: (count, error) => !(error instanceof AppApiError && error.status >= 400 && error.status < 500) && count < 2,
    },
    mutations: { networkMode: 'online' },
  },
});

export const queryPersister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: 'gnomchat-query-cache-v1',
  throttleTime: 2000,
});

/** Bump to drop every cached result after an incompatible change. */
export const CACHE_BUSTER = '2';

// Refetch when the app comes back to the foreground, and know when we're offline.
onlineManager.setEventListener((setOnline) => NetInfo.addEventListener((state) => setOnline(Boolean(state.isConnected))));
function onAppStateChange(status: AppStateStatus) {
  if (Platform.OS !== 'web') focusManager.setFocused(status === 'active');
}
AppState.addEventListener('change', onAppStateChange);

/** Query keys in one place, so SSE updates and mutations hit the right cache entries. */
export const qk = {
  me: ['me'] as const,
  users: ['users'] as const,
  feed: (types: string) => ['feed', types] as const,
  feedAll: ['feed'] as const,
  feedItem: (id: string) => ['feedItem', id] as const,
  notifications: ['notifications'] as const,
  notificationSettings: ['notificationSettings'] as const,
  events: ['communityEvents'] as const,
  event: (id: string) => ['communityEvent', id] as const,
  profile: (uid: number) => ['profile', uid] as const,
  profileQuotes: (uid: number) => ['profileQuotes', uid] as const,
  profileEvents: (uid: number) => ['profileEvents', uid] as const,
  overheard: ['overheard'] as const,
  albums: ['albums'] as const,
  album: (id: string) => ['album', id] as const,
  albumMedia: ['albumMedia'] as const,
  obligations: ['photoObligations'] as const,
  archive: (groupId: string, kind: string) => ['archive', groupId, kind] as const,
  archiveGroups: ['archiveGroups'] as const,
  lamp: ['lamp'] as const,
  valheim: ['valheim'] as const,
  kino: (section: string) => ['kino', section] as const,
  olborsEvents: ['olbors'] as const,
  olborsEvent: (id: string) => ['olbors', id] as const,
  dev: ['dev'] as const,
  sessions: ['sessions'] as const,
  adminUsers: ['adminUsers'] as const,
  invites: ['invites'] as const,
};
