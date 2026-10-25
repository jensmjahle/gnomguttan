import { useEffect, useRef } from 'react';
import { AppState, View } from 'react-native';
import { WebView } from 'react-native-webview';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { MATRIX_ENGINE_HTML } from '@/generated/matrixEngine';
import { useMatrixMobileStore } from '@/store/matrixMobileStore';
import { attachMatrixTransport, matrixCall, handleMatrixResponse, hydrateMatrixSession, clearMatrixSession } from '@/services/matrix';
import { getNotifications } from '@/services/notifications';
import { config } from '@/config';
import { useAuthStore } from '@/store/authStore';
import { appApi } from '@/services/appApi';

// Only the Matrix SDK and its WASM crypto run here. All visible screens are React Native.
export function MatrixRuntime() {
  const web = useRef<WebView>(null);
  const session = useMatrixMobileStore(s => s.session);
  const ready = useMatrixMobileStore(s => s.engineReady);
  const pushInFlight = useRef(false);
  const pushRegistered = useRef<string | null>(null);
  useEffect(() => { void hydrateMatrixSession(); return () => attachMatrixTransport(null); }, []);
  useEffect(() => {
    if (!ready || !session) return;
    let active = true;
    void matrixCall('start', session).catch(error => { if (active) useMatrixMobileStore.setState({ error: error.message }); });
    return () => { active = false; };
  }, [ready, session]);
  useEffect(() => {
    if (!ready) return;
    const visible = () => void matrixCall('visibility', { active: AppState.currentState === 'active' && useMatrixMobileStore.getState().chatVisible }).catch(() => undefined);
    const sub = AppState.addEventListener('change', visible);
    const unsub = useMatrixMobileStore.subscribe((next, previous) => { if (next.chatVisible !== previous.chatVisible) visible(); });
    visible();
    return () => { sub.remove(); unsub(); };
  }, [ready]);
  async function registerPush() {
    const notifications = getNotifications();
    if (!notifications) { useMatrixMobileStore.setState({ notificationError: 'Pushvarsler krever et eget appbygg. Chatten kan brukes i Expo Go.' }); return; }
    if (!session || !Device.isDevice || pushInFlight.current || pushRegistered.current === session.accessToken) return;
    pushInFlight.current = true;
    try {
      await notifications.setNotificationChannelAsync('messages', { name: 'Meldinger', importance: notifications.AndroidImportance.HIGH });
      const permission = await notifications.requestPermissionsAsync();
      if (permission.status !== 'granted') throw new Error('Varsler er slått av i telefonens innstillinger.');
      const projectId = Constants.easConfig?.projectId || Constants.expoConfig?.extra?.eas?.projectId;
      if (!projectId) throw new Error('Mangler Expo prosjekt-ID.');
      const token = (await notifications.getExpoPushTokenAsync({ projectId })).data;
      if (useMatrixMobileStore.getState().session !== session) return;
      if (useAuthStore.getState().token) void appApi.post('/notifications/push-token/unregister', { token }).catch(() => undefined);
      const response = await fetch(`${config.appApiHost}/matrix-mobile/register`, { method: 'POST', headers: {
        'Content-Type': 'application/json', Authorization: `Bearer ${session.accessToken}`,
      }, body: JSON.stringify({ token, baseUrl: session.baseUrl, deviceId: session.deviceId }) });
      if (!response.ok) throw new Error('Kunne ikke registrere Matrix-varsler.');
      const { pushkey, url } = await response.json();
      if (useMatrixMobileStore.getState().session !== session) return;
      await matrixCall('pusher', { app_id: 'no.gnomguttan.gnomchat', pushkey, kind: 'http', append: false,
        app_display_name: 'GnomChat', device_display_name: 'GnomChat mobil', lang: 'nb', data: { url, format: 'event_id_only' } });
      pushRegistered.current = session.accessToken;
      useMatrixMobileStore.setState({ notificationError: null });
    } catch (error) {
      if (useMatrixMobileStore.getState().session === session) useMatrixMobileStore.setState({ notificationError: error instanceof Error ? error.message : 'Varsling feilet.' });
    }
    finally { pushInFlight.current = false; }
  }
  return <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ position: 'absolute', width: 1, height: 1, opacity: 0 }}>
    <WebView ref={web} source={{ html: MATRIX_ENGINE_HTML, baseUrl: 'https://gnomguttan.no/' }}
      originWhitelist={['*']}
      javaScriptEnabled domStorageEnabled mixedContentMode="never" allowFileAccess={false}
      geolocationEnabled mediaCapturePermissionGrantType="prompt"
      onShouldStartLoadWithRequest={request => request.url === 'about:blank' || request.url === 'https://gnomguttan.no/'}
      onRenderProcessGone={() => { attachMatrixTransport(null); useMatrixMobileStore.setState({ engineReady: false }); web.current?.reload(); }}
      onContentProcessDidTerminate={() => { attachMatrixTransport(null); useMatrixMobileStore.setState({ engineReady: false }); web.current?.reload(); }}
      onError={() => useMatrixMobileStore.setState({ error: 'Kunne ikke starte Matrix. Lukk og åpne appen på nytt.' })}
      onMessage={event => {
        try {
          const data = JSON.parse(event.nativeEvent.data);
          if (data.type === 'ready') {
            attachMatrixTransport(value => web.current?.injectJavaScript(`window.__gnomMatrixCommand(${JSON.stringify(value)});true;`));
            useMatrixMobileStore.setState({ engineReady: true, error: null });
          }
          if (data.type === 'response') handleMatrixResponse(data);
          if (data.type === 'status') {
            useMatrixMobileStore.setState({ status: data.status });
            if (data.status === 'Tilkoblet') void registerPush();
          }
          if (data.type === 'snapshot') {
            if (data.userId !== useMatrixMobileStore.getState().session?.userId) return;
            const count = data.rooms.reduce((sum: number, room: { unread: number }) => sum + room.unread, 0);
            useMatrixMobileStore.setState(s => ({ rooms: data.rooms, unreadCount: count, typing: data.typing,
              ...(data.roomId ? { messages: { ...s.messages, [data.roomId]: data.messages } } : {}) }));
            void getNotifications()?.setBadgeCountAsync(count).catch(() => undefined);
          }
          if (data.type === 'expired') void clearMatrixSession().catch(() => undefined);
          if (data.type === 'verification') useMatrixMobileStore.setState({ verification: data.verification });
          if (data.type === 'crypto-progress') useMatrixMobileStore.setState({ recoveryStatus: data.status });
          if (data.type === 'voice-state') useMatrixMobileStore.setState({ voiceState: data.state, voiceDuration: data.duration });
          if (data.type === 'error') useMatrixMobileStore.setState({ error: data.error });
        } catch { /* Ignore malformed messages from the local protocol worker. */ }
      }} />
  </View>;
}
