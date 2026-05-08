import { Avatar } from '@/components/ui/Avatar';
import { vocechatService } from '@/services/vocechat';
import { useAuthStore } from '@/store/authStore';
import { format } from 'date-fns';
import styles from './ChatMessage.module.css';

interface Props {
  mid: number;
  fromUid: number;
  fromName: string;
  createdAt: number;
  content: string;
  avatarUpdatedAt?: number;
}

export function ChatMessage({ fromUid, fromName, createdAt, content, avatarUpdatedAt }: Props) {
  const currentUser = useAuthStore((s) => s.user);
  const isSelf = currentUser?.uid === fromUid;

  return (
    <div className={[styles.row, isSelf ? styles.self : styles.other].filter(Boolean).join(' ')}>
      {!isSelf && (
        <Avatar
          src={vocechatService.avatarUrl(fromUid, avatarUpdatedAt)}
          name={fromName}
          size="sm"
          className={styles.avatar}
        />
      )}
      <div className={styles.bubble}>
        {!isSelf && <span className={styles.sender}>{fromName}</span>}
        <p className={styles.text}>{content}</p>
        <span className={styles.time}>{format(createdAt, 'HH:mm')}</span>
      </div>
      {isSelf && (
        <Avatar
          src={vocechatService.avatarUrl(fromUid, avatarUpdatedAt)}
          name={fromName}
          size="sm"
          className={styles.avatar}
        />
      )}
    </div>
  );
}
