import { useMemo } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { ChatPanel } from '@/components/chat/ChatPanel';
import { Calendar } from '@/components/calendar/Calendar';
import { OverheardWidget } from '@/components/overheard/OverheardWidget';
import { useCommunityEventStore } from '@/store/communityEventStore';

const CALENDAR_COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#06b6d4'];

const box: React.CSSProperties = {
  background: 'var(--bg-card)',
  borderRadius: 'var(--radius-lg)',
  overflow: 'hidden',
};

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
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(200px, 1fr) minmax(0, 2.5fr) minmax(200px, 1fr)',
        gap: '20px',
        padding: '20px',
        flex: 1,
        minHeight: 0,
        alignItems: 'stretch',
      }}>

        {/* Left — Chat */}
        <div style={{ ...box, display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
          <ChatPanel />
        </div>

        {/* Center — Feed placeholder */}
        <div style={{ ...box, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Feed</span>
        </div>

        {/* Right — 3 stacked boxes */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', height: '100%', minHeight: 0 }}>

          {/* Calendar */}
          <div style={{ ...box, flex: 5, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            <Calendar events={calendarEvents} />
          </div>

          {/* Quotes */}
          <div style={{ ...box, flex: 3, minHeight: 0, overflow: 'auto' }}>
            <OverheardWidget />
          </div>

          {/* Buttons placeholder */}
          <div style={{ ...box, flex: 4, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Buttons</span>
          </div>

        </div>
      </div>
    </AppLayout>
  );
}
