import type { MatrixMessage } from '@/types/matrix';
export function mediaKind(message: Pick<MatrixMessage, 'msgtype' | 'media'>): 'audio' | 'video' | 'image' | 'file' {
  const mime = message.media?.mimetype || '';
  if (message.msgtype === 'm.audio' || mime.startsWith('audio/')) return 'audio';
  if (message.msgtype === 'm.video' || mime.startsWith('video/')) return 'video';
  if (message.msgtype === 'm.image' || mime.startsWith('image/')) return 'image';
  const name = message.media?.name || '';
  if (/\.(mp3|m4a|ogg|opus|wav|aac|flac)$/i.test(name)) return 'audio';
  if (/\.(mp4|m4v|mov|webm)$/i.test(name)) return 'video';
  return 'file';
}
export function messagesConnect(previous?: MatrixMessage, next?: MatrixMessage): boolean {
  if (!previous || !next || previous.sender !== next.sender) return false;
  if ([previous, next].some(message => message.sticker || message.poll || message.location || message.redacted || message.failed || message.body.startsWith('Kryptert melding'))) return false;
  const gap = next.timestamp - previous.timestamp;
  return gap >= 0 && gap <= 5 * 60 * 1000 && new Date(previous.timestamp).toDateString() === new Date(next.timestamp).toDateString();
}
