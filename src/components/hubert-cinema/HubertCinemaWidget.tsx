import { useState } from 'react';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { useHubertCinema } from '@/hooks/useHubertCinema';
import styles from './HubertCinemaWidget.module.css';
import type { HubertCinemaMovie } from '@/services/jellyfin';

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

function FilmIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M3 10h18" />
      <path d="M7 4v16" />
      <path d="M17 4v16" />
      <path d="M3 14h18" />
    </svg>
  );
}

function formatDate(value?: string) {
  if (!value) {
    return undefined;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return undefined;
  }

  return new Intl.DateTimeFormat('nb-NO', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

function Poster({ movie }: { movie: HubertCinemaMovie }) {
  const [broken, setBroken] = useState(false);

  if (!movie.posterUrl || broken) {
    return (
      <div className={styles.posterFallback} aria-hidden="true">
        <FilmIcon />
      </div>
    );
  }

  return (
    <img
      className={styles.poster}
      src={movie.posterUrl}
      alt={movie.title}
      loading="lazy"
      onError={() => setBroken(true)}
    />
  );
}

export function HubertCinemaWidget() {
  const { movies, loading, error, refresh } = useHubertCinema();

  return (
    <section className={styles.widget}>
      <header className={styles.header}>
        <div className={styles.titleBlock}>
          <h2 className={styles.title}>Hubert Cinema</h2>
          <span className={styles.subtitle}>Nylig lagt til filmer og serier</span>
        </div>

        <button
          type="button"
          className={styles.iconBtn}
          onClick={refresh}
          title="Oppdater"
          aria-label="Oppdater"
        >
          <RefreshIcon />
        </button>
      </header>

      <div className={styles.body}>
        {loading && (
          <div className={styles.state}>
            <LoadingSpinner size="sm" />
            <span>Henter fra Jellyfin...</span>
          </div>
        )}

        {!loading && error && <div className={styles.state}>{error}</div>}

        {!loading && !error && movies.length === 0 && (
          <div className={styles.state}>Ingen nylig lagt til filmer enda.</div>
        )}

        {!loading && !error && movies.length > 0 && (
          <div className={styles.list}>
            {movies.map((movie) => {
              const metadata = [
                movie.year,
                movie.runtimeLabel,
                movie.rating !== undefined ? movie.rating.toFixed(1) : undefined,
                formatDate(movie.addedAt),
              ].filter(Boolean) as string[];

              return (
                <a
                  key={movie.id}
                  className={styles.movieLink}
                  href={movie.detailsUrl}
                  aria-label={`Se ${movie.title} i Kino`}
                >
                  <article className={styles.movie}>
                    <Poster movie={movie} />

                    <div className={styles.copy}>
                      <div className={styles.textBlock}>
                        <h3 className={styles.movieTitle}>{movie.title}</h3>
                        {metadata.length > 0 && <p className={styles.meta}>{metadata.join(' - ')}</p>}
                      </div>

                      <div className={styles.badges}>
                        <span className={styles.badge}>{movie.kindLabel}</span>
                        {movie.genres.slice(0, 2).map((genre) => (
                          <span key={genre} className={styles.badge}>
                            {genre}
                          </span>
                        ))}
                      </div>

                      {movie.overview && <p className={styles.overview}>{movie.overview}</p>}
                    </div>
                  </article>
                </a>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
