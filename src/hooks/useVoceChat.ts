import { useState, useEffect, useCallback, useRef } from 'react';
import {
  mergeChatMessages,
  normalizeChatHistory,
  sortChatMessages,
  vocechatService,
} from '@/services/vocechat';
import type { Group, ChatMessage, SSEChatEvent } from '@/types';

type ConnectionStatus = 'connecting' | 'connected' | 'error';

function formatError(prefix: string, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message ? `${prefix}: ${message}` : prefix;
}

function mergeFlatMessages(currentMessages: ChatMessage[], incomingMessages: ChatMessage[]) {
  return incomingMessages.reduce<ChatMessage[]>((acc, message) => {
    const existingIndex = acc.findIndex((currentMessage) => currentMessage.mid === message.mid);
    if (existingIndex === -1) {
      return [...acc, message];
    }

    const nextMessages = [...acc];
    nextMessages[existingIndex] = message;
    return nextMessages;
  }, currentMessages);
}

function isGroupTarget(target: ChatMessage['target']): target is { gid: number } {
  return 'gid' in target;
}

export function useVoceChat() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [activeGroup, setActiveGroup] = useState<Group | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [groupsLoading, setGroupsLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('connecting');
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const esRef = useRef<EventSource | null>(null);

  // Load groups once on mount
  useEffect(() => {
    setGroupsLoading(true);
    setError(null);
    vocechatService
      .getGroups()
      .then((gs) => {
        setGroups(gs);
        if (gs.length > 0) {
          setHistoryLoading(true);
          setActiveGroup(gs[0]);
        } else {
          setHistoryLoading(false);
        }
      })
      .catch((e) => {
        setError(formatError('Failed to load VoceChat groups', e));
        setHistoryLoading(false);
      })
      .finally(() => setGroupsLoading(false));
  }, []);

  // Reload history whenever the active group changes
  useEffect(() => {
    if (!activeGroup) {
      setHistoryLoading(false);
      return;
    }

    let cancelled = false;
    const groupId = activeGroup.gid;
    setHistoryLoading(true);
    setMessages([]);
    setError(null);
    vocechatService
      .getGroupHistory(groupId)
      .then((history) => {
        if (cancelled) return;
        const normalizedHistory = normalizeChatHistory(history);
        setMessages((current) => {
          const retainedMessages = current.filter(
            (message) => !(isGroupTarget(message.target) && message.target.gid === groupId)
          );
          const currentGroupMessages = current.filter(
            (message) => isGroupTarget(message.target) && message.target.gid === groupId
          );
          const mergedGroupMessages = sortChatMessages(mergeFlatMessages(currentGroupMessages, normalizedHistory));
          return [...retainedMessages, ...mergedGroupMessages];
        });
      })
      .catch((e) => {
        if (!cancelled) {
          setError(formatError('Failed to load VoceChat history', e));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setHistoryLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeGroup]);

  // Single SSE connection for real-time events
  useEffect(() => {
    esRef.current?.close();
    setConnectionStatus('connecting');
    setConnectionError(null);

    const handleChat = (event: SSEChatEvent) => {
      setMessages((prev) => mergeChatMessages(prev, event));
    };

    const es = vocechatService.openEventStream(handleChat);
    esRef.current = es;

    es.onopen = () => {
      setConnectionStatus('connected');
      setConnectionError(null);
    };

    es.onerror = () => {
      if (es.readyState === EventSource.CLOSED) {
        setConnectionStatus('error');
        setConnectionError('VoceChat live updates disconnected.');
      }
    };

    return () => {
      esRef.current?.close();
      esRef.current = null;
    };
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
        (m) => 'gid' in m.target && m.target.gid === activeGroup.gid
      )
    : [];

  return {
    groups,
    activeGroup,
    setActiveGroup,
    messages: activeMessages,
    loading: groupsLoading || historyLoading,
    error,
    connectionStatus,
    connectionError,
    sendMessage,
  };
}
