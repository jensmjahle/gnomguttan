import type { MatrixEvent } from 'matrix-js-sdk';

export function messagesConnect(previous: MatrixEvent | undefined, next: MatrixEvent | undefined): boolean {
  if (!previous || !next || !previous.getSender() || previous.getSender() !== next.getSender()) return false;
  const canGroup = (event: MatrixEvent) => event.getType() === 'm.room.message' && !event.isRedacted() && !event.isDecryptionFailure() && !event.getContent()['org.gnomguttan.sticker'];
  if (!canGroup(previous) || !canGroup(next)) return false;
  const gap = next.getTs() - previous.getTs();
  return gap >= 0 && gap <= 5 * 60 * 1000 && new Date(previous.getTs()).toDateString() === new Date(next.getTs()).toDateString();
}
