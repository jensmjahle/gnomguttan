// Web preview: no file system, so decrypted media is kept as data URIs in memory.
import { useEffect, useState } from 'react';
import { call } from '@/matrix/engine';
import type { MediaRef } from '@/matrix/protocol.generated';

const memory = new Map<string, Promise<string>>();

export function mediaKey(ref: MediaRef, thumbnail?: number) {
  const id = ref.file?.url || ref.mxc || '';
  return id ? `${id}${thumbnail ? `@${thumbnail}` : ''}` : '';
}

export function loadMedia(ref: MediaRef, thumbnail?: number): Promise<string> {
  const key = mediaKey(ref, thumbnail);
  if (!key) return Promise.reject(new Error('Mangler medieadresse.'));
  let job = memory.get(key);
  if (!job) {
    job = call('media', { ref, ...(thumbnail ? { thumbnail: { width: thumbnail, height: thumbnail } } : {}) }).then(({ base64, mimetype }) => `data:${mimetype};base64,${base64}`);
    job.catch(() => memory.delete(key));
    memory.set(key, job);
  }
  return job;
}

export function useMatrixMedia(ref: MediaRef | undefined, thumbnail?: number, enabled = true) {
  const key = ref ? mediaKey(ref, thumbnail) : '';
  const [uri, setUri] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!ref || !key || !enabled) return;
    let active = true;
    loadMedia(ref, thumbnail).then((value) => { if (active) setUri(value); }).catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : 'Kunne ikke hente filen.'); });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled]);
  return { uri, error };
}

export async function clearMatrixMedia() { memory.clear(); }
