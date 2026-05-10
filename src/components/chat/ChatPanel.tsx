import { config } from '@/config';
import styles from './ChatPanel.module.css';

type ChatPanelVariant = 'panel' | 'fullscreen';

interface Props {
  variant?: ChatPanelVariant;
}

export function ChatPanel({ variant = 'panel' }: Props) {
  const isFullscreen = variant === 'fullscreen';

  return (
    <aside className={[styles.panel, isFullscreen ? styles.fullscreen : ''].filter(Boolean).join(' ')} aria-label="VoceChat">
      <iframe
        className={[styles.iframe, isFullscreen ? styles.iframeFullscreen : ''].filter(Boolean).join(' ')}
        src={config.vocechatHost}
        title="VoceChat"
        allow="camera; microphone"
      />
    </aside>
  );
}
