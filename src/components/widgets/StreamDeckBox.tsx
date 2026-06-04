import { StreamDeck, type StreamDeckEntry } from './StreamDeck';
import { MjauTile } from './tiles/MjauTile';
import { LampaTile } from './tiles/LampaTile';
import { SpinWheelWidget } from '@/components/spin-wheel/SpinWheelWidget';
import { PigsWidget } from '@/components/pigs/PigsWidget';

// ── Icons ─────────────────────────────────────────────────────────────────────

function SpinIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
    </svg>
  );
}

// ── Button registry ───────────────────────────────────────────────────────────
// Add new entries here to make them appear in the StreamDeck on the home page.
//
// kind: 'widget' — tap opens the full widget inside the box; × returns to grid.
// kind: 'custom' — pre-built tile component with its own state/animations
//                  (used for tiles that need live state, e.g. LampaTile).
// kind: 'button' — tap fires onPress immediately; tile flashes active state.

const ENTRIES: StreamDeckEntry[] = [
  {
    label: 'Mjau',
    kind:  'custom',
    tile:  <MjauTile />,
  },
  {
    label: 'Lampa',
    kind:  'custom',
    tile:  <LampaTile />,
  },
  {
    label: 'Spin',
    icon:  <SpinIcon />,
    kind:  'widget',
    node:  <SpinWheelWidget />,
  },
  {
    label: 'Kast grisene',
    icon:  <img src="/images/pigs/labber.gif" alt="" style={{ width: 28, height: 28, objectFit: 'contain' }} />,
    kind:  'widget',
    node:  <PigsWidget />,
  },
];

// ── Component ─────────────────────────────────────────────────────────────────

export function StreamDeckBox() {
  return <StreamDeck entries={ENTRIES} />;
}
