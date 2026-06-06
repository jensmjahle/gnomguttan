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

// Timing constants that must stay in sync with AnimatedCollapse / AnimatedHeight.
const DECK_FADE_MS     = 180;  // StreamDeck widget fade duration

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

  // ── Synchronous restore helpers ───────────────────────────────────────────
  // Called directly inside handlers (not in useEffect) so that the restore
  // state update lands in the same React batch as the active-panel change.
  // This ensures all collapse/expand transitions start in the same frame.
  const resetDeckMinimization = useCallback(() => {
    setCalMinimizedByDeck(false);
    setOverheardMinimizedByDeck(false);
  }, []);

  const resetCalMinimization = useCallback(() => {
    calMinCancelRef.current = true;
    setOverheardMinimizedByCal(false);
    setDeckMinimizedByCal(false);
  }, []);

  // Each handler activates its panel and deactivates the others.
  // Restore helpers are called synchronously so transitions stay in sync.
  const handleCalendarDaySelect = useCallback((day: Date | null) => {
    setCalendarSelectedDay(day);
    if (day !== null) {
      setComposerOpen(false);
      setDeckActiveIndex(null);
      resetDeckMinimization();
    } else {
      resetCalMinimization();
    }
  }, [resetDeckMinimization, resetCalMinimization]);

  const handleComposerChange = useCallback((open: boolean) => {
    // Always cancel any in-flight delayed open first.
    if (composerOpenTimerRef.current) {
      clearTimeout(composerOpenTimerRef.current);
      composerOpenTimerRef.current = null;
    }

    if (!open) {
      setComposerOpen(false);
      // Restore any calendar that was left minimised while the form was pending.
      setCalMinimizedByDeck(false);
      return;
    }

    setCalendarSelectedDay(null);
    resetCalMinimization();

    if (deckActiveIndex !== null) {
      // ── Two-phase transition when a deck widget is active ─────────────────
      // Phase 1 (immediate): close the deck widget + reveal sitater with the
      //   quote.  The calendar stays collapsed so it doesn't compete.
      setDeckActiveIndex(null);
      setOverheardMinimizedByDeck(false);   // sitater starts opening right away

      // Phase 2 (after deck has faded): open the form.  By now the deck widget
      //   is gone and sitater is either fully visible or mid-reveal — either
      //   way the AnimatedHeight/AnimatedCollapse machinery handles it cleanly.
      composerOpenTimerRef.current = setTimeout(() => {
        composerOpenTimerRef.current = null;
        setCalMinimizedByDeck(false);       // restore calendar alongside form
        setComposerOpen(true);
      }, DECK_FADE_MS);
    } else {
      // No active widget — open everything at once.
      resetDeckMinimization();
      setComposerOpen(true);
    }
  }, [resetCalMinimization, resetDeckMinimization, deckActiveIndex]);

  const handleOverheardRefresh = useCallback(() => {
    setCalendarSelectedDay(null);
    resetCalMinimization();
    setDeckActiveIndex(null);
    resetDeckMinimization();
  }, [resetCalMinimization, resetDeckMinimization]);

  const handleDeckActiveChange = useCallback((index: number | null) => {
    setDeckActiveIndex(index);
    if (index !== null) {
      setComposerOpen(false);
      setCalendarSelectedDay(null);
      resetCalMinimization();
    } else {
      resetDeckMinimization();
    }
  }, [resetCalMinimization, resetDeckMinimization]);

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
  const calMinimized       = calMinimizedByDeck;
  const overheardMinimized = overheardMinimizedByDeck || overheardMinimizedByCal;
  const deckMinimized      = deckMinimizedByCal;

  const calWrapRef            = useRef<HTMLDivElement>(null);
  const overheardWrapRef      = useRef<HTMLDivElement>(null);
  const deckWrapRef           = useRef<HTMLDivElement>(null);
  const composerOpenTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Guards against the ResizeObserver's debounce firing after resetCalMinimization()
  // (useEffect cleanup is passive/post-paint so the timer can race ahead of it).
  const calMinCancelRef       = useRef(false);

  // ── Trigger A: StreamDeck widget ─────────────────────────────────────────
  // Only handles minimization on open; restoration is done synchronously in
  // the handlers above so all transitions start in the same frame.
  useEffect(() => {
    if (deckActiveIndex === null) return;
    const widgetArea = (deckWrapRef.current?.offsetHeight ?? 0) - DECK_NAV_PX;
    if (widgetArea >= DECK_BOTH_PX) return;
    setOverheardMinimizedByDeck(true);
    setCalMinimizedByDeck(true);
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
  // Restoration is done synchronously in the handlers above.
  useEffect(() => {
    if (calendarSelectedDay === null) return;
    const deckEl = deckWrapRef.current;
    if (!deckEl) return;

    calMinCancelRef.current = false; // fresh observation; cancel any prior reset signal

    let debounce: ReturnType<typeof setTimeout>;
    const check = () => {
      clearTimeout(debounce);
      debounce = setTimeout(() => {
        if (calMinCancelRef.current) return; // reset was called between fire and cleanup
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
  }, [calendarSelectedDay]);

  return (
    <AppLayout>
      <div className="grid grid-cols-1 md:grid-cols-[minmax(200px,1fr)_minmax(0,2.5fr)_minmax(200px,1fr)] gap-5 px-5 pb-5 sm:pb-0 flex-1 min-h-0 items-stretch">

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
              onRefresh={handleOverheardRefresh}
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
