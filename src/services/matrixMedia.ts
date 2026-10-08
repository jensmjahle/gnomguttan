import { decryptAttachment, encryptAttachment } from 'matrix-encrypt-attachment';
import { EventType, MsgType, type MatrixClient } from 'matrix-js-sdk';
import type { EncryptedFile } from 'matrix-js-sdk/lib/@types/media';

export type MatrixMedia = { url?: string; file?: EncryptedFile; mimetype?: string };
const caches = new WeakMap<MatrixClient, Map<string, Promise<Blob>>>();
export function loadMatrixMedia(client: MatrixClient, media: MatrixMedia, signal?: AbortSignal): Promise<Blob> {
  const mxc = media.file?.url || media.url;
  if (!mxc?.startsWith('mxc://')) return Promise.reject(new Error('Ugyldig Matrix-medieadresse.'));
  const url = client.mxcUrlToHttp(mxc, undefined, undefined, undefined, false, true, true);
  if (!url) return Promise.reject(new Error('Kunne ikke lese medieadressen.'));
  return fetch(url, { headers: { Authorization: `Bearer ${client.getAccessToken()}` }, signal }).then(async response => {
    if (!response.ok) throw new Error(`Kunne ikke hente filen (${response.status}).`);
    if (media.file) {
      const data = await decryptAttachment(await response.arrayBuffer(), media.file);
      return new Blob([data], { type: media.mimetype || 'application/octet-stream' });
    }
    return response.blob();
  });
}
export function loadMatrixAvatar(client: MatrixClient, url: string): Promise<Blob> {
  let cache = caches.get(client);
  if (!cache) { cache = new Map(); caches.set(client, cache); }
  const cached = cache.get(url);
  if (cached) return cached;
  if (cache.size >= 80) cache.delete(cache.keys().next().value!);
  const request = loadMatrixMedia(client, { url }).catch(error => { cache!.delete(url); throw error; });
  cache.set(url, request);
  return request;
}

export async function uploadMatrixFile(client: MatrixClient, roomId: string, file: File, sticker = false, onProgress?: (value: number) => void, voice?: { duration: number }) {
  if (sticker && !['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.type)) throw new Error('Velg en PNG-, JPEG-, WebP- eller GIF-fil som sticker.');
  const encrypted = Boolean(client.getRoom(roomId)?.hasEncryptionStateEvent());
  if (encrypted && !client.getCrypto()) throw new Error('Krypteringen er ikke klar. Prøv igjen om litt.');
  const image = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif'].includes(file.type);
  const audio = file.type.startsWith('audio/');
  let dimensions: { w?: number; h?: number } = {};
  if (image) {
    try { const bitmap = await createImageBitmap(file); dimensions = { w: bitmap.width, h: bitmap.height }; bitmap.close(); } catch { /* Files without decodable dimensions can still be downloaded. */ }
  }
  const payload = encrypted ? await encryptAttachment(await file.arrayBuffer()) : null;
  const uploaded = await client.uploadContent(payload ? new Blob([payload.data], { type: 'application/octet-stream' }) : file, {
    name: encrypted ? 'encrypted' : file.name,
    type: encrypted ? 'application/octet-stream' : file.type || 'application/octet-stream',
    includeFilename: !encrypted,
    progressHandler: progress => onProgress?.(Math.round(progress.loaded / Math.max(1, progress.total) * 100)),
  });
  const encryptedFile = payload ? { ...payload.info, url: uploaded.content_uri } as EncryptedFile : undefined;
  const info = { mimetype: file.type || 'application/octet-stream', size: file.size, ...dimensions, ...(voice ? { duration: voice.duration } : {}) };
  if (sticker && !encrypted) {
    await client.sendStickerMessage(roomId, uploaded.content_uri, info, file.name);
  } else {
    // Encrypted stickers use an image message for compatibility with Matrix clients that cannot decrypt m.sticker attachments.
    const content = {
      body: file.name, filename: file.name, info,
      ...(sticker ? { 'org.gnomguttan.sticker': true } : {}),
      ...(voice ? { 'org.matrix.msc3245.voice': {}, 'org.matrix.msc1767.audio': { duration: voice.duration } } : {}),
      ...(encryptedFile ? { file: encryptedFile } : { url: uploaded.content_uri }),
    };
    if (image) await client.sendMessage(roomId, { ...content, msgtype: MsgType.Image });
    else if (audio) await client.sendMessage(roomId, { ...content, msgtype: MsgType.Audio });
    else await client.sendMessage(roomId, { ...content, msgtype: MsgType.File });
  }
}

export async function makeEmojiSticker(emoji: string): Promise<File> {
  const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Nettleseren kan ikke lage stickers.');
  ctx.font = '180px "Segoe UI Emoji", "Apple Color Emoji", sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(emoji, 128, 140);
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('Kunne ikke lage sticker.')), 'image/png'));
  return new File([blob], `${emoji}.png`, { type: 'image/png' });
}

export const isDisplayMessage = (type: string) => [EventType.RoomMessage, EventType.RoomMessageEncrypted, EventType.Sticker, 'm.poll.start', 'org.matrix.msc3381.poll.start', 'm.location', 'org.matrix.msc3488.location'].includes(type);
