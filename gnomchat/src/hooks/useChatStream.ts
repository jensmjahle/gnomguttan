import { useEffect, useRef, useState } from 'react';
import { openChatStream } from '@/services/sse';
import { useChatStore } from '@/store/chatStore';
import { useAuthStore } from '@/store/authStore';
import { vocechatService } from '@/services/vocechat';
import { presentMessageNotification } from '@/services/notifications';

type StreamStatus = 'connecting' | 'open' | 'closed' | 'error';

/**
 * Opens the VoceChat SSE stream while authenticated, merges events into the chat
 * store, and raises a local notification for messages that arrive outside the
 * active thread (and not sent by us). Mount once near the app root.
 */
export function useChatStream() {
  const [status, setStatus] = useState<StreamStatus>('connecting');
  const myUid = useAuthStore((s) => s.user?.uid);
  const token = useAuthStore((s) => s.token);
  const knownUsers = useRef<Set<number>>(new Set());

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
        const isActive = activeThread === key;
        if (!isActive && event.from_uid !== myUid && event.detail.type !== 'reaction') {
          const senderName = usersById[event.from_uid]?.name ?? 'New message';
          const target = event.target;
          const groupName = 'gid' in target ? groups.find((g) => g.gid === target.gid)?.name : undefined;
          const title = groupName ? `${senderName} · ${groupName}` : senderName;
          const body = typeof event.detail.content === 'string' ? event.detail.content : 'Sent a message';
          void presentMessageNotification(title, body, { thread: key });
        }
      },
      onStatus: (s) => setStatus(s === 'open' ? 'open' : s),
    });

    return () => handle.close();
  }, [token, myUid]);

  return status;
}
