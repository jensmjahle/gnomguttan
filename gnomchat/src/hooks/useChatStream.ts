import { useEffect, useRef, useState } from 'react';
import { openChatStream } from '@/services/sse';
import { useChatStore } from '@/store/chatStore';
import { useAuthStore } from '@/store/authStore';
import { useReadStore } from '@/store/readStore';
import { vocechatService } from '@/services/vocechat';
import { presentMessageNotification } from '@/services/notifications';

type StreamStatus = 'connecting' | 'open' | 'closed' | 'error';

// VoceChat replays recent messages every time the SSE stream connects. Local
// fallback notifications must only fire for messages created after this
// connection opened; older replayed messages are shown in-app without alerts.

/**
 * Opens the VoceChat SSE stream while authenticated, merges events into the chat
 * store, and raises a local notification only for genuinely new, unread messages
 * that arrive live (outside the active thread and not sent by us). Mount once
 * near the app root.
 */
export function useChatStream() {
  const [status, setStatus] = useState<StreamStatus>('connecting');
  const myUid = useAuthStore((s) => s.user?.uid);
  const token = useAuthStore((s) => s.token);
  const knownUsers = useRef<Set<number>>(new Set());
  const streamOpenedAt = useRef(0);
  const lastLocalNotificationMid = useRef(0);

  useEffect(() => {
    if (!token || !myUid) return;

    const handle = openChatStream({
      onChat: (event) => {
        const key = useChatStore.getState().ingestEvent(event, myUid);

        // Lazily fetch unknown senders so names/avatars render.
        if (event.from_uid !== myUid && !knownUsers.current.has(event.from_uid)) {
          knownUsers.current.add(event.from_uid);
          vocechatService
            .getUserInfo(event.from_uid)
            .then((u) => useChatStore.getState().cacheUsers([u]))
            .catch(() => knownUsers.current.delete(event.from_uid));
        }

        const { activeThread, usersById, groups } = useChatStore.getState();
        const { lastRead } = useReadStore.getState();
        const isActive = activeThread === key;
        const marker = lastRead[key];
        // Unread = we have a baseline for this thread and the message is newer,
        // or it's a thread we've never baselined (a brand-new conversation).
        const isUnread = marker === undefined || event.mid > marker;
        const isLiveForCurrentConnection =
          streamOpenedAt.current > 0 && event.created_at >= streamOpenedAt.current - 1000;
        const messageDetail =
          event.detail.type === 'normal' || event.detail.type === 'reply' ? event.detail : null;

        const shouldNotify =
          isLiveForCurrentConnection &&
          isUnread &&
          event.mid > lastLocalNotificationMid.current &&
          !isActive &&
          event.from_uid !== myUid &&
          messageDetail !== null;

        if (shouldNotify) {
          lastLocalNotificationMid.current = event.mid;
          const senderName = usersById[event.from_uid]?.name ?? 'New message';
          const target = event.target;
          const groupName = 'gid' in target ? groups.find((g) => g.gid === target.gid)?.name : undefined;
          const title = groupName ? `${senderName} · ${groupName}` : senderName;
          const body =
            messageDetail && typeof messageDetail.content === 'string' ? messageDetail.content : 'Sent a message';
          void presentMessageNotification(title, body, { thread: key });
        }
      },
      onStatus: (s) => {
        setStatus(s === 'open' ? 'open' : s);
        if (s === 'open') {
          // New connection: messages older than this timestamp are replay only.
          streamOpenedAt.current = Date.now();
        } else {
          streamOpenedAt.current = 0;
        }
      },
    });

    return () => {
      streamOpenedAt.current = 0;
      handle.close();
    };
  }, [token, myUid]);

  return status;
}
