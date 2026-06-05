import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { ChatPanel } from '@/components/chat/ChatPanel';
import { Calendar } from '@/components/calendar/Calendar';
import { OverheardWidget } from '@/components/overheard/OverheardWidget';
import { StreamDeckBox } from '@/components/widgets/StreamDeckBox';
import { FeedPanel } from '@/components/feed/FeedPanel';
import { useCommunityEventStore } from '@/store/communityEventStore';
import { loadCommunityEvents } from '@/services/communityEvents';

const CALENDAR_COLORS  = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#06b6d4'];
// Below this widget-area threshold both panels are collapsed on widget open.
// Widgets (games, pickers, etc.) typically need 450+ px to be usable.
// Above the threshold the overflow-detection pass handles edge cases.
const DECK_BOTH_PX     = 450;
const DECK_NAV_PX      = 42;  // StreamDeck nav-bar height (approx)
const OVERHEARD_HDR_PX = 52;  // Overheard header-only height when collapsed (approx)

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

  // ── Active-panel state ────────────────────────────────────────────────────
  // At most one panel can be "active" at a time. Active means:
  //   calendar  → an event day is selected (events panel open)
  //   overheard → the quote composer is open
  //   deck      → a widget is being shown in the stream deck
  // When one becomes active the others are deactivated, but none are minimized
  // unless there is genuinely not enough vertical space.
  const [calendarSelectedDay, setCalendarSelectedDay] = useState<Date | null>(null);
  const [composerOpen,        setComposerOpen]        = useState(false);
  const [deckActiveIndex,     setDeckActiveIndex]     = useState<number | null>(null);

  // Each handler activates its panel and deactivates the others.
  const handleCalendarDaySelect = useCallback((day: Date | null) => {
    setCalendarSelectedDay(day);
    if (day !== null) {
      setComposerOpen(false);
      setDeckActiveIndex(null);
    }
  }, []);

  const handleComposerChange = useCallback((open: boolean) => {
    setComposerOpen(open);
    if (open) {
      setCalendarSelectedDay(null);
      setDeckActiveIndex(null);
    }
  }, []);

  const handleDeckActiveChange = useCallback((index: number | null) => {
    setDeckActiveIndex(index);
    if (index !== null) {
      setComposerOpen(false);
      setCalendarSelectedDay(null);
    }
  }, []);

  // ── Space management ──────────────────────────────────────────────────────
  // When a StreamDeck widget opens we do two passes:
  //
  // 1. Pre-render (deckActiveIndex changes): collapse panels if the current
  //    deck height is obviously too small (< MIN_WIDGET_PX).
  //
  // 2. Post-render (onNeedsSpace callback from StreamDeck): the widget div
  //    reports its actual overflow via scrollHeight vs clientHeight. If it
  //    overflows we progressively collapse Overheard then Calendar.
  //
  // Both are fully restored the moment the widget closes.
  const [calMinimized,       setCalMinimized]       = useState(false);
  const [overheardMinimized, setOverheardMinimized] = useState(false);
  const calWrapRef       = useRef<HTMLDivElement>(null);
  const overheardWrapRef = useRef<HTMLDivElement>(null);
  const deckWrapRef      = useRef<HTMLDivElement>(null);

  // Pass 1 — pre-render height check
  useEffect(() => {
    if (deckActiveIndex === null) {
      setCalMinimized(false);
      setOverheardMinimized(false);
      return;
    }

    const deckH      = deckWrapRef.current?.offsetHeight ?? 0;
    const widgetArea = deckH - DECK_NAV_PX;

    if (widgetArea >= DECK_BOTH_PX) return; // plenty of room — overflow check handles edge cases

    // Below the threshold: collapse both so the widget has maximum space
    setOverheardMinimized(true);
    setCalMinimized(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deckActiveIndex]);

  // Pass 2 — post-render overflow signal from StreamDeck's content div
  const handleNeedsSpace = useCallback((extraPx: number) => {
    if (extraPx <= 0) return;

    setOverheardMinimized(prev => {
      if (prev) return prev; // already minimized

      const overheardH        = overheardWrapRef.current?.offsetHeight ?? 0;
      const overheardFreeable = Math.max(0, overheardH - OVERHEARD_HDR_PX);

      if (overheardFreeable < extraPx) {
        // Overheard alone won't be enough — also collapse Calendar
        setCalMinimized(true);
      }
      return true; // minimize Overheard
    });
  }, []);

  return (
    <AppLayout>
      <div className="grid grid-cols-1 md:grid-cols-[minmax(200px,1fr)_minmax(0,2.5fr)_minmax(200px,1fr)] gap-5 px-5 pt-5 flex-1 min-h-0 items-stretch">

        {/* Left — Chat, hidden on mobile */}
        <div className="hidden md:flex flex-col h-full min-h-0" style={box}>
          <ChatPanel />
        </div>

        {/* Center — Feed, always visible */}
        <div className="flex flex-col min-h-0" style={box}>
          <FeedPanel />
        </div>

        {/* Right — no scroll; flex layout, StreamDeck fills remaining space */}
        <div className="hidden md:flex flex-col h-full min-h-0 gap-5" style={{ overflow: 'hidden' }}>

          <div ref={calWrapRef}>
            <Calendar
              events={calendarEvents}
              selectedDay={calendarSelectedDay}
              onSelectedDayChange={handleCalendarDaySelect}
              minimized={calMinimized}
            />
          </div>

          <div ref={overheardWrapRef}>
            <OverheardWidget
              composerOpen={composerOpen}
              onComposerChange={handleComposerChange}
              minimized={overheardMinimized}
            />
          </div>

          {/* Wrapper gives StreamDeck its flex share and provides the column
              context so the shell's own flex:1 fills all the way to the bottom */}
          <div ref={deckWrapRef} style={{ flex: '1 1 0', minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            <StreamDeckBox
              activeIndex={deckActiveIndex}
              onActiveChange={handleDeckActiveChange}
              onNeedsSpace={handleNeedsSpace}
            />
          </div>

        </div>
      </div>
    </AppLayout>
  );
}
