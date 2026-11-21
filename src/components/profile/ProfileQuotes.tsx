import { Fragment, useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { nb } from 'date-fns/locale/nb';
import { getQuotesAbout, type ProfileQuote } from '@/services/profiles';
import styles from './Profile.module.css';

const SHOWN = 4;
const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The text with the first name marked (same whole-word rule as the server). */
function Highlighted({ text, firstName }: { text: string; firstName: string }) {
  const parts = useMemo(() => {
    if (firstName.length < 2) return [text];
    return text.split(new RegExp(`((?<![\\p{L}\\p{N}])${escapeRegex(firstName)}(?:s|'s?|’s?)?(?![\\p{L}\\p{N}]))`, 'iu'));
  }, [text, firstName]);
  return <>{parts.map((part, i) => (i % 2 ? <mark key={i} className={styles.mark}>{part}</mark> : <Fragment key={i}>{part}</Fragment>))}</>;
}

/** Overhørt quotes by or about someone, matched on their first name. */
export function ProfileQuotes({ uid }: { uid: number }) {
  const [data, setData] = useState<{ firstName: string; quotes: ProfileQuote[] } | null>(null);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setShowAll(false);
    getQuotesAbout(uid)
      .then((result) => { if (!cancelled) setData(result); })
      .catch(() => { if (!cancelled) setData({ firstName: '', quotes: [] }); });
    return () => { cancelled = true; };
  }, [uid]);

  const quotes = data?.quotes ?? [];
  const shown = showAll ? quotes : quotes.slice(0, SHOWN);

  return (
    <section className={styles.card}>
      <h2 className={styles.sectionTitle}>
        Overhørt{data?.firstName ? ` med ${data.firstName}` : ''}
        {quotes.length > 0 && <span className={styles.count}>{quotes.length}</span>}
      </h2>
      {!data && <p className={styles.empty}>Henter sitater…</p>}
      {data && quotes.length === 0 && <p className={styles.empty}>Ingen sitater av eller om {data.firstName || 'denne personen'} ennå.</p>}
      <ul className={styles.quotes}>
        {shown.map((quote) => (
          <li key={quote.id} className={styles.quote}>
            <blockquote className={styles.quoteText}>«<Highlighted text={quote.text} firstName={data?.firstName ?? ''} />»</blockquote>
            <span className={styles.quoteMeta}>
              — {quote.saidBy ? <strong>{quote.author}</strong> : quote.author}
              {quote.createdAt ? ` · ${format(new Date(quote.createdAt), 'd. MMM yyyy', { locale: nb })}` : ''}
            </span>
          </li>
        ))}
      </ul>
      {quotes.length > SHOWN && (
        <button type="button" className={styles.linkButton} onClick={() => setShowAll((v) => !v)}>
          {showAll ? 'Vis færre' : `Vis alle ${quotes.length}`}
        </button>
      )}
    </section>
  );
}
