import { Navbar } from '@/components/layout/Navbar';
import { config } from '@/config';
import styles from './KinoPage.module.css';

export function KinoPage() {
  return (
    <AppLayout>
      <div style={{ padding: 'var(--page-padding)', flex: 1, minHeight: 0, display: 'flex' }}>
        <iframe
          className={styles.iframe}
          src={config.jellyfinClientUrl}
          title="Kino"
          allow="fullscreen"
        />
      </main>
    </div>
  );
}
