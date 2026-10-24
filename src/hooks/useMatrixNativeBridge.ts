import { useEffect, useRef } from 'react';
import { ClientEvent, RoomEvent, type MatrixClient } from 'matrix-js-sdk';

type Session = { accessToken: string; userId: string; deviceId: string; baseUrl: string };
function post(value: unknown) {
  (window as Window & { ReactNativeWebView?: { postMessage: (value: string) => void } }).ReactNativeWebView?.postMessage(JSON.stringify(value));
}
export function useMatrixNativeBridge({ enabled, session, client, openRoom, onBack, onError }: {
  enabled: boolean; session: Session | null; client: MatrixClient | null;
  openRoom: (id: string) => void; onBack: () => void; onError: (message: string) => void;
}) {
  const callbacks = useRef({ openRoom, onBack, onError });
  callbacks.current = { openRoom, onBack, onError };
  useEffect(() => {
    if (!enabled || !client) return;
    const update = () => post({ type: 'unread', count: client.getRooms().reduce((sum, room) => sum + room.getUnreadNotificationCount(), 0) });
    client.on(ClientEvent.Sync, update); client.on(RoomEvent.Receipt, update); update();
    return () => { client.off(ClientEvent.Sync, update); client.off(RoomEvent.Receipt, update); };
  }, [enabled, client]);
  useEffect(() => {
    if (!enabled) return;
    post({ type: 'matrix-session', authenticated: !!session, userId: session?.userId });
    const receive = async (event: Event) => {
      const data = (event as CustomEvent).detail;
      if (data?.type === 'back') callbacks.current.onBack();
      if (data?.type === 'open-room' && typeof data.roomId === 'string') { callbacks.current.openRoom(data.roomId); post({ type: 'room-opened' }); }
      if (data?.type !== 'push-token' || !client || !session || typeof data.token !== 'string') return;
      try {
        const response = await fetch('/matrix-mobile/register', { method: 'POST', headers: {
          'Content-Type': 'application/json', Authorization: `Bearer ${session.accessToken}`,
        }, body: JSON.stringify({ token: data.token, deviceId: session.deviceId, baseUrl: session.baseUrl }) });
        if (!response.ok) throw new Error('Kunne ikke registrere Matrix-varsler. Prøv igjen i innstillinger.');
        const { pushkey, url } = await response.json();
        await client.setPusher({ app_id: 'no.gnomguttan.gnomchat', pushkey, kind: 'http',
          app_display_name: 'GnomChat', device_display_name: 'GnomChat mobil', lang: 'nb',
          append: false, data: { url, format: 'event_id_only' } });
        post({ type: 'push-ready' });
      } catch (error) { callbacks.current.onError(error instanceof Error ? error.message : 'Varsling feilet.'); }
    };
    window.addEventListener('gnomchat-native', receive);
    post({ type: 'bridge-ready' });
    return () => window.removeEventListener('gnomchat-native', receive);
  }, [enabled, session, client]);
}
