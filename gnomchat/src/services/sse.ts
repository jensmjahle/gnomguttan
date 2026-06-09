import EventSource from 'react-native-sse';
import { config } from '@/config';
import { ensureFreshVoceChatToken } from '@/services/session';
import type { SSEChatEvent } from '@/types';

// React Native has no built-in EventSource, so we use react-native-sse to open
// the VoceChat SSE stream (GET /api/user/events?api-key=<token>). The token goes
// in the query string because EventSource can't set headers — same as the website.
//
// We manage reconnection ourselves so each reconnect uses a freshly-renewed token.

export interface ChatStreamHandle {
  close: () => void;
}

interface ChatStreamHandlers {
  onChat: (event: SSEChatEvent) => void;
  onStatus?: (status: 'open' | 'closed' | 'error') => void;
}

const RECONNECT_DELAY_MS = 3000;

export function openChatStream({ onChat, onStatus }: ChatStreamHandlers): ChatStreamHandle {
  let es: EventSource | null = null;
  let closed = false;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  const connect = async () => {
    if (closed) return;
    const token = await ensureFreshVoceChatToken();
    if (!token) {
      onStatus?.('error');
      return;
    }
    if (closed) return;

    const url = `${config.vocechatHost}/api/user/events?api-key=${encodeURIComponent(token)}`;
    // Disable the library's own reconnect; we reconnect manually with a fresh token.
    es = new EventSource(url, { pollingInterval: 0 });

    es.addEventListener('open', () => onStatus?.('open'));

    es.addEventListener('message', (event) => {
      if (!event.data) return;
      try {
        const data = JSON.parse(event.data) as SSEChatEvent;
        if (data.type === 'chat') onChat(data);
      } catch {
        // ignore malformed frames
      }
    });

    es.addEventListener('error', () => {
      onStatus?.('error');
      scheduleReconnect();
    });
  };

  const scheduleReconnect = () => {
    if (closed) return;
    es?.removeAllEventListeners();
    es?.close();
    es = null;
    onStatus?.('closed');
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(() => void connect(), RECONNECT_DELAY_MS);
  };

  void connect();

  return {
    close: () => {
      closed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      es?.removeAllEventListeners();
      es?.close();
      es = null;
    },
  };
}
