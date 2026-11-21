import { useEffect } from 'react';
import { CommentSection } from '@/components/comments/CommentSection';
import { loadCommunityEvent } from '@/services/communityEvents';
import { useAuthStore } from '@/store/authStore';
import { useCommunityEventStore } from '@/store/communityEventStore';
import { getFeedItemThread } from '@/utils/comments';
import type { AnyFeedItem, CommunityEvent, FeedComment } from '@/types';
import { useFeedCardOptions } from './FeedCardContext';

const EMPTY: FeedComment[] = [];
// Events the feed has already tried to fetch, so cards don't refetch on every render.
const requestedEventIds = new Set<string>();

interface Props {
  item: AnyFeedItem;
}

/** The comment thread under a feed card. Event posts show the event's own comments. */
export function FeedComments({ item }: Props) {
  const isLoggedIn = useAuthStore((s) => Boolean(s.user));
  const { expandComments, highlightCommentId } = useFeedCardOptions();
  const thread = getFeedItemThread(item);
  const isEvent = thread.kind === 'event';
  const liveEvent = useCommunityEventStore((s) =>
    isEvent ? s.events.find((event) => event.id === thread.id) : undefined
  );

  useEffect(() => {
    if (!isEvent || liveEvent || requestedEventIds.has(thread.id)) return;
    requestedEventIds.add(thread.id);
    void loadCommunityEvent(thread.id).catch(() => {});
  }, [isEvent, liveEvent, thread.id]);

  const event = isEvent ? liveEvent ?? (item.payload as CommunityEvent) : null;

  return (
    <CommentSection
      thread={thread}
      comments={(event ? event.comments : item.comments) ?? EMPTY}
      canComment={isLoggedIn && (!event || event.status === 'published')}
      eventLink={event ? `/arrangementer/${encodeURIComponent(thread.id)}` : undefined}
      defaultExpanded={expandComments}
      highlightId={highlightCommentId}
      commentsReady={!isEvent || Boolean(liveEvent)}
    />
  );
}
