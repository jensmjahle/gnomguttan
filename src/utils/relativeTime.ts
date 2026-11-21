import { format } from 'date-fns';
import { nb } from 'date-fns/locale/nb';

/** Relative "5 min siden"-style stamp, with a fallback to a date for older posts. */
export function formatRelativeTime(timestamp: number) {
  const diffMinutes = Math.round((Date.now() - timestamp) / 60000);

  if (diffMinutes < 1) return 'nå nettopp';
  if (diffMinutes < 60) return `${diffMinutes} min siden`;

  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours} t siden`;

  const diffDays = Math.round(diffHours / 24);
  if (diffDays < 7) return `${diffDays} d siden`;

  return format(new Date(timestamp), 'd. MMM HH:mm', { locale: nb });
}
