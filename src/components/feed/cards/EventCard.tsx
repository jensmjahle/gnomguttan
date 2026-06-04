import { useState } from 'react';
import { format } from 'date-fns';
import { FeedCardShell } from '@/components/feed/FeedCardShell';
import { useAuth } from '@/hooks/useAuth';
import { respondToCommunityEvent } from '@/services/communityEvents';
import { useCommunityEventStore } from '@/store/communityEventStore';
import type { EventCreatedFeedItem, EventRsvpStatus } from '@/types';
import styles from './EventCard.module.css';

const RSVP_OPTIONS: Array<{ value: EventRsvpStatus; label: string }> = [
  { value: 'coming', label: 'Kommer' },
  { value: 'maybe', label: 'Kanskje' },
  { value: 'cannot', label: 'Kan ikke' },
];

const RSVP_STATUS_LABELS: Record<EventRsvpStatus, string> = {
  coming: 'kommer',
  maybe: 'kanskje',
  cannot: 'kan ikke',
};

interface Props {
  item: EventCreatedFeedItem;
}

export function EventCard({ item }: Props) {
  const { user } = useAuth();
  const [isBusy, setIsBusy] = useState(false);

  // Always read from the live store so RSVP changes are reflected instantly
  const liveEvent = useCommunityEventStore(
    (state) => state.events.find((e) => e.id === item.payload.id)
  );
  const event = liveEvent ?? item.payload;

  const myResponse = user ? (event.responses.find((r) => r.uid === user.uid) ?? null) : null;
  const myStatus = myResponse?.status ?? null;

  const handleRespond = async (status: EventRsvpStatus) => {
    if (!user || isBusy) return;
    setIsBusy(true);
    try {
      await respondToCommunityEvent(event.id, status);
    } finally {
      setIsBusy(false);
    }
  };

  const comingCount = event.responses.filter((r) => r.status === 'coming').length;
  const maybeCount = event.responses.filter((r) => r.status === 'maybe').length;
  const cannotCount = event.responses.filter((r) => r.status === 'cannot').length;

  return (
    <FeedCardShell
      badge="Arrangement"
      badgeVariant="event"
      actor={item.actorName}
      timestamp={item.createdAt}
    >
      <div className={styles.content}>
        <div className={styles.titleRow}>
          <h3 className={styles.title}>{event.title}</h3>
          {myStatus && (
            <span className={styles.myBadge}>{RSVP_STATUS_LABELS[myStatus]}</span>
          )}
        </div>

        <p className={styles.meta}>
          {format(new Date(event.startsAt), 'dd.MM.yyyy HH:mm')}
          {event.location && <> · {event.location}</>}
        </p>

        {event.description && (
          <p className={styles.description}>{event.description}</p>
        )}

        <div className={styles.footer}>
          <div className={styles.rsvpButtons}>
            {RSVP_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={[
                  styles.rsvpBtn,
                  myStatus === opt.value ? styles[`rsvpBtn_${opt.value}`] : '',
                ].filter(Boolean).join(' ')}
                onClick={() => void handleRespond(opt.value)}
                disabled={!user || isBusy}
                aria-pressed={myStatus === opt.value}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <div className={styles.counts}>
            <span>{comingCount} kommer</span>
            <span>{maybeCount} kanskje</span>
            <span>{cannotCount} kan ikke</span>
          </div>
        </div>
      </div>
    </FeedCardShell>
  );
}
