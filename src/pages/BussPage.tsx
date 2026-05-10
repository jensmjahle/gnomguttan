import { Navbar } from '@/components/layout/Navbar';
import { config } from '@/config';
import styles from './BussPage.module.css';

export function BussPage() {
  return (
    <div className={styles.shell}>
      <Navbar />
      <main className={styles.main}>
        <iframe
          className={styles.iframe}
          src={config.busUrl}
          title="Buss"
          allow="fullscreen"
        />
      </main>
    </div>
  );
}
