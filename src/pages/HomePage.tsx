import { useMemo } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Calendar } from '@/components/calendar/Calendar';
import { ChatPanel } from '@/components/chat/ChatPanel';
import { EventsWidget } from '@/components/events/EventsWidget';
import { Gallery } from '@/components/gallery/Gallery';
import { HubertCinemaWidget } from '@/components/hubert-cinema/HubertCinemaWidget';
import { OverheardWidget } from '@/components/overheard/OverheardWidget';
import { useCommunityEventStore } from '@/store/communityEventStore';
import styles from './HomePage.module.css';

const CALENDAR_COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#06b6d4'];

export function HomePage() {
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
      <div className={styles.content}>
        <aside className={styles.sidebar}>
          <div className={styles.leftColumn}>
            <section className={styles.calendarSection}>
              <Calendar events={calendarEvents} />
            </section>
            <section className={styles.eventsSection}>
              <EventsWidget />
            </section>
            <section className={styles.overheardSection}>
              <OverheardWidget />
            </section>
          </div>
          <div className={styles.mainColumn}>
            <section className={styles.cinemaSection}>
              <HubertCinemaWidget />
            </section>
            <section className={styles.gallerySection}>
              <Gallery />
            </section>
          </div>
        </aside>
        <ChatPanel />
      </div>
    </AppLayout>
  );
}
