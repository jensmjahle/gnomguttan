import { useMemo } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Calendar } from '@/components/calendar/Calendar';
import { EventsWidget } from '@/components/events/EventsWidget';
import { useCommunityEventStore } from '@/store/communityEventStore';

const CALENDAR_COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#06b6d4'];

export function CalendarPage() {
  const events = useCommunityEventStore((state) => state.events);

  const calendarEvents = useMemo(
    () =>
      events.map((event, index) => ({
        id: event.id,
        title: event.title,
        date: new Date(event.startsAt),
        color: CALENDAR_COLORS[index % CALENDAR_COLORS.length],
      })),
    [events]
  );

  return (
    <AppLayout>
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, gap: '24px', padding: 'var(--page-padding)', minWidth: 0, minHeight: 0 }}>
        <Calendar events={calendarEvents} />
        <EventsWidget />
      </div>
    </AppLayout>
  );
}
