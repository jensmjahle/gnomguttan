import { isRunningInExpoGo } from 'expo';

type Notifications = typeof import('expo-notifications');
let notifications: Notifications | null | undefined;

/** Do not evaluate expo-notifications in Expo Go: its Android topic module is absent. */
export function getNotifications(): Notifications | null {
  if (notifications !== undefined) return notifications;
  if (isRunningInExpoGo()) return (notifications = null);
  try {
    notifications = require('expo-notifications') as Notifications;
  } catch (error) {
    // An older development build may also lack a newly added native module.
    // Keep the rest of the app available until that build can be replaced.
    console.warn('Varsler er utilgjengelige. Bygg appen på nytt for å aktivere dem.', error);
    notifications = null;
  }
  return notifications;
}
