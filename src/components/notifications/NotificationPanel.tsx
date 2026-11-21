import { useEffect, useRef, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { loadNotifications, markAllNotificationsRead, markNotificationRead, openNotification } from '@/services/notifications';
import { useNotificationStore } from '@/store/notificationStore';
import { NotificationItem } from './NotificationItem';
import styles from './NotificationPanel.module.css';

interface Props {
  anchorRef: RefObject<HTMLElement>;
  onClose: () => void;
  onOpenSettings: () => void;
}

/** The dropdown under the bell: newest notifications first, each linking to where it happened. */
export function NotificationPanel({ anchorRef, onClose, onOpenSettings }: Props) {
  const navigate = useNavigate();
  const panelRef = useRef<HTMLDivElement>(null);
  const items = useNotificationStore((s) => s.items);
  const unreadCount = useNotificationStore((s) => s.unreadCount);
  const hasMore = useNotificationStore((s) => s.hasMore);
  const loaded = useNotificationStore((s) => s.loaded);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [anchor] = useState(() => anchorRef.current?.getBoundingClientRect() ?? null);

  useEffect(() => {
    if (!loaded) void loadNotifications().catch(() => setError('Kunne ikke hente varsler.'));
  }, [loaded]);

  useEffect(() => {
    function handlePointer(event: MouseEvent) {
      const target = event.target as Node;
      if (panelRef.current?.contains(target) || anchorRef.current?.contains(target)) return;
      onClose();
    }
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    document.addEventListener('mousedown', handlePointer);
    document.addEventListener('keydown', handleKey);
    window.addEventListener('resize', onClose);
    return () => {
      document.removeEventListener('mousedown', handlePointer);
      document.removeEventListener('keydown', handleKey);
      window.removeEventListener('resize', onClose);
    };
  }, [anchorRef, onClose]);

  async function loadMore() {
    const oldest = items[items.length - 1];
    if (!oldest || loadingMore) return;
    setLoadingMore(true);
    try {
      await loadNotifications(oldest.updatedAt);
    } catch {
      setError('Kunne ikke hente flere varsler.');
    } finally {
      setLoadingMore(false);
    }
  }

  const top = (anchor?.bottom ?? 64) + 8;
  const right = anchor ? Math.max(8, window.innerWidth - anchor.right - 8) : 16;

  return createPortal(
    <div ref={panelRef} className={styles.panel} style={{ top, right }} role="dialog" aria-label="Varsler">
      <header className={styles.header}>
        <h2 className={styles.title}>Varsler</h2>
        <div className={styles.headerActions}>
          {unreadCount > 0 && (
            <button type="button" className={styles.linkBtn} onClick={() => void markAllNotificationsRead().catch(() => {})}>
              Merk alle som lest
            </button>
          )}
          <button type="button" className={styles.iconBtn} onClick={onOpenSettings} aria-label="Varslingsinnstillinger" title="Innstillinger">
            ⚙
          </button>
        </div>
      </header>

      <div className={styles.list}>
        {!loaded && !error && <p className={styles.empty}>Laster…</p>}
        {loaded && items.length === 0 && (
          <div className={styles.empty}>
            <span className={styles.emptyIcon} aria-hidden="true">✓</span>
            Du har ingen nye varsler
          </div>
        )}
        {items.map((notification) => (
          <NotificationItem
            key={notification.id}
            notification={notification}
            onSelect={() => {
              const link = openNotification(notification);
              onClose();
              navigate(link);
            }}
            onMarkRead={() => void markNotificationRead(notification.id).catch(() => {})}
          />
        ))}
        {hasMore && (
          <button type="button" className={styles.moreBtn} onClick={() => void loadMore()} disabled={loadingMore}>
            {loadingMore ? 'Laster…' : 'Vis eldre'}
          </button>
        )}
        {error && <p className={styles.error}>{error}</p>}
      </div>
    </div>,
    document.body,
  );
}
