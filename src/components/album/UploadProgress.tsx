import type { AlbumUploadProgress } from '@/services/albums';
import styles from './UploadProgress.module.css';

export function UploadProgress({ progress }: { progress: AlbumUploadProgress }) {
  const overall = progress.total > 0 ? (progress.done + progress.currentFraction) / progress.total : 0;
  const pct = Math.min(100, Math.max(0, Math.round(overall * 100)));

  return (
    <div className={styles.wrap} role="status" aria-live="polite">
      <div className={styles.track}>
        <div className={styles.fill} style={{ width: `${pct}%` }} />
      </div>
      <span className={styles.text}>
        {progress.done} av {progress.total} {progress.total === 1 ? 'fil' : 'filer'} lastet opp
      </span>
    </div>
  );
}
