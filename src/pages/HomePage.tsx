import { AppLayout } from '@/components/layout/AppLayout';
import { Calendar } from '@/components/calendar/Calendar';
import { ChatPanel } from '@/components/chat/ChatPanel';
import { Gallery } from '@/components/gallery/Gallery';
import { HubertCinemaWidget } from '@/components/hubert-cinema/HubertCinemaWidget';
import { OverheardWidget } from '@/components/overheard/OverheardWidget';
import styles from './HomePage.module.css';
import type { CalendarEvent } from '@/types';

// Placeholder events — swap with a real API later
const DEMO_EVENTS: CalendarEvent[] = [
  { id: '1', title: 'Team standup', date: new Date(), color: '#6366f1' },
  { id: '2', title: 'Movie night', date: new Date(Date.now() + 86400000 * 3), color: '#22c55e' },
];

export function HomePage() {
  return (
    <AppLayout>
      <div className={styles.content}>
        <aside className={styles.sidebar}>
          <div className={styles.leftColumn}>
            <section className={styles.calendarSection}>
              <Calendar events={DEMO_EVENTS} />
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
