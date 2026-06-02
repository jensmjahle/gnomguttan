import { useEffect, useCallback } from 'react';
import styles from './Lightbox.module.css';

interface Props {
  src: string;
  alt: string;
  onClose: () => void;
  onPrev?: () => void;
  onNext?: () => void;
}

export function Lightbox({ src, alt, onClose, onPrev, onNext }: Props) {
  const handleKey = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
    if (e.key === 'ArrowLeft') onPrev?.();
    if (e.key === 'ArrowRight') onNext?.();
  }, [onClose, onPrev, onNext]);

  useEffect(() => {
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [handleKey]);

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <button className={styles.close} onClick={onClose} aria-label="Lukk">×</button>
      {onPrev && (
        <button className={`${styles.nav} ${styles.navPrev}`} onClick={(e) => { e.stopPropagation(); onPrev(); }} aria-label="Forrige">‹</button>
      )}
      <img
        className={styles.image}
        src={src}
        alt={alt}
        onClick={(e) => e.stopPropagation()}
      />
      {onNext && (
        <button className={`${styles.nav} ${styles.navNext}`} onClick={(e) => { e.stopPropagation(); onNext(); }} aria-label="Neste">›</button>
      )}
    </div>
  );
}
