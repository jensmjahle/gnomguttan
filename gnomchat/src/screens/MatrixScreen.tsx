import { useEffect, useRef, useState } from 'react';
import { AppState, BackHandler, Linking, Pressable, Text, View } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { WebView } from 'react-native-webview';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { config } from '@/config';
import { useMatrixMobileStore } from '@/store/matrixMobileStore';
import { useAuthStore } from '@/store/authStore';
import { appApi } from '@/services/appApi';

const url = `${config.appApiHost}/mobile-chat`;
export function MatrixScreen() {
  const web = useRef<WebView>(null);
  const focused = useIsFocused();
  const [failure, setFailure] = useState(false);
  const token = useRef<string | undefined>(undefined);
  const pendingRoom = useMatrixMobileStore(s => s.pendingRoom);
  const authenticated = useMatrixMobileStore(s => s.authenticated);
  const send = (value: unknown) => web.current?.injectJavaScript(`window.dispatchEvent(new CustomEvent('gnomchat-native',{detail:${JSON.stringify(value)}}));true;`);
  const visible = () => send({ type: 'visibility', active: focused && AppState.currentState === 'active' });
  const register = async () => {
    if (!Device.isDevice) return;
    try {
      await Notifications.setNotificationChannelAsync('messages', { name: 'Meldinger', importance: Notifications.AndroidImportance.HIGH });
      const permission = await Notifications.requestPermissionsAsync();
      if (permission.status !== 'granted') {
        useMatrixMobileStore.setState({ notificationError: 'Varsler er slått av. Du kan aktivere dem i telefonens appinnstillinger.' }); return;
      }
      const projectId = Constants.easConfig?.projectId || Constants.expoConfig?.extra?.eas?.projectId;
      if (!projectId) throw new Error('Mangler Expo prosjekt-ID');
      token.current = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
      // An upgraded installation may still have a VoceChat push subscription.
      if (useAuthStore.getState().token) await appApi.post('/notifications/push-token/unregister', { token: token.current }).catch(() => undefined);
      send({ type: 'push-token', token: token.current });
    } catch { useMatrixMobileStore.setState({ notificationError: 'Kunne ikke aktivere varsler. Åpne chatten igjen for å prøve på nytt.' }); }
  };
  useEffect(() => {
    visible();
    if (focused && authenticated) void register();
    const sub = AppState.addEventListener('change', visible);
    const back = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!focused || !useMatrixMobileStore.getState().activeRoom) return false;
      send({ type: 'back' }); return true;
    });
    return () => { sub.remove(); back.remove(); };
  }, [focused, authenticated]);
  useEffect(() => {
    if (pendingRoom && focused) send({ type: 'open-room', roomId: pendingRoom });
  }, [pendingRoom, focused]);
  return <View style={{ flex: 1 }}>
    {failure && <Pressable onPress={() => { setFailure(false); web.current?.reload(); }}><Text>Kunne ikke laste chatten. Trykk for å prøve igjen.</Text></Pressable>}
    <WebView ref={web} source={{ uri: url }} style={{ flex: 1 }} javaScriptEnabled domStorageEnabled startInLoadingState
      originWhitelist={['*']} mixedContentMode="never" allowFileAccess={false}
      allowsInlineMediaPlayback mediaPlaybackRequiresUserAction={false} setSupportMultipleWindows={false}
      onError={() => setFailure(true)} onHttpError={() => setFailure(true)}
      onContentProcessDidTerminate={() => web.current?.reload()}
      onShouldStartLoadWithRequest={request => {
        if (request.url === 'about:blank' || request.url.startsWith('blob:')) return true;
        if (request.url.split('?')[0] === url) return true;
        if (/^https?:/.test(request.url)) void Linking.openURL(request.url);
        return false;
      }}
      onMessage={event => {
        if (event.nativeEvent.url.split('?')[0] !== url) return;
        try {
          const data = JSON.parse(event.nativeEvent.data);
          if (data.type === 'matrix-session') useMatrixMobileStore.setState({ authenticated: data.authenticated === true, userId: data.userId || null });
          if (data.type === 'bridge-ready') {
            visible();
            if (pendingRoom) send({ type: 'open-room', roomId: pendingRoom });
            if (useMatrixMobileStore.getState().authenticated) void register();
          }
          if (data.type === 'push-ready') useMatrixMobileStore.setState({ notificationError: null });
          if (data.type === 'unread' && Number.isFinite(data.count)) {
            const count = Math.max(0, Math.floor(data.count)); useMatrixMobileStore.setState({ unreadCount: count });
            void Notifications.setBadgeCountAsync(count).catch(() => undefined);
          }
          if (data.type === 'active-room') {
            useMatrixMobileStore.setState({ activeRoom: data.roomId || null });
            if (data.roomId) void Notifications.getPresentedNotificationsAsync().then(items => Promise.all(items.filter(item => item.request.content.data?.roomId === data.roomId).map(item => Notifications.dismissNotificationAsync(item.request.identifier))));
          }
          if (data.type === 'room-opened') useMatrixMobileStore.setState({ pendingRoom: null });
        } catch { /* Ignore malformed messages from the page. */ }
      }} />
  </View>;
}
