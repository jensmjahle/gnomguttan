import { Navbar } from '@/components/layout/Navbar';
import { config } from '@/config';
import styles from './KinoPage.module.css';

export function KinoPage() {
  return (
    <div className={styles.shell}>
      <Navbar />
      <main className={styles.main}>
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
