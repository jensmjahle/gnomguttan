import { FormEvent, useEffect, useMemo, useState } from 'react';
import { createOverheardQuote, loadOverheardQuotes } from '@/services/overheard';
import type { OverheardQuote, OverheardQuoteInput } from '@/types';
import styles from './OverheardWidget.module.css';

function RefreshIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12a9 9 0 0 1-15.5 6.36" />
      <polyline points="21 8 21 12 17 12" />
      <path d="M3 12a9 9 0 0 1 15.5-6.36" />
      <polyline points="3 16 3 12 7 12" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function pickRandomQuote(quotes: OverheardQuote[], excludeId?: string | null) {
  if (quotes.length === 0) return null;
  if (quotes.length === 1) return quotes[0];

  const available = quotes.filter((quote) => quote.id !== excludeId);
  const pool = available.length > 0 ? available : quotes;
  return pool[Math.floor(Math.random() * pool.length)];
}

function mergeQuotes(currentQuotes: OverheardQuote[], nextQuotes: OverheardQuote[]) {
  const nextById = new Map(currentQuotes.map((quote) => [quote.id, quote] as const));

  for (const quote of nextQuotes) {
    nextById.set(quote.id, quote);
  }

  return [...nextById.values()];
}

export function OverheardWidget() {
  const [quotes, setQuotes] = useState<OverheardQuote[]>([]);
  const [currentQuoteId, setCurrentQuoteId] = useState('');
  const [composerOpen, setComposerOpen] = useState(false);
  const [draftText, setDraftText] = useState('');
  const [draftAuthor, setDraftAuthor] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function run() {
      setIsLoading(true);
      setError('');

      try {
        const nextQuotes = await loadOverheardQuotes();
        if (cancelled) {
          return;
        }

        setQuotes((currentQuotes) => {
          const mergedQuotes = mergeQuotes(currentQuotes, nextQuotes);
          setCurrentQuoteId((currentId) => {
            if (currentId && mergedQuotes.some((quote) => quote.id === currentId)) {
              return currentId;
            }

            return pickRandomQuote(mergedQuotes)?.id ?? '';
          });
          return mergedQuotes;
        });
      } catch {
        if (!cancelled) {
          setError('Kunne ikke laste overhørt.');
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void run();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (quotes.length === 0) {
      setCurrentQuoteId('');
      return;
    }

    setCurrentQuoteId((currentId) => {
      if (currentId && quotes.some((quote) => quote.id === currentId)) {
        return currentId;
      }

      return pickRandomQuote(quotes)?.id ?? '';
    });
  }, [quotes]);

  const currentQuote = useMemo(
    () => quotes.find((quote) => quote.id === currentQuoteId) ?? quotes[0] ?? null,
    [quotes, currentQuoteId]
  );

  const handleRefresh = () => {
    if (isLoading || quotes.length === 0) {
      return;
    }

    const next = pickRandomQuote(quotes, currentQuote?.id ?? null);
    if (next) {
      setCurrentQuoteId(next.id);
    }
  };

  const handleToggleComposer = () => {
    setComposerOpen((open) => {
      const next = !open;
      if (next) {
        setDraftText('');
        setDraftAuthor('');
        setError('');
      }
      return next;
    });
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const text = draftText.trim();
    const author = draftAuthor.trim();
    if (!text || !author) {
      setError('Skriv både sitat og hvem som sa det.');
      return;
    }

    const nextQuote: OverheardQuoteInput = {
      text,
      author,
    };

    setIsSubmitting(true);
    setError('');

    try {
      const createdQuote = await createOverheardQuote(nextQuote);
      setQuotes((currentQuotes) => mergeQuotes(currentQuotes, [createdQuote]));
      setCurrentQuoteId(createdQuote.id);
      setComposerOpen(false);
      setDraftText('');
      setDraftAuthor('');
    } catch {
      setError('Kunne ikke lagre sitatet.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className={styles.widget}>
      <header className={styles.header}>
        <div className={styles.titleBlock}>
          <h2 className={styles.title}>Overhørt</h2>
          <span className={styles.subtitle}>Tilfeldige sitater</span>
        </div>

        <div className={styles.actions}>
          <button
            type="button"
            className={styles.iconBtn}
            onClick={handleRefresh}
            title="Hent nytt sitat"
            aria-label="Hent nytt sitat"
          >
            <RefreshIcon />
          </button>
          <button
            type="button"
            className={styles.iconBtn}
            onClick={handleToggleComposer}
            title="Legg til sitat"
            aria-label="Legg til sitat"
          >
            <PlusIcon />
          </button>
        </div>
      </header>

      <div className={styles.body}>
        {error && <p className={styles.error}>{error}</p>}

        <blockquote className={styles.quote}>
          <p className={styles.text}>
            {isLoading && quotes.length === 0
              ? 'Laster sitater...'
              : currentQuote
                ? `“${currentQuote.text}”`
                : 'Ingen sitater enda'}
          </p>
          {currentQuote && <span className={styles.author}>-{currentQuote.author}</span>}
        </blockquote>

        {composerOpen && (
          <form className={styles.form} onSubmit={handleSubmit}>
            <textarea
              className={styles.textarea}
              value={draftText}
              onChange={(event) => setDraftText(event.target.value)}
              placeholder="Skriv sitatet her"
              rows={3}
            />
            <input
              className={styles.input}
              type="text"
              value={draftAuthor}
              onChange={(event) => setDraftAuthor(event.target.value)}
              placeholder="Hvem sa det?"
            />
            <div className={styles.formActions}>
              <button type="button" className={styles.ghostBtn} onClick={handleToggleComposer} disabled={isSubmitting}>
                Avbryt
              </button>
              <button type="submit" className={styles.primaryBtn} disabled={isSubmitting}>
                Lagre
              </button>
            </div>
          </form>
        )}
      </div>
    </section>
  );
}
