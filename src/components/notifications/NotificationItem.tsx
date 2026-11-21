import { Avatar } from '@/components/ui/Avatar';
import { useAppUsers } from '@/hooks/useAppUsers';
import { useMinuteTick } from '@/hooks/useMinuteTick';
import { describeNotification } from '@/utils/notificationText';
import { getPersonAvatar, resolvePerson } from '@/utils/people';
import { formatRelativeTime } from '@/utils/relativeTime';
import type { AppNotification } from '@/types';
import styles from './NotificationItem.module.css';

interface Props {
  notification: AppNotification;
  onSelect: () => void;
  /** Clicking the unread dot marks it read without opening it. */
  onMarkRead: () => void;
}

/** One notification: who, what, a snippet and when. Used in the panel and in toasts. */
export function NotificationItem({ notification, onSelect, onMarkRead }: Props) {
  useMinuteTick();
  const { usersByUid } = useAppUsers();
  const { actors, action, icon } = describeNotification(notification);
  const latest = notification.actors[0];
  const person = latest ? resolvePerson(latest, usersByUid) : null;
  const unread = notification.readAt === null;

  return (
    <div className={`${styles.item} ${unread ? styles.unread : styles.read}`}>
      <button type="button" className={styles.main} onClick={onSelect}>
        <span className={styles.avatarWrap}>
          <Avatar src={person ? getPersonAvatar(person) : undefined} name={person?.name} size="md" />
          <span className={styles.typeIcon} aria-hidden="true">{icon}</span>
        </span>
        <span className={styles.body}>
          <span className={styles.text}>
            <strong>{actors}</strong> {action}
          </span>
          {notification.snippet && <span className={styles.snippet}>«{notification.snippet}»</span>}
          <span className={styles.time}>{formatRelativeTime(notification.updatedAt)}</span>
        </span>
      </button>
      {unread && (
        <button
          type="button"
          className={styles.dotBtn}
          onClick={onMarkRead}
          aria-label="Merk som lest"
          title="Merk som lest"
        >
          <span className={styles.dot} />
        </button>
      )}
    </div>
  );
}
