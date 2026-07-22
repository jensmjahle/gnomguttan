import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { appApi } from '@/services/appApi';
import { useChatStore } from '@/store/chatStore';

type PushRegistrationResponse = {
  ok: boolean;
  chatPushEnabled?: boolean;
};

Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const thread = notification.request.content.data?.thread;
    const activeThread = useChatStore.getState().activeThread;
    const shouldShow = typeof thread !== 'string' || activeThread !== thread;

    return {
      shouldShowBanner: shouldShow,
      shouldShowList: shouldShow,
      shouldPlaySound: shouldShow,
      shouldSetBadge: false,
    };
  },
});

let permissionGranted = false;
let registeredExpoPushToken: string | null = null;
let remoteChatPushEnabled = false;

export async function registerForNotifications(): Promise<boolean> {
  if (!Device.isDevice) return false;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('messages', {
      name: 'Messages',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
    });
  }

  const existing = await Notifications.getPermissionsAsync();
  let status = existing.status;
  if (status !== 'granted') {
    const requested = await Notifications.requestPermissionsAsync();
    status = requested.status;
  }
  permissionGranted = status === 'granted';
  if (!permissionGranted) {
    remoteChatPushEnabled = false;
    return false;
  }

  await clearDeliveredNotifications();

  const projectId = resolveExpoProjectId();
  if (!projectId) {
    console.warn('[Notifications] Missing Expo projectId; remote push registration skipped.');
    remoteChatPushEnabled = false;
    return true;
  }

  try {
    const expoToken = await Notifications.getExpoPushTokenAsync({ projectId });
    registeredExpoPushToken = expoToken.data;
    const response = await appApi.post<PushRegistrationResponse>('/notifications/push-token', {
      token: expoToken.data,
      platform: Platform.OS,
      deviceName: Device.deviceName ?? undefined,
    });
    remoteChatPushEnabled = response.chatPushEnabled === true;
  } catch (error) {
    console.warn('[Notifications] Failed to register Expo push token.', error);
    remoteChatPushEnabled = false;
  }

  return true;
}

export async function unregisterForNotifications(): Promise<void> {
  remoteChatPushEnabled = false;
  const token = registeredExpoPushToken;
  registeredExpoPushToken = null;
  if (!token) return;

  try {
    await appApi.post('/notifications/push-token/unregister', { token });
  } catch (error) {
    console.warn('[Notifications] Failed to unregister Expo push token.', error);
  }
}

export async function clearDeliveredNotifications(): Promise<void> {
  await Promise.all([
    Notifications.dismissAllNotificationsAsync().catch(() => {}),
    Notifications.setBadgeCountAsync(0).catch(() => {}),
  ]);
}

export async function presentMessageNotification(title: string, body: string, data?: Record<string, unknown>) {
  if (!permissionGranted || remoteChatPushEnabled) return;
  await Notifications.scheduleNotificationAsync({
    content: { title, body, data },
    trigger: null, // present immediately
  });
}

function resolveExpoProjectId(): string | undefined {
  const expoExtra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
  return Constants.easConfig?.projectId ?? expoExtra?.eas?.projectId;
}
