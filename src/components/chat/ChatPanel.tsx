import { useEffect, useRef } from 'react';
import { useVoceChat } from '@/hooks/useVoceChat';
import { useAuthStore } from '@/store/authStore';
import { ChatMessage } from './ChatMessage';
import { ChatInput } from './ChatInput';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import styles from './ChatPanel.module.css';

function HashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="4" y1="9" x2="20" y2="9" /><line x1="4" y1="15" x2="20" y2="15" />
      <line x1="10" y1="3" x2="8" y2="21" /><line x1="16" y1="3" x2="14" y2="21" />
    </svg>
  );
}

export function ChatPanel() {
  const { groups, activeGroup, setActiveGroup, messages, loading, error, sendMessage } = useVoceChat();
  const currentUser = useAuthStore((s) => s.user);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <aside className={styles.panel}>
      {/* Channel selector */}
      <header className={styles.header}>
        <div className={styles.channelIcon}><HashIcon /></div>
        {groups.length > 1 ? (
          <select
            className={styles.channelSelect}
            value={activeGroup?.gid ?? ''}
            onChange={(e) => {
              const gid = Number(e.target.value);
              const g = groups.find((g) => g.gid === gid);
              if (g) setActiveGroup(g);
            }}
          >
            {groups.map((g) => (
              <option key={g.gid} value={g.gid}>{g.name}</option>
            ))}
          </select>
        ) : (
          <span className={styles.channelName}>{activeGroup?.name ?? 'Chat'}</span>
        )}
      </header>

      {/* Messages */}
      <div className={styles.messages}>
        {loading && <LoadingSpinner center size="md" />}

        {error && (
          <div className={styles.errorMsg}>
            Could not connect to VoceChat. Check your configuration.
          </div>
        )}

        {!loading && !error && messages.length === 0 && (
          <div className={styles.empty}>No messages yet. Say hello!</div>
        )}

        {messages.map((msg) => (
          <ChatMessage
            key={msg.mid}
            mid={msg.mid}
            fromUid={msg.from_uid}
            fromName={msg.from_uid === currentUser?.uid ? (currentUser?.name ?? 'You') : `User ${msg.from_uid}`}
            createdAt={msg.created_at}
            content={msg.content}
          />
        ))}
        <div ref={messagesEndRef} />
      </div>

      <ChatInput onSend={sendMessage} disabled={!activeGroup || loading} />
    </aside>
  );
}
