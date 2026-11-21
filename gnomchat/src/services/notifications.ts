import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { appApi } from '@/services/appApi';
import { navigateWhenReady, navigationRef, openAppLink } from '@/navigation/navigationRef';
import { markNotificationReadLocally } from '@/data/feedCache';
import type { AppNotification, NotificationPage, NotificationSettings } from '@/types';

// Push comes from two places, both through Expo:
//  · the Gnomguttan server, for app notifications (mentions, replies, reactions, new events)
//  · the Matrix homeserver, via the push gateway on the Gnomguttan server, for chat messages
// The Expo token is registered with /app-api; the Matrix pusher is set up by the chat
// (src/matrix/push.ts) once it's signed in.

type PushRegistration = { ok: boolean; matrixPushGatewayUrl?: string };

/** What the user is looking at right now, so we don't buzz for it. */
let activeChatRoomId: string | null = null;
export function setActiveChatRoom(roomId: string | null) { activeChatRoomId = roomId; }

Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const data = notification.request.content.data as { type?: string; roomId?: string } | undefined;
    const show = !(data?.type === 'matrix' && data.roomId && data.roomId === activeChatRoomId);
    return { shouldShowBanner: show, shouldShowList: show, shouldPlaySound: show, shouldSetBadge: true };
  },
});

let expoPushToken: string | null = null;
let gatewayUrl = '';
const tokenListeners = new Set<(registration: { token: string; gatewayUrl: string }) => void>();

/** Called when a push token is registered (also immediately if one already is). */
export function onPushRegistered(listener: (registration: { token: string; gatewayUrl: string }) => void) {
  tokenListeners.add(listener);
  if (expoPushToken && gatewayUrl) listener({ token: expoPushToken, gatewayUrl });
  return () => { tokenListeners.delete(listener); };
}

export function currentPushToken() { return expoPushToken; }

async function ensureChannels() {
  if (Platform.OS !== 'android') return;
  await Promise.all([
    Notifications.setNotificationChannelAsync('messages', {
      name: 'Chatmeldinger',
      description: 'Nye meldinger i chatten',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
    }),
    Notifications.setNotificationChannelAsync('activity', {
      name: 'Varsler fra Gnomguttan',
      description: 'Nevnt, svar, kommentarer, reaksjoner og nye arrangementer',
      importance: Notifications.AndroidImportance.HIGH,
    }),
  ]);
}

export type PushStatus = { state: 'ok' | 'denied' | 'unavailable' | 'error'; detail?: string };
let lastStatus: PushStatus = { state: 'unavailable', detail: 'Ikke registrert ennå.' };
export const pushStatus = () => lastStatus;

function projectId(): string | undefined {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
  return Constants.easConfig?.projectId ?? extra?.eas?.projectId;
}

/** Asks for permission (once), gets the Expo push token and registers it with the server. */
export async function registerForPush(): Promise<PushStatus> {
  await ensureChannels();
  if (!Device.isDevice) return (lastStatus = { state: 'unavailable', detail: 'Push fungerer bare på en ekte telefon.' });

  let { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') status = (await Notifications.requestPermissionsAsync()).status;
  if (status !== 'granted') return (lastStatus = { state: 'denied', detail: 'Varsler er slått av for GnomChat i telefonens innstillinger.' });

  const id = projectId();
  if (!id) return (lastStatus = { state: 'error', detail: 'Appen mangler Expo-prosjekt-ID.' });

  try {
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId: id });
    const response = await appApi.post<PushRegistration>('/notifications/push-token', {
      token,
      platform: Platform.OS,
      deviceName: Device.deviceName ?? Device.modelName ?? undefined,
      appVersion: Constants.expoConfig?.version,
    });
    expoPushToken = token;
    gatewayUrl = response.matrixPushGatewayUrl ?? '';
    tokenListeners.forEach((listener) => listener({ token, gatewayUrl }));
    return (lastStatus = { state: 'ok' });
  } catch (error) {
    // Most often: the Android build has no Firebase config (google-services.json); see SETUP.md.
    const message = error instanceof Error ? error.message : String(error);
    console.warn('[Push] Registration failed', message);
    return (lastStatus = { state: 'error', detail: message });
  }
}

export async function unregisterPush() {
  const token = expoPushToken;
  expoPushToken = null;
  if (token) await appApi.post('/notifications/push-token/unregister', { token }).catch(() => {});
}

export async function clearDelivered() {
  await Promise.all([
    Notifications.dismissAllNotificationsAsync().catch(() => {}),
    Notifications.setBadgeCountAsync(0).catch(() => {}),
  ]);
}

/** Opens the right screen when a push is tapped (also when it launched the app). */
export function listenForPushTaps(): () => void {
  const open = (response: Notifications.NotificationResponse | null) => {
    if (!response) return;
    const data = response.notification.request.content.data as { type?: string; roomId?: string; link?: string; notificationId?: string } | undefined;
    if (data?.type === 'matrix' && data.roomId) {
      const roomId = data.roomId;
      navigateWhenReady(() => navigationRef.navigate('ChatRoom', { roomId }));
    } else if (data?.type === 'notification') {
      if (data.notificationId) void markNotificationRead(data.notificationId).catch(() => {});
      if (!data.link || !openAppLink(data.link)) navigateWhenReady(() => navigationRef.navigate('Notifications'));
    } else if (data?.type === 'chat') {
      navigateWhenReady(() => navigationRef.navigate('Tabs', { screen: 'ChatTab' }));
    }
  };
  void Notifications.getLastNotificationResponseAsync().then(open);
  const subscription = Notifications.addNotificationResponseReceivedListener(open);
  return () => subscription.remove();
}

// ── App notifications (the bell) ─────────────────────────────────────────────

export function loadNotifications(before?: number) {
  const params = new URLSearchParams({ limit: '30' });
  if (before !== undefined) params.set('before', String(before));
  return appApi.get<NotificationPage>(`/notifications?${params}`);
}

export async function markNotificationRead(id: string) {
  markNotificationReadLocally(id);
  await appApi.post(`/notifications/${encodeURIComponent(id)}/read`);
}

export const markAllNotificationsRead = () => appApi.post('/notifications/read-all');
export const loadNotificationSettings = () => appApi.get<NotificationSettings>('/notifications/settings');
export const saveNotificationSettings = (patch: Partial<NotificationSettings>) => appApi.put<NotificationSettings>('/notifications/settings', patch);

export function openNotification(notification: AppNotification) {
  if (notification.readAt === null) void markNotificationRead(notification.id).catch(() => {});
  if (!openAppLink(notification.link)) navigateWhenReady(() => navigationRef.navigate('Notifications'));
}
