import { useEffect, useState } from 'react';
import { triggerMeow, suppressNextCat } from '@/services/meow';
import { useAuthStore } from '@/store/authStore';
import { TileButton } from '../StreamDeck';

export function MjauTile() {
  const [active, setActive] = useState(false);

  useEffect(() => {
    const token  = useAuthStore.getState().token ?? '';
    const source = new EventSource(`/app-api/meow/events?token=${encodeURIComponent(token)}`);
    // Audio is handled by the Navbar SSE listener — we only drive the emoji animation here.
    source.onmessage = () => {
      setActive(true);
      setTimeout(() => setActive(false), 600);
    };
    return () => source.close();
  }, []);

  function handleClick() {
    suppressNextCat();
    triggerMeow().catch(() => {});
  }

  return (
    <TileButton label="Mjau" onClick={handleClick}>
      <span
        style={{
          fontSize:   '22px',
          lineHeight: 1,
          display:    'inline-block',
          transition: 'transform 0.15s ease',
          transform:  active ? 'scale(1.3) rotate(-10deg)' : 'scale(1)',
        }}
      >
        🐱
      </span>
    </TileButton>
  );
}
