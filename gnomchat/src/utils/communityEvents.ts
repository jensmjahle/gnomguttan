import type { CommunityEvent, CommunityEventPerson } from '@/types';

export const EVENT_TYPES = ['Sosialt', 'Fylla', 'Gaming', 'Skole', 'Egendefinert'] as const;

export function generateId(prefix = 'evt'): string {
  return `${prefix}_${Math.random().toString(36).slice(2)}_${Date.now()}`;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

export function formatDateTimeInput(value?: string | Date): string {
  const date = value instanceof Date ? value : value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return '';
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Accepts Norwegian DD.MM.YYYY HH:mm, ISO values and values understood by Date. */
export function parseDateTimeInput(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const norwegian = trimmed.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})[ T](\d{1,2}):(\d{2})$/);
  if (norwegian) {
    const [, day, month, year, hour, minute] = norwegian;
    const date = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute));
    if (
      date.getFullYear() === Number(year) &&
      date.getMonth() === Number(month) - 1 &&
      date.getDate() === Number(day) &&
      date.getHours() === Number(hour) &&
      date.getMinutes() === Number(minute)
    ) {
      return date.toISOString();
    }
    return null;
  }

  const timestamp = Date.parse(trimmed);
  return Number.isNaN(timestamp) ? null : new Date(timestamp).toISOString();
}

export function formatDateTime(value?: string | number | Date, includeYear = true): string {
  if (value === undefined) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('nb-NO', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    ...(includeYear ? { year: 'numeric' as const } : {}),
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function formatDateRange(startsAt: string, endsAt?: string): string {
  const start = formatDateTime(startsAt);
  if (!endsAt) return start;
  const startDate = new Date(startsAt);
  const endDate = new Date(endsAt);
  if (Number.isNaN(endDate.getTime())) return start;
  const sameDay = startDate.toDateString() === endDate.toDateString();
  const end = sameDay
    ? new Intl.DateTimeFormat('nb-NO', { hour: '2-digit', minute: '2-digit' }).format(endDate)
    : formatDateTime(endsAt);
  return `${start} – ${end}`;
}

export function getEventDate(event: CommunityEvent): Date {
  if (event.timeMode === 'proposed' && event.timeProposals?.[0]?.startsAt) {
    return new Date(event.timeProposals[0].startsAt);
  }
  return new Date(event.startsAt);
}

export function getEventTimeLabel(event: CommunityEvent): string {
  if (event.timeMode === 'proposed') {
    const count = event.timeProposals?.length ?? 0;
    return count > 0 ? `Tid foreslås · ${count} forslag` : 'Tid foreslås';
  }
  return formatDateRange(event.startsAt, event.endsAt);
}

export function getEventTypeLabel(event: Pick<CommunityEvent, 'eventType' | 'customEventType'>): string {
  const type = event.eventType?.trim() || 'Sosialt';
  return type === 'Egendefinert' ? event.customEventType?.trim() || type : type;
}

export function isEventFinished(event: CommunityEvent): boolean {
  if (event.status === 'draft' || event.timeMode === 'proposed') return false;
  const finish = Date.parse(event.endsAt || event.startsAt);
  return Number.isFinite(finish) && Date.now() >= finish;
}

export function canEditEvent(
  event: CommunityEvent,
  user?: { uid: number; is_admin?: boolean; isAdmin?: boolean } | null,
): boolean {
  if (!user) return false;
  if (user.is_admin || user.isAdmin) return true;
  if (event.editMode === 'open' && event.status !== 'draft') return true;
  return event.createdBy.uid === user.uid || (event.coOrganizers ?? []).some((person) => person.uid === user.uid);
}

export function userInfoToEventPerson(user: {
  uid: number;
  name: string;
  avatar_updated_at?: number;
}): CommunityEventPerson {
  return {
    uid: user.uid,
    name: user.name,
    ...(typeof user.avatar_updated_at === 'number' ? { avatarUpdatedAt: user.avatar_updated_at } : {}),
  };
}
