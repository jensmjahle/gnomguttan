import { useEffect, useRef, useState } from 'react';
import { triggerMeow, suppressNextCat, onMeow } from '@/services/meow';
import styles from './MeowButton.module.css';

export function MeowButton({ suppressCat = false }: { suppressCat?: boolean }) {
  const [active, setActive] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    audioRef.current = new Audio('/mjau.wav');

    // Meows arrive on the shared live feed stream (one connection per tab).
    return onMeow(() => {
      const audio = audioRef.current;
      if (audio) {
        audio.currentTime = 0;
        audio.play().catch(() => {});
      }
      setActive(true);
      setTimeout(() => setActive(false), 600);
    });
  }, []);

  const handleClick = () => {
    if (suppressCat) suppressNextCat();
    triggerMeow().catch(() => {});
  };

  return (
    <button
      className={`${styles.btn} ${active ? styles.active : ''}`}
      onClick={handleClick}
      title="Meow"
    >
      <span className={styles.emoji}>🐱</span>
      <span className={styles.label}>Mjau!!</span>
    </button>
  );
}
