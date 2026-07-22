import { useCallback, useEffect, useRef, useState } from 'react';
import { vocechatService } from '@/services/vocechat';
import type { VoceChatFile } from '@/types';

// Ported from the website's src/hooks/useVoceChatGallery.ts — loads every image
// stored on the VoceChat server, newest first.

const PAGE_SIZE = 1000;
const MAX_PAGES = 25;

export function useVoceChatGallery() {
  const [files, setFiles] = useState<VoceChatFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const loadGallery = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);

    try {
      const seen = new Set<number>();
      const collected: VoceChatFile[] = [];

      const appendFiles = (batch: VoceChatFile[]) => {
        for (const file of batch) {
          if (seen.has(file.mid)) continue;
          seen.add(file.mid);
          if (file.expired || file.gid === -1) continue;
          collected.push(file);
        }
      };

      const firstBatch = await vocechatService.getSystemFiles({ file_type: 'Image', page_size: PAGE_SIZE });
      if (requestId !== requestIdRef.current) return;

      appendFiles(firstBatch);

      if (firstBatch.length >= PAGE_SIZE) {
        for (let page = 1; page <= MAX_PAGES; page += 1) {
          const batch = await vocechatService.getSystemFiles({ file_type: 'Image', page_size: PAGE_SIZE, page });
          if (requestId !== requestIdRef.current) return;

          const beforeCount = collected.length;
          appendFiles(batch);

          if (batch.length === 0) break;
          if (page > 1 && collected.length === beforeCount) break;
          if (batch.length < PAGE_SIZE) break;
        }
      }

      collected.sort((a, b) => b.created_at - a.created_at);
      setFiles(collected);
    } catch (err) {
      if (requestId === requestIdRef.current) {
        const message = err instanceof Error ? err.message : String(err);
        setError(message ? `Kunne ikke laste galleriet: ${message}` : 'Kunne ikke laste galleriet.');
      }
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void loadGallery();
  }, [loadGallery]);

  return { files, loading, error, refresh: loadGallery };
}
