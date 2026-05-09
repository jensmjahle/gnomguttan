import { config } from '@/config';
import styles from './ChatPanel.module.css';

export function ChatPanel() {
  return (
    <aside className={styles.panel} aria-label="VoceChat">
      <iframe
        className={styles.iframe}
        src={config.vocechatHost}
        title="VoceChat"
        allow="camera; microphone"
      />
    </aside>
  );
}
