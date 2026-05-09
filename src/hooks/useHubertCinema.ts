import { useCallback, useEffect, useRef, useState } from 'react';
import { getRecentHubertMovies, JellyfinApiError, type HubertCinemaMovie } from '@/services/jellyfin';

const DEFAULT_LIMIT = 8;

function formatError(prefix: string, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message ? `${prefix}: ${message}` : prefix;
}

function mapError(error: unknown) {
  if (error instanceof JellyfinApiError) {
    if (error.status === 404) {
      return 'Konfigurer JELLYFIN_HOST og JELLYFIN_TOKEN i .env';
    }

    if (error.status === 401 || error.status === 403) {
      return 'Jellyfin-token ble avvist';
    }
  }

  return formatError('Kunne ikke laste Hubert Cinema', error);
}

export function useHubertCinema() {
  const [movies, setMovies] = useState<HubertCinemaMovie[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const loadMovies = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);

    try {
      const result = await getRecentHubertMovies(DEFAULT_LIMIT);
      if (requestId !== requestIdRef.current) {
        return;
      }

      setMovies(result);
    } catch (error) {
      if (requestId === requestIdRef.current) {
        setError(mapError(error));
      }
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void loadMovies();
  }, [loadMovies]);

  return {
    movies,
    loading,
    error,
    refresh: loadMovies,
  };
}
