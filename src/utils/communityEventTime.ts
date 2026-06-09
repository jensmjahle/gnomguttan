import { format, isSameDay } from 'date-fns';
import type { Locale } from 'date-fns';

interface FormatCommunityEventTimeRangeOptions {
  locale?: Locale;
  startFormat: string;
  endFormat?: string;
  sameDayEndFormat?: string;
  separator?: string;
}

export function formatCommunityEventTimeRange(
  startAt: string,
  endsAt: string | null | undefined,
  options: FormatCommunityEventTimeRangeOptions,
) {
  const start = new Date(startAt);
  if (Number.isNaN(start.getTime())) {
    return '';
  }

  const startText = format(start, options.startFormat, { locale: options.locale });
  if (!endsAt) {
    return startText;
  }

  const end = new Date(endsAt);
  if (Number.isNaN(end.getTime())) {
    return startText;
  }

  const endFormat = isSameDay(start, end)
    ? options.sameDayEndFormat ?? 'HH:mm'
    : options.endFormat ?? options.startFormat;

  return `${startText}${options.separator ?? ' – '}${format(end, endFormat, { locale: options.locale })}`;
}
