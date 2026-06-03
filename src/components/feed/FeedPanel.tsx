import { useEffect, useMemo, useRef, useState } from 'react';
import { loadFeedPage } from '@/services/feed';
import { useFeedStore } from '@/store/feedStore';
import { useFeedStream } from '@/hooks/useFeedStream';
import { useFeedFilterStore, getVisibleTypes } from '@/store/feedFilterStore';
import { FeedFilter } from './FeedFilter';
import { getCardComponent } from './FeedCardRegistry';
import styles from './FeedPanel.module.css';

export function FeedPanel() {
  const { items } = useFeedStore();
  const { enabled } = useFeedFilterStore();
  const visibleTypes = useMemo(() => getVisibleTypes(enabled), [enabled]);
  const visibleItems = useMemo(() => items.filter((item) => visibleTypes.has(item.type)), [items, visibleTypes]);

  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [isAtTop, setIsAtTop] = useState(true);
  const [newItemsCount, setNewItemsCount] = useState(0);

  const bodyRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const isLoadingMoreRef = useRef(false);
  const isInitializedRef = useRef(false);
  const prevFirstIdRef = useRef<string | null>(null);

  useFeedStream();

  // Initial load
  useEffect(() => {
    let cancelled = false;
    async function init() {
      setIsLoading(true);
      setError('');
      try {
        await loadFeedPage();
        if (!cancelled) isInitializedRef.current = true;
      } catch {
        if (!cancelled) setError('Kunne ikke laste feed.');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    void init();
    return () => { cancelled = true; };
  }, []);

  // Track scroll position to know when the user has scrolled away from the top
  useEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    function onScroll() {
      setIsAtTop((body?.scrollTop ?? 0) < 60);
    }
    body.addEventListener('scroll', onScroll, { passive: true });
    return () => body.removeEventListener('scroll', onScroll);
  }, []);

  // Count new visible items prepended via SSE while user is scrolled away
  useEffect(() => {
    if (!isInitializedRef.current || visibleItems.length === 0) return;
    const firstId = visibleItems[0].id;
    if (prevFirstIdRef.current !== null && prevFirstIdRef.current !== firstId && !isAtTop) {
      setNewItemsCount((n) => n + 1);
    }
    prevFirstIdRef.current = firstId;
  }, [visibleItems, isAtTop]);

  // Reset counter when user reaches the top
  useEffect(() => {
    if (isAtTop) setNewItemsCount(0);
  }, [isAtTop]);

  // Infinite scroll sentinel
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

  const scrollToTop = () => {
    bodyRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className={styles.panel}>
      <header className={styles.header}>
        <span className={styles.title}>Feed</span>
        <FeedFilter />
      </header>

      <div className={styles.body} ref={bodyRef}>
        {newItemsCount > 0 && !isAtTop && (
          <button type="button" className={styles.newItemsBanner} onClick={scrollToTop}>
            ↑ {newItemsCount} {newItemsCount === 1 ? 'nytt innlegg' : 'nye innlegg'}
          </button>
        )}

        {isLoading && visibleItems.length === 0 && (
          <div className={styles.emptyState}>
            <p className={styles.emptyTitle}>Laster...</p>
          </div>
        )}

        {!isLoading && visibleItems.length === 0 && !error && (
          <div className={styles.emptyState}>
            {items.length > 0 ? (
              <>
                <p className={styles.emptyTitle}>Alt er filtrert bort</p>
                <p className={styles.emptyText}>Trykk på filterikonet øverst for å vise innhold.</p>
              </>
            ) : (
              <>
                <p className={styles.emptyTitle}>Ingen innlegg enda</p>
                <p className={styles.emptyText}>Opprett et arrangement eller legg til et sitat — det dukker opp her.</p>
              </>
            )}
          </div>
        )}

        {error && (
          <div className={styles.emptyState}>
            <p className={styles.emptyTitle}>Noe gikk galt</p>
            <p className={styles.emptyText}>{error}</p>
          </div>
        )}

        <div className={styles.list}>
          {visibleItems.map((item) => {
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

        <div ref={sentinelRef} className={styles.sentinel} aria-hidden="true" />

        {isLoadingMore && (
          <p className={styles.loadingMore}>Laster mer...</p>
        )}
      </div>
    </div>
  );
}
