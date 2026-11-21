import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { markNotificationRead, openNotification } from '@/services/notifications';
import { useNotificationStore } from '@/store/notificationStore';
import type { AppNotification } from '@/types';
import { NotificationItem } from './NotificationItem';
import styles from './NotificationToasts.module.css';

const TOAST_MS = 6000;

function Toast({ notification }: { notification: AppNotification }) {
  const navigate = useNavigate();
  const dismiss = useNotificationStore((s) => s.dismissToast);

  // Restart the timer when a grouped notification is updated.
  useEffect(() => {
    const timer = window.setTimeout(() => dismiss(notification.id), TOAST_MS);
    return () => window.clearTimeout(timer);
  }, [dismiss, notification.id, notification.updatedAt]);

  return (
    <div className={styles.toast} role="status">
      <NotificationItem
        notification={notification}
        onSelect={() => navigate(openNotification(notification))}
        onMarkRead={() => {
          void markNotificationRead(notification.id).catch(() => {});
          dismiss(notification.id);
        }}
      />
      <button type="button" className={styles.close} onClick={() => dismiss(notification.id)} aria-label="Lukk varsel">
        ✕
      </button>
    </div>
  );
}

/** Popups for notifications that arrive live (can be turned off in the settings). */
export function NotificationToasts() {
  const toasts = useNotificationStore((s) => s.toasts);
  if (toasts.length === 0) return null;

  return createPortal(
    <div className={styles.stack} aria-live="polite">
      {toasts.map((notification) => (
        <Toast key={notification.id} notification={notification} />
      ))}
    </div>,
    document.body,
  );
}
