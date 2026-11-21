import { useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { FeedCardOptionsProvider } from '@/components/feed/FeedCardContext';
import { getCardComponent } from '@/components/feed/FeedCardRegistry';
import { loadFeedItem } from '@/services/feed';
import { useFeedItem } from '@/store/feedStore';
import styles from './FeedPostPage.module.css';

/** A single feed post with all its comments, for direct links (/innlegg/:id#c-<commentId>). */
export function FeedPostPage() {
  const { feedItemId = '' } = useParams();
  const { hash } = useLocation();
  const item = useFeedItem(feedItemId);
  const [missing, setMissing] = useState(false);
  const highlightCommentId = hash.startsWith('#c-') ? decodeURIComponent(hash.slice(3)) : undefined;

  // Always fetch: the copy in the feed list may predate comments or bumps.
  useEffect(() => {
    let cancelled = false;
    setMissing(false);
    loadFeedItem(feedItemId).catch(() => {
      if (!cancelled) setMissing(true);
    });
    return () => { cancelled = true; };
  }, [feedItemId]);

  const Card = item ? getCardComponent(item.type) : null;

  return (
    <AppLayout>
      <div className={styles.page}>
        <div className={styles.inner}>
          <Link to="/" className={styles.back}>← Tilbake til feeden</Link>

          {item && Card && (
            <FeedCardOptionsProvider value={{ expandComments: true, highlightCommentId }}>
              <Card item={item} />
            </FeedCardOptionsProvider>
          )}
          {item && !Card && <p className={styles.message}>Denne typen innlegg kan ikke vises her.</p>}
          {!item && !missing && <p className={styles.message}>Laster innlegget…</p>}
          {!item && missing && (
            <div className={styles.message}>
              <strong>Fant ikke innlegget</strong>
              <span>Det kan ha blitt slettet, eller lenken er feil.</span>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
