import { AppLayout } from '@/components/layout/AppLayout';
import { ChatPanel } from '@/components/chat/ChatPanel';
import { OverheardWidget } from '@/components/overheard/OverheardWidget';
import styles from './HomePage.module.css';

export function HomePage() {
  return (
    <AppLayout>
      <div className={styles.content}>
        <div className={styles.rightColumn}>
          <ChatPanel />
          <section className={styles.overheardSection}>
            <OverheardWidget />
          </section>
        </div>
      </div>
    </AppLayout>
  );
}
