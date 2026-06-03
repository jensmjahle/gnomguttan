import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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

  const scrollRef = useRef<HTMLDivElement>(null);
  const [atTop, setAtTop] = useState(true);
  const [atBottom, setAtBottom] = useState(true);

  const checkScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setAtTop(el.scrollTop <= 0);
    setAtBottom(el.scrollTop + el.clientHeight >= el.scrollHeight - 1);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    checkScroll();
    el.addEventListener('scroll', checkScroll, { passive: true });
    const ro = new ResizeObserver(checkScroll);
    ro.observe(el);
    return () => {
      el.removeEventListener('scroll', checkScroll);
      ro.disconnect();
    };
  }, [checkScroll]);

  const borderColor = 'var(--border)';
  const rightColStyle: React.CSSProperties = {
    overflow: 'hidden',
    borderRadius: 'var(--radius-lg)',
    borderTop: atTop ? undefined : `1px solid ${borderColor}`,
    borderBottom: atBottom ? undefined : `1px solid ${borderColor}`,
  };

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

        {/* Right — outer div clips corners and shows edge borders when scrolled */}
        <div className="hidden md:flex flex-col h-full min-h-0" style={rightColStyle}>
          <div ref={scrollRef} className="flex flex-col flex-1 min-h-0 overflow-y-auto no-scrollbar gap-5">

            <div style={{ flex: 'none' }}>
              <Calendar events={calendarEvents} />
            </div>

            <div style={{ flex: 'none' }}>
              <OverheardWidget />
            </div>

            <div style={{ flex: '1 0 120px', display: 'flex' }}>
              <StreamDeckBox />
            </div>

          </div>
        </div>
      </div>
    </AppLayout>
  );
}
