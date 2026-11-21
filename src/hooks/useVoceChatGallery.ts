import { useCallback, useEffect, useRef, useState } from 'react';
import {
  listArchivedMedia,
  mediaCopyStatus,
  requestMediaSync,
  type ArchivedMedia,
  type MediaCopyStatus,
} from '@/services/vocechatMedia';

function formatError(prefix: string, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message ? `${prefix}: ${message}` : prefix;
}

/** Images from VoceChat channels, served from our own copy. Opening it tops the copy up. */
export function useVoceChatGallery() {
  const [files, setFiles] = useState<ArchivedMedia[]>([]);
  const [copyStatus, setCopyStatus] = useState<MediaCopyStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const loadGallery = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);
    try {
      const [items, status] = await Promise.all([listArchivedMedia({ kind: 'image' }), mediaCopyStatus().catch(() => null)]);
      if (requestId !== requestIdRef.current) return;
      setFiles(items);
      setCopyStatus(status);
    } catch (err) {
      if (requestId === requestIdRef.current) setError(formatError('Kunne ikke hente bildene', err));
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadGallery();
    // Look for new files in VoceChat; reload once the server has had a moment to list them.
    let timer: ReturnType<typeof setTimeout> | undefined;
    void requestMediaSync().then((result) => {
      if (result?.started) timer = setTimeout(() => void loadGallery(), 4000);
    }).catch(() => {});
    return () => clearTimeout(timer);
  }, [loadGallery]);

  return { files, copyStatus, loading, error, refresh: loadGallery };
}
