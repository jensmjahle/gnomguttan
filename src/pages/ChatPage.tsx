import { ChatPanel } from '@/components/chat/ChatPanel';
import { Navbar } from '@/components/layout/Navbar';
import styles from './ChatPage.module.css';

export function ChatPage() {
  return (
    <div className={styles.shell}>
      <Navbar />
      <main className={styles.main}>
        <ChatPanel variant="fullscreen" />
      </main>
    </div>
  );
}
