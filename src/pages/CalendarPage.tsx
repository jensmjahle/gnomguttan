import { useMemo, useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Calendar } from '@/components/calendar/Calendar';
import { EventsWidget } from '@/components/events/EventsWidget';
import { useCommunityEventStore } from '@/store/communityEventStore';
import styles from './CalendarPage.module.css';

// No test data in this file

const CALENDAR_COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#06b6d4'];

export function CalendarPage() {
  const events = useCommunityEventStore((state) => state.events);
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);

  // events are loaded/managed by the communityEventStore

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
      <div className={styles.page}>
        <div className={styles.calendarWrap}>
          <Calendar
            events={calendarEvents}
            selectedDay={selectedDay}
            onSelectedDayChange={setSelectedDay}
          />
        </div>
        <div className={styles.eventsWrap}>
          <EventsWidget />
        </div>
      </div>
    </AppLayout>
  );
}
