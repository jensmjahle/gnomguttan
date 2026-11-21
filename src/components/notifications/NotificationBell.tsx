import { useRef } from 'react';
import { useNotificationStore } from '@/store/notificationStore';
import { NotificationPanel } from './NotificationPanel';
import styles from './NotificationBell.module.css';

interface Props {
  /** Open the notification settings (in the profile overlay). */
  onOpenSettings: () => void;
}

function BellIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  );
}

/** The Navbar bell: live unread badge, opens the notification panel. */
export function NotificationBell({ onOpenSettings }: Props) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const unreadCount = useNotificationStore((s) => s.unreadCount);
  const open = useNotificationStore((s) => s.panelOpen);
  const setOpen = useNotificationStore((s) => s.setPanelOpen);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className={`${styles.bell} ${open ? styles.open : ''}`}
        onClick={() => setOpen(!open)}
        aria-label={unreadCount > 0 ? `Varsler, ${unreadCount} uleste` : 'Varsler'}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <BellIcon />
        {unreadCount > 0 && <span className={styles.badge}>{unreadCount > 9 ? '9+' : unreadCount}</span>}
      </button>
      {open && (
        <NotificationPanel
          anchorRef={buttonRef}
          onClose={() => setOpen(false)}
          onOpenSettings={() => {
            setOpen(false);
            onOpenSettings();
          }}
        />
      )}
    </>
  );
}
