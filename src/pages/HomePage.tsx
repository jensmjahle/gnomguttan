import { useEffect, useMemo } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { ChatPanel } from '@/components/chat/ChatPanel';
import { Calendar } from '@/components/calendar/Calendar';
import { OverheardWidget } from '@/components/overheard/OverheardWidget';
import { StreamDeckBox } from '@/components/widgets/StreamDeckBox';
import { useCommunityEventStore } from '@/store/communityEventStore';
import { loadCommunityEvents } from '@/services/communityEvents';

const CALENDAR_COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#06b6d4'];

const box: React.CSSProperties = {
  background: 'var(--bg-card)',
  borderRadius: 'var(--radius-lg)',
  overflow: 'hidden',
};

export function HomePage() {
  const events = useCommunityEventStore((state) => state.events);

  useEffect(() => { void loadCommunityEvents(); }, []);

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
      <div className="grid grid-cols-1 md:grid-cols-[minmax(200px,1fr)_minmax(0,2.5fr)_minmax(200px,1fr)] gap-5 p-5 flex-1 min-h-0 items-stretch">

        {/* Left — Chat, hidden on mobile */}
        <div className="hidden md:flex flex-col h-full min-h-0" style={box}>
          <ChatPanel />
        </div>

        {/* Center — Feed, always visible */}
        <div className="flex items-center justify-center" style={box}>
          <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Feed</span>
        </div>

        {/* Right — 3 stacked boxes, hidden on mobile */}
        <div className="hidden md:flex flex-col gap-5 h-full min-h-0">

          <div className="flex flex-col min-h-0" style={{ ...box, flex: 109 }}>
            <Calendar events={calendarEvents} />
          </div>

          <div className="min-h-0 overflow-auto" style={{ ...box, flex: 42 }}>
            <OverheardWidget />
          </div>

          <div style={{ ...box, flex: 89, display: 'flex' }}>
            <StreamDeckBox />
          </div>

        </div>
      </div>
    </AppLayout>
  );
}
