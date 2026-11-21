import { useEffect, useState } from 'react';
import { triggerMeow, suppressNextCat, onMeow } from '@/services/meow';
import { TileButton } from '../StreamDeck';

export function MjauTile() {
  const [active, setActive] = useState(false);

  // Meows arrive on the shared live feed stream. Audio is handled by the Navbar —
  // we only drive the emoji animation here.
  useEffect(() => onMeow(() => {
    setActive(true);
    setTimeout(() => setActive(false), 600);
  }), []);

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
