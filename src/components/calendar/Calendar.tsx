import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  isToday,
  format,
  addMonths,
  subMonths,
} from 'date-fns';
import type { CalendarEvent } from '@/types';
import { AnimatedHeight } from '@/components/ui/AnimatedHeight';
import { AnimatedCollapse } from '@/components/ui/AnimatedCollapse';
import styles from './Calendar.module.css';

interface Props {
  events?: CalendarEvent[];
  minimized?: boolean;
  selectedDay: Date | null;
  onSelectedDayChange: (day: Date | null) => void;
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function ChevronLeft() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

function ChevronRight() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

export function Calendar({ events = [], minimized = false, selectedDay, onSelectedDayChange }: Props) {
  const [currentMonth, setCurrentMonth] = useState(new Date());

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });

  const eventsOnDay = (day: Date) =>
    events.filter((e) => isSameDay(e.date, day));

  const selectedDayEvents = selectedDay ? eventsOnDay(selectedDay) : [];

  const handleTodayClick = () => {
    const today = new Date();
    setCurrentMonth(today);
    // Toggle: clicking Today again when today is already selected closes the events panel
    onSelectedDayChange(selectedDay && isSameDay(selectedDay, today) ? null : today);
  };

  return (
    <div className={styles.calendar}>
      {/* Header */}
      <div className={styles.header}>
        <button className={styles.navBtn} onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>
          <ChevronLeft />
        </button>
        <h2 className={styles.monthLabel}>{format(currentMonth, 'MMMM yyyy')}</h2>
        <button className={styles.navBtn} onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>
          <ChevronRight />
        </button>
        <button className={styles.todayBtn} onClick={handleTodayClick}>
          Today
        </button>
      </div>

      {/* Weekdays + grid + events — collapse when minimized */}
      <AnimatedCollapse open={!minimized}>
        <div className={styles.weekdays}>
          {WEEKDAYS.map((d) => <span key={d} className={styles.weekday}>{d}</span>)}
        </div>

        <div className={styles.grid}>
          {days.map((day) => {
            const dayEvents = eventsOnDay(day);
            const outside = !isSameMonth(day, currentMonth);
            const today = isToday(day);
            const selected = selectedDay ? isSameDay(day, selectedDay) : false;

            return (
              <button
                key={day.toISOString()}
                className={[
                  styles.day,
                  outside ? styles.outside : '',
                  today ? styles.today : '',
                  selected ? styles.selected : '',
                ].filter(Boolean).join(' ')}
                onClick={() => onSelectedDayChange(selectedDay && isSameDay(selectedDay, day) ? null : day)}
              >
                <span className={styles.dayNum}>{format(day, 'd')}</span>
                {dayEvents.length > 0 && (
                  <div className={styles.dots}>
                    {dayEvents.slice(0, 3).map((e) => (
                      <span
                        key={e.id}
                        className={styles.dot}
                        style={{ background: e.color ?? 'var(--accent)' }}
                      />
                    ))}
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {/* Selected day events — animates in/out */}
        <AnimatedHeight>
          {selectedDayEvents.length > 0 && (
            <div className={styles.eventList}>
              <p className={styles.eventListTitle}>{format(selectedDay!, 'EEEE, MMMM d')}</p>
              {selectedDayEvents.map((e) => (
                <Link key={e.id} to={`/arrangementer/${e.id}`} className={styles.event} style={{ borderLeftColor: e.color ?? 'var(--accent)' }}>
                  <span className={styles.eventTitle}>{e.title}</span>
                </Link>
              ))}
            </div>
          )}
        </AnimatedHeight>
      </AnimatedCollapse>
    </div>
  );
}
