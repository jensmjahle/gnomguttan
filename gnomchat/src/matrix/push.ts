import * as Device from 'expo-device';
import { config } from '@/config';
import { call, onEngineEvent } from '@/matrix/engine';
import { useMatrixSession } from '@/matrix/store';
import { onPushRegistered, currentPushToken } from '@/services/notifications';

// Registers this phone's Expo push token as a Matrix pusher, pointing at the
// Gnomguttan push gateway, whenever both the Matrix session and the token exist.
// The homeserver then pushes new chat messages, even when the app is closed.

let registeredFor = '';

async function sync(token: string, gatewayUrl: string) {
  const session = useMatrixSession.getState().session;
  if (!session || !token || !gatewayUrl) return;
  const key = `${session.userId}|${session.deviceId}|${token}|${gatewayUrl}`;
  if (registeredFor === key) return;
  try {
    await call('setPusher', { pushkey: token, gatewayUrl, appId: config.matrixPushAppId, deviceName: Device.deviceName ?? Device.modelName ?? 'GnomChat' });
    registeredFor = key;
  } catch (error) {
    console.warn('[MatrixPush] Could not register pusher', error);
  }
}

export function startMatrixPush(): () => void {
  let latest: { token: string; gatewayUrl: string } | null = null;
  const offToken = onPushRegistered((registration) => { latest = registration; void sync(registration.token, registration.gatewayUrl); });
  const offEngine = onEngineEvent((event) => {
    if (event.event === 'status' && event.status === 'online' && latest) void sync(latest.token, latest.gatewayUrl);
  });
  return () => { offToken(); offEngine(); };
}

/** Before signing out of Matrix: stop pushes to this phone for that account. */
export async function removeMatrixPusher() {
  const token = currentPushToken();
  registeredFor = '';
  if (token) await call('removePusher', { pushkey: token, appId: config.matrixPushAppId }).catch(() => undefined);
}
