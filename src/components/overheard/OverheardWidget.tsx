import { FormEvent, useEffect, useMemo, useState } from 'react';
import styles from './OverheardWidget.module.css';

interface OverheardQuote {
  id: string;
  text: string;
  author: string;
}

const STORAGE_KEY = 'gnomguttan-overheard-quotes';

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

function createId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function loadQuotes(): OverheardQuote[] {
  if (typeof window === 'undefined') {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map((item) => {
        if (!item || typeof item !== 'object') return null;
        const candidate = item as Partial<OverheardQuote>;
        const text = candidate.text?.trim();
        const author = candidate.author?.trim();
        const id = candidate.id?.trim();
        if (!text || !author || !id || id.startsWith('default-')) return null;
        return {
          id,
          text,
          author,
        };
      })
      .filter((item): item is OverheardQuote => item !== null);
  } catch {
    return [];
  }
}

function pickRandomQuote(quotes: OverheardQuote[], excludeId?: string | null) {
  if (quotes.length === 0) return null;
  if (quotes.length === 1) return quotes[0];

  const available = quotes.filter((quote) => quote.id !== excludeId);
  const pool = available.length > 0 ? available : quotes;
  return pool[Math.floor(Math.random() * pool.length)];
}

export function OverheardWidget() {
  const [quotes, setQuotes] = useState<OverheardQuote[]>(() => loadQuotes());
  const [currentQuoteId, setCurrentQuoteId] = useState<string>(() => pickRandomQuote(loadQuotes())?.id ?? '');
  const [composerOpen, setComposerOpen] = useState(false);
  const [draftText, setDraftText] = useState('');
  const [draftAuthor, setDraftAuthor] = useState('');

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(quotes));
    } catch {
      // Ignore storage failures.
    }
  }, [quotes]);

  const currentQuote = useMemo(
    () => quotes.find((quote) => quote.id === currentQuoteId) ?? quotes[0] ?? null,
    [quotes, currentQuoteId]
  );

  const handleRefresh = () => {
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
      }
      return next;
    });
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const text = draftText.trim();
    const author = draftAuthor.trim();
    if (!text || !author) return;

    const nextQuote: OverheardQuote = {
      id: createId(),
      text,
      author,
    };

    setQuotes((prev) => [...prev, nextQuote]);
    setCurrentQuoteId(nextQuote.id);
    setComposerOpen(false);
    setDraftText('');
    setDraftAuthor('');
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
        <blockquote className={styles.quote}>
          <p className={styles.text}>
            {currentQuote ? `“${currentQuote.text}”` : 'Ingen sitater enda'}
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
              <button type="button" className={styles.ghostBtn} onClick={handleToggleComposer}>
                Avbryt
              </button>
              <button type="submit" className={styles.primaryBtn}>
                Lagre
              </button>
            </div>
          </form>
        )}
      </div>
    </section>
  );
}
