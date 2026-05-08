import { useState, useEffect, useCallback, useRef } from 'react';
import { vocechatService } from '@/services/vocechat';
import type { Group, ChatMessage, SSEChatEvent } from '@/types';

export function useVoceChat() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [activeGroup, setActiveGroup] = useState<Group | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const esRef = useRef<EventSource | null>(null);

  // Load groups once on mount
  useEffect(() => {
    vocechatService
      .getGroups()
      .then((gs) => {
        setGroups(gs);
        if (gs.length > 0) setActiveGroup(gs[0]);
      })
      .catch((e) => setError(String(e)));
  }, []);

  // Reload history whenever the active group changes
  useEffect(() => {
    if (!activeGroup) return;
    setLoading(true);
    setMessages([]);
    vocechatService
      .getGroupHistory(activeGroup.gid)
      .then(setMessages)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [activeGroup]);

  // Single SSE connection for real-time events
  useEffect(() => {
    esRef.current?.close();

    const handleChat = (event: SSEChatEvent) => {
      setMessages((prev) => {
        // Deduplicate by mid
        if (prev.some((m) => m.mid === event.mid)) return prev;
        const msg: ChatMessage = {
          mid: event.mid,
          from_uid: event.from_uid,
          created_at: event.created_at,
          content: event.content,
          content_type: event.content_type,
          target: event.target,
        };
        return [...prev, msg];
      });
    };

    esRef.current = vocechatService.openEventStream(handleChat);
    return () => esRef.current?.close();
  }, []);

  const sendMessage = useCallback(
    async (content: string) => {
      if (!activeGroup) return;
      await vocechatService.sendGroupMessage(activeGroup.gid, content);
    },
    [activeGroup]
  );

  // Filter messages to those belonging to the active group
  const activeMessages = activeGroup
    ? messages.filter(
        (m) => m.target.type === 'group' && (m.target as { type: 'group'; gid: number }).gid === activeGroup.gid
      )
    : [];

  return {
    groups,
    activeGroup,
    setActiveGroup,
    messages: activeMessages,
    loading,
    error,
    sendMessage,
  };
}
