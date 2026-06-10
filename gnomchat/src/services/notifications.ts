import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';

// v1 push: local notifications driven by the SSE stream while the app runs.
// VoceChat has no Expo/FCM push sender, so true background push is a follow-up.

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

let permissionGranted = false;

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
  return permissionGranted;
}

export async function presentMessageNotification(title: string, body: string, data?: Record<string, unknown>) {
  if (!permissionGranted) return;
  await Notifications.scheduleNotificationAsync({
    content: { title, body, data },
    trigger: null, // present immediately
  });
}
