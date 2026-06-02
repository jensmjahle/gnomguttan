import { useEffect, useRef, useState } from 'react';
import { triggerMeow, suppressNextCat } from '@/services/meow';
import { useAuthStore } from '@/store/authStore';
import styles from './MeowButton.module.css';

export function MeowButton({ suppressCat = false }: { suppressCat?: boolean }) {
  const [active, setActive] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    audioRef.current = new Audio('/mjau.wav');

    const token = useAuthStore.getState().token ?? '';
    const source = new EventSource(`/app-api/meow/events?token=${encodeURIComponent(token)}`);

    source.onmessage = () => {
      const audio = audioRef.current;
      if (audio) {
        audio.currentTime = 0;
        audio.play().catch(() => {});
      }
      setActive(true);
      setTimeout(() => setActive(false), 600);
    };

    return () => source.close();
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
