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

// ── Space-management thresholds ───────────────────────────────────────────────
// StreamDeck widget triggers (deck widget area too small):
const DECK_BOTH_PX     = 450; // below this → collapse Calendar + Overheard
const DECK_NAV_PX      = 42;  // StreamDeck nav-bar height (approx)
// Calendar event-list triggers (deck wrapper squeezed by growing calendar):
const CAL_OVHD_PX      = 200; // deck wrapper below this → collapse Overheard
const CAL_DECK_PX      = 80;  // deck wrapper below this → also collapse StreamDeck
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
  // Two independent triggers can collapse panels:
  //
  //  A) StreamDeck widget opens → may collapse Calendar + Overheard
  //  B) Calendar event-list grows → may collapse Overheard + StreamDeck
  //
  // Each trigger has its own state pair so restoring one never affects the other.

  const [calMinimizedByDeck,       setCalMinimizedByDeck]       = useState(false);
  const [overheardMinimizedByDeck, setOverheardMinimizedByDeck] = useState(false);
  const [overheardMinimizedByCal,  setOverheardMinimizedByCal]  = useState(false);
  const [deckMinimizedByCal,       setDeckMinimizedByCal]       = useState(false);

  // Derived props for the three panels
  const calMinimized      = calMinimizedByDeck;
  const overheardMinimized = overheardMinimizedByDeck || overheardMinimizedByCal;
  const deckMinimized     = deckMinimizedByCal;

  const calWrapRef       = useRef<HTMLDivElement>(null);
  const overheardWrapRef = useRef<HTMLDivElement>(null);
  const deckWrapRef      = useRef<HTMLDivElement>(null);

  // ── Trigger A: StreamDeck widget ─────────────────────────────────────────
  // Pass 1 — pre-render height check
  useEffect(() => {
    if (deckActiveIndex === null) {
      setCalMinimizedByDeck(false);
      setOverheardMinimizedByDeck(false);
      return;
    }
    const widgetArea = (deckWrapRef.current?.offsetHeight ?? 0) - DECK_NAV_PX;
    if (widgetArea >= DECK_BOTH_PX) return;
    setOverheardMinimizedByDeck(true);
    setCalMinimizedByDeck(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deckActiveIndex]);

  // Pass 2 — post-render overflow signal from StreamDeck's content div
  const handleNeedsSpace = useCallback((extraPx: number) => {
    if (extraPx <= 0) return;
    setOverheardMinimizedByDeck(prev => {
      if (prev) return prev;
      const overheardH        = overheardWrapRef.current?.offsetHeight ?? 0;
      const overheardFreeable = Math.max(0, overheardH - OVERHEARD_HDR_PX);
      if (overheardFreeable < extraPx) setCalMinimizedByDeck(true);
      return true;
    });
  }, []);

  // ── Trigger B: Calendar event-list ───────────────────────────────────────
  // Watch the deck wrapper with a ResizeObserver — it shrinks as Calendar grows.
  // When it drops below a threshold, collapse Overheard (and StreamDeck if needed).
  // Both are fully restored when the selected day is cleared.
  useEffect(() => {
    if (calendarSelectedDay === null) {
      setOverheardMinimizedByCal(false);
      setDeckMinimizedByCal(false);
      return;
    }
    const deckEl = deckWrapRef.current;
    if (!deckEl) return;

    let debounce: ReturnType<typeof setTimeout>;
    const check = () => {
      clearTimeout(debounce);
      debounce = setTimeout(() => {
        const h = deckEl.offsetHeight;
        if (h < CAL_DECK_PX) {
          setOverheardMinimizedByCal(true);
          setDeckMinimizedByCal(true);
        } else if (h < CAL_OVHD_PX) {
          setOverheardMinimizedByCal(true);
        }
      }, 50);
    };

    const ro = new ResizeObserver(check);
    ro.observe(deckEl);
    check(); // immediate check for current state

    return () => { ro.disconnect(); clearTimeout(debounce); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calendarSelectedDay]);

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
              minimized={deckMinimized}
            />
          </div>

        </div>
      </div>
    </AppLayout>
  );
}
