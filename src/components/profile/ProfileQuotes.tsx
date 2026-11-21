import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { nb } from 'date-fns/locale/nb';
import { getQuotesAbout } from '@/services/profiles';
import type { OverheardQuote } from '@/types';
import styles from './Profile.module.css';

function pickRandom(quotes: OverheardQuote[], excludeId?: string | null) {
  const pool = quotes.length > 1 ? quotes.filter((quote) => quote.id !== excludeId) : quotes;
  return pool[Math.floor(Math.random() * pool.length)] ?? null;
}

function RefreshIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="23 4 23 10 17 10" />
      <path d="M20.49 15A9 9 0 1 1 23 10" />
    </svg>
  );
}

/** Overhørt quotes by or about someone (matched on their first name), one at a time like the front page. */
export function ProfileQuotes({ uid }: { uid: number }) {
  const [data, setData] = useState<{ firstName: string; quotes: OverheardQuote[] } | null>(null);
  const [current, setCurrent] = useState<OverheardQuote | null>(null);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setCurrent(null);
    getQuotesAbout(uid)
      .then((result) => {
        if (cancelled) return;
        setData(result);
        setCurrent(pickRandom(result.quotes));
      })
      .catch(() => { if (!cancelled) setData({ firstName: '', quotes: [] }); });
    return () => { cancelled = true; };
  }, [uid]);

  const quotes = data?.quotes ?? [];

  return (
    <section className={styles.card}>
      <header className={styles.cardHeader}>
        <h2 className={styles.sectionTitle}>
          Overhørt{data?.firstName ? ` med ${data.firstName}` : ''}
          {quotes.length > 0 && <span className={styles.count}>{quotes.length}</span>}
        </h2>
        {quotes.length > 1 && (
          <button
            type="button"
            className={styles.iconButton}
            onClick={() => setCurrent((shown) => pickRandom(quotes, shown?.id))}
            title="Vis et annet sitat"
            aria-label="Vis et annet sitat"
          >
            <RefreshIcon />
          </button>
        )}
      </header>
      {!data && <p className={styles.empty}>Henter sitater…</p>}
      {data && !current && <p className={styles.empty}>Ingen sitater av eller om {data.firstName || 'denne personen'} ennå.</p>}
      {current && (
        <figure key={current.id} className={styles.quote}>
          <blockquote className={styles.quoteText}>«{current.text}»</blockquote>
          <figcaption className={styles.quoteMeta}>
            — {current.author}
            {current.createdAt ? ` · ${format(new Date(current.createdAt), 'd. MMM yyyy', { locale: nb })}` : ''}
          </figcaption>
        </figure>
      )}
    </section>
  );
}
