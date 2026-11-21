import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { Avatar } from '@/components/ui/Avatar';
import { useAppUsers } from '@/hooks/useAppUsers';
import { getPersonAvatar } from '@/utils/people';
import styles from './UserLink.module.css';

const OPEN_DELAY_MS = 400;
const CLOSE_DELAY_MS = 150;
const CARD_WIDTH = 280;
const CARD_ROOM = 150;

/** Hover cards only where there's a real pointer; on touch screens the link just opens the profile. */
const canHover = () => window.matchMedia?.('(hover: hover) and (pointer: fine)').matches ?? false;

interface Props {
  uid?: number | null;
  /** Shown when there are no children, and on the card until the directory has loaded. */
  name: string;
  className?: string;
  children?: ReactNode;
}

/** A person's name that opens their profile, with a small card (picture, name, bio) on hover. */
export function UserLink({ uid, name, className, children }: Props) {
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const linkRef = useRef<HTMLAnchorElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  const later = useCallback((fn: () => void, ms: number) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(fn, ms);
  }, []);
  const open = useCallback(() => {
    if (canHover()) later(() => setAnchor(linkRef.current?.getBoundingClientRect() ?? null), OPEN_DELAY_MS);
  }, [later]);
  const close = useCallback(() => later(() => setAnchor(null), CLOSE_DELAY_MS), [later]);
  const keep = useCallback(() => clearTimeout(timer.current), []);

  useEffect(() => () => clearTimeout(timer.current), []);
  // The card is positioned on screen, so it goes away rather than drift when the page scrolls.
  useEffect(() => {
    if (!anchor) return;
    const hide = () => setAnchor(null);
    window.addEventListener('scroll', hide, true);
    window.addEventListener('resize', hide);
    return () => {
      window.removeEventListener('scroll', hide, true);
      window.removeEventListener('resize', hide);
    };
  }, [anchor]);

  if (!uid) return <span className={className}>{children ?? name}</span>;

  return (
    <>
      <Link
        ref={linkRef}
        to={`/profil/${uid}`}
        className={[styles.link, className].filter(Boolean).join(' ')}
        onMouseEnter={open}
        onMouseLeave={close}
        onClick={(event) => {
          event.stopPropagation();
          clearTimeout(timer.current);
          setAnchor(null);
        }}
      >
        {children ?? name}
      </Link>
      {anchor && createPortal(<HoverCard uid={uid} fallbackName={name} anchor={anchor} onEnter={keep} onLeave={close} />, document.body)}
    </>
  );
}

function HoverCard({ uid, fallbackName, anchor, onEnter, onLeave }: {
  uid: number;
  fallbackName: string;
  anchor: DOMRect;
  onEnter: () => void;
  onLeave: () => void;
}) {
  const { usersByUid } = useAppUsers();
  const person = usersByUid.get(uid) ?? { uid, name: fallbackName };
  const left = Math.min(Math.max(8, anchor.left), window.innerWidth - CARD_WIDTH - 8);
  const below = anchor.bottom + 8 + CARD_ROOM < window.innerHeight;
  const position = below ? { top: anchor.bottom + 8, left } : { bottom: window.innerHeight - anchor.top + 8, left };

  return (
    // Mouse-only extra: the name link itself is what keyboards and screen readers use.
    <Link
      to={`/profil/${uid}`}
      className={styles.card}
      style={{ ...position, width: CARD_WIDTH }}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      aria-hidden="true"
      tabIndex={-1}
      data-hover-card=""
    >
      <Avatar src={getPersonAvatar(person)} name={person.name} size="lg" />
      <span className={styles.text}>
        <span className={styles.name}>{person.name}</span>
        {person.bio ? <span className={styles.bio}>{person.bio}</span> : <span className={styles.noBio}>Ingen bio ennå</span>}
        <span className={styles.more}>Se profilen →</span>
      </span>
    </Link>
  );
}
