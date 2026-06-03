import { useEffect, useRef, useState } from 'react';
import { loadFeedPage } from '@/services/feed';
import { useFeedStore } from '@/store/feedStore';
import { useFeedStream } from '@/hooks/useFeedStream';
import { getCardComponent } from './FeedCardRegistry';
import styles from './FeedPanel.module.css';

export function FeedPanel() {
  const { items, hasMore } = useFeedStore();
  const [isLoading, setIsLoading] = useState(false);
  useFeedStream();
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const sentinelRef = useRef<HTMLDivElement>(null);
  const isLoadingMoreRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      setIsLoading(true);
      setError('');
      try {
        await loadFeedPage();
      } catch {
        if (!cancelled) setError('Kunne ikke laste feed.');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void init();
    return () => { cancelled = true; };
  }, []);

  // IntersectionObserver watches the sentinel div at the bottom of the list.
  // When it scrolls into view and there are more items, we fetch the next page.
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0].isIntersecting) return;
        if (isLoadingMoreRef.current) return;

        const { items: currentItems, hasMore: currentHasMore } = useFeedStore.getState();
        if (!currentHasMore || currentItems.length === 0) return;

        isLoadingMoreRef.current = true;
        setIsLoadingMore(true);

        const oldest = currentItems[currentItems.length - 1];
        loadFeedPage(oldest.createdAt)
          .catch(() => {})
          .finally(() => {
            isLoadingMoreRef.current = false;
            setIsLoadingMore(false);
          });
      },
      { threshold: 0.1 }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

  return (
    <div className={styles.panel}>
      <header className={styles.header}>
        <span className={styles.title}>Feed</span>
      </header>

      <div className={styles.body}>
        {isLoading && items.length === 0 && (
          <div className={styles.emptyState}>
            <p className={styles.emptyTitle}>Laster...</p>
          </div>
        )}

        {!isLoading && items.length === 0 && !error && (
          <div className={styles.emptyState}>
            <p className={styles.emptyTitle}>Ingen innlegg enda</p>
            <p className={styles.emptyText}>
              Opprett et arrangement eller legg til et sitat — det dukker opp her.
            </p>
          </div>
        )}

        {error && (
          <div className={styles.emptyState}>
            <p className={styles.emptyTitle}>Noe gikk galt</p>
            <p className={styles.emptyText}>{error}</p>
          </div>
        )}

        <div className={styles.list}>
          {items.map((item) => {
            const Card = getCardComponent(item.type);
            if (!Card) {
              return (
                <div key={item.id} className={styles.unknownCard}>
                  <span className={styles.unknownType}>{item.type}</span>
                </div>
              );
            }
            return <Card key={item.id} item={item} />;
          })}
        </div>

        {/* Sentinel — observed by IntersectionObserver to trigger next page load */}
        <div ref={sentinelRef} className={styles.sentinel} aria-hidden="true" />

        {isLoadingMore && (
          <p className={styles.loadingMore}>Laster mer...</p>
        )}
      </div>
    </div>
  );
}
