import { useState } from 'react';
import { format } from 'date-fns';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { Lightbox } from '@/components/ui/Lightbox';
import { useVoceChatGallery } from '@/hooks/useVoceChatGallery';
import { vocechatService } from '@/services/vocechat';
import styles from './Gallery.module.css';

function RefreshIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="23 4 23 10 17 10" />
      <path d="M20.49 15A9 9 0 1 1 23 10" />
    </svg>
  );
}

export function Gallery() {
  const { files, loading, error, refresh } = useVoceChatGallery();
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const countLabel = files.length === 1 ? '1 bilde' : `${files.length} bilder`;

  return (
    <section className={styles.gallery}>
      <header className={styles.header}>
        <div className={styles.titleBlock}>
          <h2 className={styles.title}>Galleri</h2>
          <span className={styles.count}>{countLabel}</span>
        </div>
        <button className={styles.refreshBtn} onClick={refresh} title="Oppdater galleri" aria-label="Oppdater galleri">
          <RefreshIcon />
        </button>
      </header>

      <div className={styles.body}>
        {loading && (
          <div className={styles.state}>
            <LoadingSpinner size="sm" />
            <span>Henter bilder fra alle chatter...</span>
          </div>
        )}

        {!loading && error && <div className={styles.state}>{error}</div>}

        {!loading && !error && files.length === 0 && <div className={styles.state}>Ingen bilder funnet.</div>}

        {!loading && !error && files.length > 0 && (
          <div className={styles.grid}>
            {files.map((file, i) => {
              const previewPath = file.thumbnail || file.content;
              const previewUrl = vocechatService.resourceFileUrl(previewPath);
              const dateLabel = format(file.created_at, 'dd.MM.yyyy');

              return (
                <button
                  key={file.mid}
                  className={styles.item}
                  onClick={() => setLightboxIndex(i)}
                  title={dateLabel}
                  aria-label={`Bilde fra ${dateLabel}`}
                >
                  <img className={styles.thumb} src={previewUrl} alt={`Bilde fra ${dateLabel}`} loading="lazy" />
                </button>
              );
            })}
          </div>
        )}

        {lightboxIndex !== null && (() => {
          const file = files[lightboxIndex];
          return (
            <Lightbox
              src={vocechatService.resourceFileUrl(file.content)}
              alt={format(file.created_at, 'dd.MM.yyyy')}
              onClose={() => setLightboxIndex(null)}
              onPrev={lightboxIndex > 0 ? () => setLightboxIndex(lightboxIndex - 1) : undefined}
              onNext={lightboxIndex < files.length - 1 ? () => setLightboxIndex(lightboxIndex + 1) : undefined}
            />
          );
        })()}
      </div>
    </section>
  );
}
