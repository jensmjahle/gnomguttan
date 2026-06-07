import { useState } from 'react';
import { FeedCardShell } from '@/components/feed/FeedCardShell';
import { Avatar } from '@/components/ui/Avatar';
import { Lightbox } from '@/components/ui/Lightbox';
import { vocechatService } from '@/services/vocechat';
import { statusrapportImageUrl } from '@/services/feed';
import { useAuthStore } from '@/store/authStore';
import type { StatusrapportFeedItem } from '@/types';
import styles from './StatusrapportCard.module.css';

interface Props {
  item: StatusrapportFeedItem;
}

export function StatusrapportCard({ item }: Props) {
  const { text, imageId, actorAvatarUpdatedAt } = item.payload;
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const token = useAuthStore((s) => s.token);

  const avatarSrc = item.actorUid != null
    ? vocechatService.avatarUrl(item.actorUid, actorAvatarUpdatedAt)
    : undefined;

  const imageUrl = imageId ? statusrapportImageUrl(imageId, token) : null;

  return (
    <>
      <FeedCardShell badge="Statusrapport" badgeVariant="statusrapport" timestamp={item.createdAt} feedItemId={item.id} reactions={item.reactions}>
        <div className={styles.authorRow}>
          <Avatar src={avatarSrc} name={item.actorName} size="sm" />
          <span className={styles.authorName}>{item.actorName ?? 'Ukjent'}</span>
        </div>
        <p className={styles.text}>
        {text.split('\n').map((line, i, arr) => (
          <span key={i}>
            {line.startsWith('>') ? <span className={styles.quoteLine}>{line}</span> : line}
            {i < arr.length - 1 && <br />}
          </span>
        ))}
      </p>
        {imageUrl && (
          <div className={styles.imageWrap}>
            <img
              src={imageUrl}
              alt=""
              className={styles.image}
              loading="lazy"
              onClick={() => setLightboxOpen(true)}
            />
          </div>
        )}
      </FeedCardShell>

      {lightboxOpen && imageUrl && (
        <Lightbox src={imageUrl} alt={text} onClose={() => setLightboxOpen(false)} />
      )}
    </>
  );
}
