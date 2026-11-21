import { useEffect, useState } from 'react';
import * as FileSystem from 'expo-file-system/legacy';
import { call } from '@/matrix/engine';
import type { MediaRef } from '@/matrix/protocol.generated';

// Matrix media (avatars, images, files) is fetched and, in encrypted rooms,
// decrypted by the engine, then written to the app's cache folder once. Later
// views read the file straight from disk.

const DIR = `${FileSystem.cacheDirectory}matrix-media/`;
const memory = new Map<string, string>();
const inflight = new Map<string, Promise<string>>();
let dirReady: Promise<void> | null = null;

function hash(text: string) {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

const EXT: Record<string, string> = {
  'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif', 'video/mp4': 'mp4', 'video/webm': 'webm',
  'audio/ogg': 'ogg', 'audio/mp4': 'm4a', 'audio/mpeg': 'mp3', 'audio/webm': 'webm', 'audio/aac': 'aac', 'application/pdf': 'pdf',
};

export function mediaKey(ref: MediaRef, thumbnail?: number) {
  const id = ref.file?.url || ref.mxc || '';
  return id ? `${id}${thumbnail ? `@${thumbnail}` : ''}` : '';
}

export async function loadMedia(ref: MediaRef, thumbnail?: number, name?: string): Promise<string> {
  const key = mediaKey(ref, thumbnail);
  if (!key) throw new Error('Mangler medieadresse.');
  const cached = memory.get(key);
  if (cached) return cached;
  const running = inflight.get(key);
  if (running) return running;

  const job = (async () => {
    dirReady ??= FileSystem.makeDirectoryAsync(DIR, { intermediates: true }).catch(() => undefined);
    await dirReady;
    const extension = (name?.match(/\.([a-z0-9]{1,5})$/i)?.[1] ?? EXT[ref.mimetype ?? ''] ?? 'bin').toLowerCase();
    const path = `${DIR}${hash(key)}.${extension}`;
    const info = await FileSystem.getInfoAsync(path);
    if (!info.exists) {
      const { base64 } = await call('media', { ref, ...(thumbnail ? { thumbnail: { width: thumbnail, height: thumbnail } } : {}) });
      await FileSystem.writeAsStringAsync(path, base64, { encoding: FileSystem.EncodingType.Base64 });
    }
    memory.set(key, path);
    return path;
  })().finally(() => inflight.delete(key));
  inflight.set(key, job);
  return job;
}

/** A local file URI for the media, or null while loading / on failure. */
export function useMatrixMedia(ref: MediaRef | undefined, thumbnail?: number, enabled = true) {
  const key = ref ? mediaKey(ref, thumbnail) : '';
  const [uri, setUri] = useState<string | null>(() => (key ? memory.get(key) ?? null : null));
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!ref || !key || !enabled) return;
    let active = true;
    setError(null);
    loadMedia(ref, thumbnail).then((path) => { if (active) setUri(path); }).catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : 'Kunne ikke hente filen.'); });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled]);
  return { uri, error };
}

export async function clearMatrixMedia() {
  memory.clear();
  await FileSystem.deleteAsync(DIR, { idempotent: true }).catch(() => undefined);
  dirReady = null;
}
