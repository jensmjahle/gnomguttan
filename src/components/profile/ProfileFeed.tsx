import { useEffect, useMemo, useState } from 'react';
import { FeedFilter } from '@/components/feed/FeedFilter';
import { getCardComponent } from '@/components/feed/FeedCardRegistry';
import { loadProfileFeedPage } from '@/services/profiles';
import { useFeedFilterStore, visibleTypesParam } from '@/store/feedFilterStore';
import { useFeedItem } from '@/store/feedStore';
import styles from './Profile.module.css';

function ProfileFeedItem({ id }: { id: string }) {
  const item = useFeedItem(id);
  const Card = item ? getCardComponent(item.type) : null;
  return item && Card ? <Card item={item} /> : null;
}

/** Someone's own posts, newest first, filtered like the main feed. */
export function ProfileFeed({ uid, name }: { uid: number; name: string }) {
  const enabled = useFeedFilterStore((s) => s.enabled);
  const typesKey = useMemo(() => visibleTypesParam(enabled), [enabled]);
  const [ids, setIds] = useState<string[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [cursor, setCursor] = useState<number>();
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    loadProfileFeedPage(uid)
      .then((page) => {
        if (cancelled) return;
        setIds(page.ids);
        setHasMore(page.hasMore);
        setCursor(page.last);
      })
      .catch(() => { if (!cancelled) setError('Kunne ikke hente innleggene.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [uid, typesKey]);

  async function loadMore() {
    if (loadingMore || cursor === undefined) return;
    setLoadingMore(true);
    try {
      const page = await loadProfileFeedPage(uid, cursor);
      setIds((current) => [...current, ...page.ids.filter((id) => !current.includes(id))]);
      setHasMore(page.hasMore);
      setCursor(page.last);
    } catch {
      setError('Kunne ikke hente flere innlegg.');
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <section className={styles.feed} aria-label={`Innlegg av ${name}`}>
      <header className={styles.feedHeader}>
        <h2 className={styles.sectionTitle}>Innlegg</h2>
        <FeedFilter />
      </header>
      {loading && <p className={styles.empty}>Henter innlegg…</p>}
      {!loading && ids.length === 0 && !error && <p className={styles.empty}>{name} har ingen innlegg her ennå.</p>}
      {error && <p className={styles.error} role="alert">{error}</p>}
      {!loading && ids.map((id) => <ProfileFeedItem key={id} id={id} />)}
      {!loading && hasMore && (
        <button type="button" className={styles.moreButton} onClick={() => void loadMore()} disabled={loadingMore}>
          {loadingMore ? 'Henter…' : 'Vis flere innlegg'}
        </button>
      )}
    </section>
  );
}
