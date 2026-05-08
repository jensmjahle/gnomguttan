import { useState, type KeyboardEvent } from 'react';
import styles from './ChatInput.module.css';

interface Props {
  onSend: (message: string) => Promise<void>;
  disabled?: boolean;
}

function SendIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  );
}

export function ChatInput({ onSend, disabled }: Props) {
  const [value, setValue] = useState('');
  const [sending, setSending] = useState(false);

  const handleSend = async () => {
    const text = value.trim();
    if (!text || sending) return;
    setSending(true);
    setValue('');
    try {
      await onSend(text);
    } finally {
      setSending(false);
    }
  };

  const handleKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className={styles.container}>
      <textarea
        className={styles.textarea}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKey}
        placeholder="Message… (Enter to send, Shift+Enter for new line)"
        disabled={disabled || sending}
        rows={1}
      />
      <button
        className={styles.sendBtn}
        onClick={handleSend}
        disabled={!value.trim() || sending || disabled}
        title="Send message"
      >
        <SendIcon />
      </button>
    </div>
  );
}
